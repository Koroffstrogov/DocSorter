import type { Result, SupportedDocumentExtension } from "../documents/documentDiscovery";

export type PreviewKind = "image" | "pdf";

export interface PreviewData {
  kind: PreviewKind;
  filePath: string;
  extension: SupportedDocumentExtension;
  mimeType: string;
  bytes: ArrayBuffer;
}

export type PreviewDataResult = Result<PreviewData>;
