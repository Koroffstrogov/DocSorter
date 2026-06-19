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
            targetKind: {
              selected: "person | household | vehicle | property | other optionnel",
              candidates: [{ value: "household", score: 80, reason: "document du foyer", role: "selected" }]
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
            { value: "Vehicules", score: 80, reason: "dossier connu pertinent", exists: true }
          ],
          fileNameCandidates: [
            {
              value: "2026_captur_facture-entretien_renault_vidange.pdf",
              score: 80,
              reason: "convention respectée",
              exists: false,
              requiresCreation: false
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
      "- Chaque champ de fields doit contenir selected et candidates ; retourne jusqu'à 3 candidats par champ.",
      "- Chaque candidate de champ contient value, score, reason, role optionnel ; le meilleur candidat doit être dans selected.",
      "- Chaque candidat de folderCandidates et fileNameCandidates contient value, score, reason, exists optionnel, requiresCreation optionnel.",
      "- fields.subject.selected doit proposer le champ Sujet de Renommage proposé quand il est identifiable.",
      "- fields.subject, fields.target, fields.documentType, fields.issuer et fields.detail doivent être des blocs courts compatibles nom de fichier.",
      "- folderCandidates doit contenir des dossiers relatifs candidats ; chaque dossier doit être relatif, sans chemin absolu, sans lettre de lecteur, sans \"..\".",
      "- folderCandidates doit préférer un dossier relatif connu pertinent quand il existe dans knownRelativeFolders.",
      "- si aucun dossier connu ne convient, ajoute un candidat requiresCreation true puis un fallback Divers/A-traiter-manuellement.",
      "- fileNameCandidates doit contenir des noms complets proposés qui respectent la convention de nommage.",
      "- subject ne doit jamais être égal à documentType.",
      "- subject ne doit pas répéter le type documentaire.",
      "- target ne doit jamais être égal à documentType.",
      "- target est la valeur de nommage : paul, lea, foyer, captur, maison-principale.",
      "- target ne doit jamais valoir personne, person, véhicule, vehicle, document, bien, property, other, ni le type documentaire.",
      "- targetKind décrit seulement la nature optionnelle de target : person, household, vehicle, property ou other.",
      "- subject peut rester un libellé lisible, mais ne doit pas remplacer target.",
      "- la cible doit être la personne, le foyer, le véhicule ou le bien concerné ; le type documentaire ne doit pas servir de cible.",
      "- detail ne doit pas répéter subject, target, documentType ou issuer.",
      "- le nom de fichier source ou son basename ne doit jamais devenir subject ni target.",
      "- n'utilise jamais DocSorter, docsorter-local, document de test ou contenu fictif dans subject, issuer, detail ou proposedName.",
      "- n'utilise jamais de chemin absolu dans target, documentType, issuer, detail ou targetFolder.",
      "- dateToken doit être au format AAAA-MM-JJ ou AAAA, ou rester absent.",
      "- si tu ne connais que le mois au format AAAA-MM, utilise AAAA-MM-01.",
      "- n'utilise pas date-inconnue, AAAA-env, ni AAAA-MM dans la sortie JSON.",
      "- Pour contrat ou assurance, la date d'effet est prioritaire sur la date de signature.",
      "- Si une date complète d'effet, émission ou délivrance est détectée, dateToken doit être AAAA-MM-JJ, pas seulement AAAA.",
      "- Si une date de prise d'effet est présente, elle doit gagner comme dateToken.",
      "- Pour avis-imposition, target doit être foyer et dateToken doit être l'année fiscale/recherche.",
      "- Pour scolarité 2026/2027, dateToken doit être 2026.",
      "- Pour identité, carte-identite ou passeport, la date d'émission/délivrance est prioritaire ; la date de naissance est exclue du dateToken.",
      "- Pour carte-identite, targetFolder doit prioriser un dossier connu pertinent comme CNI ou Identité ; sinon propose Identité avec requiresCreation true.",
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
      required: ["dateToken", "subject", "target", "targetKind", "documentType", "issuer", "detail"],
      properties: {
        dateToken: createFieldSchema(),
        subject: createFieldSchema(),
        target: createFieldSchema(),
        targetKind: createFieldSchema(),
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
    maxItems: 3,
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
        role: { type: "string" },
        exists: { type: "boolean" },
        requiresCreation: { type: "boolean" }
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
