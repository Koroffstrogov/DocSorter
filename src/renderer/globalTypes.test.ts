import { readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

describe("renderer global types", () => {
  it("does not declare a generic catch-all Window API", async () => {
    const globalTypes = await readFile(path.join(process.cwd(), "src", "renderer", "global.d.ts"), "utf8");

    expect(globalTypes).not.toContain("[key: string]");
    expect(globalTypes).not.toContain("(...args: any[])");
  });
});
