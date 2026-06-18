function openReferenceDataPanel(): void {
  state.referenceData = {
    ...state.referenceData,
    isOpen: true
  };
  renderReferenceDataPanel();

  if (!state.referenceData.overview && state.referenceData.status !== "loading") {
    void loadReferenceDataOverview("Chargement des référentiels...");
  }
}

function closeReferenceDataPanel(): void {
  state.referenceData = {
    ...state.referenceData,
    isOpen: false
  };
  renderReferenceDataPanel();
}

function renderReferenceDataPanel(): void {
  referenceDataPanel.render();
}

async function loadReferenceDataOverview(message: string): Promise<void> {
  state.referenceData = {
    ...state.referenceData,
    status: "loading",
    message,
    error: null
  };
  renderReferenceDataPanel();

  const result = await window.docSorter.getReferenceDataStatus();
  applyReferenceDataOverviewResult(result, "Référentiels chargés.");
}

async function reloadReferenceDataFromPanel(): Promise<void> {
  state.referenceData = {
    ...state.referenceData,
    status: "loading",
    message: "Rechargement des référentiels...",
    error: null
  };
  renderReferenceDataPanel();

  const result = await window.docSorter.reloadReferenceData();
  applyReferenceDataOverviewResult(result, "Référentiels rechargés.");
}

async function openReferenceDataFolderFromPanel(): Promise<void> {
  const result = await window.docSorter.openReferenceDataFolder();
  state.referenceData = {
    ...state.referenceData,
    message: result.ok ? "Dossier des référentiels ouvert." : state.referenceData.message,
    error: result.ok ? null : result.error
  };
  renderReferenceDataPanel();
}

async function createMissingReferenceDataFilesFromPanel(): Promise<void> {
  const confirmed = window.confirm(
    "Créer les fichiers JSON de référentiels manquants dans la configuration locale ?"
  );
  if (!confirmed) {
    return;
  }

  state.referenceData = {
    ...state.referenceData,
    status: "saving",
    message: "Création des fichiers de référentiels manquants...",
    error: null
  };
  renderReferenceDataPanel();

  const result = await window.docSorter.createMissingReferenceDataFiles();
  applyReferenceDataOverviewResult(result, "Fichiers manquants créés.");
}

function selectReferenceDataFile(fileKey: ReferenceDataFileKey): void {
  state.referenceData = {
    ...state.referenceData,
    selectedFileKey: fileKey,
    validation: null,
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    simpleDraft: createEmptyReferenceDataSimpleDraft()
  };
  renderReferenceDataPanel();
}

function setReferenceDataPanelMode(mode: ReferenceDataPanelMode): void {
  state.referenceData = {
    ...state.referenceData,
    mode
  };
  renderReferenceDataPanel();
}

function updateReferenceDataJsonDraft(fileKey: ReferenceDataFileKey, content: string): void {
  state.referenceData = {
    ...state.referenceData,
    jsonDrafts: {
      ...state.referenceData.jsonDrafts,
      [fileKey]: content
    },
    validation: null,
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    error: null
  };
}

async function validateReferenceDataFileFromPanel(fileKey: ReferenceDataFileKey): Promise<boolean> {
  const content = getReferenceDataCurrentContent(fileKey);
  state.referenceData = {
    ...state.referenceData,
    status: "validating",
    message: "Validation du référentiel...",
    error: null
  };
  renderReferenceDataPanel();

  const result = await window.docSorter.validateReferenceDataFile(fileKey, content);
  state.referenceData = {
    ...state.referenceData,
    status: "ready",
    validation: result,
    lastValidatedFileKey: result.ok ? fileKey : null,
    lastValidatedContent: result.ok ? content : "",
    message: result.ok ? "Référentiel valide. Sauvegarde possible." : "Référentiel invalide.",
    error: result.ok ? null : result.error
  };
  renderReferenceDataPanel();
  return result.ok;
}

async function saveReferenceDataFileFromPanel(fileKey: ReferenceDataFileKey): Promise<void> {
  const content = getReferenceDataCurrentContent(fileKey);
  const alreadyValidated = Boolean(
    state.referenceData.validation?.ok &&
      state.referenceData.lastValidatedFileKey === fileKey &&
      state.referenceData.lastValidatedContent === content
  );

  if (!alreadyValidated) {
    const valid = await validateReferenceDataFileFromPanel(fileKey);
    if (!valid) {
      return;
    }
  }

  state.referenceData = {
    ...state.referenceData,
    status: "saving",
    message: "Sauvegarde du référentiel...",
    error: null
  };
  renderReferenceDataPanel();

  const result = await window.docSorter.saveReferenceDataFile(fileKey, content);
  if (!result.ok) {
    state.referenceData = {
      ...state.referenceData,
      status: "ready",
      validation: result,
      message: "Sauvegarde refusée.",
      error: result.error
    };
    renderReferenceDataPanel();
    return;
  }

  const overview = updateOverviewFile(state.referenceData.overview, result.value);
  state.referenceData = {
    ...state.referenceData,
    status: "ready",
    overview,
    jsonDrafts: {
      ...state.referenceData.jsonDrafts,
      [fileKey]: result.value.content
    },
    validation: null,
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    message: `Référentiel sauvegardé à ${formatReferenceDataTime(new Date())}.`,
    error: null
  };
  renderReferenceDataPanel();
}

