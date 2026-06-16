interface ClassificationPanelState {
  activeDocument: DocumentItem | null;
  classification: ClassificationState;
}

interface ClassificationPanelOptions {
  root?: ParentNode;
  getState: () => ClassificationPanelState;
  hasVisibleDuplicate: (filePath: string) => boolean;
  formatDate: (value: string) => string;
}

interface ClassificationPanelApi {
  render: () => void;
  isVisible: () => boolean;
}

interface ClassificationPanelFactoryApi {
  createClassificationPanel: (options: ClassificationPanelOptions) => ClassificationPanelApi;
}

interface Window {
  DocSorterClassificationPanel: ClassificationPanelFactoryApi;
}

var DocSorterClassificationPanel: ClassificationPanelFactoryApi;

(() => {
  function createClassificationPanel(options: ClassificationPanelOptions): ClassificationPanelApi {
    const summary = (options.root ?? document).querySelector<HTMLElement>("#classification-summary");

    function render(): void {
      if (!summary) {
        return;
      }

      const { activeDocument, classification } = options.getState();

      if (classification.status === "completed-warning" && classification.journalWarning) {
        summary.hidden = false;
        summary.replaceChildren(
          createHeading("Classement réel", "Journal incomplet", classification.status),
          createWarningMessage(classification.journalWarning.message),
          createNotice("Le fichier a bien été déplacé."),
          createNotice("L'historique persistant et l'annulation après redémarrage peuvent être incomplets."),
          createNotice("L'annulation immédiate reste possible si le bouton est actif."),
          ...(classification.plan ? [createDetails(classification.plan, options.formatDate)] : [])
        );
        return;
      }

      if (classification.status === "undo-warning" && classification.journalWarning) {
        summary.hidden = false;
        summary.replaceChildren(
          createHeading("Annulation", "Journal incomplet", classification.status),
          createWarningMessage(classification.journalWarning.message),
          createNotice("Le fichier a bien été restauré."),
          createNotice("Le journal n'a pas pu être finalisé.")
        );
        return;
      }

      if (classification.status === "undoing") {
        summary.hidden = false;
        summary.replaceChildren(
          createHeading("Annulation", "En cours", classification.status),
          createNotice("Annulation de la dernière action en cours...")
        );
        return;
      }

      if (!activeDocument || classification.status === "idle") {
        summary.hidden = true;
        summary.replaceChildren();
        return;
      }

      summary.hidden = false;

      if (classification.status === "preparing") {
        summary.replaceChildren(
          createHeading("Simulation de classement", "Préparation en cours", classification.status),
          createNotice("Simulation uniquement — aucun fichier n'a été modifié")
        );
        return;
      }

      if (classification.status === "executing") {
        summary.replaceChildren(
          createHeading("Classement réel", "En cours", classification.status),
          createNotice("Action réelle : le fichier est en cours de renommage et déplacement.")
        );
        return;
      }

      const plan = classification.plan;
      if (!plan) {
        summary.hidden = true;
        summary.replaceChildren();
        return;
      }

      summary.replaceChildren(
        createHeading(
          "Simulation de classement",
          classification.status === "ready" ? "Plan prêt" : "Plan bloqué",
          classification.status
        ),
        createNotice("Simulation uniquement — aucun fichier n'a été modifié"),
        ...(plan.status === "ready" && options.hasVisibleDuplicate(activeDocument.filePath)
          ? [
              createNotice(
                "Attention : doublon exact détecté. Le classement réel conservera un fichier séparé, sans suppression ni remplacement."
              )
            ]
          : []),
        ...(plan.status === "ready"
          ? [createNotice("Action réelle : le fichier sera renommé et déplacé.")]
          : []),
        createMessage(plan, classification.error),
        createDetails(plan, options.formatDate),
        createChecks(plan.checks)
      );
    }

    function isVisible(): boolean {
      return Boolean(summary && !summary.hidden);
    }

    return {
      render,
      isVisible
    };
  }

  function createHeading(
    title: string,
    status: string,
    classificationStatus: ClassificationState["status"]
  ): HTMLDivElement {
    const heading = document.createElement("div");
    const titleElement = document.createElement("h4");
    const statusElement = document.createElement("strong");

    heading.className = "classification-heading";
    titleElement.textContent = title;
    statusElement.textContent = status;
    statusElement.className = classificationStatus === "ready" ? "status-valid" : "status-warning";
    heading.append(titleElement, statusElement);

    return heading;
  }

  function createNotice(message: string): HTMLParagraphElement {
    const notice = document.createElement("p");
    notice.className = "classification-notice";
    notice.textContent = message;
    return notice;
  }

  function createMessage(
    plan: ClassificationPlan,
    error: ClassificationPlanError | ClassificationOperationError | UndoClassificationError | null
  ): HTMLParagraphElement {
    const message = document.createElement("p");
    message.className =
      plan.status === "ready" ? "classification-message ready" : "classification-message blocked";
    message.textContent = error?.message ?? plan.message;
    return message;
  }

  function createWarningMessage(messageText: string): HTMLParagraphElement {
    const message = document.createElement("p");
    message.className = "classification-message blocked";
    message.textContent = messageText;
    return message;
  }

  function createDetails(
    plan: ClassificationPlan,
    formatDate: (value: string) => string
  ): HTMLDListElement {
    const details = document.createElement("dl");
    details.className = "classification-details";
    details.append(
      createDetail("Source", plan.sourcePath),
      createDetail("Nom actuel", plan.currentName),
      createDetail("Cible", plan.targetPath),
      createDetail("Nom proposé", plan.proposedFilename),
      createDetail("Chemin final prévu", plan.destinationPath || "Non déterminé"),
      createDetail("Préparé le", formatDate(plan.preparedAt))
    );

    return details;
  }

  function createDetail(label: string, value: string): HTMLDivElement {
    const row = document.createElement("div");
    const labelElement = document.createElement("dt");
    const valueElement = document.createElement("dd");

    labelElement.textContent = label;
    valueElement.textContent = value;
    valueElement.title = value;
    row.append(labelElement, valueElement);

    return row;
  }

  function createChecks(checks: ClassificationPlanCheck[]): HTMLUListElement {
    const list = document.createElement("ul");
    list.className = "classification-checks";
    list.replaceChildren(...checks.map(createCheckItem));
    return list;
  }

  function createCheckItem(check: ClassificationPlanCheck): HTMLLIElement {
    const item = document.createElement("li");
    const status = document.createElement("span");
    const text = document.createElement("strong");
    const message = document.createElement("small");

    item.className = `check-${check.status}`;
    status.textContent = checkStatusLabel(check.status);
    text.textContent = check.label;
    message.textContent = check.message;
    item.append(status, text, message);

    return item;
  }

  function checkStatusLabel(status: ClassificationPlanCheckStatus): string {
    switch (status) {
      case "ok":
        return "OK";
      case "blocking":
        return "Bloquant";
      case "not-run":
        return "Non contrôlé";
    }
  }

  DocSorterClassificationPanel = {
    createClassificationPanel
  };
  globalThis.DocSorterClassificationPanel = DocSorterClassificationPanel;
})();
