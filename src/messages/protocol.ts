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
  | "chooseGpgKey"
  | "cleanUpBranches"
  | "clearStashes"
  | "cloneRepository"
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
  | "createChangelist"
  | "createPatchFromCommit"
  | "createPatchFromShelf"
  | "createTag"
  | "deleteBranch"
  | "deleteBranchPrompt"
  | "deleteChangelist"
  | "deleteFiles"
  | "deleteIdeaShelf"
  | "deleteShelve"
  | "deleteTag"
  | "dropCommit"
  | "executePush"
  | "executeRollback"
  | "fetchAll"
  | "fetchBranch"
  | "fixupCommit"
  | "generateCommitMessage"
  | "getAheadCommits"
  | "getAmendMessage"
  | "getBranches"
  | "getChangelists"
  | "getCherryPickState"
  | "getCommitFiles"
  | "getCommitOptions"
  | "getCommitRangeFiles"
  | "getConflictFiles"
  | "getDiff"
  | "getFileContent"
  | "getFileVersions"
  | "getChangesViewFiles"
  | "getGraphData"
  | "getIdeaShelves"
  | "getLog"
  | "getMergeState"
  | "getNotCherryPickedCommits"
  | "getProtectedBranches"
  | "getRebaseCommits"
  | "getRebaseState"
  | "getRecentCommitMessages"
  | "getRemoteBranches"
  | "getRemoteUrls"
  | "getShelves"
  | "getStatus"
  | "getTags"
  | "getWorkingTreeChanges"
  | "getWorkspaceRoot"
  | "getWorktreeIncludeState"
  | "getWorktrees"
  | "ideaShelveChanges"
  | "ideaUnshelveChanges"
  | "importPatchFromClipboard"
  | "importPatches"
  | "interactiveRebase"
  | "isShallowRepository"
  | "loadMoreLog"
  | "lockWorktree"
  | "mergeAction"
  | "mergeBranch"
  | "mergeTag"
  | "moveToChangelist"
  | "navigateToHead"
  | "openConflictsPanel"
  | "openDiffEditor"
  | "openFile"
  | "openFileAtRevision"
  | "openMergeEditor"
  | "openPushPanel"
  | "openRollbackPanel"
  | "openWorktree"
  | "openWorktreeIncludeFile"
  | "pickFile"
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
  | "renameChangelist"
  | "renameRemote"
  | "resetToCommit"
  | "resolveLogRef"
  | "revealInSystemExplorer"
  | "revertCommit"
  | "revertFileChanges"
  | "rewordCommit"
  | "rollbackFile"
  | "rollbackFiles"
  | "saveMergedContent"
  | "setActiveChangelist"
  | "setCommitOption"
  | "setContext"
  | "setRemoteUrl"
  | "setPanelDialogOpen"
  | "setSingleClickAction"
  | "setUpstreamPrompt"
  | "shelveChanges"
  | "closeChangesView"
  | "showChangesView"
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
  | "showSparseCheckout"
  | "showSubmodules"
  | "showTagDiff"
  | "showWarningMessage"
  | "squashCommit"
  | "stageAll"
  | "stageFile"
  | "stashChanges"
  | "toggleBranchGroupByDirectory"
  | "toggleFavorite"
  | "toggleShowTags"
  | "undoCommit"
  | "unlockWorktree"
  | "unsetUpstream"
  | "unshallowRepository"
  | "unshelveChanges"
  | "unshelveFile"
  | "unstageAll"
  | "unstageFile"
  | "unstashAsBranch";

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
