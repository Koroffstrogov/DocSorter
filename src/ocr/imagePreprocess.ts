import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createCanvas, loadImage } from "@napi-rs/canvas";

import type { ImageOcrPreprocessingMode } from "./ocrTypes";

export interface PreparedImageForOcr {
  inputForTesseract: string;
  cleanup: () => Promise<void>;
  preprocessingApplied: boolean;
  preprocessingMode: ImageOcrPreprocessingMode;
  warnings: string[];
}

export interface PrepareImageForOcrOptions {
  enabled: boolean;
  mode: ImageOcrPreprocessingMode;
  makeTemporaryDirectory?: (prefix: string) => Promise<string>;
  writeTemporaryFile?: (filePath: string, content: Buffer) => Promise<void>;
  removeTemporaryDirectory?: (directoryPath: string) => Promise<void>;
  preprocessImage?: (inputPath: string) => Promise<Buffer>;
}

const MIN_LONG_EDGE_FOR_OCR = 1_600;
const MAX_UPSCALE_FACTOR = 2;
const CONTRAST_FACTOR = 1.18;
const BRIGHTNESS_OFFSET = 4;

export async function prepareImageForOcr(
  inputPath: string,
  options: PrepareImageForOcrOptions
): Promise<PreparedImageForOcr> {
  if (!options.enabled || options.mode === "none") {
    return createOriginalImagePreparation(inputPath, "none");
  }

  let temporaryDirectory = "";
  try {
    const preprocessImage = options.preprocessImage ?? preprocessImageStandard;
    const imageBuffer = await preprocessImage(inputPath);
    temporaryDirectory = await (options.makeTemporaryDirectory ?? mkdtemp)(
      path.join(tmpdir(), "docsorter-image-ocr-")
    );
    const outputPath = path.join(temporaryDirectory, "prepared.png");
    await (options.writeTemporaryFile ?? writeFile)(outputPath, imageBuffer);

    return {
      inputForTesseract: outputPath,
      cleanup: () => cleanupTemporaryDirectory(temporaryDirectory, options),
      preprocessingApplied: true,
      preprocessingMode: "standard",
      warnings: []
    };
  } catch {
    if (temporaryDirectory) {
      await cleanupTemporaryDirectory(temporaryDirectory, options);
    }

    return {
      ...createOriginalImagePreparation(inputPath, options.mode),
      warnings: ["Prétraitement image indisponible, OCR lancé sur l'image originale."]
    };
  }
}

export async function preprocessImageStandard(inputPath: string): Promise<Buffer> {
  const image = await loadImage(inputPath);
  const width = Math.max(1, image.width || image.naturalWidth);
  const height = Math.max(1, image.height || image.naturalHeight);
  const scale = resolveUpscaleFactor(width, height);
  const outputWidth = Math.max(1, Math.round(width * scale));
  const outputHeight = Math.max(1, Math.round(height * scale));
  const canvas = createCanvas(outputWidth, outputHeight);
  const context = canvas.getContext("2d");

  context.fillStyle = "white";
  context.fillRect(0, 0, outputWidth, outputHeight);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(image, 0, 0, outputWidth, outputHeight);

  const pixels = context.getImageData(0, 0, outputWidth, outputHeight);
  for (let index = 0; index < pixels.data.length; index += 4) {
    const alpha = pixels.data[index + 3] / 255;
    const red = blendWithWhite(pixels.data[index], alpha);
    const green = blendWithWhite(pixels.data[index + 1], alpha);
    const blue = blendWithWhite(pixels.data[index + 2], alpha);
    const gray = 0.299 * red + 0.587 * green + 0.114 * blue;
    const adjusted = clampByte((gray - 128) * CONTRAST_FACTOR + 128 + BRIGHTNESS_OFFSET);

    pixels.data[index] = adjusted;
    pixels.data[index + 1] = adjusted;
    pixels.data[index + 2] = adjusted;
    pixels.data[index + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);

  return canvas.encodeSync("png");
}

function createOriginalImagePreparation(
  inputPath: string,
  mode: ImageOcrPreprocessingMode
): PreparedImageForOcr {
  return {
    inputForTesseract: inputPath,
    cleanup: async () => undefined,
    preprocessingApplied: false,
    preprocessingMode: mode,
    warnings: []
  };
}

function resolveUpscaleFactor(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  if (longEdge >= MIN_LONG_EDGE_FOR_OCR) {
    return 1;
  }

  return Math.min(MAX_UPSCALE_FACTOR, MIN_LONG_EDGE_FOR_OCR / longEdge);
}

function blendWithWhite(value: number, alpha: number): number {
  return value * alpha + 255 * (1 - alpha);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

async function cleanupTemporaryDirectory(
  directoryPath: string,
  options: PrepareImageForOcrOptions
): Promise<void> {
  try {
    await (options.removeTemporaryDirectory ?? ((value: string) => rm(value, {
      recursive: true,
      force: true
    })))(directoryPath);
  } catch {
    // Cleanup is best-effort; OCR results must not be hidden by a temp-file removal failure.
  }
}
