import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createCanvas } from "@napi-rs/canvas";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  prepareImageForOcr,
  preprocessImageStandard
} from "./imagePreprocess";

const temporaryRoots: string[] = [];

describe("image OCR preprocessing", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map(async (root) => {
        await rm(root, { recursive: true, force: true });
      })
    );
    temporaryRoots.length = 0;
  });

  it("keeps the original image path in none mode", async () => {
    const workspace = await createWorkspace();

    const prepared = await prepareImageForOcr(workspace.imagePath, {
      enabled: false,
      mode: "none",
      preprocessImage: vi.fn(async () => Buffer.from("unused"))
    });

    expect(prepared.inputForTesseract).toBe(workspace.imagePath);
    expect(prepared.preprocessingApplied).toBe(false);
    expect(prepared.preprocessingMode).toBe("none");
    await expect(prepared.cleanup()).resolves.toBeUndefined();
  });

  it("creates and cleans a temporary preprocessed image", async () => {
    const workspace = await createWorkspace();

    const prepared = await prepareImageForOcr(workspace.imagePath, {
      enabled: true,
      mode: "standard",
      preprocessImage: vi.fn(async () => Buffer.from("prepared-image"))
    });

    expect(prepared.inputForTesseract).not.toBe(workspace.imagePath);
    expect(prepared.preprocessingApplied).toBe(true);
    expect(prepared.preprocessingMode).toBe("standard");
    await expect(readFile(prepared.inputForTesseract, "utf8")).resolves.toBe("prepared-image");

    const temporaryDirectory = path.dirname(prepared.inputForTesseract);
    await prepared.cleanup();
    await expect(stat(temporaryDirectory)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("falls back to the original image when preprocessing fails", async () => {
    const workspace = await createWorkspace();

    const prepared = await prepareImageForOcr(workspace.imagePath, {
      enabled: true,
      mode: "standard",
      preprocessImage: vi.fn(async () => {
        throw new Error("invalid image");
      })
    });

    expect(prepared.inputForTesseract).toBe(workspace.imagePath);
    expect(prepared.preprocessingApplied).toBe(false);
    expect(prepared.preprocessingMode).toBe("standard");
    expect(prepared.warnings).toContain(
      "Prétraitement image indisponible, OCR lancé sur l'image originale."
    );
  });

  it("never modifies the original image", async () => {
    const workspace = await createWorkspace("original-bytes");

    const prepared = await prepareImageForOcr(workspace.imagePath, {
      enabled: true,
      mode: "standard",
      preprocessImage: vi.fn(async () => Buffer.from("prepared-image"))
    });

    expect(await readFile(workspace.imagePath, "utf8")).toBe("original-bytes");
    await prepared.cleanup();
    expect(await readFile(workspace.imagePath, "utf8")).toBe("original-bytes");
  });

  it("can preprocess a real PNG with standard mode", async () => {
    const workspace = await createWorkspace();
    await writeFile(workspace.imagePath, createSamplePng());

    const result = await preprocessImageStandard(workspace.imagePath);

    expect(result.byteLength).toBeGreaterThan(0);
  });
});

async function createWorkspace(content: string | Buffer = "image-bytes") {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-image-preprocess-"));
  temporaryRoots.push(root);

  const imagePath = path.join(root, "image.png");
  await writeFile(imagePath, content, "utf8");

  return {
    root,
    imagePath
  };
}

function createSamplePng(): Buffer {
  const canvas = createCanvas(320, 90);
  const context = canvas.getContext("2d");
  context.fillStyle = "white";
  context.fillRect(0, 0, 320, 90);
  context.fillStyle = "black";
  context.font = "32px Arial";
  context.fillText("ATTESTATION", 16, 55);
  return canvas.encodeSync("png");
}
