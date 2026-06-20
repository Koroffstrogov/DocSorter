import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  getFolderLearningPreferenceForFolder,
  getFolderLearningPreferencesPath,
  loadFolderLearningPreferences,
  recordFolderLearningPreferenceFromClassification
} from "./folderLearningPreferences";

const tempRoots: string[] = [];

describe("folderLearningPreferences", () => {
  afterEach(async () => {
    await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("creates a preference after a confirmed classification with a conforming name", async () => {
    const userDataPath = await createTempUserData();

    const result = await recordFolderLearningPreferenceFromClassification({
      userDataPath,
      folderRelativePath: "Banque/Releves",
      classifiedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      confirmedAt: "2026-06-20T10:00:00.000Z"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        folderRelativePath: "Banque/Releves",
        preferredSchema: "DATE_CIBLE_DOCUMENT_EMETTEUR",
        preferredDatePrecision: "month",
        preferredTarget: "compte-joint",
        preferredDocumentType: "releve-bancaire",
        preferredIssuer: "bnp-paribas",
        detailUsage: "never",
        confirmedCount: 1,
        lastConfirmedAt: "2026-06-20T10:00:00.000Z"
      }
    });

    const loaded = await getFolderLearningPreferenceForFolder(userDataPath, "Banque/Releves");
    expect(loaded.value).toMatchObject({
      folderRelativePath: "Banque/Releves",
      confirmedCount: 1
    });
  });

  it("increments confirmedCount for repeated classifications in the same folder", async () => {
    const userDataPath = await createTempUserData();

    await recordFolderLearningPreferenceFromClassification({
      userDataPath,
      folderRelativePath: "Banque/Releves",
      classifiedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      confirmedAt: "2026-06-20T10:00:00.000Z"
    });
    const result = await recordFolderLearningPreferenceFromClassification({
      userDataPath,
      folderRelativePath: "Banque/Releves",
      classifiedName: "2026-06_compte-joint_releve-bancaire_bnp-paribas.pdf",
      confirmedAt: "2026-06-21T10:00:00.000Z"
    });

    expect(result).toMatchObject({
      ok: true,
      value: {
        confirmedCount: 2,
        lastConfirmedAt: "2026-06-21T10:00:00.000Z"
      }
    });
  });

  it("does not learn from a non-conforming final name", async () => {
    const userDataPath = await createTempUserData();

    const result = await recordFolderLearningPreferenceFromClassification({
      userDataPath,
      folderRelativePath: "Banque/Releves",
      classifiedName: "scan libre.pdf",
      confirmedAt: "2026-06-20T10:00:00.000Z"
    });

    expect(result).toMatchObject({
      ok: true,
      value: null
    });
    const loaded = await loadFolderLearningPreferences(userDataPath);
    expect(loaded.value.preferences).toEqual([]);
  });

  it("ignores corrupted JSON without crashing and rewrites a clean preference", async () => {
    const userDataPath = await createTempUserData();
    const filePath = getFolderLearningPreferencesPath(userDataPath);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{not-json", "utf8");

    const loaded = await loadFolderLearningPreferences(userDataPath);
    expect(loaded.value.preferences).toEqual([]);
    expect(loaded.warnings.join(" ")).toContain("JSON invalide");

    const result = await recordFolderLearningPreferenceFromClassification({
      userDataPath,
      folderRelativePath: "Sante/Paul",
      classifiedName: "2026_paul_carte-identite.pdf",
      confirmedAt: "2026-06-20T10:00:00.000Z"
    });

    expect(result.ok).toBe(true);
    const content = await readFile(filePath, "utf8");
    expect(content).toContain('"folderRelativePath": "Sante/Paul"');
    expect(content).not.toContain("{not-json");
  });

  it("does not store complete filenames, Windows paths or document contents", async () => {
    const userDataPath = await createTempUserData();
    await recordFolderLearningPreferenceFromClassification({
      userDataPath,
      folderRelativePath: "Banque/Releves",
      classifiedName: "2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf",
      confirmedAt: "2026-06-20T10:00:00.000Z"
    });

    const content = await readFile(getFolderLearningPreferencesPath(userDataPath), "utf8");
    expect(content).not.toContain("2026-05_compte-joint_releve-bancaire_bnp-paribas.pdf");
    expect(content).not.toContain("C:\\");
    expect(content).not.toContain("Facture");
    expect(content).toContain('"preferredDocumentType": "releve-bancaire"');
  });
});

async function createTempUserData(): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-folder-learning-"));
  tempRoots.push(root);
  return root;
}
