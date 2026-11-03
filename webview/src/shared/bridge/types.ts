export interface RequestMessage {
  type: "request";
  id: string;
  command: string;
  params: Record<string, unknown>;
}

export interface ResponseMessage {
  type: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: { code: string; message: string };
}

export interface EventMessage {
  type: "event";
  event: EventType;
  data: unknown;
}

export type Message = RequestMessage | ResponseMessage | EventMessage;

export type CommandType =
  | "acceptOurs"
  | "acceptTheirs"
  | "addRemote"
  | "addWorktree"
  | "amendCommit"
  | "cancelCommitMessage"
  | "checkoutAndRebase"
  | "checkoutBranch"
  | "checkoutCommit"
  | "checkoutTag"
  | "cherryPick"
  | "cherryPickAction"
  | "cherryPickFileChanges"
  | "chooseAiModel"
  | "closeMergeEditor"
  | "closePushPanel"
  | "closeRollbackPanel"
  | "commitAndPush"
  | "commitChanges"
  | "compareWithCurrent"
  | "compareWithLocal"
  | "confirmCancelMerge"
  | "copyShelfPatchToClipboard"
  | "copyToClipboard"
  | "createBranch"
  | "createBranchFromCommit"
  | "createBranchPrompt"
  | "createPatchFromCommit"
  | "createPatchFromShelf"
  | "createTag"
  | "deleteBranch"
  | "deleteBranchPrompt"
  | "deleteFiles"
  | "deleteIdeaShelf"
  | "deleteShelve"
  | "deleteTag"
  | "dropCommit"
  | "executePush"
  | "executeRollback"
  | "fetchAll"
  | "fetchBranch"
  | "generateCommitMessage"
  | "getAheadCommits"
  | "getAmendMessage"
  | "getBranches"
  | "getCherryPickState"
  | "getCommitFiles"
  | "getCommitRangeFiles"
  | "getConflictFiles"
  | "getDiff"
  | "getFileContent"
  | "getFileVersions"
  | "getGraphData"
  | "getIdeaShelves"
  | "getLog"
  | "getMergeState"
  | "getRebaseState"
  | "getRecentCommitMessages"
  | "getRemoteBranches"
  | "getRemoteUrls"
  | "getShelves"
  | "getStatus"
  | "getTags"
  | "getWorkingTreeChanges"
  | "getWorkspaceRoot"
  | "getWorktrees"
  | "ideaShelveChanges"
  | "ideaUnshelveChanges"
  | "importPatchFromClipboard"
  | "importPatches"
  | "loadMoreLog"
  | "mergeAction"
  | "mergeBranch"
  | "mergeTag"
  | "navigateToHead"
  | "openConflictsPanel"
  | "openDiffEditor"
  | "openFile"
  | "openFileAtRevision"
  | "openMergeEditor"
  | "openPushPanel"
  | "openRollbackPanel"
  | "openWorktree"
  | "pickFolder"
  | "pruneWorktrees"
  | "pullBranch"
  | "pullMerge"
  | "pullRebase"
  | "pushAllUpToHere"
  | "pushBranch"
  | "pushTag"
  | "rebaseAction"
  | "rebaseBranch"
  | "refreshGitState"
  | "removeRemote"
  | "removeWorktree"
  | "renameBranch"
  | "renameRemote"
  | "resetToCommit"
  | "revealInSystemExplorer"
  | "revertCommit"
  | "revertFileChanges"
  | "rollbackFile"
  | "rollbackFiles"
  | "saveMergedContent"
  | "setContext"
  | "setRemoteUrl"
  | "setSingleClickAction"
  | "shelveChanges"
  | "showConfirmMessage"
  | "showDiffForWorkingFile"
  | "showErrorNotification"
  | "showHeadDiff"
  | "showIdeaShelfFileDiff"
  | "showInfoNotification"
  | "showInputBox"
  | "showMyBranches"
  | "showQuickPick"
  | "showRepositoryAtRevision"
  | "showShelfFileDiff"
  | "showTagDiff"
  | "showWarningMessage"
  | "stageAll"
  | "stageFile"
  | "toggleBranchGroupByDirectory"
  | "toggleFavorite"
  | "toggleShowTags"
  | "undoCommit"
  | "unshelveChanges"
  | "unshelveFile"
  | "unstageAll"
  | "unstageFile";

export type EventType =
  | "gitStateChanged"
  | "mergeStateChanged"
  | "themeChanged"
  | "showFileHistory"
  | "operationStart"
  | "operationEnd"
  | "commitStateChanged"
  | "rollbackPanelInit"
  | "focusCommitInGraph"
  | "jumpToSourceRequested"
  | "showDiffRequested"
  | "stageFileRequested"
  | "rollbackFileRequested"
  | "deleteFileRequested"
  | "unshelveChangesRequested"
  | "toggleGroupByDirectoryRequested"
  | "aiCommitMessageDelta";

export interface Bridge {
  /**
   * `command` is the closed `CommandType` union — do NOT widen it to `string`.
   * The union is the only thing that catches a renamed/typo'd command at
   * compile time; widening it silently turns every bridge call into a
   * runtime "Unknown command" failure.
   */
  request(
    command: CommandType,
    params?: Record<string, unknown>,
  ): Promise<unknown>;
  onEvent(handler: (event: EventType, data: unknown) => void): () => void;
}
