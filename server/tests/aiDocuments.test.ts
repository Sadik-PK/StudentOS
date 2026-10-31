import { describe, expect, test } from "vitest"
import {
  extractDocumentText,
  MAX_EXTRACTED_CHARACTERS,
  splitDocumentIntoChunks,
} from "../src/ai/documents"

describe("AI document processing", () => {
  test("extracts UTF-8 text files and preserves form-feed page boundaries", async () => {
    const bytes = new TextEncoder().encode("First page\fSecond page")

    await expect(extractDocumentText("lecture.txt", "text/plain", bytes)).resolves.toEqual([
      { pageNumber: 1, text: "First page" },
      { pageNumber: 2, text: "Second page" },
    ])
  })

  test("splits text into overlapping chunks while retaining page references", () => {
    const text = "a".repeat(2500)

    const chunks = splitDocumentIntoChunks([{ pageNumber: 4, text }])

    expect(chunks).toHaveLength(3)
    expect(chunks[0]?.pageNumber).toBe(4)
    expect(chunks[1]?.content.slice(0, 180)).toBe(chunks[0]?.content.slice(-180))
  })

  test("rejects documents above the extraction limit and text without readable chunks", () => {
    expect(() =>
      splitDocumentIntoChunks([
        { pageNumber: 1, text: "a".repeat(MAX_EXTRACTED_CHARACTERS + 1) },
      ]),
    ).toThrow(/too much text/)
    expect(() => splitDocumentIntoChunks([{ pageNumber: 1, text: "short" }])).toThrow(
      /No readable text/,
    )
  })

  test("rejects unsupported file types", async () => {
    await expect(
      extractDocumentText("lecture.rtf", "application/rtf", new Uint8Array()),
    ).rejects.toThrow(/Only PDF, DOCX, and TXT/)
  })
})
