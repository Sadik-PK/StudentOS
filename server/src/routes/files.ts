import { randomUUID } from "node:crypto"

import express, { Router } from "express"

import { z } from "zod"

import { env } from "../env.js"

import { prisma } from "../db.js"

import { requireAuth } from "../middleware/requireAuth.js"
import {
  deleteDriveFile,
  downloadDriveFile,
  uploadDriveFile,
} from "../storage/googleDrive.js"

const MAX_FILE_BYTES = 20 * 1024 * 1024

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

  purpose: z.enum(["note", "assignment", "profile", "study-document"]),
})

export const filesRouter = Router()
filesRouter.use(requireAuth)

export async function readOwnedStudyFile(userId: string, fileId: string) {
  const file = await prisma.uploadedFile.findFirst({
    where: { id: fileId, userId, status: "complete", purpose: "study-document" },
  });
  if (!file) return null;

  if (!env.GOOGLE_DRIVE_ENABLED) {
    throw new Error("Google Drive file storage is not configured.");
  }

  const object = await downloadDriveFile(file.objectKey);
  if (
    object.bytes.length !== file.sizeBytes ||
    object.contentType?.split(";")[0] !== file.contentType
  ) {
    throw new Error("The stored file does not match its metadata.");
  }
  return { file, bytes: object.bytes };
}

export async function deleteOwnedStudyFile(userId: string, fileId: string) {
  const file = await prisma.uploadedFile.findFirst({
    where: { id: fileId, userId, purpose: "study-document" },
  });
  if (!file) return false;
  if (!env.GOOGLE_DRIVE_ENABLED) {
    throw new Error("Google Drive file storage is not configured.");
  }

  const attached = await Promise.all([
    prisma.note.findFirst({ where: { userId, fileId } }),
    prisma.assignment.findFirst({ where: { userId, fileId } }),
    prisma.userProfile.findFirst({ where: { userId, avatarFileId: fileId } }),
  ]);
  if (attached.some(Boolean)) {
    throw new Error("This file is attached to another record and cannot be deleted.");
  }

  await deleteDriveFile(file.objectKey);
  await prisma.uploadedFile.delete({ where: { id: fileId } });
  return true;
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

  if (!env.GOOGLE_DRIVE_ENABLED) {
    res.status(503).json({ error: "Google Drive file storage is not configured." })

    return
  }

  try {
    const id = randomUUID()

    const key = `${req.userId}/${id}`

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
      uploadUrl: `/api/files/${id}/content`,
    })
  } catch (error) {
    next(error)
  }
})

filesRouter.put(
  "/:id/content",
  express.raw({ type: "*/*", limit: MAX_FILE_BYTES }),
  async (req, res, next) => {
    if (!env.GOOGLE_DRIVE_ENABLED) {
      res.status(503).json({ error: "Google Drive file storage is not configured." })
      return
    }

    try {
      const file = await prisma.uploadedFile.findFirst({
        where: { id: req.params.id, userId: req.userId },
      })
      if (!file) {
        res.status(404).json({ error: "Upload not found." })
        return
      }
      if (file.status === "complete") {
        res.status(409).json({ error: "This upload has already been completed." })
        return
      }
      if (!Buffer.isBuffer(req.body) || req.body.length !== file.sizeBytes) {
        res.status(400).json({ error: "Uploaded file size does not match its metadata." })
        return
      }
      if (req.get("content-type")?.split(";")[0] !== file.contentType) {
        res.status(400).json({ error: "Uploaded file type does not match its metadata." })
        return
      }
      if (!matchesFileSignature(file.contentType, file.fileName, req.body)) {
        res.status(400).json({ error: "File content does not match the permitted file type." })
        return
      }

      const driveFileId = await uploadDriveFile(
        file.id,
        req.userId!,
        file.fileName,
        file.contentType,
        req.body,
      )
      let completed
      try {
        completed = await prisma.uploadedFile.update({
          where: { id: file.id },
          data: { objectKey: driveFileId, status: "complete" },
        })
      } catch (error) {
        try {
          await deleteDriveFile(driveFileId)
        } catch (cleanupError) {
          console.error("Could not clean up an unregistered Google Drive file:", cleanupError)
        }
        throw error
      }
      const { objectKey: _objectKey, ...publicFile } = completed
      res.status(201).json(publicFile)
    } catch (error) {
      next(error)
    }
  },
)

filesRouter.get("/:id/download-url", async (req, res, next) => {
  if (!env.GOOGLE_DRIVE_ENABLED) {
    res.status(503).json({ error: "Google Drive file storage is not configured." })
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

    res.json({
      url: `/api/files/${encodeURIComponent(file.id)}/download`,
      fileName: file.fileName,
      contentType: file.contentType,
    })
  } catch (error) {
    next(error)
  }
})

filesRouter.get("/:id/download", async (req, res, next) => {
  if (!env.GOOGLE_DRIVE_ENABLED) {
    res.status(503).json({ error: "Google Drive file storage is not configured." })
    return
  }

  try {
    const file = await prisma.uploadedFile.findFirst({
      where: {
        id: req.params.id,
        userId: req.userId,
        status: "complete",
      },
    })
    if (!file) {
      res.status(404).json({ error: "File not found." })
      return
    }
    const object = await downloadDriveFile(file.objectKey)
    if (
      object.bytes.length !== file.sizeBytes ||
      object.contentType?.split(";")[0] !== file.contentType
    ) {
      throw new Error("Stored file does not match its metadata.")
    }
    res.setHeader("Content-Type", file.contentType)
    res.setHeader(
      "Content-Disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
    )
    res.setHeader("Content-Length", object.bytes.length)
    res.send(Buffer.from(object.bytes))
  } catch (error) {
    next(error)
  }
})

filesRouter.delete("/:id", async (req, res, next) => {
  if (!env.GOOGLE_DRIVE_ENABLED) {
    res.status(503).json({ error: "Google Drive file storage is not configured." })

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

    const [note, assignment, profile, studyDocument] = await Promise.all([
      prisma.note.findFirst({ where: { userId: req.userId!, fileId: file.id } }),
      prisma.assignment.findFirst({ where: { userId: req.userId!, fileId: file.id } }),
      prisma.userProfile.findFirst({ where: { userId: req.userId!, avatarFileId: file.id } }),
      prisma.aiDocument.findFirst({ where: { userId: req.userId!, fileId: file.id } }),
    ])
    if (note || assignment || profile || studyDocument) {
      res.status(409).json({ error: "Remove this file from its attached record before deleting it." })
      return
    }

    if (file.objectKey !== `${file.userId}/${file.id}`) {
      await deleteDriveFile(file.objectKey)
    }

    await prisma.uploadedFile.delete({
      where: { id: file.id },
    })

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})
