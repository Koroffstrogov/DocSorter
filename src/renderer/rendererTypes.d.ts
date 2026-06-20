type SupportedDocumentExtension = ".pdf" | ".jpg" | ".jpeg" | ".png";
type PreviewKind = "image" | "pdf";
type PreviewStatus = "idle" | "loading" | "ready" | "error";
type NamingMessageLevel = "error" | "warning" | "info";
type ClassificationPanelStatus =
  | "idle"
  | "preparing"
  | "ready"
  | "blocked"
  | "executing"
  | "undoing"
  | "completed-warning"
  | "undo-warning";
type DestinationCheckStatus =
  | "idle"
  | "checking"
  | "available"
  | "collision"
  | "target-not-selected"
  | "invalid"
  | "error";
type TargetFolderStatus =
  | "idle"
  | "loading"
  | "ready"
  | "invalid"
  | "missing"
  | "creating"
  | "created"
  | "error";
type ClassificationPlanCheckStatus = "ok" | "blocking" | "not-run";
type DuplicateAnalysisStatus = "idle" | "analyzing" | "ready" | "error";
type OcrPanelStatus = "loading" | "ready" | "saving" | "testing" | "error";
type AiPanelStatus =
  | "loading"
  | "ready"
  | "saving"
  | "testing"
  | "preloading"
  | "analyzing"
  | "unloading"
  | "suggestion-ready"
  | "error";
type AiConnectionStatus = "disabled" | "not-tested" | "ok" | "model-missing" | "error" | "timeout";
type AiModelProfileId = "gemma3-4b" | "gemma4-12b-nothink" | "gemma4-12b-thinking";
type UiDisplayMode = "simple" | "advanced";
type AiModelLifecycleStatus =
  | "unavailable"
  | "model_missing"
  | "idle"
  | "loading"
  | "ready"
  | "error";

interface AppError {
  code:
    | "SOURCE_NOT_SELECTED"
    | "DIRECTORY_NOT_FOUND"
    | "DIRECTORY_ACCESS_DENIED"
    | "DIRECTORY_UNAVAILABLE"
    | "FILE_NOT_FOUND"
    | "FILE_ACCESS_DENIED"
    | "FILE_UNAVAILABLE"
    | "UNSUPPORTED_FILE_TYPE"
    | "PREVIEW_NOT_ALLOWED"
    | "PREVIEW_FILE_TOO_LARGE"
    | "UNKNOWN_ERROR";
  message: string;
}

interface DocumentItem {
  name: string;
  filePath: string;
  extension: SupportedDocumentExtension;
  sizeBytes: number;
  sizeLabel: string;
  modifiedAt: string;
  status: "pending" | "missing";
}

interface RendererPreviewData {
  kind: PreviewKind;
  filePath: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  bytes: ArrayBuffer;
}

interface NamingDraft {
  documentDate: string;
  subject: string;
  documentType: string;
  keywords: string;
}

type NamingFieldOrigin =
  | "manual"
  | "reference-data"
  | "date-engine"
  | "folder-inventory"
  | "legacy-filename"
  | "fallback"
  | "rule"
  | "ai-v2";

interface NamingDraftOrigins {
  documentDate: NamingFieldOrigin;
  subject: NamingFieldOrigin;
  documentType: NamingFieldOrigin;
  keywords: NamingFieldOrigin;
}

interface NamingMessage {
  level: NamingMessageLevel;
  code: string;
  message: string;
}

interface ProposedFilename {
  proposedFilename: string;
  isValid: boolean;
  messages: NamingMessage[];
  normalizedDraft: NamingDraft;
}

type NamingOverrideFilenameOrigin = "folder-learning" | "destination-alternative";

interface NamingState {
  draft: NamingDraft;
  origins: NamingDraftOrigins;
  proposal: ProposedFilename | null;
  overrideFilename: string | null;
  overrideFilenameOrigin: NamingOverrideFilenameOrigin | null;
  isLoading: boolean;
}

interface DestinationAvailabilityError {
  code:
    | "TARGET_NOT_SELECTED"
    | "TARGET_NOT_FOUND"
    | "TARGET_NOT_DIRECTORY"
    | "TARGET_ACCESS_DENIED"
    | "TARGET_NOT_WRITABLE"
    | "TARGET_FOLDER_INVALID"
    | "TARGET_FOLDER_NOT_FOUND"
    | "TARGET_FOLDER_NOT_DIRECTORY"
    | "INVALID_FILENAME"
    | "TOO_MANY_COLLISIONS"
    | "UNKNOWN_ERROR";
  message: string;
}

