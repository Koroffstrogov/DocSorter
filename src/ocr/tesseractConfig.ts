import { constants } from "node:fs";
import { access, mkdir, readFile, rename, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_OCR_LANGUAGE,
  DEFAULT_OCR_PSM,
  createOcrError,
  ocrFailure,
  type OcrError,
  type OcrResult,
  type OcrSettings,
  type OcrSettingsInput,
  type OcrStatus
} from "./ocrTypes";

export interface OcrConfigurationOptions {
  resourcesPath?: string;
  envPath?: string;
  platform?: NodeJS.Platform;
}

export function getOcrSettingsPath(userDataPath: string): string {
  return path.join(userDataPath, "config", "ocr-settings.json");
}

export function createDefaultOcrSettings(): OcrSettings {
  return {
    tesseractPath: "",
    tessdataPath: "",
    language: DEFAULT_OCR_LANGUAGE,
    psm: DEFAULT_OCR_PSM,
    lastTestedAt: null,
    detectedVersion: null
  };
}

export async function loadOcrSettings(userDataPath: string): Promise<OcrResult<OcrSettings>> {
  const settingsPath = getOcrSettingsPath(userDataPath);

  let rawSettings = "";
  try {
    rawSettings = await readFile(settingsPath, "utf8");
  } catch (error) {
    if (isNotFoundError(error)) {
      return {
        ok: true,
        value: createDefaultOcrSettings()
      };
    }

    return ocrFailure("OCR_CONFIG_READ_FAILED", "Impossible de lire la configuration OCR.");
  }

  try {
    return normalizeOcrSettings(JSON.parse(rawSettings));
  } catch {
    return ocrFailure("OCR_CONFIG_READ_FAILED", "La configuration OCR n'est pas un JSON valide.");
  }
}

export async function saveOcrSettings(
  userDataPath: string,
  input: OcrSettingsInput
): Promise<OcrResult<OcrStatus>> {
  const normalizedSettings = normalizeOcrSettings(input);
  if (!normalizedSettings.ok) {
    return normalizedSettings;
  }

  const settings = normalizedSettings.value;
  const executable = await checkTesseractExecutable(settings.tesseractPath);
  if (!executable.ok) {
    return executable;
  }

  const tessdata = await checkTessdataDirectory(settings.tessdataPath);
  if (!tessdata.ok) {
    return tessdata;
  }

  const languageCheck = await checkLanguageData(settings.tessdataPath, settings.language);
  if (!languageCheck.ok) {
    return languageCheck;
  }

  const writeResult = await writeOcrSettings(userDataPath, settings);
  if (!writeResult.ok) {
    return writeResult;
  }

  return getOcrStatus(userDataPath);
}

export async function writeOcrSettings(
  userDataPath: string,
  settings: OcrSettings
): Promise<OcrResult<void>> {
  const settingsPath = getOcrSettingsPath(userDataPath);
  const temporaryPath = `${settingsPath}.tmp`;

  try {
    await mkdir(path.dirname(settingsPath), { recursive: true });
    await writeFile(temporaryPath, `${JSON.stringify(settings, null, 2)}\n`, "utf8");
    await rename(temporaryPath, settingsPath);
    return { ok: true, value: undefined };
  } catch {
    return ocrFailure("OCR_CONFIG_WRITE_FAILED", "Impossible de sauvegarder la configuration OCR.");
  }
}

