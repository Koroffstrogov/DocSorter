import { stat } from "node:fs/promises";
import path from "node:path";

import {
  checkTargetDirectoryWritable as defaultCheckTargetDirectoryWritable,
  type TargetDirectoryAccessErrorCode,
  type TargetDirectoryWritableChecker
} from "../filesystem/targetDirectoryAccess";
import {
  checkDestinationNameAvailability,
  validateDestinationFilename
} from "../naming/destinationNameAvailability";
import { resolveTargetFolder } from "../naming/targetFolder";

export type ClassificationPlanStatus = "ready" | "blocked";
export type ClassificationPlanCheckStatus = "ok" | "blocking" | "not-run";

export type ClassificationPlanErrorCode =
  | "SOURCE_DOCUMENT_NOT_SELECTED"
  | "SOURCE_DOCUMENT_NOT_FOUND"
  | "SOURCE_DOCUMENT_NOT_IN_QUEUE"
  | "TARGET_NOT_SELECTED"
  | "TARGET_NOT_FOUND"
  | "TARGET_NOT_DIRECTORY"
  | "TARGET_ACCESS_DENIED"
  | "TARGET_NOT_WRITABLE"
  | "TARGET_FOLDER_INVALID"
  | "TARGET_FOLDER_NOT_FOUND"
  | "TARGET_FOLDER_NOT_DIRECTORY"
  | "INVALID_FILENAME"
  | "DESTINATION_ALREADY_EXISTS"
  | "UNKNOWN_ERROR";

export type ClassificationPlanCheckCode =
  | "SOURCE_DOCUMENT_SELECTED"
  | "SOURCE_DOCUMENT_IN_QUEUE"
  | "SOURCE_DOCUMENT_EXISTS"
  | "TARGET_SELECTED"
  | "TARGET_FOLDER_VALID"
  | "TARGET_ACCESSIBLE"
  | "TARGET_WRITABLE"
  | "FILENAME_VALID"
  | "DESTINATION_AVAILABLE"
  | "SIMULATION_ONLY";

export type SourceFileStatus =
  | "present"
  | "not-selected"
  | "not-in-queue"
  | "missing"
  | "unknown";

export type TargetDirectoryStatus =
  | "available"
  | "not-selected"
  | "not-found"
  | "not-directory"
  | "access-denied"
  | "not-writable"
  | "folder-invalid"
  | "folder-missing"
  | "unknown";

export type DestinationCollisionStatus =
  | "available"
  | "already-exists"
  | "invalid"
  | "unchecked";

export interface ClassificationPlanCheck {
  code: ClassificationPlanCheckCode;
  label: string;
  status: ClassificationPlanCheckStatus;
  message: string;
}

export interface ClassificationPlan {
  status: ClassificationPlanStatus;
  sourcePath: string;
  currentName: string;
  targetRootPath: string;
  targetFolder: string;
  targetPath: string;
  proposedFilename: string;
  destinationPath: string;
  extension: string;
  sourceFileStatus: SourceFileStatus;
  targetDirectoryStatus: TargetDirectoryStatus;
  collisionStatus: DestinationCollisionStatus;
  preparedAt: string;
  checks: ClassificationPlanCheck[];
  message: string;
  simulationOnly: true;
}

export interface ClassificationPlanError {
  code: ClassificationPlanErrorCode;
  message: string;
}

export type PrepareClassificationPlanResult =
  | {
      ok: true;
      value: ClassificationPlan & { status: "ready" };
    }
  | {
      ok: false;
      error: ClassificationPlanError;
      value: ClassificationPlan & { status: "blocked" };
    };

export interface PrepareClassificationPlanOptions {
  documentPath: string;
  proposedFilename: string;
  selectedTargetPath: string | null | undefined;
  targetFolder?: string;
  queuedDocumentPaths: Iterable<string>;
  now?: () => Date;
  checkTargetDirectoryWritable?: TargetDirectoryWritableChecker;
}

