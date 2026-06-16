import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

const AI_RUNTIME_FILES = [
  "aiClassificationTypes.ts",
  "aiClassificationValidator.ts",
  "simulatedAiClassificationProvider.ts",
  "aiClassificationOrchestrator.ts"
];

describe("AI classification module surface", () => {
  it("does not import filesystem, process, Electron, IPC or network helpers", async () => {
    const sources = await Promise.all(
      AI_RUNTIME_FILES.map((fileName) =>
        readFile(path.join(process.cwd(), "src", "ai", fileName), "utf8")
      )
    );
    const source = sources.join("\n");

    expect(source).not.toMatch(/from\s+["'](?:node:)?fs/);
    expect(source).not.toMatch(/from\s+["'](?:node:)?child_process/);
    expect(source).not.toMatch(/from\s+["']electron["']/);
    expect(source).not.toMatch(/IPC_CHANNELS|ipcRenderer|ipcMain/);
    expect(source).not.toMatch(/\bfetch\s*\(|from\s+["'](?:node:)?(?:http|https|net|dns)/);
  });
});