interface DestinationAvailability {
  status: "available" | "collision";
  targetRootPath: string;
  targetFolder: string;
  targetPath: string;
  proposedFilename: string;
  finalFilename: string;
  finalPath: string;
  alternativeFilename: string | null;
  message: string;
}

interface DestinationCheckState {
  status: DestinationCheckStatus;
  result: DestinationAvailability | null;
  error: DestinationAvailabilityError | null;
  checkedFilename: string;
}

interface TargetFolderState {
  selectedFolder: string;
  folders: string[];
  status: TargetFolderStatus;
  message: string;
  origin: NamingFieldOrigin;
}

type FolderLearningStatus = "idle" | "loading" | "ready" | "error";
type FolderLearningProfileStatus = "none" | "weak" | "medium" | "strong";
type FolderLearningDatePrecision = "day" | "month" | "year" | "mixed";
type FolderLearningDetailUsage = "never" | "sometimes" | "often";
type FolderLearningRecommendation = "keep-ai" | "prefer-folder-profile" | "manual-review";
type FolderLearningPipelineStepId =
  | "content-ai-analysis"
  | "folder-candidate"
  | "folder-name-scan"
  | "folder-schema-analysis"
  | "aligned-name-proposal";

type AiDiagnosticPipelineStepId =
  | "content-ai-analysis"
  | "candidate-validation"
  | "folder-candidate"
  | "folder-name-scan"
  | "folder-schema-analysis"
  | "aligned-name-proposal"
  | "user-name-choice"
  | "classification-readiness";

type AiDiagnosticPipelineStatus = "ok" | "skipped" | "blocked" | "warning";

interface FolderLearningNameEntry {
  name: string;
  isFile: boolean;
}

interface FolderLearningNameList {
  targetFolder: string;
  entries: FolderLearningNameEntry[];
  preference?: FolderLearningPreference;
  truncated: boolean;
  entryLimit: number;
  warnings: string[];
}

interface FolderLearningPreference {
  folderRelativePath: string;
  preferredSchema?: string;
  preferredDatePrecision?: "day" | "month" | "year";
  preferredTarget?: string;
  preferredDocumentType?: string;
  preferredIssuer?: string;
  detailUsage?: FolderLearningDetailUsage;
  confirmedCount: number;
  lastConfirmedAt: string;
}

interface FolderLearningProfile {
  status: FolderLearningProfileStatus;
  analyzedFileCount: number;
  recognizedFileCount: number;
  dominantPattern?: string;
  dominantBlockCount?: number;
  dominantBlocks?: string[];
  dominantDatePrecision?: FolderLearningDatePrecision;
  dominantTarget?: string;
  dominantDocumentType?: string;
  dominantIssuer?: string;
  detailUsage?: FolderLearningDetailUsage;
  localPreference?: FolderLearningPreference;
  examples: string[];
  reasons: string[];
  warnings: string[];
}

interface FolderLearningComparison {
  aiName: string;
  alignedName?: string;
  detectedPattern?: string;
  recommendation: FolderLearningRecommendation;
  confidence: number;
  appliedChanges: string[];
  reasons: string[];
  warnings: string[];
}

interface FolderLearningPipelineStep {
  id: FolderLearningPipelineStepId;
  status: "ready" | "warning" | "blocked";
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  output: unknown;
  warnings: string[];
  blockingReason?: string;
}

interface AiDiagnosticPipelineStep {
  id: AiDiagnosticPipelineStepId;
  status: AiDiagnosticPipelineStatus;
  inputs: Record<string, unknown>;
  variables: Record<string, unknown>;
  output: unknown;
  warnings: string[];
  blockingReason?: string;
}

interface FolderLearningAnalysis {
  profile: FolderLearningProfile;
  comparison: FolderLearningComparison | null;
  pipeline: FolderLearningPipelineStep[];
}

interface FolderLearningState {
  status: FolderLearningStatus;
  targetFolder: string;
  entries: FolderLearningNameEntry[];
  preference?: FolderLearningPreference;
  profile: FolderLearningProfile | null;
  comparison: FolderLearningComparison | null;
  pipeline: FolderLearningPipelineStep[];
  message: string;
  error: string;
  warnings: string[];
}

interface ClassificationPlanCheck {
  code: string;
  label: string;
  status: ClassificationPlanCheckStatus;
  message: string;
}

