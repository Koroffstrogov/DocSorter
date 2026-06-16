interface HistoryPanelState {
  history: HistoryState;
}

interface HistoryPanelOptions {
  root?: ParentNode;
  getState: () => HistoryPanelState;
  formatDate: (value: string) => string;
}

interface HistoryPanelApi {
  render: () => void;
}

interface HistoryPanelElements {
  state: HTMLElement | null;
  list: HTMLOListElement | null;
}

interface HistoryPanelFactoryApi {
  createHistoryPanel: (options: HistoryPanelOptions) => HistoryPanelApi;
}

interface Window {
  DocSorterHistoryPanel: HistoryPanelFactoryApi;
}

var DocSorterHistoryPanel: HistoryPanelFactoryApi;

(() => {
  function createHistoryPanel(options: HistoryPanelOptions): HistoryPanelApi {
    const elements = getHistoryPanelElements(options.root ?? document);

    function render(): void {
      if (!elements.state || !elements.list) {
        return;
      }

      const { history } = options.getState();
      if (history.isLoading) {
        elements.state.hidden = false;
        elements.state.replaceChildren("Lecture du journal...");
        elements.list.replaceChildren();
        return;
      }

      if (history.errorMessage) {
        elements.state.hidden = false;
        elements.state.replaceChildren(history.errorMessage);
        elements.list.replaceChildren();
        return;
      }

      if (history.entries.length === 0) {
        elements.state.hidden = false;
        elements.state.replaceChildren("Aucune action récente");
        elements.list.replaceChildren();
        return;
      }

      elements.state.hidden = true;
      elements.state.replaceChildren();
      elements.list.replaceChildren(...history.entries.map(createHistoryItem));
    }

    function createHistoryItem(entry: ActionJournalEntry): HTMLLIElement {
      const item = document.createElement("li");
      const header = document.createElement("div");
      const action = document.createElement("strong");
      const status = document.createElement("span");
      const names = document.createElement("p");
      const date = document.createElement("small");

      item.className = `history-item history-${entry.status}`;
      item.title = historyEntryTitle(entry);
      action.textContent = historyActionLabel(entry.action);
      status.textContent = historyStatusLabel(entry.status);
      header.append(action, status);
      names.textContent = historyNamesLabel(entry);
      date.textContent = options.formatDate(entry.timestamp);
      item.append(header, names, date);

      return item;
    }

    return {
      render
    };
  }

  function getHistoryPanelElements(root: ParentNode): HistoryPanelElements {
    return {
      state: root.querySelector<HTMLElement>("#history-state"),
      list: root.querySelector<HTMLOListElement>("#history-list")
    };
  }

  function historyEntryTitle(entry: ActionJournalEntry): string {
    const paths = [entry.oldPath, entry.newPath, entry.restoredPath, entry.classifiedPath].filter(Boolean);
    return paths.join("\n");
  }

  function historyNamesLabel(entry: ActionJournalEntry): string {
    const left = entry.oldName ?? "Nom source inconnu";
    const right = entry.newName ?? "Nom cible inconnu";
    return `${left} -> ${right}`;
  }

  function historyActionLabel(action: ActionJournalEntry["action"]): string {
    switch (action) {
      case "classify":
        return "Classement";
      case "undo-classify":
        return "Annulation";
    }
  }

  function historyStatusLabel(status: ActionJournalEntry["status"]): string {
    switch (status) {
      case "started":
        return "Démarré";
      case "completed":
        return "Terminé";
      case "failed":
        return "Échec";
    }
  }

  DocSorterHistoryPanel = {
    createHistoryPanel
  };
  globalThis.DocSorterHistoryPanel = DocSorterHistoryPanel;
})();
