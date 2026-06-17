import { readdir, stat } from "node:fs/promises";
import path from "node:path";

import type {
  BuildFolderInventoryOptions,
  FolderInventoryItem,
  FolderInventoryResult
} from "./folderInventoryTypes";
import { normalizeInventoryRelativePath } from "./folderInventorySafety";

const DEFAULT_MAX_DEPTH = 3;
const DEFAULT_SAMPLE_FILE_LIMIT = 20;

export async function buildFolderInventory(
  options: BuildFolderInventoryOptions
): Promise<FolderInventoryResult> {
  if (!options.rootPath?.trim()) {
    return {
      ok: false,
      error: {
        code: "TARGET_NOT_SELECTED",
        message: "Aucune racine cible sélectionnée pour inventorier les dossiers."
      }
    };
  }

  const rootPath = path.resolve(options.rootPath);
  const rootStatus = await getRootStatus(rootPath);
  if (rootStatus === "missing") {
    return {
      ok: false,
      error: {
        code: "TARGET_NOT_FOUND",
        message: "La racine cible n'existe plus."
      }
    };
  }
  if (rootStatus === "file") {
    return {
      ok: false,
      error: {
        code: "TARGET_NOT_DIRECTORY",
        message: "La racine cible n'est pas un dossier."
      }
    };
  }

  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
  const sampleFileLimit = options.sampleFileLimit ?? DEFAULT_SAMPLE_FILE_LIMIT;
  const items: FolderInventoryItem[] = [];
  const warnings: string[] = [];

  await collectFolderInventory(rootPath, "", 0, maxDepth, sampleFileLimit, items, warnings);

  return {
    ok: true,
    inventory: {
      items: items.sort((left, right) =>
        left.relativePath.localeCompare(right.relativePath, "fr", { sensitivity: "base" })
      ),
      warnings: uniqueStrings(warnings)
    }
  };
}

async function collectFolderInventory(
  rootPath: string,
  relativePath: string,
  depth: number,
  maxDepth: number,
  sampleFileLimit: number,
  items: FolderInventoryItem[],
  warnings: string[]
): Promise<void> {
  if (depth > maxDepth) {
    return;
  }

  const absolutePath = relativePath ? path.join(rootPath, ...relativePath.split("/")) : rootPath;
  let entries;
  try {
    entries = await readdir(absolutePath, { withFileTypes: true });
  } catch {
    if (relativePath) {
      warnings.push("Dossier ignoré pendant l'inventaire : lecture impossible.");
    }
    return;
  }

  const folderEntries = entries.filter((entry) => entry.isDirectory()).sort(compareDirEntries);
  const fileEntries = entries.filter((entry) => entry.isFile()).sort(compareDirEntries);

  if (relativePath) {
    const safePath = normalizeInventoryRelativePath(relativePath, maxDepth);
    if (!safePath.ok) {
      warnings.push("Dossier ignoré pendant l'inventaire : chemin relatif invalide.");
    } else {
      items.push({
        relativePath: safePath.relativePath,
        depth: safePath.depth,
        childFolderCount: folderEntries.length,
        fileCount: fileEntries.length,
        sampleFileNames: fileEntries.slice(0, sampleFileLimit).map((entry) => entry.name)
      });
    }
  }

  for (const entry of folderEntries) {
    const candidate = relativePath ? `${relativePath}/${entry.name}` : entry.name;
    const safeCandidate = normalizeInventoryRelativePath(candidate, maxDepth);
    if (!safeCandidate.ok) {
      warnings.push("Dossier ignoré pendant l'inventaire : chemin relatif invalide.");
      continue;
    }

    await collectFolderInventory(
      rootPath,
      safeCandidate.relativePath,
      safeCandidate.depth,
      maxDepth,
      sampleFileLimit,
      items,
      warnings
    );
  }
}

async function getRootStatus(rootPath: string): Promise<"directory" | "file" | "missing"> {
  try {
    const rootStats = await stat(rootPath);
    return rootStats.isDirectory() ? "directory" : "file";
  } catch {
    return "missing";
  }
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function compareDirEntries(
  left: { name: string },
  right: { name: string }
): number {
  return left.name.localeCompare(right.name, "fr", { sensitivity: "base" });
}
