import { constants } from "node:fs";

import { describe, expect, it } from "vitest";

import { checkTargetDirectoryWritable } from "./targetDirectoryAccess";

describe("checkTargetDirectoryWritable", () => {
  it("returns TARGET_NOT_SELECTED without a selected target", async () => {
    const result = await checkTargetDirectoryWritable(null);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_SELECTED");
    }
  });

  it("returns TARGET_NOT_DIRECTORY when the target is not a directory", async () => {
    const result = await checkTargetDirectoryWritable("C:\\target.txt", {
      statPath: async () => ({
        isDirectory: () => false
      }),
      accessPath: async () => undefined
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_DIRECTORY");
    }
  });

  it("checks write access with W_OK", async () => {
    let receivedMode = 0;

    const result = await checkTargetDirectoryWritable("C:\\target", {
      statPath: async () => ({
        isDirectory: () => true
      }),
      accessPath: async (_targetPath, mode) => {
        receivedMode = mode;
      }
    });

    expect(result.ok).toBe(true);
    expect(receivedMode).toBe(constants.W_OK);
  });

  it("returns TARGET_NOT_WRITABLE when write access is refused", async () => {
    const result = await checkTargetDirectoryWritable("C:\\target", {
      statPath: async () => ({
        isDirectory: () => true
      }),
      accessPath: async () => {
        const error = new Error("denied") as NodeJS.ErrnoException;
        error.code = "EACCES";
        throw error;
      }
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("TARGET_NOT_WRITABLE");
      expect(result.error.message).toContain("écriture");
    }
  });
});
