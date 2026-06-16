import "./keyboardShortcuts";

import { describe, expect, it } from "vitest";

const shortcuts = globalThis.DocSorterKeyboardShortcuts;

describe("keyboard shortcuts", () => {
  it("maps ArrowDown to next document outside text input", () => {
    expect(resolve({ key: "ArrowDown" })).toBe("navigate-next");
  });

  it("maps ArrowUp to previous document outside text input", () => {
    expect(resolve({ key: "ArrowUp" })).toBe("navigate-previous");
  });

  it("maps Ctrl+F to focus search", () => {
    expect(resolve({ key: "f", ctrlKey: true }, { focusKind: "text-input" })).toBe(
      "focus-search"
    );
  });

  it("maps R to refresh only when a source is available", () => {
    expect(resolve({ key: "r" }, { sourceAvailable: true })).toBe("refresh-source");
    expect(resolve({ key: "r" }, { sourceAvailable: false })).toBeNull();
  });

  it("maps V to prepare classification only when available", () => {
    expect(resolve({ key: "v" }, { prepareClassificationAvailable: true })).toBe(
      "prepare-classification"
    );
    expect(resolve({ key: "v" }, { prepareClassificationAvailable: false })).toBeNull();
  });

  it("maps Ctrl+Enter to execute classification only when a valid plan is available", () => {
    expect(resolve({ key: "Enter", ctrlKey: true }, { executeClassificationAvailable: true })).toBe(
      "execute-classification"
    );
    expect(resolve({ key: "Enter", ctrlKey: true }, { executeClassificationAvailable: false })).toBeNull();
  });

  it("does not execute classification with plain Enter", () => {
    expect(resolve({ key: "Enter" }, { executeClassificationAvailable: true })).toBeNull();
  });

  it("does not map Ctrl+Z inside text input", () => {
    expect(
      resolve({ key: "z", ctrlKey: true }, { focusKind: "text-input", undoAvailable: true })
    ).toBeNull();
  });

  it("maps Ctrl+Z outside text input when undo is available", () => {
    expect(resolve({ key: "z", ctrlKey: true }, { undoAvailable: true })).toBe(
      "undo-last-action"
    );
  });

  it("maps D to duplicate filter outside text input", () => {
    expect(resolve({ key: "d" })).toBe("toggle-duplicates-filter");
  });

  it("maps T to all filter outside text input", () => {
    expect(resolve({ key: "t" })).toBe("show-all-filter");
  });

  it("ignores letter shortcuts while typing naming fields", () => {
    expect(resolve({ key: "d" }, { focusKind: "text-input" })).toBeNull();
    expect(resolve({ key: "v" }, { focusKind: "text-input", prepareClassificationAvailable: true })).toBeNull();
  });

  it("ignores repeated sensitive shortcut actions", () => {
    expect(resolve({ key: "r", repeat: true }, { sourceAvailable: true })).toBeNull();
    expect(
      resolve({ key: "Enter", ctrlKey: true, repeat: true }, { executeClassificationAvailable: true })
    ).toBeNull();
  });

  it("allows repeated navigation", () => {
    expect(resolve({ key: "ArrowDown", repeat: true })).toBe("navigate-next");
  });

  it("maps Escape in search to clear or blur", () => {
    expect(resolve({ key: "Escape" }, { focusKind: "search-input", searchHasText: true })).toBe(
      "clear-search"
    );
    expect(resolve({ key: "Escape" }, { focusKind: "search-input", searchHasText: false })).toBe(
      "blur-search"
    );
  });

  it("maps ? to shortcuts help outside text input", () => {
    expect(resolve({ key: "?" })).toBe("toggle-shortcuts-help");
  });
});

function resolve(
  event: KeyboardShortcutEventLike,
  context: Partial<KeyboardShortcutContext> = {}
): KeyboardShortcutAction | null {
  return shortcuts.resolveKeyboardShortcut(event, {
    focusKind: "none",
    searchHasText: false,
    sourceAvailable: false,
    prepareClassificationAvailable: false,
    executeClassificationAvailable: false,
    undoAvailable: false,
    ...context
  });
}