function updateReferenceDataSimpleField(
  field: keyof ReferenceDataSimpleDraft,
  value: string | boolean
): void {
  const draft = {
    ...state.referenceData.simpleDraft,
    [field]: value
  };

  if (field === "label" && typeof value === "string") {
    const alias = normalizeReferenceDataAlias(value);
    if (!state.referenceData.simpleDraft.fileAlias.trim()) {
      draft.fileAlias = alias;
    }
    if (!state.referenceData.simpleDraft.aliases.trim()) {
      draft.aliases = value.trim();
    }
    if (!state.referenceData.simpleDraft.folderAlias.trim()) {
      draft.folderAlias = defaultFolderAliasForReference(
        state.referenceData.selectedFileKey,
        alias
      );
    }
  }

  state.referenceData = {
    ...state.referenceData,
    simpleDraft: draft,
    error: null
  };
  renderReferenceDataPanel();
}

function resetReferenceDataSimpleDraft(): void {
  state.referenceData = {
    ...state.referenceData,
    simpleDraft: createEmptyReferenceDataSimpleDraft(),
    error: null
  };
  renderReferenceDataPanel();
}

function cancelReferenceDataFileChanges(fileKey: ReferenceDataFileKey): void {
  const file = state.referenceData.overview?.files.find((candidate) => candidate.key === fileKey);
  state.referenceData = {
    ...state.referenceData,
    jsonDrafts: {
      ...state.referenceData.jsonDrafts,
      [fileKey]: file?.content ?? "[]\n"
    },
    simpleDraft: createEmptyReferenceDataSimpleDraft(),
    validation: null,
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    message: "Modifications annulées.",
    error: null
  };
  renderReferenceDataPanel();
}

function editReferenceDataSimpleEntry(index: number): void {
  const entry = getReferenceDataEntries()[index];
  if (!entry) {
    return;
  }

  state.referenceData = {
    ...state.referenceData,
    simpleDraft: {
      editingIndex: index,
      label: stringField(entry.label),
      fileAlias: stringField(entry.fileAlias),
      folderAlias: stringField(entry.folderAlias),
      aliases: arrayField(entry.aliases).join(", "),
      birthDate: stringField(entry.birthDate),
      useBirthDateForDetectionOnly: entry.useBirthDateForDetectionOnly === true,
      domains: arrayField(entry.domains).join(", "),
      enabled: entry.enabled !== false
    },
    error: null
  };
  renderReferenceDataPanel();
}

function toggleReferenceDataSimpleEntry(index: number): void {
  const entries = getReferenceDataEntries();
  const entry = entries[index];
  if (!entry) {
    return;
  }

  entries[index] = {
    ...entry,
    enabled: entry.enabled === false
  };
  updateReferenceDataEntries(entries, "Entrée mise à jour. Enregistrez le référentiel.");
}

function deleteReferenceDataSimpleEntry(index: number): void {
  const entries = getReferenceDataEntries();
  const entry = entries[index];
  if (!entry) {
    return;
  }

  const label = stringField(entry.label) || stringField(entry.id) || `entrée ${index + 1}`;
  const confirmed = window.confirm(
    `Supprimer "${label}" du brouillon JSON ? Le fichier ne sera modifié qu'après Enregistrer.`
  );
  if (!confirmed) {
    return;
  }

  entries.splice(index, 1);
  updateReferenceDataEntries(entries, "Entrée supprimée du brouillon. Enregistrez pour écrire le fichier.");
  state.referenceData = {
    ...state.referenceData,
    simpleDraft: createEmptyReferenceDataSimpleDraft()
  };
  renderReferenceDataPanel();
}

function applyReferenceDataSimpleDraft(): void {
  const fileKey = state.referenceData.selectedFileKey;
  const entries = getReferenceDataEntries();
  const index = state.referenceData.simpleDraft.editingIndex;
  const previousEntry = index !== null && index >= 0 && index < entries.length
    ? entries[index]
    : null;
  const entry = buildReferenceEntryFromDraft(
    fileKey,
    state.referenceData.simpleDraft,
    previousEntry
  );
  if (!entry) {
    state.referenceData = {
      ...state.referenceData,
      error: {
        code: "REFERENCE_DATA_INVALID_SCHEMA",
        message: "Le libellé et l'alias fichier sont obligatoires."
      }
    };
    renderReferenceDataPanel();
    return;
  }

  if (index === null || index < 0 || index >= entries.length) {
    entries.push(entry);
  } else {
    entries[index] = entry;
  }

  updateReferenceDataEntries(entries, "Entrée prête. Sauvegarde encore nécessaire.");
  state.referenceData = {
    ...state.referenceData,
    simpleDraft: createEmptyReferenceDataSimpleDraft()
  };
}

