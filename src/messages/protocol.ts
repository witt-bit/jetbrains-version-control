export interface RequestMessage {
  type: "request";
  id: string;
  command: CommandType;
  params: Record<string, unknown>;
}

export interface ResponseMessage {
  type: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: {
    code: ErrorCode;
    message: string;
  };
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
  /** data: { hash: string } — jump the Git Log graph to a specific commit */
  | "focusCommitInGraph"
  /** Open the highlighted Commit-panel file in an editor (host → webview) */
  | "jumpToSourceRequested"
  /** Show diff for the highlighted Commit-panel file (host → webview) */
  | "showDiffRequested"
  /** Stage the highlighted Commit-panel file (host → webview) */
  | "stageFileRequested"
  /** Rollback the highlighted Commit-panel file (host → webview) */
  | "rollbackFileRequested"
  /** Delete the highlighted Commit-panel file(s) (host → webview) */
  | "deleteFileRequested"
  /** Unshelve the highlighted shelf entry (host → webview) */
  | "unshelveChangesRequested"
  /** Toggle group-by-directory (host → webview) */
  | "toggleGroupByDirectoryRequested"
  /** data: { text: string } — a streamed chunk of the AI commit message */
  | "aiCommitMessageDelta";

export interface RemoteBranchGroup {
  remote: string;
  branches: string[];
}

export enum ErrorCode {
  GIT_NOT_FOUND = "GIT_NOT_FOUND",
  GIT_COMMAND_FAILED = "GIT_COMMAND_FAILED",
  NOT_A_GIT_REPO = "NOT_A_GIT_REPO",
  INVALID_REF = "INVALID_REF",
  FILE_NOT_FOUND = "FILE_NOT_FOUND",
  MERGE_CONFLICT = "MERGE_CONFLICT",
  UNKNOWN = "UNKNOWN",
}
