interface NamingPanelState {
  activeDocument: DocumentItem | null;
  targetPath: string | null;
  targetFolder: TargetFolderState;
  folderLearning: FolderLearningState;
  naming: NamingState;
  destination: DestinationCheckState;
  effectiveFilename: string;
  effectiveFilenameValid: boolean;
  aiPreview: {
    filename: string;
    filenameValid: boolean;
    destinationFolder: string;
    messages: AiSelectionPreviewMessage[];
    fields: AiSelectionFields;
    manualFields: AiSelectionManualFields;
  } | null;
  canResetChoices: boolean;
}

interface NamingPanelOptions {
  root?: ParentNode;
  getState: () => NamingPanelState;
  onDraftChange: (draft: NamingDraft) => void;
  onResetDraft: () => void;
  onApplyDestinationAlternative: () => void;
  onUseFolderLearningAlignedName: () => void;
  onTargetFolderChange: (targetFolder: string) => void;
  onCreateTargetFolder: () => void;
}

interface NamingPanelApi {
  render: (syncInputs: boolean) => void;
  renderDestinationCheck: () => void;
}

interface NamingPanelElements {
  panel: HTMLElement | null;
  dateInput: HTMLInputElement | null;
  subjectInput: HTMLInputElement | null;
  typeInput: HTMLInputElement | null;
  keywordsInput: HTMLInputElement | null;
  resetButton: HTMLButtonElement | null;
  proposedFilename: HTMLElement | null;
  nameExplanation: HTMLDetailsElement | null;
  nameExplanationContent: HTMLElement | null;
  folderLearningSummary: HTMLElement | null;
  proposalState: HTMLElement | null;
  messages: HTMLUListElement | null;
  destinationStatus: HTMLElement | null;
  targetFolderInput: HTMLInputElement | null;
  targetFolderOptions: HTMLDataListElement | null;
  targetFolderStatus: HTMLElement | null;
  createTargetFolderButton: HTMLButtonElement | null;
  destinationTarget: HTMLElement | null;
  destinationFinalPath: HTMLElement | null;
  destinationFolderBadge: HTMLElement | null;
  destinationAlternative: HTMLElement | null;
  applyDestinationAlternativeButton: HTMLButtonElement | null;
}

interface NamingPanelFactoryApi {
  createNamingPanel: (options: NamingPanelOptions) => NamingPanelApi;
}

interface Window {
  DocSorterNamingPanel: NamingPanelFactoryApi;
}

var DocSorterNamingPanel: NamingPanelFactoryApi;

