import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";

export type FileHashResult =
  | {
      ok: true;
      value: string;
    }
  | {
      ok: false;
      error: {
        code: "HASH_FAILED";
        message: string;
      };
    };

export async function calculateSha256(filePath: string): Promise<FileHashResult> {
  return new Promise((resolve) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => {
      hash.update(chunk);
    });

    stream.on("error", () => {
      resolve({
        ok: false,
        error: {
          code: "HASH_FAILED",
          message: "Impossible de calculer l'empreinte du fichier."
        }
      });
    });

    stream.on("end", () => {
      resolve({
        ok: true,
        value: hash.digest("hex")
      });
    });
  });
}
