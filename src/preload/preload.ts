import { contextBridge, ipcRenderer } from "electron";

import type { PrepareClassificationPlanResult } from "../classification/classificationPlan";
import type { DocumentDiscoveryResult, Result } from "../documents/documentDiscovery";
import type { DestinationAvailabilityResult } from "../naming/destinationNameAvailability";
import type { NamingDraft, ProposedFilename } from "../naming/namingDraft";
import type { PreviewData } from "../preview/previewTypes";

interface DirectorySelection {
  path: string;
}

const api = {
  getVersion: (): Promise<string> => ipcRenderer.invoke("app:getVersion"),
  selectSourceDirectory: (): Promise<Result<DirectorySelection | null>> =>
    ipcRenderer.invoke("directory:selectSource"),
  selectTargetDirectory: (): Promise<Result<DirectorySelection | null>> =>
    ipcRenderer.invoke("directory:selectTarget"),
  refreshSourceDocuments: (): Promise<Result<DocumentDiscoveryResult>> =>
    ipcRenderer.invoke("documents:refreshSource"),
  getPreviewData: (documentPath: string): Promise<Result<PreviewData>> =>
    ipcRenderer.invoke("preview:getData", documentPath),
  createInitialNamingDraft: (originalName: string): Promise<NamingDraft> =>
    ipcRenderer.invoke("naming:createInitialDraft", originalName),
  buildNamingProposal: (
    draft: NamingDraft,
    originalExtension: string
  ): Promise<ProposedFilename> => ipcRenderer.invoke("naming:buildProposal", draft, originalExtension),
  checkDestinationAvailability: (
    proposedFilename: string
  ): Promise<DestinationAvailabilityResult> =>
    ipcRenderer.invoke("naming:checkDestinationAvailability", proposedFilename),
  prepareClassificationPlan: (
    documentPath: string,
    proposedFilename: string
  ): Promise<PrepareClassificationPlanResult> =>
    ipcRenderer.invoke("classification:preparePlan", documentPath, proposedFilename)
};

contextBridge.exposeInMainWorld("docSorter", api);

export type DocSorterApi = typeof api;
