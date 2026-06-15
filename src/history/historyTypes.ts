export type ActionJournalAction = "classify" | "undo-classify";
export type ActionJournalStatus = "started" | "completed" | "failed";

export interface ActionJournalEntry {
  id: string;
  timestamp: string;
  action: ActionJournalAction;
  status: ActionJournalStatus;
  originalActionId?: string;
  oldPath?: string;
  newPath?: string;
  oldName?: string;
  newName?: string;
  restoredPath?: string;
  classifiedPath?: string;
  sourceHashSha256?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface UndoableClassificationAction {
  id: string;
  completedAt: string;
  originalPath: string;
  classifiedPath: string;
  originalName: string;
  classifiedName: string;
  sourceHashSha256?: string;
}
