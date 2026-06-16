import type { DocumentTypeReference } from "./referenceDataTypes";

export const defaultDocumentTypes: DocumentTypeReference[] = [
  {
    id: "facture-entretien",
    label: "Facture entretien",
    fileAlias: "facture-entretien",
    aliases: [
      "facture entretien",
      "facture d'entretien",
      "revision",
      "révision",
      "vidange",
      "garage"
    ],
    domain: "vehicule",
    defaultTargetKind: "vehicle",
    defaultDateRule: "document-date"
  },
  {
    id: "avis-imposition",
    label: "Avis d'imposition",
    fileAlias: "avis-imposition",
    aliases: ["avis d'imposition", "avis imposition", "impot", "impôts", "impots"],
    domain: "fiscal",
    defaultTargetKind: "foyer",
    defaultDateRule: "period-year"
  },
  {
    id: "certificat-scolarite",
    label: "Certificat de scolarité",
    fileAlias: "certificat-scolarite",
    aliases: ["certificat de scolarité", "certificat scolarite", "scolarité", "scolarite"],
    domain: "scolarite",
    defaultTargetKind: "person",
    defaultDateRule: "document-date"
  },
  {
    id: "carnet-vaccination",
    label: "Carnet de vaccination",
    fileAlias: "carnet-vaccination",
    aliases: ["carnet de vaccination", "carnet vaccination", "vaccination", "vaccin"],
    domain: "sante",
    defaultTargetKind: "person",
    defaultDateRule: "document-date"
  },
  {
    id: "releve-bancaire",
    label: "Relevé bancaire",
    fileAlias: "releve-bancaire",
    aliases: ["relevé bancaire", "releve bancaire", "extrait de compte"],
    domain: "banque",
    defaultTargetKind: "foyer",
    defaultDateRule: "period-year"
  },
  {
    id: "carte-identite",
    label: "Carte d'identité",
    fileAlias: "carte-identite",
    aliases: ["carte d'identité", "carte identite", "cni"],
    domain: "identite",
    defaultTargetKind: "person",
    defaultDateRule: "document-date"
  },
  {
    id: "attestation-assurance",
    label: "Attestation d'assurance",
    fileAlias: "attestation-assurance",
    aliases: ["attestation d'assurance", "attestation assurance"],
    domain: "assurance",
    defaultTargetKind: "foyer",
    defaultDateRule: "document-date"
  },
  {
    id: "contrat-assurance-habitation",
    label: "Contrat assurance habitation",
    fileAlias: "contrat-assurance-habitation",
    aliases: ["contrat assurance habitation", "assurance habitation"],
    domain: "assurance",
    defaultTargetKind: "property",
    defaultDateRule: "document-date"
  }
];
