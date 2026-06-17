import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildSuggestionV2ForDocument } from "./buildSuggestionV2ForDocument";

const temporaryDirectories: string[] = [];

describe("buildSuggestionV2ForDocument", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
    );
  });

  it("builds a read-only v2 suggestion with name and target folder options", async () => {
    const workspace = await createWorkspace();
    await writeReferenceData(workspace.userDataPath);
    const documentPath = path.join(workspace.sourcePath, "scan_renault_captur.pdf");

    const result = await buildSuggestionV2ForDocument({
      documentPath,
      textContext: {
        source: "pdf-native",
        excerpt: "Facture Renault Captur vidange du 05/03/2024"
      },
      legacyDraft: {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      queuedDocuments: [{ filePath: documentPath, name: "scan_renault_captur.pdf" }],
      queuedDocumentPaths: [documentPath],
      userDataPath: workspace.userDataPath,
      knownRelativeFolders: ["Vehicules/Captur"],
      now: () => new Date("2026-06-17T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value.draft.proposedName).toBe(
      "2024-03-05_captur_facture-entretien_renault.pdf"
    );
    expect(result.value.draft).toMatchObject({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault"
    });
    expect(result.value.targetFolderSuggestion.recommended?.relativePath).toBe("Vehicules/Captur");
    expect(result.value.missingFields).toEqual([]);
    expect(result.value.builtAt).toBe("2026-06-17T10:00:00.000Z");
  });

  it("returns an incomplete suggestion when reference entities are absent", async () => {
    const workspace = await createWorkspace();
    const documentPath = path.join(workspace.sourcePath, "avis.pdf");

    const result = await buildSuggestionV2ForDocument({
      documentPath,
      textContext: {
        source: "pdf-native",
        excerpt: "Avis d'imposition 2025"
      },
      legacyDraft: {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      queuedDocuments: [{ filePath: documentPath, name: "avis.pdf" }],
      queuedDocumentPaths: [documentPath],
      userDataPath: workspace.userDataPath
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value.draft.documentType).toBe("avis-imposition");
    expect(result.value.draft.proposedName).toBeUndefined();
    expect(result.value.missingFields).toContain("target");
    expect(result.value.referenceDataWarnings.length).toBeGreaterThan(0);
  });

  it("refuses a document outside the last scanned queue", async () => {
    const workspace = await createWorkspace();
    const result = await buildSuggestionV2ForDocument({
      documentPath: path.join(workspace.sourcePath, "outside.pdf"),
      textContext: null,
      legacyDraft: null,
      queuedDocuments: [],
      queuedDocumentPaths: [],
      userDataPath: workspace.userDataPath
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SUGGESTION_V2_DOCUMENT_NOT_IN_QUEUE",
        message: "Le document n'appartient pas à la dernière file scannée."
      }
    });
  });

  it("returns a sober error when reference data is invalid", async () => {
    const workspace = await createWorkspace();
    const documentPath = path.join(workspace.sourcePath, "document.pdf");
    const referenceDataPath = path.join(workspace.userDataPath, "config", "reference-data");
    await mkdir(referenceDataPath, { recursive: true });
    await writeFile(path.join(referenceDataPath, "document-types.json"), "{ invalid", "utf8");

    const result = await buildSuggestionV2ForDocument({
      documentPath,
      textContext: null,
      legacyDraft: null,
      queuedDocuments: [{ filePath: documentPath, name: "document.pdf" }],
      queuedDocumentPaths: [documentPath],
      userDataPath: workspace.userDataPath
    });

    expect(result).toEqual({
      ok: false,
      error: {
        code: "SUGGESTION_V2_REFERENCE_DATA_INVALID",
        message: "Référentiels v2 indisponibles ou invalides."
      }
    });
  });

  it("bounds extracted text before matching reference aliases", async () => {
    const workspace = await createWorkspace();
    await writeReferenceData(workspace.userDataPath);
    const documentPath = path.join(workspace.sourcePath, "document.pdf");
    const longText = `${"x".repeat(6_001)} Renault Captur`;

    const result = await buildSuggestionV2ForDocument({
      documentPath,
      textContext: {
        source: "pdf-native",
        excerpt: longText
      },
      legacyDraft: {
        documentDate: "",
        subject: "",
        documentType: "",
        keywords: ""
      },
      queuedDocuments: [{ filePath: documentPath, name: "document.pdf" }],
      queuedDocumentPaths: [documentPath],
      userDataPath: workspace.userDataPath
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.value.draft.target).toBeUndefined();
  });

  it("does not create, rename, move or delete source files", async () => {
    const workspace = await createWorkspace();
    await writeReferenceData(workspace.userDataPath);
    const documentPath = path.join(workspace.sourcePath, "scan_renault_captur.pdf");
    const before = await readdir(workspace.sourcePath);

    await buildSuggestionV2ForDocument({
      documentPath,
      textContext: {
        source: "pdf-native",
        excerpt: "Facture Renault Captur vidange du 05/03/2024"
      },
      legacyDraft: null,
      queuedDocuments: [{ filePath: documentPath, name: "scan_renault_captur.pdf" }],
      queuedDocumentPaths: [documentPath],
      userDataPath: workspace.userDataPath
    });

    const after = await readdir(workspace.sourcePath);
    expect(after).toEqual(before);
  });
});

async function createWorkspace(): Promise<{
  root: string;
  sourcePath: string;
  userDataPath: string;
}> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-suggestion-v2-"));
  temporaryDirectories.push(root);
  const sourcePath = path.join(root, "source");
  const userDataPath = path.join(root, "user-data");
  await mkdir(sourcePath, { recursive: true });
  await mkdir(userDataPath, { recursive: true });
  await writeFile(path.join(sourcePath, "scan_renault_captur.pdf"), "source", "utf8");
  await writeFile(path.join(sourcePath, "avis.pdf"), "source", "utf8");
  await writeFile(path.join(sourcePath, "document.pdf"), "source", "utf8");
  return { root, sourcePath, userDataPath };
}

async function writeReferenceData(userDataPath: string): Promise<void> {
  const referenceDataPath = path.join(userDataPath, "config", "reference-data");
  const entitiesPath = path.join(referenceDataPath, "entities");
  await mkdir(entitiesPath, { recursive: true });
  await writeFile(
    path.join(entitiesPath, "vehicles.json"),
    JSON.stringify([
      {
        id: "captur",
        label: "Renault Captur",
        fileAlias: "captur",
        folderAlias: "Vehicules/Captur",
        aliases: ["renault captur", "captur"]
      }
    ]),
    "utf8"
  );
  await writeFile(
    path.join(entitiesPath, "providers.json"),
    JSON.stringify([
      {
        id: "renault",
        label: "Renault",
        fileAlias: "renault",
        aliases: ["renault"]
      }
    ]),
    "utf8"
  );
}