interface ClassificationPlan {
  status: "ready" | "blocked";
  sourcePath: string;
  currentName: string;
  targetRootPath: string;
  targetFolder: string;
  targetPath: string;
  proposedFilename: string;
  destinationPath: string;
  extension: string;
  sourceFileStatus: string;
  targetDirectoryStatus: string;
  collisionStatus: string;
  preparedAt: string;
  checks: ClassificationPlanCheck[];
  message: string;
  simulationOnly: true;
}

interface ClassificationPlanError {
  code: string;
  message: string;
}

interface UndoableClassificationAction {
  id: string;
  completedAt: string;
  originalPath: string;
  classifiedPath: string;
  originalName: string;
  classifiedName: string;
  sourceHashSha256: string;
}

interface ClassificationOperationError {
  code: string;
  message: string;
}

interface UndoClassificationError {
  code: string;
  message: string;
}

interface OperationJournalWarning {
  code: "CLASSIFIED_BUT_JOURNAL_INCOMPLETE" | "UNDO_COMPLETED_BUT_JOURNAL_INCOMPLETE";
  message: string;
}

interface ActionJournalEntry {
  id: string;
  timestamp: string;
  action: "classify" | "undo-classify";
  status: "started" | "completed" | "failed";
  originalActionId?: string;
  oldPath?: string;
  newPath?: string;
  oldName?: string;
  newName?: string;
  restoredPath?: string;
  classifiedPath?: string;
  errorCode?: string;
  errorMessage?: string;
}

interface DuplicateFileReference {
  filePath: string;
  name: string;
}

interface SourceQueueDuplicateMatch {
  type: "source-queue";
  hash: string;
  files: DuplicateFileReference[];
  reliable: true;
}

interface HistoryDuplicateMatch {
  type: "history";
  hash: string;
  sourceFile: DuplicateFileReference;
  historyFile: DuplicateFileReference & {
    originalName: string;
    classifiedName: string;
    actionId: string;
  };
  reliable: true;
}

type ExactDuplicateMatch = SourceQueueDuplicateMatch | HistoryDuplicateMatch;

interface ExactDuplicateFileError {
  filePath: string;
  name: string;
  code: "FILE_NOT_FOUND" | "FILE_HASH_FAILED";
  message: string;
}

interface ExactDuplicateAnalysis {
  analyzedAt: string;
  sourceFileCount: number;
  hashedSourceFileCount: number;
  matches: ExactDuplicateMatch[];
  fileErrors: ExactDuplicateFileError[];
  ignoredHistoryCount: number;
}

interface DuplicateAnalysisState {
  status: DuplicateAnalysisStatus;
  matches: ExactDuplicateMatch[];
  fileErrors: ExactDuplicateFileError[];
  ignoredFilePaths: string[];
  errorMessage: string;
  analyzedAt: string;
}

type TextExtractionStatus = "idle" | "extracting" | "text-found" | "empty" | "error";

interface PdfTextExtraction {
  status: "text-found" | "empty";
  source?: "pdf-native" | "tesseract-cli";
  pageCount?: number;
  pagesAnalyzed?: number;
  language?: string;
  psm?: number;
  text?: string;
  characterCount: number;
  excerpt: string;
  excerptCharacterCount: number;
  truncated: boolean;
  durationMs?: number;
  extractedAt: string;
  fromCache?: boolean;
  warnings?: string[];
}

interface PdfTextExtractionError {
  code:
    | "DOCUMENT_NOT_SELECTED"
    | "DOCUMENT_NOT_IN_QUEUE"
    | "DOCUMENT_NOT_FOUND"
    | "DOCUMENT_NOT_PDF"
    | "PDF_TOO_LARGE_FOR_TEXT_EXTRACTION"
    | "PDF_TEXT_EMPTY"
    | "PDF_PROTECTED_OR_UNREADABLE"
    | "PDF_EXTRACTION_FAILED"
    | "OCR_ENGINE_NOT_CONFIGURED"
    | "OCR_ENGINE_NOT_FOUND"
    | "OCR_LANGUAGE_DATA_MISSING"
    | "OCR_INPUT_NOT_SUPPORTED"
    | "OCR_INPUT_NOT_FOUND"
    | "OCR_INPUT_TOO_LARGE"
    | "OCR_TIMEOUT"
    | "OCR_PROCESS_FAILED"
    | "OCR_TEXT_EMPTY"
    | "OCR_CACHE_READ_FAILED"
    | "OCR_CACHE_WRITE_FAILED"
    | "UNKNOWN_ERROR";
  message: string;
}

