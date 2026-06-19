import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeAiDiagnostic } from "./aiDiagnostic";

describe("AI diagnostics", () => {
  it("keeps the invalid AI output field in the exported diagnostic", async () => {
    const writes: Array<{ filePath: string; content: string }> = [];

    const result = await writeAiDiagnostic({
      userDataPath: "C:\\tmp\\docsorter-user-data",
      documentName: "T03-bulletin_scolaire_lea_t1.pdf",
      extension: ".pdf",
      textContext: {
        source: "pdf-native",
        excerpt: "Bulletin scolaire Lea trimestre 1."
      },
      aiResult: {
        ok: false,
        error: {
          code: "AI_OUTPUT_INVALID",
          message: "Le candidat sélectionné IA doit être présent dans la liste des candidats.",
          field: "fields.documentType.selected"
        }
      },
      now: () => new Date("2026-06-19T15:05:04.635Z"),
      makeDirectory: async () => undefined,
      writeTextFile: async (filePath, content) => {
        writes.push({ filePath, content });
      }
    });

    expect(result.ok).toBe(true);
    expect(writes).toHaveLength(1);
    expect(writes[0].filePath).toContain(path.join("diagnostics", "2026-06-19T15-05-04-635Z_diagnostic-ia_T03-bulletin_scolaire_lea_t1.json"));

    const log = JSON.parse(writes[0].content);
    expect(log.ia.error).toMatchObject({
      code: "AI_OUTPUT_INVALID",
      message: "Le candidat sélectionné IA doit être présent dans la liste des candidats.",
      field: "fields.documentType.selected"
    });
  });
});
