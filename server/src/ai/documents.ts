import { createRequire } from "node:module";
import mammoth from "mammoth";

const pdfParse = createRequire(import.meta.url)(
  "pdf-parse/lib/pdf-parse.js",
) as typeof import("pdf-parse");

export interface ExtractedPage {
  pageNumber: number | null;
  text: string;
}

export const MAX_EXTRACTED_CHARACTERS = 500_000;

export async function extractDocumentText(
  fileName: string,
  contentType: string,
  bytes: Uint8Array,
): Promise<ExtractedPage[]> {
  const extension = fileName.split(".").pop()?.toLowerCase();
  if (contentType === "application/pdf" || extension === "pdf") {
    const renderedPages: string[] = [];
    const parsed = await pdfParse(Buffer.from(bytes), {
      pagerender: async (pageData: {
        getTextContent: () => Promise<{
          items: { str?: string; hasEOL?: boolean }[];
        }>;
      }) => {
        const content = await pageData.getTextContent();
        const text = content.items
          .map((item) => `${item.str ?? ""}${item.hasEOL ? "\n" : " "}`)
          .join("")
          .trim();
        renderedPages.push(text);
        return text;
      },
    });
    const pageTexts = renderedPages.length
      ? renderedPages
      : parsed.text.split(/\f|\n{2,}/);
    return pageTexts
      .map((text, index) => ({ pageNumber: index + 1, text: text.trim() }))
      .filter((page) => page.text);
  }

  if (
    contentType ===
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    extension === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    return [{ pageNumber: null, text: result.value.trim() }];
  }

  if (contentType === "text/plain" || extension === "txt") {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return text
      .split("\f")
      .map((page, index) => ({ pageNumber: index + 1, text: page.trim() }))
      .filter((page) => page.text);
  }

  throw new Error("Only PDF, DOCX, and TXT documents can be processed.");
}

export function splitDocumentIntoChunks(pages: ExtractedPage[]) {
  const totalCharacters = pages.reduce((sum, page) => sum + page.text.length, 0);
  if (totalCharacters > MAX_EXTRACTED_CHARACTERS) {
    throw new Error(
      "This document contains too much text to process. Split it into smaller files and retry.",
    );
  }

  const chunks: { content: string; pageNumber: number | null }[] = [];
  const chunkSize = 1200;
  const overlap = 180;
  for (const page of pages) {
    const text = page.text.replace(/\s+/g, " ").trim();
    for (let start = 0; start < text.length; start += chunkSize - overlap) {
      const content = text.slice(start, start + chunkSize).trim();
      if (content.length >= 40) {
        chunks.push({ content, pageNumber: page.pageNumber });
      }
    }
  }
  if (chunks.length === 0) {
    throw new Error(
      "No readable text was found. Scanned PDFs require OCR and cannot be processed yet.",
    );
  }
  return chunks;
}