(() => {
  function createNamingPanel(options: NamingPanelOptions): NamingPanelApi {
    const elements = getNamingPanelElements(options.root ?? document);
    const draftInputs = [
      elements.dateInput,
      elements.subjectInput,
      elements.typeInput,
      elements.keywordsInput
    ];

    draftInputs.forEach((input) => {
      input?.addEventListener("input", () => {
        options.onDraftChange(readDraft(elements));
      });
    });

    elements.resetButton?.addEventListener("click", () => {
      options.onResetDraft();
    });

    elements.applyDestinationAlternativeButton?.addEventListener("click", () => {
      options.onApplyDestinationAlternative();
    });

    elements.targetFolderInput?.addEventListener("input", () => {
      options.onTargetFolderChange(elements.targetFolderInput?.value ?? "");
    });

    elements.createTargetFolderButton?.addEventListener("click", () => {
      options.onCreateTargetFolder();
    });

    function render(syncInputs: boolean): void {
      if (!elements.panel) {
        return;
      }

      const { activeDocument, naming, effectiveFilename, effectiveFilenameValid, aiPreview, canResetChoices } =
        options.getState();
      syncResetButton(elements, canResetChoices);
      elements.panel.hidden = false;
      if (!activeDocument) {
        if (elements.proposedFilename) {
          elements.proposedFilename.className = "proposal-final-name invalid";
          elements.proposedFilename.replaceChildren("Nom final non généré");
          elements.proposedFilename.title = "";
        }

        setProposalState(elements, "Aucun document sélectionné.");
        renderNameExplanation(elements, createNameExplanationInput(options.getState()));
        renderFolderLearningSummary(elements, options.getState(), options.onUseFolderLearningAlignedName);

        if (elements.messages) {
          elements.messages.replaceChildren(
            createAiPreviewMessageItem({
              level: "info",
              message: "Sélectionnez un document à trier."
            })
          );
        }

        return;
      }

      if (syncInputs) {
        syncNamingInputs(elements, naming.draft);
      }

      if (elements.proposedFilename) {
        const hasOverride = Boolean(naming.overrideFilename);
        const displayFilename = hasOverride
          ? effectiveFilename
          : aiPreview
            ? aiPreview.filename
            : naming.proposal?.isValid
              ? effectiveFilename
              : "";
        const displayIsValid = hasOverride
          ? effectiveFilenameValid
          : aiPreview
            ? aiPreview.filenameValid
            : Boolean(naming.proposal?.isValid);
        const label = !aiPreview && naming.isLoading
          ? "Calcul de la proposition..."
          : displayFilename || "Nom final non généré";
        elements.proposedFilename.className = `proposal-final-name ${displayIsValid ? "valid" : "invalid"}`;
        elements.proposedFilename.replaceChildren(label);
        elements.proposedFilename.title = displayFilename;
      }

      setProposalState(elements, proposalStateLabel(naming, aiPreview));
      renderNameExplanation(elements, createNameExplanationInput(options.getState()));
      renderFolderLearningSummary(elements, options.getState(), options.onUseFolderLearningAlignedName);

      if (elements.messages) {
        if (aiPreview) {
          elements.messages.replaceChildren(...aiPreview.messages.map(createAiPreviewMessageItem));
        } else {
          const messages = naming.proposal?.messages ?? [
            {
              level: "warning",
              code: "DATE_REQUIRED",
              message: "Date documentaire à confirmer."
            }
          ];
          elements.messages.replaceChildren(...messages.map(createNamingMessageItem));
        }
      }
    }

    function renderDestinationCheck(): void {
      if (
        !elements.destinationStatus ||
        !elements.destinationTarget ||
        !elements.destinationFinalPath ||
        !elements.destinationAlternative
      ) {
        return;
      }

      const { activeDocument, targetPath, targetFolder, naming, destination, aiPreview } = options.getState();
      renderNameExplanation(elements, createNameExplanationInput(options.getState()));
      renderFolderLearningSummary(elements, options.getState(), options.onUseFolderLearningAlignedName);
      const finalFolder = aiPreview
        ? formatRelativeDestinationFolder(aiPreview.destinationFolder)
        : naming.proposal?.isValid
          ? formatRelativeDestinationFolder(targetFolder.selectedFolder)
          : "Aucun dossier final";
      const targetLabel = targetPath ?? "Aucun dossier cible sélectionné";
      elements.destinationTarget.replaceChildren(targetLabel);
      elements.destinationTarget.title = targetLabel;
      renderTargetFolderControls(elements, targetPath, targetFolder, destination);

      if (!activeDocument) {
        setDestinationState(elements, {
          statusClass: "status-neutral",
          statusText: "Aucun document actif",
          finalPath: "Aucun dossier final",
          folderBadge: null,
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (aiPreview && !aiPreview.filenameValid) {
        setDestinationState(elements, {
          statusClass: "status-warning",
          statusText: "Prévisualisation IA incomplète",
          finalPath: finalFolder,
          folderBadge: folderBadgeFor(finalFolder, targetFolder, destination),
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (!aiPreview && naming.isLoading) {
        setDestinationState(elements, {
          statusClass: "status-neutral",
          statusText: "En attente de la proposition",
          finalPath: "Aucun dossier final",
          folderBadge: null,
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (destination.status === "invalid") {
        setDestinationState(elements, {
          statusClass: "status-warning",
          statusText: "Nom proposé invalide",
          finalPath: "Corriger la proposition avant contrôle cible",
          folderBadge: null,
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (destination.status === "target-not-selected") {
        setDestinationState(elements, {
          statusClass: "status-warning",
          statusText: "Aucune cible sélectionnée",
          finalPath: "Choisir une cible pour vérifier la disponibilité",
          folderBadge: null,
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (destination.status === "checking") {
        setDestinationState(elements, {
          statusClass: "status-neutral",
          statusText: "Contrôle en cours",
          finalPath: finalFolder,
          folderBadge: folderBadgeFor(finalFolder, targetFolder, destination),
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (destination.result) {
        const isCollision = destination.status === "collision";
        setDestinationState(elements, {
          statusClass: isCollision ? "status-warning" : "status-valid",
          statusText: isCollision ? "Nom déjà utilisé" : "Nom disponible",
          finalPath: finalFolder,
          folderBadge: folderBadgeFor(finalFolder, targetFolder, destination),
          alternative: destination.result.alternativeFilename
            ? `Alternative proposée : ${destination.result.alternativeFilename}`
            : "Aucune alternative nécessaire",
          showAlternativeButton: !aiPreview && Boolean(destination.result.alternativeFilename)
        });
        return;
      }

      if (destination.error) {
        setDestinationState(elements, {
          statusClass: "status-error",
          statusText: destinationErrorLabel(destination.error),
          finalPath: "Aucun dossier final",
          folderBadge: null,
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      setDestinationState(elements, {
        statusClass: "status-neutral",
        statusText: "Contrôle cible non lancé",
        finalPath: finalFolder,
        folderBadge: folderBadgeFor(finalFolder, targetFolder, destination),
        alternative: "",
        showAlternativeButton: false
      });
    }

    return {
      render,
      renderDestinationCheck
    };
  }

  function getNamingPanelElements(root: ParentNode): NamingPanelElements {
    return {
      panel: root.querySelector<HTMLElement>("#naming-panel"),
      dateInput: root.querySelector<HTMLInputElement>("#naming-date"),
      subjectInput: root.querySelector<HTMLInputElement>("#naming-subject"),
      typeInput: root.querySelector<HTMLInputElement>("#naming-type"),
      keywordsInput: root.querySelector<HTMLInputElement>("#naming-keywords"),
      resetButton: root.querySelector<HTMLButtonElement>("#reset-naming"),
      proposedFilename: root.querySelector<HTMLElement>("#proposed-filename"),
      nameExplanation: root.querySelector<HTMLDetailsElement>("#name-explanation"),
      nameExplanationContent: root.querySelector<HTMLElement>("#name-explanation-content"),
      folderLearningSummary: root.querySelector<HTMLElement>("#folder-learning-summary"),
      proposalState: root.querySelector<HTMLElement>("#proposal-state"),
      messages: root.querySelector<HTMLUListElement>("#naming-messages"),
      destinationStatus: root.querySelector<HTMLElement>("#destination-status"),
      targetFolderInput: root.querySelector<HTMLInputElement>("#target-folder-input"),
      targetFolderOptions: root.querySelector<HTMLDataListElement>("#target-folder-options"),
      targetFolderStatus: root.querySelector<HTMLElement>("#target-folder-status"),
      createTargetFolderButton: root.querySelector<HTMLButtonElement>("#create-target-folder"),
      destinationTarget: root.querySelector<HTMLElement>("#destination-target"),
      destinationFinalPath: root.querySelector<HTMLElement>("#destination-final-path"),
      destinationFolderBadge: root.querySelector<HTMLElement>("#destination-folder-badge"),
      destinationAlternative: root.querySelector<HTMLElement>("#destination-alternative"),
      applyDestinationAlternativeButton: root.querySelector<HTMLButtonElement>(
        "#apply-destination-alternative"
      )
    };
  }

  function syncResetButton(elements: NamingPanelElements, canResetChoices: boolean): void {
    if (!elements.resetButton) {
      return;
    }

    elements.resetButton.textContent = "Réinitialiser les choix";
    elements.resetButton.disabled = !canResetChoices;
    elements.resetButton.title = canResetChoices
      ? "Restaurer les choix IA initiaux sans modifier le classement réel"
      : "Aucun choix IA modifié à réinitialiser";
  }

  function renderTargetFolderControls(
    elements: NamingPanelElements,
    targetPath: string | null,
    targetFolder: TargetFolderState,
    destination: DestinationCheckState
  ): void {
    if (elements.targetFolderOptions) {
      elements.targetFolderOptions.replaceChildren(
        ...targetFolder.folders.map(createTargetFolderOption)
      );
    }

    if (elements.targetFolderInput) {
      if (document.activeElement !== elements.targetFolderInput) {
        elements.targetFolderInput.value = targetFolder.selectedFolder;
      }
      elements.targetFolderInput.disabled = !targetPath || targetFolder.status === "creating";
      elements.targetFolderInput.placeholder = targetPath
        ? "Racine cible ou Sous/Dossier"
        : "Choisir une racine cible";
      elements.targetFolderInput.title = targetFolder.selectedFolder || "Classement à la racine cible";
    }

    if (elements.targetFolderStatus) {
      const status = targetFolderStatus(targetPath, targetFolder, destination);
      elements.targetFolderStatus.className = status.className;
      elements.targetFolderStatus.replaceChildren(status.message);
      elements.targetFolderStatus.title = status.message;
    }

    if (elements.createTargetFolderButton) {
      const canCreate = canCreateMissingTargetFolder(targetPath, targetFolder, destination);
      elements.createTargetFolderButton.hidden = !canCreate;
      elements.createTargetFolderButton.disabled = targetFolder.status === "creating";
    }
  }

  function createTargetFolderOption(folder: string): HTMLOptionElement {
    const option = document.createElement("option");
    option.value = folder;
    return option;
  }

  function targetFolderStatus(
    targetPath: string | null,
    targetFolder: TargetFolderState,
    destination: DestinationCheckState
  ): { className: string; message: string } {
    if (!targetPath) {
      return {
        className: "status-neutral",
        message: "Choisir une racine cible avant de sélectionner un sous-dossier."
      };
    }

    if (targetFolder.status === "loading") {
      return { className: "status-neutral", message: "Lecture des sous-dossiers cible..." };
    }

    if (targetFolder.status === "creating") {
      return { className: "status-neutral", message: "Création du sous-dossier cible..." };
    }

    if (targetFolder.status === "invalid" || targetFolder.status === "error") {
      return { className: "status-error", message: targetFolder.message };
    }

    if (targetFolder.status === "created") {
      return { className: "status-valid", message: targetFolder.message };
    }

    if (!targetFolder.selectedFolder) {
      return { className: "status-neutral", message: "Classement à la racine cible." };
    }

    if (destination.error?.code === "TARGET_FOLDER_NOT_FOUND") {
      return { className: "status-warning", message: "Dossier inexistant." };
    }

    if (
      destination.error?.code === "TARGET_FOLDER_INVALID" ||
      destination.error?.code === "TARGET_FOLDER_NOT_DIRECTORY"
    ) {
      return { className: "status-error", message: destination.error.message };
    }

    if (destination.result || targetFolder.folders.includes(targetFolder.selectedFolder)) {
      return { className: "status-valid", message: "Dossier existant." };
    }

    return { className: "status-neutral", message: "Sous-dossier à vérifier." };
  }

  function canCreateMissingTargetFolder(
    targetPath: string | null,
    targetFolder: TargetFolderState,
    destination: DestinationCheckState
  ): boolean {
    return Boolean(
      targetPath &&
        targetFolder.selectedFolder &&
        targetFolder.status !== "creating" &&
        destination.error?.code === "TARGET_FOLDER_NOT_FOUND"
    );
  }

  function readDraft(elements: NamingPanelElements): NamingDraft {
    return {
      documentDate: elements.dateInput?.value ?? "",
      subject: elements.subjectInput?.value ?? "",
      documentType: elements.typeInput?.value ?? "",
      keywords: elements.keywordsInput?.value ?? ""
    };
  }

  function syncNamingInputs(elements: NamingPanelElements, draft: NamingDraft): void {
    if (elements.dateInput) {
      elements.dateInput.value = draft.documentDate;
    }
    if (elements.subjectInput) {
      elements.subjectInput.value = draft.subject;
    }
    if (elements.typeInput) {
      elements.typeInput.value = draft.documentType;
    }
    if (elements.keywordsInput) {
      elements.keywordsInput.value = draft.keywords;
    }
  }

  function createNamingMessageItem(message: NamingMessage): HTMLLIElement {
    const item = document.createElement("li");
    item.className = message.level;
    item.textContent = message.message;
    return item;
  }

  function createAiPreviewMessageItem(message: AiSelectionPreviewMessage): HTMLLIElement {
    const item = document.createElement("li");
    item.className = message.level;
    item.textContent = message.message;
    return item;
  }

  function setDestinationState(
    elements: NamingPanelElements,
    destination: {
      statusClass: string;
      statusText: string;
      finalPath: string;
      folderBadge: FolderBadge | null;
      alternative: string;
      showAlternativeButton: boolean;
    }
  ): void {
    if (
      !elements.destinationStatus ||
      !elements.destinationFinalPath ||
      !elements.destinationAlternative
    ) {
      return;
    }

    elements.destinationStatus.className = destination.statusClass;
    elements.destinationStatus.replaceChildren(destination.statusText);
    elements.destinationFinalPath.replaceChildren(destination.finalPath);
    elements.destinationFinalPath.title = destination.finalPath;
    renderFolderBadge(elements.destinationFolderBadge, destination.folderBadge);
    elements.destinationAlternative.replaceChildren(destination.alternative);
    if (elements.applyDestinationAlternativeButton) {
      elements.applyDestinationAlternativeButton.hidden = !destination.showAlternativeButton;
    }
  }

  interface FolderBadge {
    label: "existe" | "à créer" | "fallback";
    className: string;
  }

  function setProposalState(elements: NamingPanelElements, message: string): void {
    if (elements.proposalState) {
      elements.proposalState.replaceChildren(message);
      elements.proposalState.title = message;
    }
  }

  function createNameExplanationInput(state: NamingPanelState): NameExplanationInput {
    const aiPreview = state.aiPreview;
    const hasOverride = Boolean(state.naming.overrideFilename);
    return {
      filename: hasOverride
        ? state.effectiveFilename
        : aiPreview?.filename ?? (state.naming.proposal?.isValid ? state.effectiveFilename : ""),
      filenameValid: hasOverride
        ? state.effectiveFilenameValid
        : aiPreview?.filenameValid ?? Boolean(state.naming.proposal?.isValid),
      filenameSource: state.naming.overrideFilenameOrigin === "folder-learning"
        ? "folder-learning"
        : aiPreview
          ? "ai"
          : "legacy",
      extension: state.activeDocument?.extension ?? "",
      fields: aiPreview?.fields ?? null,
      manualFields: aiPreview?.manualFields ?? null,
      destinationFolder: aiPreview?.destinationFolder ?? state.targetFolder.selectedFolder,
      folderOrigin: state.targetFolder.origin,
      folderLearning: state.folderLearning,
      messages: aiPreview?.messages ?? []
    };
  }

  function renderNameExplanation(
    elements: NamingPanelElements,
    input: NameExplanationInput
  ): void {
    if (!elements.nameExplanationContent) {
      return;
    }

    const model = DocSorterNameExplanation.buildNameExplanation(input);
    const formula = document.createElement("p");
    formula.className = "name-explanation-formula";
    const formulaLabel = document.createElement("span");
    formulaLabel.textContent = "Formule";
    const formulaCode = document.createElement("code");
    formulaCode.textContent = model.formula;
    formula.replaceChildren(formulaLabel, formulaCode);

    const result = document.createElement("p");
    result.className = `name-explanation-result ${model.isComplete ? "valid" : "incomplete"}`;
    result.textContent = model.result;

    const missing = document.createElement("p");
    missing.className = "name-explanation-missing";
    missing.hidden = model.missingFields.length === 0;
    missing.textContent = model.missingFields.length
      ? `Champs manquants : ${model.missingFields.join(", ")}.`
      : "";

    const list = document.createElement("dl");
    list.className = "name-explanation-list";
    list.replaceChildren(...model.lines.map(createNameExplanationLine));

    elements.nameExplanationContent.replaceChildren(formula, result, missing, list);
  }

  function renderFolderLearningSummary(
    elements: NamingPanelElements,
    state: NamingPanelState,
    onUseFolderLearningAlignedName: () => void
  ): void {
    if (!elements.folderLearningSummary) {
      return;
    }

    const folderLearning = state.folderLearning;
    elements.folderLearningSummary.className = `folder-learning-summary ${folderLearning.status}`;

    if (folderLearning.status === "idle") {
      elements.folderLearningSummary.replaceChildren("Convention du dossier : non analysée.");
      return;
    }

    if (folderLearning.status === "loading") {
      elements.folderLearningSummary.replaceChildren("Convention du dossier : lecture en cours.");
      return;
    }

    if (folderLearning.status === "error") {
      elements.folderLearningSummary.replaceChildren("Convention du dossier : indisponible.");
      elements.folderLearningSummary.title = folderLearning.error || folderLearning.message;
      return;
    }

    const profile = folderLearning.profile;
    if (!profile || profile.status === "none") {
      elements.folderLearningSummary.replaceChildren("Convention du dossier : aucune convention détectée.");
      elements.folderLearningSummary.title = folderLearning.message;
      return;
    }

    const title = document.createElement("strong");
    title.textContent = `Convention du dossier : ${profileStatusLabel(profile.status)}`;

    const stats = document.createElement("span");
    stats.textContent = `${profile.recognizedFileCount}/${profile.analyzedFileCount} nom(s) reconnu(s)`;

    const example = document.createElement("span");
    example.textContent = profile.examples[0] ? `Exemple : ${profile.examples[0]}` : "";

    const recommendation = document.createElement("span");
    recommendation.textContent = folderLearning.comparison
      ? `Recommandation : ${recommendationLabel(folderLearning.comparison.recommendation)}`
      : "Recommandation : analyse IA requise";

    const aligned = document.createElement("span");
    aligned.className = "folder-learning-aligned-name";
    aligned.textContent = folderLearning.comparison?.alignedName
      ? `Nom aligné proposé : ${folderLearning.comparison.alignedName}`
      : "";

    const children: Node[] = [
      title,
      stats,
      example,
      recommendation,
      aligned
    ];

    if (canShowUseAlignedNameButton(state)) {
      const action = document.createElement("button");
      action.type = "button";
      action.className = "folder-learning-use-aligned";
      action.textContent = "Utiliser ce nom aligné";
      action.title = "Appliquer ce nom comme nom final affiché et vérifié";
      action.addEventListener("click", () => {
        onUseFolderLearningAlignedName();
      });
      children.push(action);
    }

    elements.folderLearningSummary.replaceChildren(...children);
    elements.folderLearningSummary.title = folderLearning.message;
  }

  function canShowUseAlignedNameButton(state: NamingPanelState): boolean {
    const comparison = state.folderLearning.comparison;
    const alignedName = comparison?.alignedName?.trim() ?? "";
    if (!state.activeDocument || !comparison || !alignedName) {
      return false;
    }

    if (comparison.recommendation !== "prefer-folder-profile" && comparison.recommendation !== "manual-review") {
      return false;
    }

    if (normalizeFilenameForComparison(alignedName) === normalizeFilenameForComparison(state.effectiveFilename)) {
      return false;
    }

    return isSafeAlignedFilename(alignedName, state.activeDocument.extension);
  }

  function profileStatusLabel(status: FolderLearningProfileStatus): string {
    switch (status) {
      case "none":
        return "aucune";
      case "weak":
        return "faible";
      case "medium":
        return "moyenne";
      case "strong":
        return "forte";
    }
  }

  function recommendationLabel(recommendation: FolderLearningRecommendation): string {
    switch (recommendation) {
      case "keep-ai":
        return "garder le nom IA";
      case "manual-review":
        return "comparaison manuelle";
      case "prefer-folder-profile":
        return "convention recommandée";
    }
  }

  function createNameExplanationLine(line: NameExplanationLine): HTMLDivElement {
    const item = document.createElement("div");
    item.className = `name-explanation-line ${line.status}`;

    const term = document.createElement("dt");
    term.textContent = line.label;

    const definition = document.createElement("dd");
    const value = document.createElement("strong");
    value.textContent = line.value;
    const reason = document.createElement("span");
    reason.textContent = line.reason;
    const source = document.createElement("small");
    source.textContent = line.source;
    definition.replaceChildren(value, reason, source);

    item.replaceChildren(term, definition);
    return item;
  }

  function proposalStateLabel(
    naming: NamingState,
    aiPreview: NamingPanelState["aiPreview"]
  ): string {
    if (aiPreview) {
      if (aiPreview.filenameValid) {
        return "Proposition prête.";
      }

      const firstError = aiPreview.messages.find((message) => message.level === "error");
      return firstError
        ? `Proposition incomplète : ${firstError.message}`
        : "Proposition incomplète.";
    }

    if (naming.isLoading) {
      return "Calcul de la proposition...";
    }

    if (naming.proposal?.isValid) {
      return "Proposition prête à vérifier.";
    }

    const firstError = naming.proposal?.messages.find((message) => message.level === "error");
    return firstError
      ? `Proposition incomplète : ${firstError.message}`
      : "Analyse IA requise pour générer une proposition.";
  }

  function formatRelativeDestinationFolder(value: string): string {
    const folder = value
      .trim()
      .replace(/\\/g, "/")
      .replace(/^\/+|\/+$/g, "");
    return folder || "Aucun dossier final";
  }

  function folderBadgeFor(
    finalFolder: string,
    targetFolder: TargetFolderState,
    destination: DestinationCheckState
  ): FolderBadge | null {
    const normalized = normalizeFolderForComparison(finalFolder);
    if (!normalized || normalized === normalizeFolderForComparison("Aucun dossier final")) {
      return null;
    }

    if (normalized.startsWith("divers") || normalized.includes("/a-traiter-manuellement")) {
      return { label: "fallback", className: "folder-status-badge ds-badge ds-badge-fallback" };
    }

    const matchesKnownFolder = targetFolder.folders.some(
      (folder) => normalizeFolderForComparison(folder) === normalized
    );
    if (matchesKnownFolder || destination.result) {
      return { label: "existe", className: "folder-status-badge ds-badge ds-badge-success" };
    }

    return { label: "à créer", className: "folder-status-badge ds-badge ds-badge-warning" };
  }

  function renderFolderBadge(element: HTMLElement | null, badge: FolderBadge | null): void {
    if (!element) {
      return;
    }

    element.hidden = !badge;
    if (!badge) {
      element.className = "folder-status-badge ds-badge";
      element.replaceChildren();
      element.title = "";
      return;
    }

    element.className = badge.className;
    element.replaceChildren(badge.label);
    element.title = badge.label;
  }

  function normalizeFolderForComparison(value: string): string {
    return value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").toLowerCase();
  }

  function normalizeFilenameForComparison(value: string): string {
    return value.trim().toLowerCase();
  }

  function isSafeAlignedFilename(
    value: string,
    expectedExtension: SupportedDocumentExtension
  ): boolean {
    const filename = value.trim();
    if (!filename || filename !== value || filename.length > 220) {
      return false;
    }

    if (
      filename.includes("/") ||
      filename.includes("\\") ||
      filename.includes("..") ||
      /^[a-z]:/i.test(filename) ||
      /[\x00-\x1f<>:"|?*]/.test(filename)
    ) {
      return false;
    }

    const extension = expectedExtension.toLowerCase();
    if (!filename.toLowerCase().endsWith(extension)) {
      return false;
    }

    const baseName = filename.slice(0, -extension.length);
    if (!baseName || baseName.endsWith(".") || baseName.endsWith(" ")) {
      return false;
    }

    const firstSegment = baseName.split(".")[0]?.toUpperCase() ?? "";
    return !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(firstSegment);
  }

  function destinationErrorLabel(error: DestinationAvailabilityError): string {
    switch (error.code) {
      case "TARGET_NOT_FOUND":
        return "Cible introuvable";
      case "TARGET_NOT_DIRECTORY":
        return "Cible invalide";
      case "TARGET_ACCESS_DENIED":
        return "Accès cible refusé";
      case "TARGET_NOT_WRITABLE":
        return "Écriture cible refusée";
      case "TARGET_FOLDER_INVALID":
        return "Sous-dossier invalide";
      case "TARGET_FOLDER_NOT_FOUND":
        return "Dossier inexistant";
      case "TARGET_FOLDER_NOT_DIRECTORY":
        return "Sous-dossier invalide";
      case "TOO_MANY_COLLISIONS":
        return "Trop de collisions";
      case "UNKNOWN_ERROR":
        return "Contrôle cible impossible";
      case "TARGET_NOT_SELECTED":
        return "Aucune cible sélectionnée";
      case "INVALID_FILENAME":
        return "Nom proposé invalide";
    }
  }

  DocSorterNamingPanel = {
    createNamingPanel
  };
  globalThis.DocSorterNamingPanel = DocSorterNamingPanel;
})();