const CHECK_ORDER: ClassificationPlanCheckCode[] = [
  "SOURCE_DOCUMENT_SELECTED",
  "SOURCE_DOCUMENT_IN_QUEUE",
  "SOURCE_DOCUMENT_EXISTS",
  "TARGET_SELECTED",
  "TARGET_FOLDER_VALID",
  "TARGET_ACCESSIBLE",
  "TARGET_WRITABLE",
  "FILENAME_VALID",
  "DESTINATION_AVAILABLE",
  "SIMULATION_ONLY"
];

const CHECK_LABELS: Record<ClassificationPlanCheckCode, string> = {
  SOURCE_DOCUMENT_SELECTED: "Source sélectionnée",
  SOURCE_DOCUMENT_IN_QUEUE: "Document issu de la file scannée",
  SOURCE_DOCUMENT_EXISTS: "Document encore présent",
  TARGET_SELECTED: "Cible sélectionnée",
  TARGET_FOLDER_VALID: "Sous-dossier cible valide",
  TARGET_ACCESSIBLE: "Dossier cible existant",
  TARGET_WRITABLE: "Dossier cible accessible en écriture",
  FILENAME_VALID: "Nom proposé valide",
  DESTINATION_AVAILABLE: "Nom disponible dans la cible",
  SIMULATION_ONLY: "Aucune action disque exécutée"
};

