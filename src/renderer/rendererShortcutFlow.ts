function handleGlobalKeyboardShortcut(event: KeyboardEvent): void {
  const action = DocSorterKeyboardShortcuts.resolveKeyboardShortcut(event, {
    focusKind: DocSorterKeyboardShortcuts.getShortcutFocusKind(document.activeElement),
    searchHasText: state.queueView.query.length > 0,
    sourceAvailable: canRefreshSource(),
    prepareClassificationAvailable: canPrepareClassificationPlan(),
    executeClassificationAvailable: canExecuteClassificationShortcut(),
    undoAvailable: canUndoLastAction()
  });

  if (!action) {
    return;
  }

  event.preventDefault();
  executeKeyboardShortcut(action);
}

function executeKeyboardShortcut(action: KeyboardShortcutAction): void {
  switch (action) {
    case "navigate-next":
      navigateVisibleQueue("next");
      return;
    case "navigate-previous":
      navigateVisibleQueue("previous");
      return;
    case "page-next":
      navigateVisibleQueueByOffset(8);
      return;
    case "page-previous":
      navigateVisibleQueueByOffset(-8);
      return;
    case "focus-search":
      focusQueueSearch();
      return;
    case "clear-search":
      clearQueueSearch();
      return;
    case "blur-search":
      queuePanel.blurSearch();
      return;
    case "toggle-duplicates-filter":
      setQueueFilter(state.queueView.filter === "duplicates" ? "all" : "duplicates");
      return;
    case "show-all-filter":
      setQueueFilter("all");
      return;
    case "refresh-source":
      if (canRefreshSource()) {
        void refreshDocuments({
          preserveSelection: true,
          successMessage: "Rafraîchissement réussi"
        });
      }
      return;
    case "prepare-classification":
      if (canPrepareClassificationPlan()) {
        void prepareClassificationSimulation();
      }
      return;
    case "execute-classification":
      if (canExecuteClassificationShortcut()) {
        void executeClassificationAction();
      }
      return;
    case "undo-last-action":
      if (canUndoLastAction()) {
        void undoLastClassificationAction();
      }
      return;
    case "toggle-shortcuts-help":
      toggleShortcutHelp();
      return;
  }
}

function renderShortcutHelp(): void {
  if (shortcutHelpPanel) {
    shortcutHelpPanel.hidden = !state.shortcutsHelpVisible;
  }

  if (shortcutHelpToggleButton) {
    shortcutHelpToggleButton.ariaPressed = String(state.shortcutsHelpVisible);
  }
}

function toggleShortcutHelp(): void {
  state.shortcutsHelpVisible = !state.shortcutsHelpVisible;
  renderShortcutHelp();
}

function canRefreshSource(): boolean {
  return Boolean(state.sourcePath && !state.isLoading && !isClassificationBusy());
}

function canUndoLastAction(): boolean {
  return Boolean(state.lastUndoableAction && !isClassificationBusy());
}

function canExecuteClassificationShortcut(): boolean {
  return Boolean(canExecuteClassification() && classificationPanel.isVisible());
}

