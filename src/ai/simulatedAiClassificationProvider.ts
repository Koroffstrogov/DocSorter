import {
  type AiClassificationSuggestion,
  type BoundedAiClassificationInput
} from "./aiClassificationTypes";
import { validateLegacyDate } from "./aiClassificationValidator";

export function simulatedAiClassificationProvider(
  input: BoundedAiClassificationInput
): AiClassificationSuggestion {
  const search = normalizeSearchText(
    [
      input.filename,
      input.extractedTextExcerpt,
      input.ocrTextExcerpt
    ].join(" ")
  );
  const date = detectDate(input);
  const year = date?.slice(0, 4) ?? detectYear(input);

  if (hasAll(search, ["renault", "captur"]) && hasAny(search, ["facture", "garage", "entretien"])) {
    return {
      ...(date ? { dateToken: date } : {}),
      subject: "captur",
      target: "captur",
      documentType: "facture-entretien",
      issuer: "renault",
      detail: "entretien",
      targetFolder: "Vehicules/Renault-Captur/Entretien",
      confidence: 84,
      reasons: [
        "Marque Renault et modele Captur detectes.",
        "Document assimile a une facture d'entretien par le provider simule."
      ],
      warnings: ["Suggestion simulee a valider manuellement."],
      source: "simulated-ai"
    };
  }

  if (hasAll(search, ["avis", "imposition"]) || hasAll(search, ["impot", "revenu"])) {
    return {
      ...(date ? { dateToken: date } : year ? { dateToken: year } : {}),
      subject: "foyer",
      target: "foyer",
      documentType: "avis-imposition",
      targetFolder: year ? `Fiscalite/Foyer/${year}` : "Fiscalite/Foyer",
      confidence: 78,
      reasons: ["Avis d'imposition detecte par le provider simule."],
      warnings: ["Verifier l'annee fiscale avant classement."],
      source: "simulated-ai"
    };
  }

  if (hasAll(search, ["assurance", "habitation"])) {
    return {
      ...(date ? { dateToken: date } : {}),
      subject: "foyer",
      target: "foyer",
      documentType: "assurance-habitation",
      issuer: "assurance",
      detail: "habitation",
      targetFolder: "Maison/Assurance",
      confidence: 74,
      reasons: ["Assurance habitation detectee par le provider simule."],
      warnings: ["Verifier le logement concerne avant classement."],
      source: "simulated-ai"
    };
  }

  if (hasAll(search, ["certificat", "scolarite"])) {
    return {
      ...(date ? { dateToken: date } : {}),
      subject: "enfants-ecole",
      target: "enfants-ecole",
      documentType: "certificat-scolarite",
      targetFolder: "Enfants/Ecole",
      confidence: 72,
      reasons: ["Certificat de scolarite detecte par le provider simule."],
      warnings: ["Verifier l'enfant et l'annee scolaire avant classement."],
      source: "simulated-ai"
    };
  }

  return {
    ...(date ? { dateToken: date } : {}),
    confidence: 18,
    reasons: ["Aucun scenario simule reconnu."],
    warnings: ["Suggestion IA faible : conserver la decision manuelle."],
    source: "simulated-ai"
  };
}

function detectDate(input: BoundedAiClassificationInput): string | null {
  if (validateLegacyDate(input.detectedDate)) {
    return input.detectedDate;
  }

  const source = `${input.filename} ${input.extractedTextExcerpt} ${input.ocrTextExcerpt}`;
  const fullDateMatch = source.match(/(^|[^0-9])((?:19|20)\d{2})-(\d{2})-(\d{2})(?=$|[^0-9])/);
  if (fullDateMatch) {
    const candidate = `${fullDateMatch[2]}-${fullDateMatch[3]}-${fullDateMatch[4]}`;
    return validateLegacyDate(candidate) ? candidate : null;
  }

  return null;
}

function detectYear(input: BoundedAiClassificationInput): string | null {
  if (/^(19|20)\d{2}$/.test(input.detectedYear)) {
    return input.detectedYear;
  }

  const source = `${input.filename} ${input.extractedTextExcerpt} ${input.ocrTextExcerpt}`;
  return source.match(/(^|[^0-9])((?:19|20)\d{2})(?=$|[^0-9])/)?.[2] ?? null;
}

function hasAll(search: string, terms: string[]): boolean {
  return terms.every((term) => search.includes(term));
}

function hasAny(search: string, terms: string[]): boolean {
  return terms.some((term) => search.includes(term));
}

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
