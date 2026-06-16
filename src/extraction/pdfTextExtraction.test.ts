import { mkdtemp, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  aggregatePageText,
  buildPdfTextExtraction,
  createTextExcerpt,
  extractTextFromPdfDocument,
  normalizeExtractedText,
  type PdfTextExtractor
} from "./pdfTextExtraction";

const fixedNow = () => new Date("2026-06-16T10:00:00.000Z");

describe("pdf text extraction helpers", () => {
  it("normalizes spaces without preserving noisy whitespace", () => {
    expect(normalizeExtractedText("  Facture\t\tEDF\r\n\n  Juin   2026  ")).toBe(
      "Facture EDF\nJuin 2026"
    );
  });

  it("aggregates page text with light page separation", () => {
    expect(aggregatePageText([" Page 1   texte ", "", "Page\t2 texte"])).toBe(
      "Page 1 texte\n\nPage 2 texte"
    );
  });

  it("limits excerpts", () => {
    expect(createTextExcerpt("abcdefghij", 4)).toBe("abcd");
  });

  it("returns empty status when no text is extracted", () => {
    const result = buildPdfTextExtraction(
      {
        pageCount: 2,
        pagesAnalyzed: 2,
        pageTexts: ["   ", ""]
      },
      {
        maxExcerptLength: 100,
        extractedAt: "2026-06-16T10:00:00.000Z"
      }
    );

    expect(result).toMatchObject({
      status: "empty",
      pageCount: 2,
      pagesAnalyzed: 2,
      characterCount: 0,
      excerpt: ""
    });
  });

  it("returns text metadata and truncation status", () => {
    const result = buildPdfTextExtraction(
      {
        pageCount: 1,
        pagesAnalyzed: 1,
        pageTexts: ["abcdefghij"]
      },
      {
        maxExcerptLength: 5,
        extractedAt: "2026-06-16T10:00:00.000Z"
      }
    );

    expect(result).toMatchObject({
      status: "text-found",
      characterCount: 10,
      excerpt: "abcde",
      excerptCharacterCount: 5,
      truncated: true
    });
  });
});

describe("extractTextFromPdfDocument", () => {
  it("returns a clean error if the file is missing", async () => {
    const filePath = path.join(await mkdtemp(path.join(os.tmpdir(), "docsorter-pdf-text-")), "missing.pdf");

    const result = await extractTextFromPdfDocument({
      documentPath: filePath,
      queuedDocumentPaths: [filePath],
      now: fixedNow
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_NOT_FOUND",
        message: "Document PDF indisponible."
      }
    });
  });

  it("refuses non-PDF documents", async () => {
    const filePath = await createTempFile("image.png", "png");

    const result = await extractTextFromPdfDocument({
      documentPath: filePath,
      queuedDocumentPaths: [filePath],
      now: fixedNow
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_NOT_PDF",
        message: "Extraction texte disponible uniquement pour les PDF."
      }
    });
  });

  it("refuses documents outside the last scanned queue", async () => {
    const filePath = await createTempFile("document.pdf", "%PDF");

    const result = await extractTextFromPdfDocument({
      documentPath: filePath,
      queuedDocumentPaths: [],
      now: fixedNow
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_NOT_IN_QUEUE",
        message: "Document non présent dans la dernière file scannée."
      }
    });
  });

  it("returns empty status when the injected extractor finds no text", async () => {
    const filePath = await createTempFile("document.pdf", "%PDF");
    const extractor: PdfTextExtractor = {
      extractText: async () => ({
        pageCount: 1,
        pagesAnalyzed: 1,
        pageTexts: [""]
      })
    };

    const result = await extractTextFromPdfDocument(
      {
        documentPath: filePath,
        queuedDocumentPaths: [filePath],
        now: fixedNow
      },
      extractor
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("empty");
      expect(result.value.extractedAt).toBe("2026-06-16T10:00:00.000Z");
    }
  });

  it("does not modify files while extracting", async () => {
    const filePath = await createTempFile("document.pdf", "%PDF unchanged");
    const beforeContent = await readFile(filePath, "utf8");
    const beforeStats = await stat(filePath);
    const extractor: PdfTextExtractor = {
      extractText: async () => ({
        pageCount: 1,
        pagesAnalyzed: 1,
        pageTexts: ["Texte"]
      })
    };

    await extractTextFromPdfDocument(
      {
        documentPath: filePath,
        queuedDocumentPaths: [filePath],
        now: fixedNow
      },
      extractor
    );

    await expect(readFile(filePath, "utf8")).resolves.toBe(beforeContent);
    expect((await stat(filePath)).mtimeMs).toBe(beforeStats.mtimeMs);
  });
});

async function createTempFile(name: string, content: string): Promise<string> {
  const directory = await mkdtemp(path.join(os.tmpdir(), "docsorter-pdf-text-"));
  const filePath = path.join(directory, name);
  await writeFile(filePath, content);
  return filePath;
}
