interface NamingPanelState {
  activeDocument: DocumentItem | null;
  targetPath: string | null;
  targetFolder: TargetFolderState;
  naming: NamingState;
  destination: DestinationCheckState;
  effectiveFilename: string;
}

interface NamingPanelOptions {
  root?: ParentNode;
  getState: () => NamingPanelState;
  onDraftChange: (draft: NamingDraft) => void;
  onResetDraft: () => void;
  onApplyDestinationAlternative: () => void;
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
  messages: HTMLUListElement | null;
  destinationStatus: HTMLElement | null;
  targetFolderInput: HTMLInputElement | null;
  targetFolderOptions: HTMLDataListElement | null;
  targetFolderStatus: HTMLElement | null;
  createTargetFolderButton: HTMLButtonElement | null;
  destinationTarget: HTMLElement | null;
  destinationFinalPath: HTMLElement | null;
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

      const { activeDocument, naming, effectiveFilename } = options.getState();
      elements.panel.hidden = !activeDocument;
      if (!activeDocument) {
        return;
      }

      if (syncInputs) {
        syncNamingInputs(elements, naming.draft);
      }

      if (elements.proposedFilename) {
        elements.proposedFilename.className = naming.proposal?.isValid ? "valid" : "invalid";
        elements.proposedFilename.replaceChildren(
          naming.isLoading
            ? "Calcul de la proposition..."
            : effectiveFilename || "Nom impossible à générer"
        );
        elements.proposedFilename.title = effectiveFilename;
      }

      if (elements.messages) {
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

    function renderDestinationCheck(): void {
      if (
        !elements.destinationStatus ||
        !elements.destinationTarget ||
        !elements.destinationFinalPath ||
        !elements.destinationAlternative
      ) {
        return;
      }

      const { activeDocument, targetPath, targetFolder, naming, destination } = options.getState();
      const targetLabel = targetPath ?? "Aucun dossier cible sélectionné";
      elements.destinationTarget.replaceChildren(targetLabel);
      elements.destinationTarget.title = targetLabel;
      renderTargetFolderControls(elements, targetPath, targetFolder, destination);

      if (!activeDocument) {
        setDestinationState(elements, {
          statusClass: "status-neutral",
          statusText: "Aucun document actif",
          finalPath: "Aucun contrôle cible en cours",
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (naming.isLoading) {
        setDestinationState(elements, {
          statusClass: "status-neutral",
          statusText: "En attente de la proposition",
          finalPath: "Le nom final sera contrôlé après calcul",
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
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      if (destination.status === "checking") {
        setDestinationState(elements, {
          statusClass: "status-neutral",
          statusText: "Contrôle en cours",
          finalPath: destination.checkedFilename,
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
          finalPath: destination.result.finalPath,
          alternative: destination.result.alternativeFilename
            ? `Alternative proposée : ${destination.result.alternativeFilename}`
            : "Aucune alternative nécessaire",
          showAlternativeButton: Boolean(destination.result.alternativeFilename)
        });
        return;
      }

      if (destination.error) {
        setDestinationState(elements, {
          statusClass: "status-error",
          statusText: destinationErrorLabel(destination.error),
          finalPath: destination.error.message,
          alternative: "",
          showAlternativeButton: false
        });
        return;
      }

      setDestinationState(elements, {
        statusClass: "status-neutral",
        statusText: "Contrôle cible non lancé",
        finalPath: "Le nom final sera vérifié avant validation future",
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
      messages: root.querySelector<HTMLUListElement>("#naming-messages"),
      destinationStatus: root.querySelector<HTMLElement>("#destination-status"),
      targetFolderInput: root.querySelector<HTMLInputElement>("#target-folder-input"),
      targetFolderOptions: root.querySelector<HTMLDataListElement>("#target-folder-options"),
      targetFolderStatus: root.querySelector<HTMLElement>("#target-folder-status"),
      createTargetFolderButton: root.querySelector<HTMLButtonElement>("#create-target-folder"),
      destinationTarget: root.querySelector<HTMLElement>("#destination-target"),
      destinationFinalPath: root.querySelector<HTMLElement>("#destination-final-path"),
      destinationAlternative: root.querySelector<HTMLElement>("#destination-alternative"),
      applyDestinationAlternativeButton: root.querySelector<HTMLButtonElement>(
        "#apply-destination-alternative"
      )
    };
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

  function setDestinationState(
    elements: NamingPanelElements,
    destination: {
      statusClass: string;
      statusText: string;
      finalPath: string;
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
    elements.destinationAlternative.replaceChildren(destination.alternative);
    if (elements.applyDestinationAlternativeButton) {
      elements.applyDestinationAlternativeButton.hidden = !destination.showAlternativeButton;
    }
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
