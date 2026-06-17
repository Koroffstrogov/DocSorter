import { describe, expect, it } from "vitest";

import {
  applyCollisionSuffix,
  detectSensitiveNameParts,
  generateDocumentNameV2,
  generateDocumentNameV2FromLegacyDraft,
  namingInputV2FromLegacyDraft,
  normalizeNameBlock,
  sanitizeWindowsFileName,
  validateDateToken
} from "./documentNameV2";

describe("generateDocumentNameV2", () => {
  it("generates DATE_CIBLE_DOCUMENT_EMETTEUR_DETAIL", () => {
    const result = generateDocumentNameV2({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "vidange",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(true);
    expect(result.filename).toBe("2024-03-05_captur_facture-entretien_renault_vidange.pdf");
  });

  it("omits empty issuer and detail blocks", () => {
    const result = generateDocumentNameV2({
      dateToken: "2025",
      target: "foyer",
      documentType: "avis-imposition",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(true);
    expect(result.filename).toBe("2025_foyer_avis-imposition.pdf");
  });

  it("keeps issuer without detail", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026",
      target: "lea",
      documentType: "certificat-scolarite",
      issuer: "college-monet",
      extension: ".pdf"
    });

    expect(result.filename).toBe("2026_lea_certificat-scolarite_college-monet.pdf");
  });

  it("normalizes uppercase extensions", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026-06-16",
      target: "paul",
      documentType: "carnet-vaccination",
      extension: ".PDF"
    });

    expect(result.filename).toBe("2026-06-16_paul_carnet-vaccination.pdf");
  });

  it("accepts date-inconnue", () => {
    const result = generateDocumentNameV2({
      dateToken: "date-inconnue",
      target: "foyer",
      documentType: "courrier-administratif",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(true);
    expect(result.filename).toBe("date-inconnue_foyer_courrier-administratif.pdf");
  });

  it("accepts approximate year tokens", () => {
    const result = generateDocumentNameV2({
      dateToken: "1910-env",
      target: "famille",
      documentType: "photo-acte",
      extension: ".jpg"
    });

    expect(result.isValid).toBe(true);
    expect(result.filename).toBe("1910-env_famille_photo-acte.jpg");
  });

  it("normalizes accents and spaces", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026-05",
      target: "Maison Principale",
      documentType: "Facture Énergie",
      issuer: "Électricité de France",
      extension: "PDF"
    });

    expect(result.filename).toBe("2026-05_maison-principale_facture-energie_electricite-de-france.pdf");
    expect(result.messages.map((message) => message.code)).toContain("NORMALIZED");
  });

  it("removes Windows forbidden characters", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026",
      target: "foyer",
      documentType: "facture:energie/edf?",
      extension: ".pdf"
    });

    expect(result.filename).toBe("2026_foyer_facture-energie-edf.pdf");
  });

  it("rejects ambiguous date tokens", () => {
    const result = generateDocumentNameV2({
      dateToken: "05/03/2024",
      target: "captur",
      documentType: "facture",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain("DATE_INVALID");
  });

  it("rejects missing required blocks", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026",
      target: "",
      documentType: " ",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(false);
    expect(result.messages.map((message) => message.code)).toEqual(
      expect.arrayContaining(["TARGET_REQUIRED", "DOCUMENT_TYPE_REQUIRED"])
    );
  });

  it("rejects reserved Windows names in required blocks", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026",
      target: "CON",
      documentType: "facture",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(false);
    expect(result.messages.map((message) => message.code)).toContain("RESERVED_WINDOWS_NAME");
  });

  it("rejects reserved Windows names in optional blocks", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026",
      target: "foyer",
      documentType: "facture",
      issuer: "AUX",
      extension: ".pdf"
    });

    expect(result.isValid).toBe(false);
    expect(result.messages).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "RESERVED_WINDOWS_NAME",
          field: "issuer"
        })
      ])
    );
  });

  it("warns for long readable names", () => {
    const result = generateDocumentNameV2({
      dateToken: "2026",
      target: "foyer",
      documentType: "courrier-administratif",
      detail: "a".repeat(120),
      extension: ".pdf"
    });

    expect(result.isValid).toBe(true);
    expect(result.messages.map((message) => message.code)).toContain("LONG_FILENAME");
  });

  it("warns for long final paths when a target directory is provided", () => {
    const result = generateDocumentNameV2(
      {
        dateToken: "2026",
        target: "foyer",
        documentType: "courrier-administratif",
        extension: ".pdf"
      },
      {
        targetDirectoryPath: `Z:\\${"dossier\\".repeat(30)}`
      }
    );

    expect(result.isValid).toBe(true);
    expect(result.messages.map((message) => message.code)).toContain("LONG_PATH");
  });
});