interface TextExtractionDocumentState {
  status: TextExtractionStatus;
  result: PdfTextExtraction | null;
  error: PdfTextExtractionError | null;
}

interface TextExtractionState {
  byDocumentPath: Record<string, TextExtractionDocumentState>;
}

interface RendererOcrError {
  code:
    | "OCR_ENGINE_NOT_CONFIGURED"
    | "OCR_ENGINE_NOT_FOUND"
    | "OCR_TESSDATA_NOT_FOUND"
    | "OCR_LANGUAGE_DATA_MISSING"
    | "OCR_VERSION_FAILED"
    | "OCR_LIST_LANGS_FAILED"
    | "OCR_PROCESS_TIMEOUT"
    | "OCR_INPUT_NOT_SUPPORTED"
    | "OCR_INPUT_NOT_FOUND"
    | "OCR_INPUT_TOO_LARGE"
    | "OCR_TIMEOUT"
    | "OCR_PROCESS_FAILED"
    | "OCR_TEXT_EMPTY"
    | "OCR_CACHE_READ_FAILED"
    | "OCR_CACHE_WRITE_FAILED"
    | "OCR_CONFIG_READ_FAILED"
    | "OCR_CONFIG_WRITE_FAILED"
    | "UNKNOWN_ERROR";
  message: string;
}

interface RendererOcrSettings {
  tesseractPath: string;
  tessdataPath: string;
  language: string;
  psm: number;
  lastTestedAt: string | null;
  detectedVersion: string | null;
}

interface RendererOcrStatus {
  status: "not-configured" | "configured" | "error";
  settingsPath: string;
  settings: RendererOcrSettings;
  tesseractPath: string;
  tessdataPath: string;
  language: string;
  psm: number;
  detectedVersion: string | null;
  lastTestedAt: string | null;
  availableLanguages: string[];
  missingLanguages: string[];
  message: string;
  error: RendererOcrError | null;
}

interface OcrSettingsDraft {
  tesseractPath: string;
  tessdataPath: string;
  language: string;
  psm: string;
}

interface OcrState {
  panelStatus: OcrPanelStatus;
  status: RendererOcrStatus | null;
  draft: OcrSettingsDraft;
  message: string;
  error: RendererOcrError | null;
  dirty: boolean;
}

interface RendererAiError {
  code:
    | "AI_URL_NOT_LOCAL"
    | "AI_PROVIDER_DISABLED"
    | "AI_CONFIG_INVALID"
    | "AI_CONFIG_READ_FAILED"
    | "AI_CONFIG_WRITE_FAILED"
    | "AI_CONNECTION_TIMEOUT"
    | "AI_CONNECTION_FAILED"
    | "AI_VERSION_FAILED"
    | "AI_MODEL_NOT_FOUND"
    | "AI_DOCUMENT_NOT_SELECTED"
    | "AI_DOCUMENT_NOT_IN_QUEUE"
    | "AI_DOCUMENT_NOT_FOUND"
    | "AI_TEXT_NOT_AVAILABLE"
    | "AI_OUTPUT_INVALID"
    | "UNKNOWN_ERROR";
  message: string;
  field?: string;
  validationErrors?: Array<{
    field?: string;
    rawValue?: string;
    normalizedValue?: string;
    reason: string;
  }>;
}

interface RendererAiSettings {
  enabled: boolean;
  provider: "ollama";
  baseUrl: string;
  profileId: AiModelProfileId;
  model: string;
  think: boolean;
  timeoutMs: number;
  keepAlive: string;
  lastTestAt: string | null;
  lastStatus: AiConnectionStatus | null;
  lastError: string | null;
}

interface RendererAiStatus {
  settingsPath: string;
  settings: RendererAiSettings;
  status: AiConnectionStatus;
  message: string;
  error: RendererAiError | null;
}

interface RendererAiModelStatus {
  status: AiModelLifecycleStatus;
  model: string;
  message: string;
  loadedAt: string | null;
  keepAliveUntil: string | null;
  lastCheckedAt: string | null;
  error: RendererAiError | null;
}

interface AiSettingsDraft {
  enabled: boolean;
  profileId: AiModelProfileId;
  baseUrl: string;
  model: string;
  timeoutMs: string;
  keepAlive: string;
}