export async function prepareClassificationPlan(
  options: PrepareClassificationPlanOptions
): Promise<PrepareClassificationPlanResult> {
  const preparedAt = (options.now ?? (() => new Date()))().toISOString();
  const sourcePath = options.documentPath.trim() ? path.resolve(options.documentPath) : "";
  const proposedFilename = options.proposedFilename;
  const targetRootPath = options.selectedTargetPath?.trim() ?? "";
  let targetFolder = "";
  let targetPath = "";
  const checkTargetDirectoryWritable =
    options.checkTargetDirectoryWritable ?? defaultCheckTargetDirectoryWritable;
  const checks: ClassificationPlanCheck[] = [];
  let sourceFileStatus: SourceFileStatus = "unknown";
  let targetDirectoryStatus: TargetDirectoryStatus = "unknown";
  let collisionStatus: DestinationCollisionStatus = "unchecked";
  let destinationPath = "";

  const createPlan = (
    status: ClassificationPlanStatus,
    message: string
  ): ClassificationPlan => ({
    status,
    sourcePath,
    currentName: sourcePath ? path.basename(sourcePath) : "",
    targetRootPath,
    targetFolder,
    targetPath,
    proposedFilename,
    destinationPath,
    extension: sourcePath ? path.extname(sourcePath).toLowerCase() : "",
    sourceFileStatus,
    targetDirectoryStatus,
    collisionStatus,
    preparedAt,
    checks: completeChecks(checks),
    message,
    simulationOnly: true
  });

  const block = (
    code: ClassificationPlanErrorCode,
    message: string
  ): PrepareClassificationPlanResult => ({
    ok: false,
    error: {
      code,
      message
    },
    value: createPlan("blocked", message) as ClassificationPlan & { status: "blocked" }
  });

  if (!sourcePath) {
    sourceFileStatus = "not-selected";
    checks.push(createCheck("SOURCE_DOCUMENT_SELECTED", "blocking", "Aucun document source sélectionné."));
    return block("SOURCE_DOCUMENT_NOT_SELECTED", "Aucun document source sélectionné.");
  }

  checks.push(createCheck("SOURCE_DOCUMENT_SELECTED", "ok", "Document source sélectionné."));

  if (!isDocumentInQueue(sourcePath, options.queuedDocumentPaths)) {
    sourceFileStatus = "not-in-queue";
    checks.push(
      createCheck(
        "SOURCE_DOCUMENT_IN_QUEUE",
        "blocking",
        "Le document ne fait pas partie de la dernière file scannée."
      )
    );
    return block(
      "SOURCE_DOCUMENT_NOT_IN_QUEUE",
      "Le document source ne fait pas partie de la dernière file scannée."
    );
  }

  checks.push(
    createCheck(
      "SOURCE_DOCUMENT_IN_QUEUE",
      "ok",
      "Document retrouvé dans la dernière file scannée."
    )
  );

  const sourceExists = await checkSourceFile(sourcePath);
  if (!sourceExists.ok) {
    sourceFileStatus = sourceExists.status;
    checks.push(createCheck("SOURCE_DOCUMENT_EXISTS", "blocking", sourceExists.message));
    return block(sourceExists.errorCode, sourceExists.message);
  }

  sourceFileStatus = "present";
  checks.push(createCheck("SOURCE_DOCUMENT_EXISTS", "ok", "Document source encore présent."));

  if (!targetRootPath) {
    targetDirectoryStatus = "not-selected";
    checks.push(createCheck("TARGET_SELECTED", "blocking", "Aucun dossier cible sélectionné."));
    return block("TARGET_NOT_SELECTED", "Aucun dossier cible sélectionné.");
  }

  checks.push(createCheck("TARGET_SELECTED", "ok", "Dossier cible sélectionné."));

  const targetFolderResult = await resolveTargetFolder(
    targetRootPath,
    options.targetFolder ?? "",
    {
      checkTargetDirectoryWritable
    }
  );
  if (!targetFolderResult.ok) {
    const targetError = mapTargetFolderError(targetFolderResult.error.code);
    targetDirectoryStatus = targetError.targetDirectoryStatus;

    if (targetError.checkCode !== "TARGET_FOLDER_VALID") {
      checks.push(createCheck("TARGET_FOLDER_VALID", "ok", "Sous-dossier cible relatif valide."));
    }

    if (targetFolderResult.error.code === "TARGET_NOT_WRITABLE") {
      checks.push(createCheck("TARGET_ACCESSIBLE", "ok", "Dossier cible encore disponible."));
      checks.push(createCheck("TARGET_WRITABLE", "blocking", targetError.message));
    } else {
      checks.push(createCheck(targetError.checkCode, "blocking", targetError.message));
    }

    return block(targetError.errorCode, targetError.message);
  }

  targetFolder = targetFolderResult.value.targetFolder;
  targetPath = targetFolderResult.value.targetPath;
  targetDirectoryStatus = "available";
  checks.push(createCheck("TARGET_FOLDER_VALID", "ok", "Sous-dossier cible relatif valide."));
  checks.push(createCheck("TARGET_ACCESSIBLE", "ok", "Dossier cible encore disponible."));
  checks.push(createCheck("TARGET_WRITABLE", "ok", "Dossier cible accessible en écriture."));

  const filenameValidation = validateDestinationFilename(proposedFilename);
  if (!filenameValidation.ok) {
    collisionStatus = "invalid";
    checks.push(createCheck("FILENAME_VALID", "blocking", "Le nom proposé est invalide."));
    return block("INVALID_FILENAME", "Le nom proposé est invalide.");
  }

  checks.push(createCheck("FILENAME_VALID", "ok", "Nom proposé valide."));
  destinationPath = path.join(targetPath, filenameValidation.value);

  const destinationAvailability = await checkDestinationNameAvailability(
    targetRootPath,
    filenameValidation.value,
    {
      targetFolder,
      checkTargetDirectoryWritable
    }
  );
  if (!destinationAvailability.ok) {
    const error = mapDestinationError(destinationAvailability.error.code);
    targetDirectoryStatus = error.targetDirectoryStatus ?? targetDirectoryStatus;
    collisionStatus = error.collisionStatus ?? collisionStatus;
    checks.push(createCheck(error.checkCode, "blocking", error.message));
    return block(error.errorCode, error.message);
  }

  if (destinationAvailability.value.status === "collision") {
    collisionStatus = "already-exists";
    checks.push(
      createCheck(
        "DESTINATION_AVAILABLE",
        "blocking",
        "Le nom proposé est déjà utilisé dans la cible."
      )
    );
    return block("DESTINATION_ALREADY_EXISTS", "Le nom proposé est déjà utilisé.");
  }

  collisionStatus = "available";
  destinationPath = destinationAvailability.value.finalPath;
  checks.push(createCheck("DESTINATION_AVAILABLE", "ok", "Nom disponible dans la cible."));

  const plan = createPlan("ready", "Plan prêt — aucun fichier modifié") as ClassificationPlan & {
    status: "ready";
  };

  return {
    ok: true,
    value: plan
  };
}

