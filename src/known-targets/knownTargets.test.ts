import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  createKnownTarget,
  deactivateKnownTarget,
  getKnownTargetsPath,
  listKnownTargets,
  updateKnownTarget
} from "./knownTargets";

const temporaryRoots: string[] = [];

describe("known targets", () => {
  afterEach(async () => {
    await Promise.all(temporaryRoots.map((root) => rm(root, { recursive: true, force: true })));
    temporaryRoots.length = 0;
  });

  it("returns an empty list when known-targets.json is absent", async () => {
    const userDataPath = await createUserDataPath();

    const result = await listKnownTargets(userDataPath);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.targets).toEqual([]);
    expect(result.ok && result.value.warnings).toEqual([]);
  });

  it("creates and lists a valid target", async () => {
    const userDataPath = await createUserDataPath();

    const result = await createKnownTarget(userDataPath, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "Paul Martin",
      aliases: ["Paul", "P. Martin"]
    }, fixedNow);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.targets).toMatchObject([
      {
        id: "paul-martin",
        kind: "person",
        displayName: "Paul Martin",
        fileAlias: "paul-martin",
        aliases: ["Paul Martin", "paul-martin", "Paul", "P. Martin"],
        isActive: true,
        createdAt: "2026-06-21T08:00:00.000Z",
        updatedAt: "2026-06-21T08:00:00.000Z"
      }
    ]);

    const raw = JSON.parse(await readFile(getKnownTargetsPath(userDataPath), "utf8")) as {
      targets: Array<{ fileAlias: string }>;
    };
    expect(raw.targets[0]?.fileAlias).toBe("paul-martin");
  });

  it("keeps multiple aliases from comma separated text", async () => {
    const userDataPath = await createUserDataPath();

    const result = await createKnownTarget(userDataPath, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul",
      aliases: "Paul, Paulo; P. Martin\nPM"
    } as unknown as Parameters<typeof createKnownTarget>[1], fixedNow);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.targets[0]?.aliases).toEqual([
      "Paul Martin",
      "paul",
      "Paulo",
      "P. Martin",
      "PM"
    ]);
  });

  it("rejects duplicate file aliases", async () => {
    const userDataPath = await createUserDataPath();
    await createKnownTarget(userDataPath, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul"
    }, fixedNow);

    const result = await createKnownTarget(userDataPath, {
      kind: "vehicle",
      displayName: "Paul Vehicule",
      fileAlias: "Paul"
    }, fixedNow);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.code).toBe("KNOWN_TARGET_DUPLICATE");
  });

  it("rejects dangerous aliases", async () => {
    const userDataPath = await createUserDataPath();

    const result = await createKnownTarget(userDataPath, {
      kind: "person",
      displayName: "Chemin",
      fileAlias: ".."
    }, fixedNow);

    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.field).toBe("fileAlias");
  });

  it("tolerates corrupted JSON with a sober warning", async () => {
    const userDataPath = await createUserDataPath();
    await mkdir(path.dirname(getKnownTargetsPath(userDataPath)), { recursive: true });
    await writeFile(getKnownTargetsPath(userDataPath), "{invalid-json", "utf8");

    const result = await listKnownTargets(userDataPath);

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.targets).toEqual([]);
    expect(result.ok && result.value.warnings).toEqual([
      "Liste locale des cibles invalide : liste vide utilisée."
    ]);
  });

  it("keeps deactivated targets stored but marked inactive", async () => {
    const userDataPath = await createUserDataPath();
    const created = await createKnownTarget(userDataPath, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul"
    }, fixedNow);
    expect(created.ok).toBe(true);

    const result = await deactivateKnownTarget(userDataPath, "paul", () => new Date("2026-06-21T09:00:00.000Z"));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.targets[0]).toMatchObject({
      id: "paul",
      isActive: false,
      updatedAt: "2026-06-21T09:00:00.000Z"
    });
  });

  it("updates a target without changing its id", async () => {
    const userDataPath = await createUserDataPath();
    await createKnownTarget(userDataPath, {
      kind: "person",
      displayName: "Paul Martin",
      fileAlias: "paul"
    }, fixedNow);

    const result = await updateKnownTarget(userDataPath, "paul", {
      kind: "vehicle",
      displayName: "Renault Captur",
      fileAlias: "captur",
      aliases: ["Renault Captur"]
    }, () => new Date("2026-06-21T09:00:00.000Z"));

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.targets[0]).toMatchObject({
      id: "paul",
      kind: "vehicle",
      displayName: "Renault Captur",
      fileAlias: "captur",
      aliases: ["Renault Captur", "captur"]
    });

    const reloaded = await listKnownTargets(userDataPath);
    expect(reloaded.ok && reloaded.value.targets[0]).toMatchObject({
      id: "paul",
      kind: "vehicle",
      displayName: "Renault Captur",
      fileAlias: "captur",
      aliases: ["Renault Captur", "captur"]
    });

    const raw = JSON.parse(await readFile(getKnownTargetsPath(userDataPath), "utf8")) as {
      targets: Array<{
        id: string;
        displayName: string;
        fileAlias: string;
        aliases: string[];
      }>;
    };
    expect(raw.targets).toHaveLength(1);
    expect(raw.targets[0]).toMatchObject({
      id: "paul",
      displayName: "Renault Captur",
      fileAlias: "captur",
      aliases: ["Renault Captur", "captur"]
    });
  });
});

async function createUserDataPath(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-known-targets-"));
  temporaryRoots.push(root);
  return root;
}

function fixedNow(): Date {
  return new Date("2026-06-21T08:00:00.000Z");
}
