import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  clampPdfPage,
  clampPreviewZoom,
  getNextPage,
  getPreviewKind,
  getPreviousPage,
  isPathInsideDirectory
} from "./previewGuards";

describe("preview guards", () => {
  it("detects preview type from supported extensions", () => {
    expect(getPreviewKind(".pdf")).toBe("pdf");
    expect(getPreviewKind(".jpg")).toBe("image");
    expect(getPreviewKind(".jpeg")).toBe("image");
    expect(getPreviewKind(".png")).toBe("image");
    expect(getPreviewKind(".txt")).toBeNull();
  });

  it("bounds zoom between 50% and 300%", () => {
    expect(clampPreviewZoom(0.1)).toBe(0.5);
    expect(clampPreviewZoom(1.25)).toBe(1.25);
    expect(clampPreviewZoom(8)).toBe(3);
    expect(clampPreviewZoom(Number.NaN)).toBe(1);
  });

  it("bounds PDF page navigation", () => {
    expect(getPreviousPage(1)).toBe(1);
    expect(getPreviousPage(3)).toBe(2);
    expect(getNextPage(1, 3)).toBe(2);
    expect(getNextPage(3, 3)).toBe(3);
    expect(clampPdfPage(0, 5)).toBe(1);
    expect(clampPdfPage(6, 5)).toBe(5);
  });

  it("validates that a file path belongs to a source directory", () => {
    const source = path.join("C:", "Users", "Seb", "Documents");
    const inside = path.join(source, "scan.pdf");
    const outside = path.join("C:", "Users", "Seb", "Other", "scan.pdf");

    expect(isPathInsideDirectory(inside, source)).toBe(true);
    expect(isPathInsideDirectory(outside, source)).toBe(false);
    expect(isPathInsideDirectory(source, source)).toBe(false);
  });
});