function createCheck(
  code: ClassificationPlanCheckCode,
  status: ClassificationPlanCheckStatus,
  message: string
): ClassificationPlanCheck {
  return {
    code,
    label: CHECK_LABELS[code],
    status,
    message
  };
}

function completeChecks(checks: ClassificationPlanCheck[]): ClassificationPlanCheck[] {
  const completedChecks = [...checks];
  const existingCodes = new Set(completedChecks.map((check) => check.code));

  for (const code of CHECK_ORDER) {
    if (existingCodes.has(code)) {
      continue;
    }

    if (code === "SIMULATION_ONLY") {
      completedChecks.push(
        createCheck(
          "SIMULATION_ONLY",
          "ok",
          "Simulation uniquement — aucune action disque exécutée."
        )
      );
      continue;
    }

    completedChecks.push(createCheck(code, "not-run", "Contrôle non exécuté."));
  }

  return completedChecks.sort(
    (left, right) => CHECK_ORDER.indexOf(left.code) - CHECK_ORDER.indexOf(right.code)
  );
}

function isDocumentInQueue(documentPath: string, queuedDocumentPaths: Iterable<string>): boolean {
  const queuedPaths = new Set(
    Array.from(queuedDocumentPaths, (queuedPath) => normalizePathForComparison(queuedPath))
  );

  return queuedPaths.has(normalizePathForComparison(documentPath));
}

function normalizePathForComparison(filePath: string): string {
  return path.resolve(filePath).toLowerCase();
}

async function checkSourceFile(
  sourcePath: string
): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      errorCode: ClassificationPlanErrorCode;
      status: SourceFileStatus;
      message: string;
    }
> {
  try {
    const sourceStats = await stat(sourcePath);
    if (!sourceStats.isFile()) {
      return {
        ok: false,
        errorCode: "SOURCE_DOCUMENT_NOT_FOUND",
        status: "missing",
        message: "Le document source n'est plus disponible."
      };
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      errorCode: isMissingPathError(error) ? "SOURCE_DOCUMENT_NOT_FOUND" : "UNKNOWN_ERROR",
      status: isMissingPathError(error) ? "missing" : "unknown",
      message: "Le document source n'est plus disponible."
    };
  }
}

function mapDestinationError(code: string): {
  errorCode: ClassificationPlanErrorCode;
  checkCode: ClassificationPlanCheckCode;
  message: string;
  targetDirectoryStatus?: TargetDirectoryStatus;
  collisionStatus?: DestinationCollisionStatus;
} {
  switch (code) {
    case "TARGET_NOT_SELECTED":
      return {
        errorCode: "TARGET_NOT_SELECTED",
        checkCode: "TARGET_SELECTED",
        message: "Aucun dossier cible sélectionné.",
        targetDirectoryStatus: "not-selected"
      };
    case "TARGET_NOT_FOUND":
      return {
        errorCode: "TARGET_NOT_FOUND",
        checkCode: "TARGET_ACCESSIBLE",
        message: "Le dossier cible n'est plus disponible.",
        targetDirectoryStatus: "not-found"
      };
    case "TARGET_NOT_DIRECTORY":
      return {
        errorCode: "TARGET_NOT_DIRECTORY",
        checkCode: "TARGET_ACCESSIBLE",
        message: "Le dossier cible n'est plus disponible.",
        targetDirectoryStatus: "not-directory"
      };
    case "TARGET_ACCESS_DENIED":
      return {
        errorCode: "TARGET_ACCESS_DENIED",
        checkCode: "TARGET_ACCESSIBLE",
        message: "Accès refusé au dossier cible.",
        targetDirectoryStatus: "access-denied"
      };
    case "TARGET_NOT_WRITABLE":
      return {
        errorCode: "TARGET_NOT_WRITABLE",
        checkCode: "TARGET_WRITABLE",
        message: "Le dossier cible n'est pas accessible en écriture.",
        targetDirectoryStatus: "not-writable"
      };
    case "TARGET_FOLDER_INVALID":
      return {
        errorCode: "TARGET_FOLDER_INVALID",
        checkCode: "TARGET_FOLDER_VALID",
        message: "Le sous-dossier cible est invalide.",
        targetDirectoryStatus: "folder-invalid"
      };
    case "TARGET_FOLDER_NOT_FOUND":
      return {
        errorCode: "TARGET_FOLDER_NOT_FOUND",
        checkCode: "TARGET_ACCESSIBLE",
        message: "Le sous-dossier cible n'existe pas.",
        targetDirectoryStatus: "folder-missing"
      };
    case "TARGET_FOLDER_NOT_DIRECTORY":
      return {
        errorCode: "TARGET_FOLDER_NOT_DIRECTORY",
        checkCode: "TARGET_ACCESSIBLE",
        message: "Le sous-dossier cible n'est pas un dossier.",
        targetDirectoryStatus: "not-directory"
      };
    case "INVALID_FILENAME":
      return {
        errorCode: "INVALID_FILENAME",
        checkCode: "FILENAME_VALID",
        message: "Le nom proposé est invalide.",
        collisionStatus: "invalid"
      };
    case "TOO_MANY_COLLISIONS":
      return {
        errorCode: "DESTINATION_ALREADY_EXISTS",
        checkCode: "DESTINATION_AVAILABLE",
        message: "Le nom proposé est déjà utilisé.",
        collisionStatus: "already-exists"
      };
    default:
      return {
        errorCode: "UNKNOWN_ERROR",
        checkCode: "DESTINATION_AVAILABLE",
        message: "Préparation du plan impossible."
      };
  }
}

