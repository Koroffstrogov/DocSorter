(() => {
  const catalog: NamingSuggestionRulesCatalog = {
    version: 1,
    documentTypeRules: [
      {
        id: "document-type-avis-imposition",
        label: "Type avis d'imposition",
        match: {
          anyOf: ["avis d imposition", "avis imposition", "impot", "impots", "revenu fiscal"]
        },
        output: {
          documentType: "avis-imposition"
        },
        confidence: 82
      },
      {
        id: "document-type-facture",
        label: "Type facture",
        match: {
          anyOf: ["facture", "invoice", "montant ttc"]
        },
        output: {
          documentType: "facture"
        },
        confidence: 80
      },
      {
        id: "document-type-attestation",
        label: "Type attestation",
        match: {
          anyOf: ["attestation"]
        },
        output: {
          documentType: "attestation"
        },
        confidence: 76
      },
      {
        id: "document-type-certificat",
        label: "Type certificat",
        match: {
          anyOf: ["certificat"]
        },
        output: {
          documentType: "certificat"
        },
        confidence: 76
      },
      {
        id: "document-type-contrat",
        label: "Type contrat",
        match: {
          anyOf: ["contrat"]
        },
        output: {
          documentType: "contrat"
        },
        confidence: 74
      },
      {
        id: "document-type-releve",
        label: "Type releve",
        match: {
          anyOf: ["releve de compte", "releve bancaire", "releve"]
        },
        output: {
          documentType: "releve"
        },
        confidence: 76
      },
      {
        id: "document-type-assurance",
        label: "Type assurance",
        match: {
          anyOf: ["assurance habitation", "attestation assurance", "assurance"]
        },
        output: {
          documentType: "assurance"
        },
        confidence: 74
      },
      {
        id: "document-type-courrier",
        label: "Type courrier",
        match: {
          anyOf: ["courrier", "lettre"]
        },
        output: {
          documentType: "courrier"
        },
        confidence: 66
      },
      {
        id: "document-type-devis",
        label: "Type devis",
        match: {
          anyOf: ["devis"]
        },
        output: {
          documentType: "devis"
        },
        confidence: 78
      },
      {
        id: "document-type-quittance",
        label: "Type quittance",
        match: {
          anyOf: ["quittance"]
        },
        output: {
          documentType: "quittance"
        },
        confidence: 78
      },
      {
        id: "document-type-bulletin",
        label: "Type bulletin",
        match: {
          anyOf: ["bulletin de salaire", "bulletin"]
        },
        output: {
          documentType: "bulletin"
        },
        confidence: 74
      }
    ],
    subjectRules: [
      {
        id: "subject-renault-captur",
        label: "Sujet Renault Captur",
        match: {
          allOf: ["renault", "captur"]
        },
        output: {
          subject: "Renault-Captur"
        },
        confidence: 86
      },
      {
        id: "subject-scenic",
        label: "Sujet Scenic",
        match: {
          anyOf: ["scenic"]
        },
        output: {
          subject: "Scenic"
        },
        confidence: 78
      },
      {
        id: "subject-maison",
        label: "Sujet Maison",
        match: {
          anyOf: ["assurance habitation"]
        },
        output: {
          subject: "Maison"
        },
        confidence: 76
      },
      {
        id: "subject-impots",
        label: "Sujet Impots",
        match: {
          anyOf: ["avis d imposition", "avis imposition", "impot", "impots"]
        },
        output: {
          subject: "Impots"
        },
        confidence: 74
      },
      {
        id: "subject-ecole",
        label: "Sujet Ecole",
        match: {
          anyOf: ["certificat de scolarite", "scolarite", "ecole"]
        },
        output: {
          subject: "Ecole"
        },
        confidence: 74
      }
    ],
    keywordRules: [
      {
        value: "controle-technique",
        aliases: ["controle technique", "controle-technique"],
        confidence: 68
      },
      {
        value: "vidange",
        aliases: ["vidange"],
        confidence: 66
      },
      {
        value: "mutuelle",
        aliases: ["mutuelle", "complementaire sante"],
        confidence: 66
      },
      {
        value: "habitation",
        aliases: ["habitation", "logement"],
        confidence: 64
      },
      {
        value: "scolarite",
        aliases: ["scolarite", "ecole", "college", "lycee"],
        confidence: 64
      },
      {
        value: "impots",
        aliases: ["impot", "impots", "fiscal"],
        confidence: 66
      },
      {
        value: "banque",
        aliases: ["banque", "bancaire", "compte courant"],
        confidence: 64
      },
      {
        value: "energie",
        aliases: ["energie", "electricite", "gaz", "edf", "engie"],
        confidence: 64
      },
      {
        value: "echeancier",
        aliases: ["echeancier", "mensualite"],
        confidence: 64
      },
      {
        value: "cotisation",
        aliases: ["cotisation"],
        confidence: 62
      },
      {
        value: "ttc",
        aliases: ["ttc", "montant ttc"],
        confidence: 58
      },
      {
        value: "devis",
        aliases: ["devis"],
        confidence: 58
      },
      {
        value: "facture",
        aliases: ["facture"],
        confidence: 58
      }
    ],
    stopWords: [
      "scan",
      "document",
      "doc",
      "pdf",
      "image",
      "img",
      "facture",
      "devis",
      "releve",
      "avis",
      "imposition",
      "impot",
      "impots",
      "attestation",
      "certificat",
      "contrat",
      "assurance",
      "courrier",
      "quittance",
      "bulletin"
    ]
  };

  globalThis.DocSorterDefaultNamingSuggestionRules = catalog;
})();
