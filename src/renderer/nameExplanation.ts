interface NameExplanationInput {
  filename: string;
  filenameValid: boolean;
  extension: string;
  fields: Partial<AiSelectionFields> | null;
  manualFields?: AiSelectionManualFields | null;
  destinationFolder: string;
  folderOrigin?: NamingFieldOrigin;
  messages: AiSelectionPreviewMessage[];
}

type NameExplanationLineStatus = "used" | "ignored" | "missing";

interface NameExplanationLine {
  label: string;
  value: string;
  status: NameExplanationLineStatus;
  reason: string;
  source: string;
}

interface NameExplanationModel {
  formula: string;
  result: string;
  isComplete: boolean;
  missingFields: string[];
  lines: NameExplanationLine[];
}

interface NameExplanationApi {
  buildNameExplanation: (input: NameExplanationInput) => NameExplanationModel;
}

interface Window {
  DocSorterNameExplanation: NameExplanationApi;
}

var DocSorterNameExplanation: NameExplanationApi;

(() => {
  const FORMULA = "DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext";

  function buildNameExplanation(input: NameExplanationInput): NameExplanationModel {
    const fields = input.fields ?? {};
    const date = normalizeDateToken(fields.dateToken ?? "");
    const target = normalizeNamePart(fields.target ?? "");
    const documentType = normalizeNamePart(fields.documentType ?? "");
    const issuerRaw = normalizeOptionalNamePart(fields.issuer ?? "");
    const detailRaw = normalizeOptionalNamePart(fields.detail ?? "");
    const optionalParts = removeRedundantNameParts({
      dateToken: date,
      target,
      documentType,
      issuer: issuerRaw,
      detail: detailRaw
    });
    const missingFields = [
      !date ? "date" : "",
      !target ? "cible" : "",
      !documentType ? "type documentaire" : ""
    ].filter(Boolean);
    const isComplete = missingFields.length === 0 && input.filenameValid;
    const result = isComplete
      ? `${FORMULA} → ${input.filename}`
      : "Nom incomplet : date, cible ou type documentaire manquant.";

    return {
      formula: FORMULA,
      result,
      isComplete,
      missingFields,
      lines: [
        createRequiredLine("Date", date, "dateToken", input.manualFields),
        createRequiredLine("Cible", target, "target", input.manualFields),
        createRequiredLine("Document", documentType, "documentType", input.manualFields),
        createOptionalLine("Émetteur", issuerRaw, optionalParts.issuer, "issuer", input.manualFields, date),
        createOptionalLine("Détail", detailRaw, optionalParts.detail, "detail", input.manualFields, date),
        createFolderLine(input.destinationFolder, input.folderOrigin),
        createSubjectLine(fields.subject ?? "", input.manualFields)
      ]
    };
  }

  function createRequiredLine(
    label: string,
    value: string,
    field: AiSelectionFieldKey,
    manualFields: AiSelectionManualFields | null | undefined
  ): NameExplanationLine {
    if (!value) {
      return {
        label,
        value: "manquant",
        status: "missing",
        reason: "Champ obligatoire pour générer le nom.",
        source: "Champ incomplet"
      };
    }

    return {
      label,
      value,
      status: "used",
      reason: "Utilisé dans le nom final.",
      source: sourceForField(field, manualFields)
    };
  }

  function createOptionalLine(
    label: string,
    rawValue: string,
    usedValue: string,
    field: AiSelectionFieldKey,
    manualFields: AiSelectionManualFields | null | undefined,
    dateToken: string
  ): NameExplanationLine {
    if (!rawValue) {
      return {
        label,
        value: "non renseigné",
        status: "ignored",
        reason: "Ignoré car le champ est vide.",
        source: "Normalisation"
      };
    }

    if (!usedValue) {
      const reason = field === "detail" && isDetailRedundantWithDate(rawValue, dateToken)
        ? "Ignoré car déjà porté par la date."
        : "Ignoré car vide, générique ou redondant.";
      return {
        label,
        value: rawValue,
        status: "ignored",
        reason,
        source: sourceForField(field, manualFields)
      };
    }

    return {
      label,
      value: usedValue,
      status: "used",
      reason: "Ajouté comme bloc optionnel du nom.",
      source: sourceForField(field, manualFields)
    };
  }

  function createSubjectLine(
    value: string,
    manualFields: AiSelectionManualFields | null | undefined
  ): NameExplanationLine {
    const normalized = normalizeOptionalNamePart(value);
    return {
      label: "Sujet",
      value: normalized || "non utilisé",
      status: "ignored",
      reason: "Non utilisé dans la convention de nommage.",
      source: normalized ? sourceForField("subject", manualFields) : "Règle documentaire"
    };
  }

  function createFolderLine(
    value: string,
    origin: NamingFieldOrigin | undefined
  ): NameExplanationLine {
    const folder = formatRelativeFolder(value);
    if (!folder) {
      return {
        label: "Dossier",
        value: "aucun dossier final",
        status: "missing",
        reason: "Aucun dossier cible sélectionné.",
        source: "Dossier sélectionné"
      };
    }

    return {
      label: "Dossier",
      value: folder,
      status: "used",
      reason: "Dossier relatif sélectionné pour le classement.",
      source: sourceForFolder(origin)
    };
  }

  function sourceForField(
    field: AiSelectionFieldKey,
    manualFields: AiSelectionManualFields | null | undefined
  ): string {
    return manualFields?.[field] ? "Correction manuelle" : "IA locale";
  }

  function sourceForFolder(origin: NamingFieldOrigin | undefined): string {
    if (origin === "manual") {
      return "Correction manuelle";
    }
    if (origin === "ai-v2") {
      return "IA locale";
    }
    return "Dossier sélectionné";
  }

  function normalizeDateToken(value: string): string {
    const trimmed = value.trim();
    if (/^(19|20)\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    if (/^(19|20)\d{2}-(0[1-9]|1[0-2])$/.test(trimmed)) {
      return trimmed;
    }
    if (/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(trimmed)) {
      return trimmed;
    }
    return "";
  }

  function normalizeNamePart(value: string): string {
    return value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function normalizeOptionalNamePart(value: string): string {
    const normalized = normalizeNamePart(value);
    return normalized === "aucun" ||
      normalized === "none" ||
      normalized === "neant" ||
      normalized === "n-a" ||
      normalized === "sans"
      ? ""
      : normalized;
  }

  function removeRedundantNameParts(input: {
    dateToken: string;
    target: string;
    documentType: string;
    issuer: string;
    detail: string;
  }): { issuer: string; detail: string } {
    const blocked = new Set([input.target, input.documentType].filter(Boolean));
    const issuer = blocked.has(input.issuer) ? "" : input.issuer;
    if (issuer) {
      blocked.add(issuer);
    }

    return {
      issuer,
      detail: blocked.has(input.detail) || isDetailRedundantWithDate(input.detail, input.dateToken)
        ? ""
        : input.detail
    };
  }

  function isDetailRedundantWithDate(detail: string, dateToken: string): boolean {
    const tokens = detail.split("-").filter(Boolean);
    if (tokens.length === 0 || !dateToken) {
      return false;
    }

    const redundantTokens = buildDateRedundantTokens(dateToken);
    return redundantTokens.size > 0 && tokens.every((token) => redundantTokens.has(token));
  }

  function buildDateRedundantTokens(dateToken: string): Set<string> {
    const tokens = new Set<string>();
    const [year, month] = dateToken.split("-");
    if (year) {
      tokens.add(year);
    }
    if (month) {
      tokens.add(month);
      tokens.add(`${year}-${month}`);
    }
    return tokens;
  }

  function formatRelativeFolder(value: string): string {
    const trimmed = value.trim();
    if (!trimmed || /^[a-z]:[\\/]/i.test(trimmed) || trimmed.startsWith("\\\\") || trimmed.startsWith("/")) {
      return "";
    }
    return trimmed
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
  }

  globalThis.DocSorterNameExplanation = {
    buildNameExplanation
  };
})();