function applyReferenceDataOverviewResult(
  result: ReferenceDataStoreResult<ReferenceDataOverview>,
  successMessage: string
): void {
  if (!result.ok) {
    state.referenceData = {
      ...state.referenceData,
      status: "error",
      message: "Référentiels indisponibles.",
      error: result.error
    };
    renderReferenceDataPanel();
    return;
  }

  state.referenceData = {
    ...state.referenceData,
    status: "ready",
    overview: result.value,
    jsonDrafts: Object.fromEntries(
      result.value.files.map((file) => [file.key, file.content])
    ) as Partial<Record<ReferenceDataFileKey, string>>,
    validation: null,
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    message: successMessage,
    error: null
  };
  renderReferenceDataPanel();
}

function getReferenceDataCurrentContent(fileKey: ReferenceDataFileKey): string {
  return (
    state.referenceData.jsonDrafts[fileKey] ??
    state.referenceData.overview?.files.find((file) => file.key === fileKey)?.content ??
    "[]\n"
  );
}

function getReferenceDataEntries(): Array<Record<string, unknown>> {
  try {
    const parsed = JSON.parse(getReferenceDataCurrentContent(state.referenceData.selectedFileKey)) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is Record<string, unknown> =>
          Boolean(entry && typeof entry === "object" && !Array.isArray(entry))
        )
      : [];
  } catch {
    return [];
  }
}

function updateReferenceDataEntries(entries: Array<Record<string, unknown>>, message: string): void {
  const fileKey = state.referenceData.selectedFileKey;
  state.referenceData = {
    ...state.referenceData,
    jsonDrafts: {
      ...state.referenceData.jsonDrafts,
      [fileKey]: `${JSON.stringify(entries, null, 2)}\n`
    },
    validation: null,
    lastValidatedFileKey: null,
    lastValidatedContent: "",
    message,
    error: null
  };
  renderReferenceDataPanel();
}

function buildReferenceEntryFromDraft(
  fileKey: ReferenceDataFileKey,
  draft: ReferenceDataSimpleDraft,
  previousEntry: Record<string, unknown> | null = null
): Record<string, unknown> | null {
  const label = draft.label.trim();
  const fileAlias = normalizeReferenceDataAlias(draft.fileAlias || label);
  const id = normalizeReferenceDataAlias(fileAlias);
  if (!label || !fileAlias || !id) {
    return null;
  }

  const aliases = uniqueReferenceValues([
    ...splitReferenceDataList(draft.aliases),
    label
  ]);
  const entry: Record<string, unknown> = {
    id,
    label,
    fileAlias,
    aliases,
    ...(draft.enabled === false ? { enabled: false } : {})
  };

  if (fileKey !== "providers" && fileKey !== "documentTypes") {
    const folderAlias = draft.folderAlias.trim();
    if (folderAlias) {
      entry.folderAlias = folderAlias;
    }
  }

  if (fileKey === "people") {
    const birthDate = draft.birthDate.trim();
    if (birthDate) {
      entry.birthDate = birthDate;
      entry.useBirthDateForDetectionOnly = true;
    }
  }

  if (fileKey === "providers") {
    const domains = splitReferenceDataList(draft.domains).map((domain) => domain.toLowerCase());
    if (domains.length > 0) {
      entry.domains = uniqueReferenceValues(domains);
    }
  }

  if (fileKey === "documentTypes" && previousEntry) {
    for (const field of ["domain", "defaultTargetKind", "defaultDateRule"]) {
      const value = previousEntry[field];
      if (typeof value === "string" && value.trim()) {
        entry[field] = value.trim();
      }
    }
  }

  return entry;
}

function updateOverviewFile(
  overview: ReferenceDataOverview | null,
  file: ReferenceDataFileInfo
): ReferenceDataOverview | null {
  if (!overview) {
    return overview;
  }

  return {
    ...overview,
    files: overview.files.map((candidate) => candidate.key === file.key ? file : candidate),
    catalogStatus: "ready"
  };
}

function defaultFolderAliasForReference(fileKey: ReferenceDataFileKey, alias: string): string {
  if (!alias || fileKey === "providers" || fileKey === "documentTypes") {
    return "";
  }

  const segment = alias
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");

  switch (fileKey) {
    case "people":
      return `Famille/${segment}`;
    case "vehicles":
      return `Vehicules/${segment}`;
    case "properties":
      return `Biens/${segment}`;
  }
}

function normalizeReferenceDataAlias(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function splitReferenceDataList(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function uniqueReferenceValues(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function stringField(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function arrayField(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string")
    : [];
}

function formatReferenceDataTime(date: Date): string {
  return date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}
