interface DocumentDetailsPanelState {
  activeDocument: DocumentItem | null;
  targetPath: string | null;
  targetFolder: string;
}

interface DocumentDetailsPanelOptions {
  root?: ParentNode;
  getState: () => DocumentDetailsPanelState;
  formatDate: (value: string) => string;
  statusLabel: (status: DocumentItem["status"]) => string;
}

interface DocumentDetailsPanelApi {
  render: () => void;
}

interface DocumentDetailsPanelFactoryApi {
  createDocumentDetailsPanel: (options: DocumentDetailsPanelOptions) => DocumentDetailsPanelApi;
}

interface Window {
  DocSorterDocumentDetailsPanel: DocumentDetailsPanelFactoryApi;
}

var DocSorterDocumentDetailsPanel: DocumentDetailsPanelFactoryApi;

(() => {
  function createDocumentDetailsPanel(options: DocumentDetailsPanelOptions): DocumentDetailsPanelApi {
    const details = (options.root ?? document).querySelector<HTMLElement>("#document-details");

    function render(): void {
      if (!details) {
        return;
      }

      const { activeDocument, targetPath, targetFolder } = options.getState();
      if (!activeDocument) {
        details.className = "details-empty";
        details.replaceChildren("Aucun document actif");
        return;
      }

      details.className = "details-list";
      details.replaceChildren(
        createDetailRow("Nom", activeDocument.name),
        createDetailRow("Chemin complet", activeDocument.filePath),
        createDetailRow("Extension", activeDocument.extension.toUpperCase()),
        createDetailRow("Taille", activeDocument.sizeLabel),
        createDetailRow("Date de modification", options.formatDate(activeDocument.modifiedAt)),
        createDetailRow("Statut", options.statusLabel(activeDocument.status)),
        createDetailRow("Racine cible", targetPath ?? "Aucune racine cible sélectionnée"),
        createDetailRow("Sous-dossier cible", targetFolder || "Racine cible")
      );
    }

    return {
      render
    };
  }

  function createDetailRow(label: string, value: string): HTMLDivElement {
    const row = document.createElement("div");
    const labelElement = document.createElement("span");
    const valueElement = document.createElement("strong");

    labelElement.textContent = label;
    valueElement.textContent = value;
    valueElement.title = value;
    row.append(labelElement, valueElement);

    return row;
  }

  DocSorterDocumentDetailsPanel = {
    createDocumentDetailsPanel
  };
  globalThis.DocSorterDocumentDetailsPanel = DocSorterDocumentDetailsPanel;
})();
