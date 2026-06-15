import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { calculateSha256 } from "./fileHash";

describe("calculateSha256", () => {
  it("calculates the SHA-256 hash of a small file", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "docsorter-hash-"));
    const filePath = path.join(root, "hash.txt");
    await writeFile(filePath, "abc");

    const result = await calculateSha256(filePath);

    expect(result).toEqual({
      ok: true,
      value: "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    });
  });

  it("returns HASH_FAILED when the file cannot be read", async () => {
    const result = await calculateSha256(path.join(os.tmpdir(), "docsorter-missing-hash.txt"));

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe("HASH_FAILED");
    }
  });
});