describe("normalization helpers", () => {
  it("lowercases and hyphenates name blocks", () => {
    expect(normalizeNameBlock("Électricité générale été")).toBe("electricite-generale-ete");
  });

  it("sanitizes Windows file name characters before block normalization", () => {
    expect(sanitizeWindowsFileName('Facture / Orange: "Mobile"')).toBe("Facture Orange Mobile");
  });
});

describe("validateDateToken", () => {
  it("accepts controlled date tokens", () => {
    expect(validateDateToken("2024-03-05")).toBeNull();
    expect(validateDateToken("2024-03")).toBeNull();
    expect(validateDateToken("2024")).toBeNull();
    expect(validateDateToken("2024-env")).toBeNull();
    expect(validateDateToken("date-inconnue")).toBeNull();
  });

  it("rejects non-ISO or impossible dates", () => {
    expect(validateDateToken("03-05-2024")?.code).toBe("DATE_INVALID");
    expect(validateDateToken("2024-02-31")?.code).toBe("DATE_INVALID");
  });
});

describe("sensitive data guard", () => {
  it("warns for probable birth dates outside dateToken", () => {
    const messages = detectSensitiveNameParts({
      dateToken: "2026",
      target: "paul-16/06/2020",
      documentType: "attestation",
      extension: ".pdf"
    });

    expect(messages.map((message) => message.code)).toContain("SENSITIVE_DATE");
  });

  it("warns for probable French social security numbers", () => {
    const messages = detectSensitiveNameParts({
      dateToken: "2026",
      target: "foyer",
      documentType: "attestation",
      issuer: "1 84 12 75 123 456 78",
      extension: ".pdf"
    });

    expect(messages.map((message) => message.code)).toContain("SENSITIVE_NUMBER");
  });

  it("warns for long identifier-like values", () => {
    const messages = detectSensitiveNameParts({
      dateToken: "2026",
      target: "foyer",
      documentType: "courrier",
      detail: "ABCD1234EFGH5678IJKL",
      extension: ".pdf"
    });

    expect(messages.map((message) => message.code)).toContain("SENSITIVE_IDENTIFIER");
  });

  it("does not warn for controlled long alphabetic document labels", () => {
    const messages = detectSensitiveNameParts({
      dateToken: "2026",
      target: "lea",
      documentType: "certificat-scolarite",
      extension: ".pdf"
    });

    expect(messages.map((message) => message.code)).not.toContain("SENSITIVE_IDENTIFIER");
  });
});

describe("applyCollisionSuffix", () => {
  it("adds a two-digit suffix before extension", () => {
    expect(
      applyCollisionSuffix("2024-03-05_captur_facture-entretien_renault_vidange.pdf", 2)
    ).toBe("2024-03-05_captur_facture-entretien_renault_vidange_02.pdf");
  });

  it("keeps suffix index at least 02", () => {
    expect(applyCollisionSuffix("nom.pdf", 1)).toBe("nom_02.pdf");
  });
});

describe("legacy draft adapter", () => {
  it("maps the current draft model to the v2 input without side effects", () => {
    expect(
      namingInputV2FromLegacyDraft(
        {
          documentDate: "2024-03-05",
          subject: "captur",
          documentType: "facture-entretien",
          keywords: "vidange"
        },
        ".pdf"
      )
    ).toEqual({
      dateToken: "2024-03-05",
      target: "captur",
      documentType: "facture-entretien",
      detail: "vidange",
      extension: ".pdf"
    });
  });

  it("can generate a v2 name from the current draft model", () => {
    const result = generateDocumentNameV2FromLegacyDraft(
      {
        documentDate: "2024-03-05",
        subject: "Renault Captur",
        documentType: "Facture Entretien",
        keywords: "Vidange"
      },
      ".PDF"
    );

    expect(result.isValid).toBe(true);
    expect(result.filename).toBe("2024-03-05_renault-captur_facture-entretien_vidange.pdf");
  });
});
