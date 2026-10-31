import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db.js";
import {
  embedTexts,
  EMBEDDING_DIMENSIONS,
  generateText,
  getProviderName,
  type AiMessageInput,
  type AiUsage,
} from "./provider.js";
import {
  extractDocumentText,
  splitDocumentIntoChunks,
} from "./documents.js";
import { readOwnedStudyFile } from "../routes/files.js";

const activeDocumentJobs = new Set<string>();
let lastRateLimitCleanup = 0;

export class AiRateLimitError extends Error {
  constructor() {
    super("AI request limit reached. Wait a minute before trying again.");
    this.name = "AiRateLimitError";
  }
}

export async function consumeAiRequest(userId: string) {
  const now = new Date();
  now.setSeconds(0, 0);
  const bucket = await prisma.aiRateLimitBucket.upsert({
    where: { userId_windowStart: { userId, windowStart: now } },
    create: { userId, windowStart: now, requests: 1 },
    update: { requests: { increment: 1 } },
  });
  if (bucket.requests > 20) throw new AiRateLimitError();

  if (Date.now() - lastRateLimitCleanup > 60_000) {
    lastRateLimitCleanup = Date.now();
    void prisma.aiRateLimitBucket
      .deleteMany({ where: { windowStart: { lt: new Date(Date.now() - 3_600_000) } } })
      .catch((error) => console.error("Could not clean up AI rate limit buckets:", error));
  }
}

export async function recordAiUsage(
  userId: string,
  operation: string,
  model: string,
  usage: AiUsage,
) {
  await prisma.aiUsage.create({
    data: {
      id: randomUUID(),
      userId,
      provider: getProviderName(),
      model,
      operation,
      inputTokens: Math.max(0, Math.round(usage.inputTokens)),
      outputTokens: Math.max(0, Math.round(usage.outputTokens)),
    },
  });
}

export async function generateAndTrack(
  userId: string,
  operation: string,
  messages: AiMessageInput[],
  json = false,
) {
  const result = await generateText(messages, { json });
  await recordAiUsage(userId, operation, result.model, result.usage);
  return result;
}

export function parseJsonResponse<T>(value: string): T {
  const cleaned = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  return JSON.parse(cleaned) as T;
}

