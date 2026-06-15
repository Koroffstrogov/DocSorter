import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rendererSource = join(root, "src", "renderer");
const rendererTarget = join(root, "dist", "renderer");

await mkdir(rendererTarget, { recursive: true });

await Promise.all(
  ["index.html", "styles.css"].map((fileName) =>
    copyFile(join(rendererSource, fileName), join(rendererTarget, fileName))
  )
);
