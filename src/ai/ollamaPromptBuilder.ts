import path from "node:path";

import {
  type AiClassificationInput,
  type BoundedAiClassificationInput
} from "./aiClassificationTypes";
import { boundAiClassificationInput } from "./aiClassificationValidator";

export interface OllamaClassificationPrompt {
  prompt: string;
  input: BoundedAiClassificationInput;
}

const WINDOWS_PATH = /(?:[A-Za-z]:\\|\\\\)[^\r\n\t ]+/g;
const FILE_URL = /file:\/\/[^\r\n\t ]+/gi;

export function buildOllamaClassificationPrompt(
  input: AiClassificationInput
): OllamaClassificationPrompt {
  const boundedInput = sanitizeBoundedInput(boundAiClassificationInput(input));
  const payload = {
    filename: boundedInput.filename,
    extension: boundedInput.extension,
    extractedTextExcerpt: boundedInput.extractedTextExcerpt,
    ocrTextExcerpt: boundedInput.ocrTextExcerpt,
    currentSuggestionV2: boundedInput.currentSuggestionV2,
    availableRootFolders: boundedInput.availableRootFolders,
    knownRelativeFolders: boundedInput.knownRelativeFolders,
    namingConvention: boundedInput.namingConvention,
    detectedDate: boundedInput.detectedDate,
    detectedYear: boundedInput.detectedYear
  };

  return {
    input: boundedInput,
    prompt: [
      "Tu aides DocSorter Local à proposer un classement documentaire local.",
      "Tu proposes seulement : l'utilisateur garde la décision finale.",
      "Réponds uniquement avec un objet JSON valide, sans Markdown ni commentaire.",
      "Schéma JSON attendu :",
      JSON.stringify(
        {
          dateToken: "AAAA-MM-JJ, AAAA-MM, AAAA, AAAA-env ou date-inconnue optionnel",
          target: "cible normalisée optionnelle",
          documentType: "type documentaire normalisé optionnel",
          issuer: "émetteur normalisé optionnel",
          detail: "détail normalisé optionnel",
          targetFolder: "dossier relatif optionnel",
          confidence: "nombre entier 0..100",
          reasons: ["raisons courtes"],
          warnings: ["avertissements courts"],
          source: "ollama"
        },
        null,
        2
      ),
      "Contraintes strictes :",
      "- source doit valoir \"ollama\".",
      "- targetFolder doit être relatif, sans chemin absolu, sans lettre de lecteur, sans \"..\".",
      "- target, documentType, issuer et detail doivent être des blocs courts compatibles nom de fichier.",
      "- target ne doit jamais être égal à documentType.",
      "- le nom de fichier source ou son basename ne doit jamais devenir target.",
      "- n'utilise jamais de chemin absolu dans target, documentType, issuer, detail ou targetFolder.",
      "- dateToken doit suivre le contrat V2 ou rester absent.",
      "- confidence est un nombre entre 0 et 100.",
      "- n'invente pas une certitude : ajoute un warning si le signal est faible.",
      "- n'inclus jamais de chemin Windows complet.",
      "- Convention de nommage : DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext.",
      "Données bornées du document actif :",
      JSON.stringify(payload, null, 2)
    ].join("\n")
  };
}

function sanitizeBoundedInput(input: BoundedAiClassificationInput): BoundedAiClassificationInput {
  return {
    ...input,
    filename: stripPathLikeFilename(input.filename),
    extractedTextExcerpt: redactPathLikeText(input.extractedTextExcerpt),
    ocrTextExcerpt: redactPathLikeText(input.ocrTextExcerpt),
    namingConvention: redactPathLikeText(input.namingConvention)
  };
}

function stripPathLikeFilename(value: string): string {
  return path.basename(value.replace(/\\/g, "/"));
}

function redactPathLikeText(value: string): string {
  return value
    .replace(WINDOWS_PATH, "[chemin-local]")
    .replace(FILE_URL, "[chemin-local]");
}
