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
  | "analyzing"
  | "unloading"
  | "suggestion-ready"
  | "error";
type AiConnectionStatus = "disabled" | "ok" | "model-missing" | "error" | "timeout";
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

interface NamingState {
  draft: NamingDraft;
  proposal: ProposedFilename | null;
  overrideFilename: string | null;
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
type NamingSuggestionStatus = "idle" | "ready" | "empty";

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
  cachedSuggestions?: NamingSuggestions | null;
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

interface NamingSuggestionDocumentState {
  status: NamingSuggestionStatus;
  suggestions: NamingSuggestions | null;
  message: string;
}

interface NamingSuggestionsState {
  byDocumentPath: Record<string, NamingSuggestionDocumentState>;
}

type SuggestionV2Status = "idle" | "loading" | "ready" | "error";
type SuggestionV2DiagnosticStatus = "idle" | "running" | "ready" | "error";
type SuggestionV2MissingField = "dateToken" | "target" | "documentType";
type SuggestionV2TextSource = "pdf-native" | "tesseract-cli";

interface RendererSuggestionV2TextContext {
  source: SuggestionV2TextSource;
  excerpt: string;
}

interface RendererSuggestionDraftV2 {
  dateToken?: string;
  target?: string;
  documentType?: string;
  issuer?: string;
  detail?: string;
  proposedName?: string;
  dateSelection?: unknown;
  semanticDeduplication?: {
    changed: boolean;
    removedTerms: string[];
    before: {
      issuer?: string;
      detail?: string;
    };
    after: {
      issuer?: string;
      detail?: string;
    };
    reasons: string[];
  };
  confidence: number;
  reasons: string[];
  warnings: string[];
  source: Record<string, string | undefined>;
  namingMessages: Array<{
    level: "error" | "warning" | "info";
    code: string;
    field?: string;
    message: string;
  }>;
}

interface RendererFolderDepthOption {
  label: "court" | "equilibre" | "detaille";
  relativePath: string;
  depth: number;
  recommended: boolean;
  confidence: number;
  reasons: string[];
  warnings: string[];
  requiresCreation?: boolean;
  source: "rules-v2" | "existing-folder" | "preference" | "fallback";
}

interface RendererTargetFolderSuggestionV2 {
  recommended?: RendererFolderDepthOption;
  options: RendererFolderDepthOption[];
  warnings: string[];
  reasons: string[];
}

interface RendererSuggestionV2FolderPlacement {
  relativePath: string;
  score: number;
  confidence: number;
  exists: boolean;
  source: "inventory" | "fallback";
  reasons: string[];
  warnings: string[];
}

interface RendererSuggestionV2FolderNamingProfile {
  status: "detected" | "not-detected";
  conventionExample?: string;
  confidence: number;
  analyzedFileCount: number;
  v2FileCount: number;
  reasons: string[];
  warnings: string[];
  dominantDatePrecision?: "day" | "month" | "year" | "unknown";
  dominantTarget?: string;
  dominantDocumentType?: string;
  dominantIssuer?: string;
}

interface RendererSuggestionV2DocumentSuggestion {
  status: "ready";
  documentName: string;
  extension: string;
  draft: RendererSuggestionDraftV2;
  targetFolderSuggestion: RendererTargetFolderSuggestionV2;
  folderPlacement: RendererSuggestionV2FolderPlacement | null;
  folderPlacementCandidates: RendererSuggestionV2FolderPlacement[];
  folderNamingProfile: RendererSuggestionV2FolderNamingProfile | null;
  missingFields: SuggestionV2MissingField[];
  referenceDataWarnings: string[];
  builtAt: string;
  message: string;
}

interface RendererSuggestionV2Error {
  code: string;
  message: string;
}

interface RendererSuggestionV2DiagnosticResult {
  mode: "diagnosticComplet" | "diagnosticExpurge";
  diagnosticKind: "suggestions" | "ai";
  diagnosticPath: string;
  documentName: string;
  message: string;
}

interface SuggestionV2DocumentState {
  status: SuggestionV2Status;
  result: RendererSuggestionV2DocumentSuggestion | null;
  error: RendererSuggestionV2Error | null;
  diagnosticStatus: SuggestionV2DiagnosticStatus;
  diagnosticResult: RendererSuggestionV2DiagnosticResult | null;
  diagnosticError: RendererSuggestionV2Error | null;
}

interface SuggestionV2State {
  byDocumentPath: Record<string, SuggestionV2DocumentState>;
}

type RendererUserRulesFileStatus = "loaded" | "created" | "invalid" | "read-error";
type NamingRulesPanelStatus = "loading" | "ready" | "saving" | "error";

interface RendererUserRulesError {
  code: string;
  message: string;
}

interface RendererNamingRulesStatus {
  status: RendererUserRulesFileStatus;
  message: string;
  userRulesPath: string;
  userCatalog: NamingSuggestionRulesCatalog;
  mergedCatalog: NamingSuggestionRulesCatalog;
  defaultRuleCount: number;
  userRuleCount: number;
  warning: RendererUserRulesError | null;
}

interface UserRuleEditingTarget {
  category: UserRuleEditorCategory;
  index: number;
}

interface NamingRulesState {
  panelStatus: NamingRulesPanelStatus;
  panelOpen: boolean;
  userRulesPath: string;
  userCatalog: NamingSuggestionRulesCatalog;
  mergedCatalog: NamingSuggestionRulesCatalog;
  defaultRuleCount: number;
  userRuleCount: number;
  message: string;
  warning: RendererUserRulesError | null;
  draft: UserRuleEditorDraft;
  editingTarget: UserRuleEditingTarget | null;
  draftErrors: string[];
  dirty: boolean;
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
}

interface RendererAiSettings {
  enabled: boolean;
  provider: "ollama";
  baseUrl: string;
  model: string;
  timeoutMs: number;
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
  baseUrl: string;
  model: string;
  timeoutMs: string;
}

interface RendererAiClassificationSuggestion {
  date?: string;
  documentType?: string;
  subject?: string;
  keywords: string[];
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
  suggestion: RendererAiClassificationSuggestion;
  promptCharacterCount: number;
  differsFromLocalRules: boolean;
  message: string;
}

interface RendererAiDocumentTextContext {
  source: "pdf-native" | "tesseract-cli";
  excerpt: string;
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
  destination: DestinationCheckState;
  classification: ClassificationState;
  lastUndoableAction: UndoableClassificationAction | null;
  history: HistoryState;
  duplicates: DuplicateAnalysisState;
  textExtraction: TextExtractionState;
  namingSuggestions: NamingSuggestionsState;
  suggestionV2: SuggestionV2State;
  namingRules: NamingRulesState;
  ocr: OcrState;
  ai: AiState;
  shortcutsHelpVisible: boolean;
}

interface RefreshOptions {
  preserveSelection: boolean;
  successMessage: string;
  preferredSelectionPath?: string;
}
