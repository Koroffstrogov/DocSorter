import type { FolderRuleV2 } from "./folderSuggestionTypes";

const FISCAL_TYPES = new Set(["avis-imposition", "declaration-revenus", "taxe-fonciere"]);
const BANK_TYPES = new Set(["releve-bancaire", "releve-epargne"]);
const VEHICLE_TYPES = new Set([
  "facture-entretien",
  "facture-reparation",
  "controle-technique",
  "carte-grise"
]);
const HEALTH_TYPES = new Set(["carnet-vaccination", "ordonnance", "resultat-labo", "compte-rendu"]);
const IDENTITY_TYPES = new Set(["carte-identite", "passeport", "acte-naissance", "livret-famille"]);
const SCHOOL_LIGHT_TYPES = new Set(["certificat-scolarite", "attestation-scolarite"]);
const SCHOOL_SERIES_TYPES = new Set(["bulletin-scolaire", "inscription-cantine", "assurance-scolaire"]);
const HOME_TYPES = new Set(["contrat-internet", "garantie-chaudiere", "diagnostic", "facture-travaux"]);
const INSURANCE_SERIES_TYPES = new Set(["quittance-assurance", "sinistre"]);

export function getTargetFolderRuleV2(documentType: string | undefined): FolderRuleV2 {
  const type = normalizeDocumentType(documentType);

  if (FISCAL_TYPES.has(type)) {
    return {
      domainPath: "Fiscalite",
      preferDetailedForSeries: true
    };
  }

  if (BANK_TYPES.has(type)) {
    return {
      domainPath: "Finances/Banque",
      preferDetailedForSeries: true
    };
  }

  if (VEHICLE_TYPES.has(type)) {
    return {
      domainPath: "Vehicules"
    };
  }

  if (HEALTH_TYPES.has(type)) {
    return {
      domainPath: "Sante",
      requireTargetWarning: true,
      detailedForExistingOnly: true
    };
  }

  if (IDENTITY_TYPES.has(type)) {
    return {
      domainPath: "Identite-famille",
      requireTargetWarning: true,
      detailedForExistingOnly: true
    };
  }

  if (SCHOOL_LIGHT_TYPES.has(type)) {
    return {
      domainPath: "Scolarite",
      requireTargetWarning: true,
      detailedForExistingOnly: true
    };
  }

  if (SCHOOL_SERIES_TYPES.has(type)) {
    return {
      domainPath: "Scolarite",
      requireTargetWarning: true,
      preferDetailedForSeries: true
    };
  }

  if (type === "facture-energie") {
    return {
      domainPath: "Maison/Energie",
      preferDetailedForSeries: true
    };
  }

  if (HOME_TYPES.has(type)) {
    return {
      domainPath: "Maison"
    };
  }

  if (type === "contrat-assurance-habitation" || type === "attestation-assurance") {
    return {
      domainPath: "Assurances/Habitation"
    };
  }

  if (INSURANCE_SERIES_TYPES.has(type)) {
    return {
      domainPath: "Assurances/Habitation",
      preferDetailedForSeries: true
    };
  }

  return {
    domainPath: "Divers/A-traiter-manuellement",
    unknownFallback: true
  };
}

export function isPeriodicFolderDocumentType(documentType: string | undefined): boolean {
  const type = normalizeDocumentType(documentType);
  return (
    FISCAL_TYPES.has(type) ||
    BANK_TYPES.has(type) ||
    SCHOOL_SERIES_TYPES.has(type) ||
    type === "facture-energie" ||
    INSURANCE_SERIES_TYPES.has(type)
  );
}

export function normalizeDocumentType(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase();
}