export async function startDocumentProcessing(
  documentId: string,
  userId: string,
) {
  if (activeDocumentJobs.has(documentId)) return;
  activeDocumentJobs.add(documentId);

  try {
    const document = await prisma.aiDocument.findFirst({
      where: { id: documentId, userId },
    });
    if (!document) return;

    await prisma.aiDocument.update({
      where: { id: documentId },
      data: {
        status: "processing",
        processingError: null,
        processedChunks: 0,
        totalChunks: 0,
      },
    });
    await prisma.aiDocumentChunk.deleteMany({ where: { documentId } });

    const stored = await readOwnedStudyFile(userId, document.fileId);
    if (!stored) throw new Error("The uploaded document is unavailable.");
    const pages = await extractDocumentText(
      stored.file.fileName,
      stored.file.contentType,
      stored.bytes,
    );
    const chunks = splitDocumentIntoChunks(pages);
    await prisma.aiDocument.update({
      where: { id: documentId },
      data: { totalChunks: chunks.length },
    });

    for (let offset = 0; offset < chunks.length; offset += 64) {
      const batch = chunks.slice(offset, offset + 64);
      const embedded = await embedTexts(
        batch.map((chunk) => chunk.content),
        "RETRIEVAL_DOCUMENT",
      );
      if (embedded.embeddings.some((vector) => vector.length !== EMBEDDING_DIMENSIONS)) {
        throw new Error("The configured embedding model returned an incompatible vector.");
      }

      const rows = batch.map((chunk, index) => {
        const embedding = embedded.embeddings[index];
        if (!embedding) throw new Error("An embedding was missing from the provider response.");
        const vector = `[${embedding.join(",")}]`;
        return Prisma.sql`(${randomUUID()}, ${documentId}, ${offset + index}, ${chunk.content}, ${chunk.pageNumber}, ${vector}::vector, CURRENT_TIMESTAMP)`;
      });
      await prisma.$executeRaw(Prisma.sql`
        INSERT INTO "AiDocumentChunk" ("id", "documentId", "position", "content", "pageNumber", "embedding", "createdAt")
        VALUES ${Prisma.join(rows)}
      `);
      await recordAiUsage(
        userId,
        "document_embedding",
        embedded.model,
        embedded.usage,
      );
      await prisma.aiDocument.update({
        where: { id: documentId },
        data: { processedChunks: offset + batch.length },
      });
    }

    await prisma.aiDocument.update({
      where: { id: documentId },
      data: { status: "ready", processingError: null },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Document processing failed.";
    console.error(`AI document processing failed (${documentId}):`, message);
    try {
      await prisma.aiDocument.updateMany({
        where: { id: documentId, userId },
        data: { status: "failed", processingError: message.slice(0, 500) },
      });
    } catch (updateError) {
      console.error(`Could not save processing error for document ${documentId}:`, updateError);
    }
  } finally {
    activeDocumentJobs.delete(documentId);
  }
}

export interface RetrievedChunk {
  id: string;
  documentId: string;
  fileName: string;
  pageNumber: number | null;
  content: string;
  similarity: number;
}

export async function retrieveDocumentChunks(
  userId: string,
  courseCode: string | null,
  query: string,
  limit = 8,
) {
  const documents = await prisma.aiDocument.findMany({
    where: { userId, status: "ready", ...(courseCode ? { courseCode } : {}) },
    select: { id: true },
  });
  if (documents.length === 0) return [];

  const embedded = await embedTexts([query], "RETRIEVAL_QUERY");
  await recordAiUsage(userId, "retrieval_embedding", embedded.model, embedded.usage);
  const vector = `[${embedded.embeddings[0]?.join(",") ?? ""}]`;
  if (vector === "[]") throw new Error("The AI provider returned an empty query vector.");

  return prisma.$queryRaw<RetrievedChunk[]>(Prisma.sql`
    SELECT
      chunk."id",
      chunk."documentId",
      document."fileName",
      chunk."pageNumber",
      chunk."content",
      1 - (chunk."embedding" <=> ${vector}::vector) AS "similarity"
    FROM "AiDocumentChunk" AS chunk
    INNER JOIN "AiDocument" AS document ON document."id" = chunk."documentId"
    WHERE document."userId" = ${userId}
      AND document."status" = 'ready'
      AND (${courseCode}::text IS NULL OR document."courseCode" = ${courseCode})
    ORDER BY chunk."embedding" <=> ${vector}::vector
    LIMIT ${limit}
  `);
}

export async function loadDocumentText(
  userId: string,
  courseCode: string,
  documentIds: string[] = [],
  maxCharacters = 500_000,
) {
  const documents = await prisma.aiDocument.findMany({
    where: {
      userId,
      courseCode,
      status: "ready",
      ...(documentIds.length ? { id: { in: documentIds } } : {}),
    },
    select: { id: true, fileName: true },
    orderBy: { createdAt: "desc" },
  });
  if (documentIds.length && documents.length !== new Set(documentIds).size) {
    throw new Error("One or more selected documents are not available for this course.");
  }
  if (documents.length === 0) {
    throw new Error("Upload and process a course document before using this tool.");
  }

  const chunks = await prisma.aiDocumentChunk.findMany({
    where: { documentId: { in: documents.map((document) => document.id) } },
    select: { documentId: true, pageNumber: true, content: true },
    orderBy: [{ documentId: "asc" }, { position: "asc" }],
  });
  let characters = 0;
  const sections: string[] = [];
  const fileNames = new Map(documents.map((document) => [document.id, document.fileName]));
  for (const chunk of chunks) {
    if (characters >= maxCharacters) break;
    const excerpt = chunk.content.slice(0, maxCharacters - characters);
    characters += excerpt.length;
    const name = fileNames.get(chunk.documentId) ?? "Course document";
    const page = chunk.pageNumber ? `, page ${chunk.pageNumber}` : "";
    sections.push(`[${name}${page}]\n${excerpt}`);
  }
  return { text: sections.join("\n\n"), documentCount: documents.length };
}

export function citationsFromAnswer(
  answer: string,
  sources: RetrievedChunk[],
) {
  const used = new Set<number>();
  const safeAnswer = answer.replace(/\[S(\d+)\]/g, (marker, number: string) => {
    const index = Number(number) - 1;
    if (index < 0 || index >= sources.length) return "";
    used.add(index);
    return marker;
  });
  return {
    answer: safeAnswer.trim(),
    citations: [...used].map((index) => {
      const source = sources[index]!;
      return {
        reference: `S${index + 1}`,
        documentId: source.documentId,
        fileName: source.fileName,
        pageNumber: source.pageNumber,
      };
    }),
  };
}
