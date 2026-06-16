type ShortcutFocusKind = "none" | "text-input" | "search-input" | "select" | "contenteditable";
type KeyboardShortcutAction =
  | "navigate-next"
  | "navigate-previous"
  | "page-next"
  | "page-previous"
  | "focus-search"
  | "clear-search"
  | "blur-search"
  | "toggle-duplicates-filter"
  | "show-all-filter"
  | "refresh-source"
  | "prepare-classification"
  | "execute-classification"
  | "undo-last-action"
  | "toggle-shortcuts-help";

interface KeyboardShortcutEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  repeat?: boolean;
}

interface KeyboardShortcutContext {
  focusKind: ShortcutFocusKind;
  searchHasText: boolean;
  sourceAvailable: boolean;
  prepareClassificationAvailable: boolean;
  executeClassificationAvailable: boolean;
  undoAvailable: boolean;
}

interface KeyboardShortcutsApi {
  resolveKeyboardShortcut: (
    event: KeyboardShortcutEventLike,
    context: KeyboardShortcutContext
  ) => KeyboardShortcutAction | null;
  getShortcutFocusKind: (element: Element | null) => ShortcutFocusKind;
}

interface Window {
  DocSorterKeyboardShortcuts: KeyboardShortcutsApi;
}

var DocSorterKeyboardShortcuts: KeyboardShortcutsApi;

(() => {
  function resolveKeyboardShortcut(
    event: KeyboardShortcutEventLike,
    context: KeyboardShortcutContext
  ): KeyboardShortcutAction | null {
    const key = normalizedKey(event.key);
    const hasModifier = Boolean(event.ctrlKey || event.metaKey);
    const focusIsTyping = isTypingFocus(context.focusKind);

    if (hasModifier && key === "f" && !event.altKey) {
      return "focus-search";
    }

    if (key === "escape" && context.focusKind === "search-input") {
      return context.searchHasText ? "clear-search" : "blur-search";
    }

    if (focusIsTyping) {
      return null;
    }

    if (event.altKey) {
      return null;
    }

    if (key === "arrowdown") {
      return "navigate-next";
    }

    if (key === "arrowup") {
      return "navigate-previous";
    }

    if (key === "pagedown") {
      return "page-next";
    }

    if (key === "pageup") {
      return "page-previous";
    }

    if (hasModifier && key === "enter") {
      return context.executeClassificationAvailable && !event.repeat ? "execute-classification" : null;
    }

    if (hasModifier && key === "z") {
      return context.undoAvailable && !event.repeat ? "undo-last-action" : null;
    }

    if (hasModifier) {
      return null;
    }

    if (event.repeat && isRepeatSensitiveKey(key)) {
      return null;
    }

    switch (key) {
      case "d":
        return "toggle-duplicates-filter";
      case "t":
        return "show-all-filter";
      case "r":
        return context.sourceAvailable ? "refresh-source" : null;
      case "v":
        return context.prepareClassificationAvailable ? "prepare-classification" : null;
      case "s":
        return "navigate-next";
      case "?":
        return "toggle-shortcuts-help";
      default:
        return null;
    }
  }

  function getShortcutFocusKind(element: Element | null): ShortcutFocusKind {
    if (!element) {
      return "none";
    }

    if (element.closest("[contenteditable='true']")) {
      return "contenteditable";
    }

    const tagName = element.tagName.toLowerCase();
    if (tagName === "select") {
      return "select";
    }

    if (tagName === "textarea") {
      return "text-input";
    }

    if (tagName !== "input") {
      return "none";
    }

    const input = element as HTMLInputElement;
    return input.type === "search" ? "search-input" : "text-input";
  }

  function normalizedKey(key: string): string {
    return key.length === 1 ? key.toLocaleLowerCase("fr-FR") : key.toLocaleLowerCase("fr-FR");
  }

  function isTypingFocus(focusKind: ShortcutFocusKind): boolean {
    return (
      focusKind === "text-input" ||
      focusKind === "search-input" ||
      focusKind === "select" ||
      focusKind === "contenteditable"
    );
  }

  function isRepeatSensitiveKey(key: string): boolean {
    return key === "d" || key === "t" || key === "r" || key === "v" || key === "?";
  }

  DocSorterKeyboardShortcuts = {
    resolveKeyboardShortcut,
    getShortcutFocusKind
  };
  globalThis.DocSorterKeyboardShortcuts = DocSorterKeyboardShortcuts;
})();