interface RendererAiClassificationSuggestion {
  dateToken?: string;
  subject?: string;
  target?: string;
  documentType?: string;
  issuer?: string;
  detail?: string;
  proposedName?: string;
  targetFolder?: string;
  confidence: number;
  reasons: string[];
  warnings: string[];
  source: "simulated-ai" | "ollama";
}

interface RendererAiDocumentSuggestion {
  status: "ready";
  documentName: string;
  extension: string;
  model: string;
  suggestedAt: string;
  textSource: "pdf-native" | "tesseract-cli";
  modelStatus: RendererAiModelStatus;
  profile: {
    id: AiModelProfileId;
    label: string;
    model: string;
    think: boolean;
  };
  responseJson: unknown;
  folderLearningPipeline?: FolderLearningPipelineStep[];
  diagnosticPipeline?: AiDiagnosticPipelineStep[];
  thinking: string | null;
  suggestion: RendererAiClassificationSuggestion;
  promptCharacterCount: number;
  message: string;
}

interface RendererAiDocumentTextContext {
  source: "pdf-native" | "tesseract-cli";
  excerpt: string;
}

type AiSelectionFieldKey = "dateToken" | "subject" | "target" | "documentType" | "issuer" | "detail";

type AiSelectionFieldSource = "candidate" | "manual";

type AiSelectionFields = Record<AiSelectionFieldKey, string>;

type AiSelectionManualFields = Partial<Record<AiSelectionFieldKey, true>>;

interface AiSelectionPreviewMessage {
  level: "error" | "warning" | "info";
  message: string;
}

interface AiSelectionState {
  fields: AiSelectionFields;
  manualFields: AiSelectionManualFields;
  editingField: AiSelectionFieldKey | null;
  editingFolder: boolean;
  selectedFolder: string;
  previewFilename: string;
  previewFilenameValid: boolean;
  previewMessages: AiSelectionPreviewMessage[];
  previewDestinationFolder: string;
}

type AiPipelineStage =
  | "idle"
  | "connection"
  | "model-loading"
  | "text-extraction"
  | "analysis"
  | "completed"
  | "error";

interface AiPipelineTimingState {
  stage: AiPipelineStage;
  startedAtMs: number | null;
  elapsedMs: number;
  finalElapsedMs: number | null;
  lastLoadMs: number | null;
  lastAnalysisMs: number | null;
  lastGenerationMs: number | null;
  model: string;
  profileId: AiModelProfileId | null;
  think: boolean | null;
}

interface AiState {
  panelStatus: AiPanelStatus;
  status: RendererAiStatus | null;
  draft: AiSettingsDraft;
  message: string;
  error: RendererAiError | null;
  dirty: boolean;
  modelStatus: RendererAiModelStatus | null;
  suggestion: RendererAiDocumentSuggestion | null;
  suggestionDocumentPath: string | null;
  selection: AiSelectionState | null;
  timing: AiPipelineTimingState;
}

interface ClassificationState {
  status: ClassificationPanelStatus;
  plan: ClassificationPlan | null;
  error: ClassificationPlanError | ClassificationOperationError | UndoClassificationError | null;
  journalWarning: OperationJournalWarning | null;
}

interface HistoryState {
  entries: ActionJournalEntry[];
  isLoading: boolean;
  errorMessage: string;
}

interface PreviewState {
  status: PreviewStatus;
  data: RendererPreviewData | null;
  errorMessage: string;
  zoom: number;
  rotation: number;
  pdfPage: number;
  pdfPageCount: number;
  pdfFitZoom: number;
}

interface QueueUiState {
  query: string;
  filter: QueueViewFilter;
  sortKey: QueueViewSortKey;
  sortDirection: QueueViewSortDirection;
}

interface AppState {
  sourcePath: string | null;
  targetPath: string | null;
  documents: DocumentItem[];
  activeDocumentPath: string | null;
  queueMessage: string;
  queueView: QueueUiState;
  isLoading: boolean;
  preview: PreviewState;
  naming: NamingState;
  targetFolder: TargetFolderState;
  folderLearning: FolderLearningState;
  destination: DestinationCheckState;
  classification: ClassificationState;
  lastUndoableAction: UndoableClassificationAction | null;
  history: HistoryState;
  duplicates: DuplicateAnalysisState;
  textExtraction: TextExtractionState;
  ocr: OcrState;
  ai: AiState;
  shortcutsHelpVisible: boolean;
  uiMode: UiDisplayMode;
}

interface RefreshOptions {
  preserveSelection: boolean;
  successMessage: string;
  preferredSelectionPath?: string;
}
