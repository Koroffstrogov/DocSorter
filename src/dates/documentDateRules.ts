import type { DateCandidate, DateRole } from "./dateCandidateTypes";

export type DocumentDateRuleKind =
  | "tax"
  | "bank-statement"
  | "invoice"
  | "vehicle-control"
  | "contract"
  | "insurance-certificate"
  | "school"
  | "living-health"
  | "identity"
  | "unknown";

export interface DocumentDateRule {
  kind: DocumentDateRuleKind;
  preferredRoles: DateRole[];
  allowTechnicalFallback: boolean;
}

const INVOICE_TYPES = new Set([
  "facture",
  "facture-entretien",
  "facture-reparation",
  "facture-energie"
]);

const CONTRACT_TYPES = new Set(["contrat", "contrat-assurance-habitation", "avenant"]);
const SCHOOL_TYPES = new Set(["certificat-scolarite", "attestation-scolarite", "bulletin-scolaire"]);
const IDENTITY_TYPES = new Set(["carte-identite", "passeport", "acte-naissance", "livret-famille"]);

export function getDocumentDateRule(documentType: string | undefined): DocumentDateRule {
  const normalized = normalizeDocumentType(documentType);

  if (normalized === "avis-imposition") {
    return {
      kind: "tax",
      preferredRoles: ["period", "document", "issue", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (normalized === "releve-bancaire") {
    return {
      kind: "bank-statement",
      preferredRoles: ["period", "document", "issue", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (INVOICE_TYPES.has(normalized)) {
    return {
      kind: "invoice",
      preferredRoles: ["issue", "document", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (normalized === "controle-technique") {
    return {
      kind: "vehicle-control",
      preferredRoles: ["document", "issue", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (CONTRACT_TYPES.has(normalized)) {
    return {
      kind: "contract",
      preferredRoles: ["effective", "signature", "issue", "document", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (normalized === "attestation-assurance") {
    return {
      kind: "insurance-certificate",
      preferredRoles: ["period", "effective", "issue", "document", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (SCHOOL_TYPES.has(normalized)) {
    return {
      kind: "school",
      preferredRoles: ["period", "document", "issue", "unknown"],
      allowTechnicalFallback: false
    };
  }

  if (normalized === "carnet-vaccination") {
    return {
      kind: "living-health",
      preferredRoles: ["document", "scan", "unknown"],
      allowTechnicalFallback: true
    };
  }

  if (IDENTITY_TYPES.has(normalized)) {
    return {
      kind: "identity",
      preferredRoles: ["issue", "document", "unknown"],
      allowTechnicalFallback: false
    };
  }

  return {
    kind: "unknown",
    preferredRoles: ["document", "issue", "period", "effective", "signature", "unknown"],
    allowTechnicalFallback: false
  };
}

export function scoreCandidateForRule(candidate: DateCandidate, rule: DocumentDateRule): number {
  let score = candidate.confidence;
  const roleIndex = rule.preferredRoles.indexOf(candidate.role);
  if (roleIndex >= 0) {
    score += 24 - roleIndex * 4;
  }

  if (candidate.source === "file-name") {
    score -= 10;
  }

  if (candidate.role === "file") {
    score -= rule.allowTechnicalFallback ? 15 : 45;
  }

  if (candidate.role === "scan") {
    score += rule.allowTechnicalFallback ? 10 : -20;
  }

  if (rule.kind === "school" && candidate.precision === "school-year") {
    score += 35;
  }

  if (rule.kind === "bank-statement" && candidate.precision === "month") {
    score += 28;
  }

  if (rule.kind === "tax" && candidate.precision === "year") {
    score += 28;
  }

  if (rule.kind === "contract" && candidate.role === "effective") {
    score += 30;
  }

  if (rule.kind === "living-health" && candidate.role === "scan") {
    score += 15;
  }

  return Math.max(0, Math.min(120, score));
}

function normalizeDocumentType(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
