import { mkdir, mkdtemp, readFile, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type {
  ExtractTextFromPdfDocumentOptions,
  PdfTextExtractionResult
} from "../extraction/pdfTextExtraction";
import {
  extractTextFromPdfDocumentWithAnalysisCache,
  getAnalysisCacheFilePath
} from "./pdfAnalysisCache";

const fixedNow = () => new Date("2026-06-16T10:00:00.000Z");

describe("pdf analysis cache", () => {
  it("reanalyzes when cache is absent and writes a local cache entry", async () => {
    const { userDataPath, documentPath } = await createFixture();
    const extractor = createFakeExtractor("Facture Renault Captur");

    const result = await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    expect(extractor.calls).toBe(1);
    if (result.ok) {
      expect(result.value.fromCache).toBe(false);
    }
    await expect(readFile(getAnalysisCacheFilePath(userDataPath, documentPath), "utf8")).resolves.toContain(
      "Facture Renault Captur"
    );
  });

  it("ignores invalid JSON cache and reanalyzes", async () => {
    const { userDataPath, documentPath } = await createFixture();
    const cacheFilePath = getAnalysisCacheFilePath(userDataPath, documentPath);
    await mkdir(path.dirname(cacheFilePath), { recursive: true });
    await writeFile(cacheFilePath, "{invalid json", "utf8");
    const extractor = createFakeExtractor("Texte recalculé");

    const result = await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    expect(extractor.calls).toBe(1);
    await expect(readFile(cacheFilePath, "utf8")).resolves.toContain("Texte recalculé");
  });

  it("returns a cache hit without calling extraction again", async () => {
    const { userDataPath, documentPath } = await createFixture();
    const extractor = createFakeExtractor("Facture Scenic");

    await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });
    const second = await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });

    expect(extractor.calls).toBe(1);
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.fromCache).toBe(true);
      expect(second.value.excerpt).toBe("Facture Scenic");
    }
  });

  it("does not serve cache for a document outside the scanned queue", async () => {
    const { userDataPath, documentPath } = await createFixture();
    const extractor = createFakeExtractor("Facture Scenic");

    await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });
    extractor.nextError = {
      code: "DOCUMENT_NOT_IN_QUEUE",
      message: "Document non présent dans la dernière file scannée."
    };

    const second = await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });

    expect(extractor.calls).toBe(2);
    expect(second).toEqual({
      ok: false,
      error: {
        code: "DOCUMENT_NOT_IN_QUEUE",
        message: "Document non présent dans la dernière file scannée."
      }
    });
  });


  it("misses cache when size or mtime changes", async () => {
    const { userDataPath, documentPath } = await createFixture();
    const extractor = createFakeExtractor("Premier texte");

    await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });
    await writeFile(documentPath, "%PDF contenu modifié", "utf8");
    await utimes(documentPath, new Date("2026-06-16T11:00:00.000Z"), new Date("2026-06-16T11:00:00.000Z"));
    extractor.nextText = "Second texte";

    const result = await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });

    expect(result.ok).toBe(true);
    expect(extractor.calls).toBe(2);
    if (result.ok) {
      expect(result.value.fromCache).toBe(false);
      expect(result.value.excerpt).toBe("Second texte");
    }
  });

  it("does not mutate the document file", async () => {
    const { userDataPath, documentPath } = await createFixture("%PDF original");
    const beforeContent = await readFile(documentPath, "utf8");
    const beforeStats = await stat(documentPath);
    const extractor = createFakeExtractor("Texte");

    await extractTextFromPdfDocumentWithAnalysisCache({
      documentPath,
      queuedDocumentPaths: [documentPath],
      userDataPath,
      extractText: extractor.extractText,
      now: fixedNow
    });

    await expect(readFile(documentPath, "utf8")).resolves.toBe(beforeContent);
    expect((await stat(documentPath)).mtimeMs).toBe(beforeStats.mtimeMs);
  });
});

async function createFixture(content = "%PDF document"): Promise<{
  userDataPath: string;
  documentPath: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-analysis-cache-"));
  const userDataPath = path.join(root, "userData");
  const documentPath = path.join(root, "document.pdf");
  await writeFile(documentPath, content, "utf8");
  return { userDataPath, documentPath };
}

function createFakeExtractor(initialText: string): {
  calls: number;
  nextText: string;
  nextError: Extract<PdfTextExtractionResult, { ok: false }>["error"] | null;
  extractText: (options: ExtractTextFromPdfDocumentOptions) => Promise<PdfTextExtractionResult>;
} {
  const fake = {
    calls: 0,
    nextText: initialText,
    nextError: null as Extract<PdfTextExtractionResult, { ok: false }>["error"] | null,
    async extractText(options: ExtractTextFromPdfDocumentOptions) {
      fake.calls += 1;
      if (fake.nextError) {
        return {
          ok: false,
          error: fake.nextError
        };
      }

      return {
        ok: true,
        value: {
          status: "text-found",
          pageCount: 1,
          pagesAnalyzed: 1,
          characterCount: fake.nextText.length,
          excerpt: fake.nextText,
          excerptCharacterCount: fake.nextText.length,
          truncated: false,
          extractedAt: (options.now ?? fixedNow)().toISOString()
        }
      };
    }
  };
  return fake;
}
