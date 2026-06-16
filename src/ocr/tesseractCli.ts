import { execFile } from "node:child_process";

import {
  checkLanguageData,
  getOcrStatus,
  getRequiredLanguages,
  writeOcrSettings
} from "./tesseractConfig";
import {
  createOcrError,
  ocrFailure,
  type OcrResult,
  type OcrSettings,
  type OcrStatus
} from "./ocrTypes";

export interface TesseractCommandResult {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
  errorMessage: string | null;
}

export interface TesseractCommandOptions {
  timeoutMs?: number;
  maxOutputBytes?: number;
  execFileRunner?: ExecFileRunner;
}

export interface TesseractEngineTestOptions extends TesseractCommandOptions {
  now?: () => Date;
}

type ExecFileCallback = (
  error: NodeJS.ErrnoException | null,
  stdout: string | Buffer,
  stderr: string | Buffer
) => void;

export type ExecFileRunner = (
  file: string,
  args: string[],
  options: {
    encoding: "utf8";
    timeout: number;
    maxBuffer: number;
    windowsHide: boolean;
    shell: false;
  },
  callback: ExecFileCallback
) => unknown;

const DEFAULT_TIMEOUT_MS = 4_000;
const DEFAULT_MAX_OUTPUT_BYTES = 8_192;

export async function runTesseractCommand(
  file: string,
  args: string[],
  options: TesseractCommandOptions = {}
): Promise<TesseractCommandResult> {
  const timeout = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const execFileRunner = options.execFileRunner ?? execFile;

  return new Promise((resolve) => {
    execFileRunner(
      file,
      args,
      {
        encoding: "utf8",
        timeout,
        maxBuffer: maxOutputBytes,
        windowsHide: true,
        shell: false
      },
      (error, stdout, stderr) => {
        const boundedStdout = boundOutput(stdout, maxOutputBytes);
        const boundedStderr = boundOutput(stderr, maxOutputBytes);
        if (!error) {
          resolve({
            exitCode: 0,
            stdout: boundedStdout,
            stderr: boundedStderr,
            timedOut: false,
            errorMessage: null
          });
          return;
        }

        resolve({
          exitCode: typeof error.code === "number" ? error.code : null,
          stdout: boundedStdout,
          stderr: boundedStderr,
          timedOut: isTimeoutError(error),
          errorMessage: error.message
        });
      }
    );
  });
}

export async function getTesseractVersion(
  tesseractPath: string,
  options: TesseractCommandOptions = {}
): Promise<OcrResult<string>> {
  const result = await runTesseractCommand(tesseractPath, ["--version"], options);
  if (result.timedOut) {
    return ocrFailure("OCR_PROCESS_TIMEOUT");
  }

  if (result.exitCode !== 0) {
    return ocrFailure("OCR_VERSION_FAILED", "Impossible de lire la version de Tesseract.");
  }

  const version = parseTesseractVersion(result.stdout);
  if (!version) {
    return ocrFailure("OCR_VERSION_FAILED", "Version Tesseract non reconnue.");
  }

  return {
    ok: true,
    value: version
  };
}

export async function listTesseractLanguages(
  tesseractPath: string,
  tessdataPath: string,
  options: TesseractCommandOptions = {}
): Promise<OcrResult<string[]>> {
  const result = await runTesseractCommand(
    tesseractPath,
    ["--list-langs", "--tessdata-dir", tessdataPath],
    options
  );
  if (result.timedOut) {
    return ocrFailure("OCR_PROCESS_TIMEOUT");
  }

  if (result.exitCode !== 0) {
    return ocrFailure("OCR_LIST_LANGS_FAILED", "Impossible de lister les langues Tesseract.");
  }

  return {
    ok: true,
    value: parseTesseractLanguages(result.stdout)
  };
}

export async function testTesseractEngineForSettings(
  settings: OcrSettings,
  options: TesseractEngineTestOptions = {}
): Promise<OcrResult<OcrStatus>> {
  const languageData = await checkLanguageData(settings.tessdataPath, settings.language);
  if (!languageData.ok) {
    return languageData;
  }

  const version = await getTesseractVersion(settings.tesseractPath, options);
  if (!version.ok) {
    return version;
  }

  const languages = await listTesseractLanguages(
    settings.tesseractPath,
    settings.tessdataPath,
    options
  );
  if (!languages.ok) {
    return languages;
  }

  const missingLanguages = getMissingLanguages(settings.language, languages.value);
  if (missingLanguages.length > 0) {
    return ocrFailure(
      "OCR_LANGUAGE_DATA_MISSING",
      `Données de langue OCR manquantes : ${missingLanguages.join(", ")}.`
    );
  }

  const testedAt = (options.now ?? (() => new Date()))().toISOString();
  const updatedSettings = {
    ...settings,
    detectedVersion: version.value,
    lastTestedAt: testedAt
  };

  return {
    ok: true,
    value: {
      status: "configured",
      settingsPath: "",
      settings: updatedSettings,
      tesseractPath: updatedSettings.tesseractPath,
      tessdataPath: updatedSettings.tessdataPath,
      language: updatedSettings.language,
      psm: updatedSettings.psm,
      detectedVersion: updatedSettings.detectedVersion,
      lastTestedAt: updatedSettings.lastTestedAt,
      availableLanguages: languages.value,
      missingLanguages: [],
      message: "Test OCR local réussi. Aucun document n'a été analysé.",
      error: null
    }
  };
}

export async function testOcrEngine(
  userDataPath: string,
  options: TesseractEngineTestOptions = {}
): Promise<OcrResult<OcrStatus>> {
  const status = await getOcrStatus(userDataPath);
  if (!status.ok) {
    return status;
  }

  if (status.value.status !== "configured") {
    return {
      ok: false,
      error: status.value.error ?? createOcrError("OCR_ENGINE_NOT_CONFIGURED")
    };
  }

  const testResult = await testTesseractEngineForSettings(status.value.settings, options);
  if (!testResult.ok) {
    return testResult;
  }

  const updatedStatus = {
    ...testResult.value,
    settingsPath: status.value.settingsPath
  };
  const writeResult = await writeOcrSettings(userDataPath, updatedStatus.settings);
  if (!writeResult.ok) {
    return writeResult;
  }

  return {
    ok: true,
    value: updatedStatus
  };
}

export function parseTesseractVersion(stdout: string): string | null {
  const firstLine = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) {
    return null;
  }

  const match = firstLine.match(/^tesseract\s+(.+)$/i);
  return match ? match[1].trim() : firstLine;
}

export function parseTesseractLanguages(stdout: string): string[] {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.toLowerCase().startsWith("list of available languages"))
    .sort((left, right) => left.localeCompare(right, "fr", { sensitivity: "base" }));
}

function getMissingLanguages(configuredLanguage: string, availableLanguages: string[]): string[] {
  const available = new Set(availableLanguages);
  return getRequiredLanguages(configuredLanguage).filter((language) => !available.has(language));
}

function boundOutput(value: string | Buffer, maxOutputBytes: number): string {
  const text = Buffer.isBuffer(value) ? value.toString("utf8") : value;
  if (Buffer.byteLength(text, "utf8") <= maxOutputBytes) {
    return text;
  }

  return `${text.slice(0, maxOutputBytes)}\n[sortie tronquee]`;
}

function isTimeoutError(error: Error & { code?: string | number | null; killed?: boolean }): boolean {
  return (
    error.killed === true ||
    error.code === "ETIMEDOUT" ||
    /timed out|timeout/i.test(error.message)
  );
}
