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
    const current = document.createElement("p");
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
    current.className = "folder-current";
    current.textContent = `Dossier proposé actuel : ${selectedFolder.trim() || "Aucun"}`;
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

    container.append(current, cards);
    return [container];
  }

  function createFolderCandidateCard(
    candidate: AiCandidateView,
    selectedFolder: string,
    onSelect: () => void
  ): HTMLElement {
    const card = document.createElement("button");
    const value = document.createElement("strong");
    const meta = document.createElement("span");
    const reason = document.createElement("p");
    const selected = aiFormatters.normalizeFolderForDisplay(candidate.value) === aiFormatters.normalizeFolderForDisplay(selectedFolder);
    card.type = "button";
    card.className = `folder-candidate-card ${aiFormatters.folderRoleClass(candidate)} ${selected ? "selected" : ""}`;
    card.setAttribute("aria-pressed", String(selected));
    value.textContent = selected ? `✓ ${candidate.value}` : candidate.value;
    value.title = candidate.value;
    meta.className = "folder-candidate-badge";
    meta.textContent = `${aiFormatters.folderRoleLabel(candidate)} · score ${candidate.score}`;
    reason.textContent = candidate.reason;
    card.addEventListener("click", onSelect);
    card.append(value, meta, reason);
    return card;
  }

  globalThis.DocSorterAiFolderCandidates = {
    createFolderCandidateContent
  };
})();