function mapTargetFolderError(code: TargetDirectoryAccessErrorCode | string): {
  errorCode: ClassificationPlanErrorCode;
  checkCode: ClassificationPlanCheckCode;
  targetDirectoryStatus: TargetDirectoryStatus;
  message: string;
} {
  switch (code) {
    case "TARGET_NOT_SELECTED":
      return {
        errorCode: "TARGET_NOT_SELECTED",
        checkCode: "TARGET_SELECTED",
        targetDirectoryStatus: "not-selected",
        message: "Aucun dossier cible sélectionné."
      };
    case "TARGET_NOT_FOUND":
      return {
        errorCode: "TARGET_NOT_FOUND",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "not-found",
        message: "Le dossier cible n'est plus disponible."
      };
    case "TARGET_NOT_DIRECTORY":
      return {
        errorCode: "TARGET_NOT_DIRECTORY",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "not-directory",
        message: "Le dossier cible n'est plus disponible."
      };
    case "TARGET_ACCESS_DENIED":
      return {
        errorCode: "TARGET_ACCESS_DENIED",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "access-denied",
        message: "Accès refusé au dossier cible."
      };
    case "TARGET_NOT_WRITABLE":
      return {
        errorCode: "TARGET_NOT_WRITABLE",
        checkCode: "TARGET_WRITABLE",
        targetDirectoryStatus: "not-writable",
        message: "Le dossier cible n'est pas accessible en écriture."
      };
    case "TARGET_FOLDER_INVALID":
      return {
        errorCode: "TARGET_FOLDER_INVALID",
        checkCode: "TARGET_FOLDER_VALID",
        targetDirectoryStatus: "folder-invalid",
        message: "Le sous-dossier cible est invalide."
      };
    case "TARGET_FOLDER_NOT_FOUND":
      return {
        errorCode: "TARGET_FOLDER_NOT_FOUND",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "folder-missing",
        message: "Le sous-dossier cible n'existe pas."
      };
    case "TARGET_FOLDER_NOT_DIRECTORY":
      return {
        errorCode: "TARGET_FOLDER_NOT_DIRECTORY",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "not-directory",
        message: "Le sous-dossier cible n'est pas un dossier."
      };
    case "UNKNOWN_ERROR":
      return {
        errorCode: "UNKNOWN_ERROR",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "unknown",
        message: "Contrôle du dossier cible impossible."
      };
    default:
      return {
        errorCode: "UNKNOWN_ERROR",
        checkCode: "TARGET_ACCESSIBLE",
        targetDirectoryStatus: "unknown",
        message: "Contrôle du dossier cible impossible."
      };
  }
}

function isMissingPathError(error: unknown): boolean {
  return isNodeError(error) && (error.code === "ENOENT" || error.code === "ENOTDIR");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
