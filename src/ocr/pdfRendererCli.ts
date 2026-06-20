import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import path from "node:path";

import {
  ocrFailure,
  type OcrResult
} from "./ocrTypes";
import {
  runTesseractCommand,
  type ExecFileRunner,
  type TesseractCommandOptions
} from "./tesseractCli";

export interface PdfRendererConfigurationOptions {
  resourcesPath?: string;
  envPath?: string;
  platform?: NodeJS.Platform;
}

export interface PdfRendererStatus {
  path: string;
  version: string | null;
}

export interface PdfRenderPageOptions extends TesseractCommandOptions {
  rendererPath: string;
  pdfPath: string;
  page: number;
  outputDirectory: string;
  dpi: number;
}

export interface PdfRenderedPage {
  page: number;
  imagePath: string;
}

export async function findPdfRenderer(
  options: PdfRendererConfigurationOptions & TesseractCommandOptions = {}
): Promise<OcrResult<PdfRendererStatus>> {
  const rendererPath = await findPdftoppmExecutable(options);
  if (!rendererPath) {
    return ocrFailure("OCR_PDF_RENDERER_NOT_FOUND", "Rendu PDF indisponible.");
  }

  const version = await getPdftoppmVersion(rendererPath, options);
  if (!version.ok) {
    return version;
  }

  return {
    ok: true,
    value: {
      path: rendererPath,
      version: version.value
    }
  };
}

export async function renderPdfPageToPng(
  options: PdfRenderPageOptions
): Promise<OcrResult<PdfRenderedPage>> {
  const prefix = path.join(options.outputDirectory, `page-${options.page}`);
  const result = await runTesseractCommand(
    options.rendererPath,
    [
      "-f",
      String(options.page),
      "-l",
      String(options.page),
      "-r",
      String(options.dpi),
      "-png",
      options.pdfPath,
      prefix
    ],
    {
      timeoutMs: options.timeoutMs,
      maxOutputBytes: options.maxOutputBytes,
      execFileRunner: options.execFileRunner
    }
  );

  if (result.timedOut) {
    return ocrFailure("OCR_TIMEOUT", "Timeout rendu PDF.");
  }

  if (result.exitCode !== 0) {
    return ocrFailure("OCR_PDF_RENDER_FAILED", "Rendu PDF impossible.");
  }

  const imagePath = await findRenderedImagePath(options.outputDirectory, `page-${options.page}`);
  if (!imagePath) {
    return ocrFailure("OCR_PDF_RENDER_FAILED", "Image de page PDF introuvable après rendu.");
  }

  return {
    ok: true,
    value: {
      page: options.page,
      imagePath
    }
  };
}

async function getPdftoppmVersion(
  rendererPath: string,
  options: TesseractCommandOptions = {}
): Promise<OcrResult<string | null>> {
  const result = await runTesseractCommand(rendererPath, ["-v"], {
    timeoutMs: options.timeoutMs ?? 4_000,
    maxOutputBytes: options.maxOutputBytes ?? 8_192,
    execFileRunner: options.execFileRunner
  });

  if (result.timedOut) {
    return ocrFailure("OCR_PROCESS_TIMEOUT", "Le test du rendu PDF a dépassé le délai autorisé.");
  }

  if (result.exitCode !== 0) {
    return ocrFailure("OCR_PDF_RENDER_FAILED", "Impossible de tester pdftoppm.");
  }

  return {
    ok: true,
    value: parsePdftoppmVersion(`${result.stdout}\n${result.stderr}`)
  };
}

function parsePdftoppmVersion(value: string): string | null {
  return value.match(/pdftoppm\s+version\s+([^\s]+)/i)?.[1] ?? null;
}

async function findPdftoppmExecutable(options: PdfRendererConfigurationOptions): Promise<string | null> {
  const embedded = await checkExecutable(
    path.join(getResourcesPath(options), "poppler", executableName("pdftoppm", options.platform))
  );
  if (embedded) {
    return embedded;
  }

  const envPath = options.envPath ?? process.env.PATH ?? "";
  const names = executableNames("pdftoppm", options.platform);
  for (const directory of envPath.split(path.delimiter).filter(Boolean)) {
    for (const name of names) {
      const candidatePath = path.join(directory, name);
      const executable = await checkExecutable(candidatePath);
      if (executable) {
        return executable;
      }
    }
  }

  return null;
}

async function checkExecutable(executablePath: string): Promise<string | null> {
  try {
    const stats = await stat(executablePath);
    if (!stats.isFile()) {
      return null;
    }
    await access(executablePath, constants.F_OK);
    return executablePath;
  } catch {
    return null;
  }
}

async function findRenderedImagePath(directoryPath: string, prefix: string): Promise<string | null> {
  const entries = await readdir(directoryPath);
  const match = entries
    .filter((entry) => entry.startsWith(prefix) && entry.toLowerCase().endsWith(".png"))
    .sort((left, right) => left.localeCompare(right))[0];
  return match ? path.join(directoryPath, match) : null;
}

function executableNames(baseName: string, platform = process.platform): string[] {
  return platform === "win32" ? [`${baseName}.exe`, baseName] : [baseName];
}

function executableName(baseName: string, platform = process.platform): string {
  return executableNames(baseName, platform)[0];
}

function getResourcesPath(options: PdfRendererConfigurationOptions): string {
  const processWithResources = process as NodeJS.Process & { resourcesPath?: string };
  return options.resourcesPath ?? processWithResources.resourcesPath ?? process.cwd();
}
