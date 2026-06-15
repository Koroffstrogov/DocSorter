import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const rendererSource = join(root, "src", "renderer");
const rendererTarget = join(root, "dist", "renderer");
const pdfJsSource = join(root, "node_modules", "pdfjs-dist", "build");
const pdfJsTarget = join(rendererTarget, "vendor", "pdfjs");

await mkdir(rendererTarget, { recursive: true });
await mkdir(pdfJsTarget, { recursive: true });

await Promise.all(
  [
    ...["index.html", "styles.css"].map((fileName) =>
      copyFile(join(rendererSource, fileName), join(rendererTarget, fileName))
    ),
    copyFile(join(pdfJsSource, "pdf.mjs"), join(pdfJsTarget, "pdf.mjs")),
    copyFile(join(pdfJsSource, "pdf.worker.mjs"), join(pdfJsTarget, "pdf.worker.mjs"))
  ]
);
