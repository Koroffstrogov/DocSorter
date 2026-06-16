import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureUserRulesFile,
  getUserRulesPath,
  loadMergedNamingRulesCatalog,
  loadUserRulesCatalog,
  saveUserRulesCatalog
} from "./userNamingRulesStore";

const temporaryRoots: string[] = [];

describe("user naming rules store", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.splice(0).map((temporaryRoot) =>
        rm(temporaryRoot, { recursive: true, force: true })
      )
    );
  });

  it("resolves the user rules path under userData/config", async () => {
    const userDataPath = await createTemporaryUserDataPath();

    expect(getUserRulesPath(userDataPath)).toBe(
      path.join(userDataPath, "config", "naming-suggestion-rules.json")
    );
  });

  it("creates a minimal user rules file if absent", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    const result = await ensureUserRulesFile(userDataPath);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.created).toBe(true);
    const content = JSON.parse(await readFile(getUserRulesPath(userDataPath), "utf8"));
    expect(content).toEqual(createCatalog());
  });

  it("loads a valid user catalog", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    await writeUserRulesFile(userDataPath, createCatalog({
      documentTypeRules: [
        createRule({
          id: "user:type-facture-entretien",
          label: "Facture entretien",
          match: { allOf: ["facture"], anyOf: ["garage"] },
          output: { documentType: "facture-entretien" },
          confidence: 80
        })
      ]
    }));

    const result = await loadUserRulesCatalog(userDataPath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.catalog.documentTypeRules[0].id).toBe("user:type-facture-entretien");
    }
  });

  it("refuses invalid JSON without overwriting it", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    await writeRawUserRulesFile(userDataPath, "{ invalid json");

    const result = await loadUserRulesCatalog(userDataPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("USER_RULES_INVALID_JSON");
    }
    expect(await readFile(getUserRulesPath(userDataPath), "utf8")).toBe("{ invalid json");
  });

  it("refuses an invalid schema", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    await writeUserRulesFile(userDataPath, {
      version: 1,
      documentTypeRules: [{ id: "", label: "Invalid", match: {}, output: {}, confidence: 120 }],
      subjectRules: [],
      keywordRules: [],
      stopWords: []
    });

    const result = await loadUserRulesCatalog(userDataPath);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("USER_RULES_INVALID_SCHEMA");
    }
  });

  it("saves a valid user catalog atomically enough for this MVP", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    const catalog = createCatalog({
      keywordRules: [
        {
          id: "user:keyword-entretien",
          value: "entretien",
          aliases: [],
          match: { anyOf: ["vidange", "revision"] },
          confidence: 70,
          label: "Mot-cle entretien"
        }
      ]
    });

    const result = await saveUserRulesCatalog(userDataPath, catalog);

    expect(result.ok).toBe(true);
    const content = JSON.parse(await readFile(getUserRulesPath(userDataPath), "utf8"));
    expect(content.keywordRules[0].id).toBe("user:keyword-entretien");
  });

  it("merges default and user catalogs", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    await writeUserRulesFile(userDataPath, createCatalog({
      subjectRules: [
        createRule({
          id: "user:subject-garage",
          label: "Sujet garage",
          match: { anyOf: ["garage"] },
          output: { subject: "Garage" },
          confidence: 70
        })
      ]
    }));

    const result = await loadMergedNamingRulesCatalog(userDataPath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.defaultRuleCount).toBeGreaterThan(0);
      expect(result.value.userRuleCount).toBe(1);
      expect(result.value.mergedCatalog.subjectRules.some((rule) => rule.id === "user:subject-garage")).toBe(
        true
      );
    }
  });

  it("refuses a user rule id that duplicates a default id", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    const result = await saveUserRulesCatalog(
      userDataPath,
      createCatalog({
        documentTypeRules: [
          createRule({
            id: "document-type-facture",
            label: "Duplicate",
            match: { anyOf: ["facture"] },
            output: { documentType: "facture-custom" },
            confidence: 80
          })
        ]
      })
    );

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("USER_RULES_INVALID_SCHEMA");
    }
  });

  it("falls back to defaults if the user file is invalid", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    await writeRawUserRulesFile(userDataPath, "{ invalid json");

    const result = await loadMergedNamingRulesCatalog(userDataPath);

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.status).toBe("invalid");
      expect(result.value.warning?.code).toBe("USER_RULES_INVALID_JSON");
      expect(result.value.userRuleCount).toBe(0);
      expect(result.value.defaultRuleCount).toBeGreaterThan(0);
    }
  });

  it("does not mutate default rules through returned merged catalogs", async () => {
    const userDataPath = await createTemporaryUserDataPath();
    const first = await loadMergedNamingRulesCatalog(userDataPath);
    expect(first.ok).toBe(true);
    if (!first.ok) {
      return;
    }

    first.value.mergedCatalog.documentTypeRules[0].output.documentType = "mutated";
    const second = await loadMergedNamingRulesCatalog(userDataPath);

    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.mergedCatalog.documentTypeRules[0].output.documentType).not.toBe(
        "mutated"
      );
    }
  });
});

async function createTemporaryUserDataPath(): Promise<string> {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "docsorter-rules-"));
  temporaryRoots.push(temporaryRoot);
  return temporaryRoot;
}

async function writeUserRulesFile(userDataPath: string, catalog: unknown): Promise<void> {
  await writeRawUserRulesFile(userDataPath, JSON.stringify(catalog, null, 2));
}

async function writeRawUserRulesFile(userDataPath: string, content: string): Promise<void> {
  const rulesPath = getUserRulesPath(userDataPath);
  await mkdir(path.dirname(rulesPath), { recursive: true });
  await writeFile(rulesPath, content, "utf8");
}

function createCatalog(overrides: Partial<NamingSuggestionRulesCatalog> = {}): NamingSuggestionRulesCatalog {
  return {
    version: 1,
    documentTypeRules: [],
    subjectRules: [],
    keywordRules: [],
    stopWords: [],
    ...overrides
  };
}

function createRule(rule: NamingSuggestionRule): NamingSuggestionRule {
  return rule;
}