export async function getOcrStatus(
  userDataPath: string,
  options: OcrConfigurationOptions = {}
): Promise<OcrResult<OcrStatus>> {
  const settingsPath = getOcrSettingsPath(userDataPath);
  const settingsResult = await loadOcrSettings(userDataPath);
  if (!settingsResult.ok) {
    return settingsResult;
  }

  const settings = settingsResult.value;
  const resolvedTesseract = await resolveTesseractExecutable(settings, options);
  if (!resolvedTesseract.ok) {
    return {
      ok: true,
      value: createStatus({
        status: "not-configured",
        settingsPath,
        settings,
        tesseractPath: "",
        error: resolvedTesseract.error,
        message: resolvedTesseract.error.message
      })
    };
  }

  const effectiveSettings = {
    ...settings,
    tesseractPath: resolvedTesseract.value
  };

  if (!effectiveSettings.tessdataPath) {
    const error = createOcrError("OCR_TESSDATA_NOT_FOUND", "Le dossier tessdata n'est pas configuré.");
    return {
      ok: true,
      value: createStatus({
        status: "not-configured",
        settingsPath,
        settings: effectiveSettings,
        tesseractPath: resolvedTesseract.value,
        error,
        message: error.message
      })
    };
  }

  const tessdata = await checkTessdataDirectory(effectiveSettings.tessdataPath);
  if (!tessdata.ok) {
    return {
      ok: true,
      value: createStatus({
        status: "error",
        settingsPath,
        settings: effectiveSettings,
        tesseractPath: resolvedTesseract.value,
        error: tessdata.error,
        message: tessdata.error.message
      })
    };
  }

  const languageCheck = await checkLanguageData(
    effectiveSettings.tessdataPath,
    effectiveSettings.language
  );
  if (!languageCheck.ok) {
    return {
      ok: true,
      value: createStatus({
        status: "error",
        settingsPath,
        settings: effectiveSettings,
        tesseractPath: resolvedTesseract.value,
        error: languageCheck.error,
        message: languageCheck.error.message,
        missingLanguages: getRequiredLanguages(effectiveSettings.language)
      })
    };
  }

  return {
    ok: true,
    value: createStatus({
      status: "configured",
      settingsPath,
      settings: effectiveSettings,
      tesseractPath: resolvedTesseract.value,
      message: "OCR local configuré. Test Tesseract disponible."
    })
  };
}

export async function resolveTesseractExecutable(
  settings: OcrSettings,
  options: OcrConfigurationOptions = {}
): Promise<OcrResult<string>> {
  const configuredPath = settings.tesseractPath.trim();
  if (configuredPath) {
    const executable = await checkTesseractExecutable(configuredPath);
    if (!executable.ok) {
      return executable;
    }

    return {
      ok: true,
      value: configuredPath
    };
  }

  const embeddedPath = path.join(getResourcesPath(options), "tesseract", "tesseract.exe");
  const embedded = await checkTesseractExecutable(embeddedPath);
  if (embedded.ok) {
    return {
      ok: true,
      value: embeddedPath
    };
  }

  const pathCandidate = await findTesseractOnPath(options);
  if (pathCandidate) {
    return {
      ok: true,
      value: pathCandidate
    };
  }

  return ocrFailure("OCR_ENGINE_NOT_CONFIGURED", "Aucun moteur Tesseract local n'est configuré.");
}

export async function checkTesseractExecutable(
  tesseractPath: string
): Promise<OcrResult<string>> {
  const normalizedPath = tesseractPath.trim();
  if (!normalizedPath) {
    return ocrFailure("OCR_ENGINE_NOT_CONFIGURED", "Aucun chemin tesseract.exe n'est configuré.");
  }

  try {
    const executableStats = await stat(normalizedPath);
    if (!executableStats.isFile()) {
      return ocrFailure("OCR_ENGINE_NOT_FOUND", "Le chemin Tesseract n'est pas un fichier.");
    }

    await access(normalizedPath, constants.F_OK);
    return {
      ok: true,
      value: normalizedPath
    };
  } catch (error) {
    return isNotFoundError(error)
      ? ocrFailure("OCR_ENGINE_NOT_FOUND", "Tesseract est introuvable.")
      : ocrFailure("OCR_ENGINE_NOT_FOUND", "Tesseract n'est pas accessible.");
  }
}

export async function checkTessdataDirectory(tessdataPath: string): Promise<OcrResult<string>> {
  const normalizedPath = tessdataPath.trim();
  if (!normalizedPath) {
    return ocrFailure("OCR_TESSDATA_NOT_FOUND", "Aucun dossier tessdata n'est configuré.");
  }

  try {
    const tessdataStats = await stat(normalizedPath);
    if (!tessdataStats.isDirectory()) {
      return ocrFailure("OCR_TESSDATA_NOT_FOUND", "Le chemin tessdata n'est pas un dossier.");
    }

    await access(normalizedPath, constants.R_OK);
    return {
      ok: true,
      value: normalizedPath
    };
  } catch {
    return ocrFailure("OCR_TESSDATA_NOT_FOUND", "Le dossier tessdata est introuvable.");
  }
}

