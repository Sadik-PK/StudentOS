import { randomUUID } from "node:crypto"

import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3"

import { createPresignedPost } from "@aws-sdk/s3-presigned-post"

import { getSignedUrl } from "@aws-sdk/s3-request-presigner"

import { Router } from "express"

import { z } from "zod"

import { env } from "../env.js"

import { prisma } from "../db.js"

import { requireAuth } from "../middleware/requireAuth.js"

const MAX_FILE_BYTES = 20 * 1024 * 1024
const storage =
  env.R2_ENABLED &&
  env.R2_ENDPOINT &&
  env.R2_ACCESS_KEY_ID &&
  env.R2_SECRET_ACCESS_KEY &&
  env.R2_BUCKET
    ? {
        bucket: env.R2_BUCKET,
        client: new S3Client({
          region: "auto",
          endpoint: env.R2_ENDPOINT,
          forcePathStyle: true,
          credentials: {
            accessKeyId: env.R2_ACCESS_KEY_ID,
            secretAccessKey: env.R2_SECRET_ACCESS_KEY,
          },
        }),
      }
    : null;

const allowedTypes = new Set([
  "application/pdf",

  "application/msword",

  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-powerpoint",

  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  "application/vnd.ms-excel",

  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "image/jpeg",

  "image/png",

  "image/webp",

  "text/plain",
])

const uploadRequestSchema = z.object({
  fileName: z.string().min(1).max(255),

  contentType: z
    .string()
    .refine((value) => allowedTypes.has(value), "Unsupported file type."),

  sizeBytes: z.number().int().positive().max(MAX_FILE_BYTES),

  purpose: z.enum(["note", "assignment", "profile"]),
})

const completeRequestSchema = z.object({
  fileName: z.string().min(1).max(255),

  contentType: z
    .string()
    .refine((value) => allowedTypes.has(value), "Unsupported file type."),

  purpose: z.enum(["note", "assignment", "profile"]),
})

export const filesRouter = Router()
filesRouter.use(requireAuth)

function getStorage() {
  return storage;
}

function matchesFileSignature(contentType: string, fileName: string, bytes: Uint8Array) {
  const startsWith = (...signature: number[]) =>
    signature.every((byte, index) => bytes[index] === byte);
  const extension = fileName.split(".").pop()?.toLowerCase();

  if (contentType === "application/pdf") {
    return new TextDecoder().decode(bytes.slice(0, 5)) === "%PDF-";
  }
  if (contentType === "image/jpeg") return startsWith(0xff, 0xd8, 0xff);
  if (contentType === "image/png") {
    return startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  }
  if (contentType === "image/webp") {
    return new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
      new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP";
  }
  if (contentType === "application/msword") {
    return extension === "doc" && startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }
  if (contentType === "application/vnd.ms-powerpoint") {
    return extension === "ppt" && startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }
  if (contentType === "application/vnd.ms-excel") {
    return extension === "xls" && startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1);
  }
  const zippedTypes: Record<string, string> = {
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  };
  if (zippedTypes[contentType]) {
    return extension === zippedTypes[contentType] && startsWith(0x50, 0x4b, 0x03, 0x04);
  }
  if (contentType === "text/plain") {
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return !text.includes("\0") && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text);
    } catch {
      return false;
    }
  }
  return false;
}

filesRouter.post("/upload-url", async (req, res, next) => {
  const parsed = uploadRequestSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid upload request.", details: parsed.error.issues })

    return
  }

  const storage = getStorage()

  if (!storage) {
    res.status(503).json({ error: "File storage is not configured." })

    return
  }

  try {
    const id = randomUUID()

    const key = `${req.userId}/${id}`

    const signedPost = await createPresignedPost(storage.client, {
      Bucket: storage.bucket,

      Key: key,

      Expires: 300,

      Fields: { "Content-Type": parsed.data.contentType },

      Conditions: [
        ["content-length-range", 1, MAX_FILE_BYTES],

        ["eq", "$Content-Type", parsed.data.contentType],
      ],
    })

    await prisma.uploadedFile.create({
      data: {
        userId: req.userId!,

        id,

        objectKey: key,

        fileName: parsed.data.fileName,

        contentType: parsed.data.contentType,

        sizeBytes: parsed.data.sizeBytes,

        purpose: parsed.data.purpose,
      },
    })

    res.json({
      id,

      url: signedPost.url,

      fields: signedPost.fields,

      completeUrl: `/api/files/${id}/complete`,
    })
  } catch (error) {
    next(error)
  }
})

