import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { OcrSettings } from "./ocrTypes";
import {
  getTesseractVersion,
  listTesseractLanguages,
  parseTesseractLanguages,
  runTesseractCommand,
  runTesseractImageOcr,
  testTesseractEngineForSettings,
  type ExecFileRunner
} from "./tesseractCli";

const temporaryRoots: string[] = [];

describe("tesseract CLI wrapper", () => {
  afterEach(async () => {
    await Promise.all(
      temporaryRoots.map(async (root) => {
        await rm(root, { recursive: true, force: true });
      })
    );
    temporaryRoots.length = 0;
  });

  it("reads Tesseract version through execFile", async () => {
    const runner = createExecFileRunner([
      {
        stdout: "tesseract 5.3.4\n leptonica-1.83\n",
        stderr: ""
      }
    ]);

    const version = await getTesseractVersion("C:\\Tools\\Tesseract-OCR\\tesseract.exe", {
      execFileRunner: runner
    });

    expect(version).toEqual({ ok: true, value: "5.3.4" });
  });

  it("lists languages with explicit tessdata args", async () => {
    const runner = createExecFileRunner([
      {
        stdout: "List of available languages in tessdata/ (3):\neng\nfra\nosd\n",
        stderr: ""
      }
    ]);

    const languages = await listTesseractLanguages("tesseract.exe", "C:\\tessdata", {
      execFileRunner: runner
    });

    expect(languages).toEqual({ ok: true, value: ["eng", "fra", "osd"] });
    expect(runner.calls[0].args).toEqual(["--list-langs", "--tessdata-dir", "C:\\tessdata"]);
  });

  it("returns a ready status without OCRing a document", async () => {
    const workspace = await createWorkspace();
    const runner = createExecFileRunner([
      {
        stdout: "tesseract 5.3.4\n",
        stderr: ""
      },
      {
        stdout: "List of available languages in tessdata/ (2):\neng\nfra\n",
        stderr: ""
      }
    ]);

    const result = await testTesseractEngineForSettings(createSettings(workspace), {
      execFileRunner: runner,
      now: () => new Date("2026-06-16T10:00:00.000Z")
    });

    expect(result.ok).toBe(true);
    expect(result.ok && result.value.detectedVersion).toBe("5.3.4");
    expect(result.ok && result.value.lastTestedAt).toBe("2026-06-16T10:00:00.000Z");
    expect(runner.calls.map((call) => call.args)).toEqual([
      ["--version"],
      ["--list-langs", "--tessdata-dir", workspace.tessdataPath]
    ]);
  });

  it("returns timeout errors cleanly", async () => {
    const runner = createExecFileRunner([
      {
        error: Object.assign(new Error("Command timed out"), {
          code: "ETIMEDOUT",
          killed: true
        }),
        stdout: "",
        stderr: "partial stderr"
      }
    ]);

    const version = await getTesseractVersion("tesseract.exe", { execFileRunner: runner });

    expect(version.ok).toBe(false);
    expect(!version.ok && version.error.code).toBe("OCR_PROCESS_TIMEOUT");
  });

  it("bounds stderr and runs without a shell", async () => {
    const oversizedStderr = "x".repeat(64);
    const runner = createExecFileRunner([
      {
        error: Object.assign(new Error("exit 1"), { code: 1 }),
        stdout: "",
        stderr: oversizedStderr
      }
    ]);

    const result = await runTesseractCommand("tesseract.exe", ["--version"], {
      execFileRunner: runner,
      maxOutputBytes: 16
    });

    expect(runner.calls[0].options.shell).toBe(false);
    expect(result.stderr.length).toBeLessThan(oversizedStderr.length);
    expect(result.stderr).toContain("[sortie tronquee]");
  });

  it("runs image OCR with explicit Tesseract CLI arguments", async () => {
    const workspace = await createWorkspace();
    const runner = createExecFileRunner([
      {
        stdout: "texte OCR",
        stderr: ""
      }
    ]);

    const result = await runTesseractImageOcr(createSettings(workspace), workspace.imagePath, {
      language: "fra",
      psm: 6,
      execFileRunner: runner
    });

    expect(result.ok).toBe(true);
    expect(runner.calls[0].file).toBe(workspace.tesseractPath);
    expect(runner.calls[0].args).toEqual([
      workspace.imagePath,
      "stdout",
      "-l",
      "fra",
      "--psm",
      "6"
    ]);
    expect(runner.calls[0].options.shell).toBe(false);
  });

  it("parses language lists without keeping the Tesseract header", () => {
    expect(
      parseTesseractLanguages("List of available languages in tessdata/ (2):\nfra\neng\n")
    ).toEqual(["eng", "fra"]);
  });
});

function createExecFileRunner(
  responses: Array<{
    error?: NodeJS.ErrnoException | null;
    stdout: string;
    stderr: string;
  }>
): ExecFileRunner & {
  calls: Array<{
    file: string;
    args: string[];
    options: Parameters<ExecFileRunner>[2];
  }>;
} {
  const calls: Array<{
    file: string;
    args: string[];
    options: Parameters<ExecFileRunner>[2];
  }> = [];
  const runner: ExecFileRunner = (file, args, options, callback) => {
    calls.push({ file, args, options });
    const response = responses.shift() ?? { stdout: "", stderr: "" };
    callback(response.error ?? null, response.stdout, response.stderr);
    return {};
  };

  return Object.assign(runner, { calls });
}

async function createWorkspace() {
  const root = await mkdtemp(path.join(tmpdir(), "docsorter-ocr-cli-"));
  temporaryRoots.push(root);

  const tesseractPath = path.join(root, "tesseract.exe");
  const imagePath = path.join(root, "image.png");
  const tessdataPath = path.join(root, "tessdata");
  await mkdir(tessdataPath, { recursive: true });
  await writeFile(tesseractPath, "", "utf8");
  await writeFile(imagePath, "", "utf8");
  await writeFile(path.join(tessdataPath, "fra.traineddata"), "", "utf8");

  return {
    tesseractPath,
    imagePath,
    tessdataPath
  };
}

function createSettings(workspace: {
  tesseractPath: string;
  tessdataPath: string;
}): OcrSettings {
  return {
    tesseractPath: workspace.tesseractPath,
    tessdataPath: workspace.tessdataPath,
    language: "fra",
    psm: 3,
    lastTestedAt: null,
    detectedVersion: null
  };
}