export async function checkLanguageData(
  tessdataPath: string,
  language: string
): Promise<OcrResult<void>> {
  const missingLanguages: string[] = [];
  for (const requiredLanguage of getRequiredLanguages(language)) {
    try {
      await access(path.join(tessdataPath, `${requiredLanguage}.traineddata`), constants.R_OK);
    } catch {
      missingLanguages.push(requiredLanguage);
    }
  }

  if (missingLanguages.length > 0) {
    return ocrFailure(
      "OCR_LANGUAGE_DATA_MISSING",
      `Données de langue OCR manquantes : ${missingLanguages
        .map((languageName) => `${languageName}.traineddata`)
        .join(", ")}.`
    );
  }

  return { ok: true, value: undefined };
}

export function getRequiredLanguages(language: string): string[] {
  return language
    .split("+")
    .map((value) => value.trim())
    .filter(Boolean);
}

export function normalizeOcrSettings(value: unknown): OcrResult<OcrSettings> {
  if (!value || typeof value !== "object") {
    return ocrFailure("OCR_CONFIG_READ_FAILED", "La configuration OCR ne respecte pas le format attendu.");
  }

  const input = value as Record<string, unknown>;
  const language = typeof input.language === "string" && input.language.trim()
    ? input.language.trim()
    : DEFAULT_OCR_LANGUAGE;
  const psm = typeof input.psm === "number" && Number.isInteger(input.psm)
    ? input.psm
    : DEFAULT_OCR_PSM;

  if (!/^[A-Za-z0-9_+\-/]+$/.test(language)) {
    return ocrFailure("OCR_CONFIG_WRITE_FAILED", "La langue OCR configurée est invalide.");
  }

  if (psm < 0 || psm > 13) {
    return ocrFailure("OCR_CONFIG_WRITE_FAILED", "Le mode PSM OCR doit être compris entre 0 et 13.");
  }

  return {
    ok: true,
    value: {
      tesseractPath: readOptionalString(input.tesseractPath),
      tessdataPath: readOptionalString(input.tessdataPath),
      language,
      psm,
      lastTestedAt: readOptionalNullableString(input.lastTestedAt),
      detectedVersion: readOptionalNullableString(input.detectedVersion)
    }
  };
}

function createStatus(options: {
  status: OcrStatus["status"];
  settingsPath: string;
  settings: OcrSettings;
  tesseractPath: string;
  message: string;
  error?: OcrError | null;
  missingLanguages?: string[];
  availableLanguages?: string[];
}): OcrStatus {
  return {
    status: options.status,
    settingsPath: options.settingsPath,
    settings: options.settings,
    tesseractPath: options.tesseractPath,
    tessdataPath: options.settings.tessdataPath,
    language: options.settings.language,
    psm: options.settings.psm,
    detectedVersion: options.settings.detectedVersion,
    lastTestedAt: options.settings.lastTestedAt,
    availableLanguages: options.availableLanguages ?? [],
    missingLanguages: options.missingLanguages ?? [],
    message: options.message,
    error: options.error ?? null
  };
}

async function findTesseractOnPath(options: OcrConfigurationOptions): Promise<string | null> {
  const envPath = options.envPath ?? process.env.PATH ?? "";
  const platform = options.platform ?? process.platform;
  const executableNames = platform === "win32" ? ["tesseract.exe", "tesseract"] : ["tesseract"];

  for (const directory of envPath.split(path.delimiter).filter(Boolean)) {
    for (const executableName of executableNames) {
      const candidatePath = path.join(directory, executableName);
      const check = await checkTesseractExecutable(candidatePath);
      if (check.ok) {
        return candidatePath;
      }
    }
  }

  return null;
}

function getResourcesPath(options: OcrConfigurationOptions): string {
  const processWithResources = process as NodeJS.Process & { resourcesPath?: string };
  return options.resourcesPath ?? processWithResources.resourcesPath ?? process.cwd();
}

function readOptionalString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readOptionalNullableString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmedValue = value.trim();
  return trimmedValue ? trimmedValue : null;
}

function isNotFoundError(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      ((error as NodeJS.ErrnoException).code === "ENOENT" ||
        (error as NodeJS.ErrnoException).code === "ENOTDIR")
  );
}