filesRouter.post("/:id/complete", async (req, res, next) => {
  const parsed = completeRequestSchema.safeParse(req.body)

  if (!parsed.success) {
    res
      .status(400)
      .json({ error: "Invalid file metadata.", details: parsed.error.issues })

    return
  }

  const storage = getStorage()

  if (!storage) {
    res.status(503).json({ error: "File storage is not configured." })

    return
  }

  try {
    const existing = await prisma.uploadedFile.findUnique({
      where: { id: req.params.id },
    })

    if (!existing || existing.userId !== req.userId) {
      res.status(404).json({ error: "Upload not found." })

      return
    }

    if (existing.status === "complete") {
      res.json(existing)

      return
    }

    if (
      existing.fileName !== parsed.data.fileName ||
      existing.contentType !== parsed.data.contentType ||
      existing.purpose !== parsed.data.purpose
    ) {
      res
        .status(400)
        .json({
          error: "Uploaded file metadata does not match the signed upload.",
        })

      return
    }

    const listed = await storage.client.send(
      new HeadObjectCommand({
        Bucket: storage.bucket,

        Key: existing.objectKey,
      }),
    )

    if (
      !listed.ContentLength ||
      listed.ContentLength !== existing.sizeBytes ||
      listed.ContentType !== existing.contentType
    ) {
      res
        .status(400)
        .json({ error: "Uploaded file does not match the permitted metadata." })

      return
    }

    const object = await storage.client.send(
      new GetObjectCommand({
        Bucket: storage.bucket,
        Key: existing.objectKey,
      }),
    )
    const bytes = object.Body
      ? await object.Body.transformToByteArray()
      : new Uint8Array()
    if (!matchesFileSignature(existing.contentType, existing.fileName, bytes)) {
      await storage.client.send(
        new DeleteObjectCommand({ Bucket: storage.bucket, Key: existing.objectKey }),
      )
      res
        .status(400)
        .json({ error: "File content does not match the permitted file type." })
      return
    }

    const file = await prisma.uploadedFile.update({
      where: { id: existing.id },

      data: { status: "complete", sizeBytes: listed.ContentLength },
    })

    res.status(201).json(file)
  } catch (error) {
    next(error)
  }
})

filesRouter.get("/:id/download-url", async (req, res, next) => {
  const storage = getStorage()

  if (!storage) {
    res.status(503).json({ error: "File storage is not configured." })

    return
  }

  try {
    const file = await prisma.uploadedFile.findUnique({
      where: { id: req.params.id },
    })

    if (!file || file.userId !== req.userId) {
      res.status(404).json({ error: "File not found." })

      return
    }

    if (file.status !== "complete") {
      res.status(409).json({ error: "Upload has not been completed." })

      return
    }

    const url = await getSignedUrl(
      storage.client,
      new GetObjectCommand({
        Bucket: storage.bucket,

        Key: file.objectKey,

        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,

        ResponseContentType: file.contentType,
      }),
      { expiresIn: 300 },
    )

    res.json({ url, fileName: file.fileName, contentType: file.contentType })
  } catch (error) {
    next(error)
  }
})

filesRouter.delete("/:id", async (req, res, next) => {
  const storage = getStorage()

  if (!storage) {
    res.status(503).json({ error: "File storage is not configured." })

    return
  }

  try {
    const file = await prisma.uploadedFile.findUnique({
      where: { id: req.params.id },
    })

    if (!file || file.userId !== req.userId) {
      res.status(404).json({ error: "File not found." })

      return
    }

    const [note, assignment, profile] = await Promise.all([
      prisma.note.findFirst({ where: { userId: req.userId!, fileId: file.id } }),
      prisma.assignment.findFirst({ where: { userId: req.userId!, fileId: file.id } }),
      prisma.userProfile.findFirst({ where: { userId: req.userId!, avatarFileId: file.id } }),
    ])
    if (note || assignment || profile) {
      res.status(409).json({ error: "Remove this file from its attached record before deleting it." })
      return
    }

    await storage.client.send(
      new DeleteObjectCommand({ Bucket: storage.bucket, Key: file.objectKey }),
    )

    await prisma.uploadedFile.delete({
      where: { id: file.id },
    })

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})

export async function closeFileStorage() {
  storage?.client.destroy()
}
