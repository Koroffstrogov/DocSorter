interface AiFolderCandidatesOptions {
  onFolderCandidateSelect: (relativePath: string) => void;
  onFolderManualEditStart: () => void;
  onFolderManualValueChange: (relativePath: string) => void;
  onFolderManualEditFinish: () => void;
}

interface AiFolderCandidatesApi {
  createFolderCandidateContent: (
    state: AiState,
    options: AiFolderCandidatesOptions
  ) => Node[];
}

interface Window {
  DocSorterAiFolderCandidates: AiFolderCandidatesApi;
}

var DocSorterAiFolderCandidates: AiFolderCandidatesApi;

(() => {
  const aiFormatters = DocSorterAiPanelFormatters;
  const aiFieldRows = DocSorterAiFieldRows;

  function createFolderCandidateContent(state: AiState, options: AiFolderCandidatesOptions): Node[] {
    const suggestion = state.suggestion;
    const container = document.createElement("div");
    const cards = document.createElement("div");

    if (state.panelStatus === "analyzing") {
      const empty = document.createElement("p");
      empty.className = "compact-empty-state";
      empty.textContent = "Analyse IA en cours. Les dossiers proposés apparaîtront ici.";
      return [empty];
    }

    if (!suggestion) {
      const empty = document.createElement("p");
      empty.className = "compact-empty-state";
      empty.textContent = "Analyse IA requise pour proposer un dossier.";
      return [empty];
    }

    const folderCandidates = aiFieldRows.getFolderCandidates(suggestion).slice(0, 3);
    const selectedFolder = state.selection?.selectedFolder ?? suggestion?.suggestion.targetFolder ?? "";
    const isEditingFolder = Boolean(state.selection?.editingFolder);

    container.className = "folder-candidate-content";
    cards.className = "folder-candidate-cards";
    cards.replaceChildren(
      ...folderCandidates.map((candidate) =>
        createFolderCandidateCard(candidate, selectedFolder, () => {
          options.onFolderCandidateSelect(candidate.value);
        })
      )
    );

    if (folderCandidates.length === 0) {
      const empty = document.createElement("span");
      empty.className = "folder-candidate-empty";
      empty.textContent = "Aucune carte de dossier disponible.";
      cards.append(empty);
    }

    container.append(cards, createManualFolderControl(selectedFolder, isEditingFolder, options));
    return [container];
  }

  function createFolderCandidateCard(
    candidate: AiCandidateView,
    selectedFolder: string,
    onSelect: () => void
  ): HTMLElement {
    const card = document.createElement("button");
    const marker = document.createElement("span");
    const value = document.createElement("strong");
    const meta = document.createElement("span");
    const selected = aiFormatters.normalizeFolderForDisplay(candidate.value) === aiFormatters.normalizeFolderForDisplay(selectedFolder);
    const label = formatRelativeFolderLabel(candidate.value);
    card.type = "button";
    card.className = `folder-candidate-card ${aiFormatters.folderRoleClass(candidate)} ${selected ? "selected" : ""}`;
    card.setAttribute("aria-pressed", String(selected));
    card.title = candidate.reason;
    marker.className = "folder-candidate-marker";
    marker.textContent = selected ? "✓" : "";
    marker.setAttribute("aria-hidden", "true");
    value.textContent = label;
    value.title = label;
    meta.className = "folder-candidate-badge";
    meta.textContent = aiFormatters.folderRoleLabel(candidate);
    card.addEventListener("click", onSelect);
    card.append(marker, value, meta);
    return card;
  }

  function createManualFolderControl(
    selectedFolder: string,
    isEditingFolder: boolean,
    options: AiFolderCandidatesOptions
  ): HTMLElement {
    const control = document.createElement("div");
    control.className = `folder-manual-control ${isEditingFolder ? "editing" : ""}`;

    if (!isEditingFolder) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "folder-manual-edit";
      button.textContent = "✎ Modifier";
      button.title = "Saisir manuellement le sous-dossier cible";
      button.setAttribute("aria-label", "Modifier manuellement le sous-dossier cible");
      button.addEventListener("click", () => {
        options.onFolderManualEditStart();
      });
      control.append(button);
      return control;
    }

    const input = document.createElement("input");
    input.type = "text";
    input.className = "folder-manual-input";
    input.value = selectedFolder;
    input.placeholder = "Sous-dossier relatif";
    input.title = "Sous-dossier relatif. Aucun dossier n'est créé automatiquement.";
    input.addEventListener("input", () => {
      options.onFolderManualValueChange(input.value);
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === "Escape") {
        event.preventDefault();
        input.blur();
      }
    });
    input.addEventListener("blur", () => {
      options.onFolderManualEditFinish();
    });
    control.append(input);
    window.setTimeout(() => {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 0);
    return control;
  }

  function formatRelativeFolderLabel(value: string): string {
    const normalized = value.trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
    if (/^[a-z]:\//i.test(normalized)) {
      const parts = normalized.split("/").filter(Boolean);
      return parts[parts.length - 1] ?? "Dossier invalide";
    }
    return normalized || "Aucun dossier";
  }

  globalThis.DocSorterAiFolderCandidates = {
    createFolderCandidateContent
  };
})();
