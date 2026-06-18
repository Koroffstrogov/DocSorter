import path from "node:path";

import {
  type AiClassificationInput,
  type BoundedAiClassificationInput
} from "./aiClassificationTypes";
import { boundAiClassificationInput } from "./aiClassificationValidator";

export interface OllamaClassificationPrompt {
  prompt: string;
  format: unknown;
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
    availableRootFolders: boundedInput.availableRootFolders,
    knownRelativeFolders: boundedInput.knownRelativeFolders,
    namingConvention: boundedInput.namingConvention,
    detectedDate: boundedInput.detectedDate,
    detectedYear: boundedInput.detectedYear
  };

  return {
    input: boundedInput,
    format: OLLAMA_MULTI_CANDIDATE_JSON_SCHEMA,
    prompt: [
      "Tu aides DocSorter Local à proposer un classement documentaire local.",
      "Tu proposes seulement : l'utilisateur garde la décision finale.",
      "Réponds uniquement avec un objet JSON valide, sans Markdown ni commentaire.",
      "Schéma JSON attendu :",
      JSON.stringify(
        {
          fields: {
            dateToken: {
              selected: "AAAA-MM-JJ ou AAAA optionnel",
              candidates: [{ value: "2026", score: 80, reason: "année fiscale détectée", role: "selected" }]
            },
            subject: {
              selected: "sujet du champ Renommage proposé optionnel",
              candidates: [{ value: "captur", score: 85, reason: "véhicule détecté", role: "selected" }]
            },
            target: {
              selected: "cible logique optionnelle",
              candidates: [{ value: "foyer", score: 85, reason: "document fiscal du foyer", role: "selected" }]
            },
            documentType: {
              selected: "type documentaire normalisé optionnel",
              candidates: [{ value: "avis-imposition", score: 90, reason: "libellé détecté", role: "selected" }]
            },
            issuer: {
              selected: "émetteur normalisé optionnel",
              candidates: [{ value: "renault", score: 60, reason: "organisme détecté", role: "selected" }]
            },
            detail: {
              selected: "détail normalisé optionnel",
              candidates: [{ value: "vidange", score: 65, reason: "prestation détectée", role: "selected" }]
            }
          },
          folderCandidates: [
            { value: "Vehicules", score: 80, reason: "dossier connu pertinent", role: "existing" }
          ],
          fileNameCandidates: [
            {
              value: "2026_captur_facture-entretien_renault_vidange.pdf",
              score: 80,
              reason: "convention respectée",
              role: "selected"
            }
          ],
          confidence: "nombre entier 0..100",
          warnings: ["avertissements courts"],
          source: "ollama"
        },
        null,
        2
      ),
      "Contraintes strictes :",
      "- source doit valoir \"ollama\".",
      "- Chaque champ de fields doit contenir selected et candidates ; chaque candidate contient value, score, reason, role optionnel.",
      "- fields.subject.selected doit proposer le champ Sujet de Renommage proposé quand il est identifiable.",
      "- fields.subject, fields.target, fields.documentType, fields.issuer et fields.detail doivent être des blocs courts compatibles nom de fichier.",
      "- folderCandidates doit contenir des dossiers relatifs candidats ; chaque dossier doit être relatif, sans chemin absolu, sans lettre de lecteur, sans \"..\".",
      "- folderCandidates doit préférer un dossier relatif connu pertinent quand il existe dans knownRelativeFolders.",
      "- si aucun dossier connu ne convient, ajoute un candidat role \"newFolderProposal\" puis un fallback Divers/A-traiter-manuellement.",
      "- fileNameCandidates doit contenir des noms complets proposés qui respectent la convention de nommage.",
      "- subject ne doit jamais être égal à documentType.",
      "- subject ne doit pas répéter le type documentaire.",
      "- target ne doit jamais être égal à documentType.",
      "- le nom de fichier source ou son basename ne doit jamais devenir subject ni target.",
      "- n'utilise jamais DocSorter, docsorter-local, document de test ou contenu fictif dans subject, issuer, detail ou proposedName.",
      "- n'utilise jamais de chemin absolu dans target, documentType, issuer, detail ou targetFolder.",
      "- dateToken doit être au format AAAA-MM-JJ ou AAAA, ou rester absent.",
      "- si tu ne connais que le mois au format AAAA-MM, utilise AAAA-MM-01.",
      "- n'utilise pas date-inconnue, AAAA-env, ni AAAA-MM dans la sortie JSON.",
      "- Pour contrat ou assurance, la date d'effet est prioritaire sur la date de signature.",
      "- Pour avis-imposition, target doit être foyer et dateToken doit être l'année fiscale/recherche.",
      "- Pour scolarité 2026/2027, dateToken doit être 2026.",
      "- N'invente pas une date précise : si seulement l'année est connue, retourne AAAA.",
      "- confidence est un nombre entre 0 et 100.",
      "- n'invente pas une certitude : ajoute un warning si le signal est faible.",
      "- n'inclus jamais de chemin Windows complet.",
      "- Convention de nommage : DATE_CIBLE_DOCUMENT[_EMETTEUR][_DETAIL].ext.",
      "Données bornées du document actif :",
      JSON.stringify(payload, null, 2)
    ].join("\n")
  };
}

export const OLLAMA_MULTI_CANDIDATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["fields", "folderCandidates", "fileNameCandidates", "warnings", "confidence", "source"],
  properties: {
    fields: {
      type: "object",
      additionalProperties: false,
      required: ["dateToken", "subject", "target", "documentType", "issuer", "detail"],
      properties: {
        dateToken: createFieldSchema(),
        subject: createFieldSchema(),
        target: createFieldSchema(),
        documentType: createFieldSchema(),
        issuer: createFieldSchema(),
        detail: createFieldSchema()
      }
    },
    folderCandidates: createCandidateArraySchema(),
    fileNameCandidates: createCandidateArraySchema(),
    warnings: {
      type: "array",
      maxItems: 8,
      items: { type: "string" }
    },
    confidence: {
      type: "integer",
      minimum: 0,
      maximum: 100
    },
    source: {
      const: "ollama"
    }
  }
} as const;

function createFieldSchema() {
  return {
    type: "object",
    additionalProperties: false,
    required: ["selected", "candidates"],
    properties: {
      selected: { type: "string" },
      candidates: createCandidateArraySchema()
    }
  } as const;
}

function createCandidateArraySchema() {
  return {
    type: "array",
    maxItems: 8,
    items: {
      type: "object",
      additionalProperties: false,
      required: ["value", "score", "reason"],
      properties: {
        value: { type: "string" },
        score: {
          type: "integer",
          minimum: 0,
          maximum: 100
        },
        reason: { type: "string" },
        role: { type: "string" }
      }
    }
  } as const;
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
