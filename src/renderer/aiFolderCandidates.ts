interface AiFolderCandidatesOptions {
  onFolderCandidateSelect: (relativePath: string) => void;
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

    container.append(cards);
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
