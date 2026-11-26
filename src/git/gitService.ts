import { execFile } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import {
  type BlameOptions,
  blameFlags,
  DEFAULT_BLAME_OPTIONS,
} from "./blameOptions.ts";
import {
  filterDeletable,
  parseLocalBranchRefs,
  selectCleanupCandidates,
} from "./branchCleanup.ts";
import { parseRemoteBranchLines } from "./branchParsing.ts";
import { GitCache } from "./cache.ts";
import { CHANGELIST_FILE_NAME, ChangelistStore } from "./changelistStore.ts";
import { type CherryMarks, computeCherryMarks } from "./cherryMarks.ts";
import {
  type CherryPickOptions,
  type CherryPickOutcome,
  DEFAULT_CHERRY_PICK_OPTIONS,
  gitSupportsCherryPickEmpty,
  runCherryPick,
} from "./cherryPick.ts";
import { nonInteractiveGitEnv } from "./cloneRepo.ts";
import {
  type CommitWarning,
  type PendingFile,
  runCommitChecks,
} from "./commitChecks.ts";
import {
  buildCommitArgs,
  type CommitOptions,
  type CommitSettings,
  thresholdBytes,
} from "./commitSettings.ts";
import { buildFetchArgs, type FetchOptions } from "./fetchOptions.ts";
import {
  resolveUpdateMethod,
  type SaveChangesPolicy,
  type UpdateMethod,
} from "./gitSettings.ts";
import {
  explainSigningFailure,
  type GpgKey,
  listSecretKeys,
  resolveGpgProgram,
} from "./gpg.ts";
import { computeGraphLayout } from "./graphLayout.ts";
import {
  assertRevision,
  buildRebaseArgs,
  describeStop,
  findRebaseStop,
  gitErrorText,
  type InteractiveRebaseOptions,
  type InteractiveRebaseResult,
  matchEntriesToRange,
  type RebaseCommit,
  RebaseStoppedError,
  rebaseEnv,
  removeScratch,
  writeScratchTodo,
} from "./interactiveRebase.ts";
import {
  buildLogFilterArgs,
  danglingParents,
  describeLogError,
  hasHistoryFilter,
  LOG_LOCATE_SCAN_LIMIT,
  normalizeLogPath,
} from "./logFilter.ts";
import {
  parseDiffGitHeader,
  parseDiffNameStatus,
  splitStatusPaths,
  unquoteGitPath,
} from "./pathUtils.ts";
import { type PendingSelection, readPendingCommit } from "./pendingCommit.ts";
import { autosquashEntries, type RebaseEntry } from "./rebaseTodo.ts";
import {
  deepenRepository,
  isShallowRepository,
  unshallowRepository,
} from "./shallow.ts";
import {
  addSparseCheckout,
  disableSparseCheckout,
  enableSparseCheckout,
  type SparseCheckoutStatus,
  setSparseCheckout,
  sparseCheckoutStatus,
} from "./sparseCheckout.ts";
import {
  assertBranchName,
  assertStashRef,
  buildStashPushArgs,
  buildUnstashArgs,
  type StashPushOptions,
} from "./stash.ts";
import {
  listSubmodules,
  type SubmoduleInfo,
  syncSubmodules,
  updateSubmodules,
} from "./submodules.ts";
import type {
  BlameLine,
  BranchInfo,
  CherryPickState,
  CommitNode,
  DiffFile,
  FileStatus,
  GraphLayoutResult,
  IdeaShelfEntry,
  LaneSnapshot,
  LogOptions,
  MergeState,
  RefInfo,
  TagInfo,
  WorkingTreeFile,
  WorktreeInfo,
} from "./types";
import { WORKTREE_INCLUDE_FILE } from "./worktreeInclude.ts";

const execFileAsync = promisify(execFile);

/** Local changes set aside by a smart operation, and where to find them. */
export type SavedChanges =
  | { kind: "stash"; sha: string }
  | { kind: "shelf"; name: string };

// For parsing git output (actual null byte)
const FIELD_SEP = "\x00";
const RECORD_SEP = "\x00\x00\x01";
// For git log --format (pretty-format): %x00 produces null byte
const FMT_FIELD_SEP = "%x00";
const FMT_RECORD_SEP = "%x00%x00%x01";
// For git branch/tag --format (ref-format / for-each-ref): %00 produces null byte
const REF_FMT_FIELD_SEP = "%00";
const MAX_BUFFER = 10 * 1024 * 1024; // 10MB
const DEFAULT_LOG_PAGE_SIZE = 200;

/** Diff-status of a file -> the status the file list renders. */
function toWorkingTreeStatus(
  status: DiffFile["status"],
): WorkingTreeFile["status"] {
  switch (status) {
    case "added":
    case "copied":
      return "added";
    case "deleted":
      return "deleted";
    case "renamed":
      return "renamed";
    default:
      return "modified";
  }
}

const LOG_FORMAT = [
  "%H", // hash
  "%h", // shortHash
  "%P", // parents (space separated)
  "%aN", // authorName (mailmap resolved)
  "%aE", // authorEmail (mailmap resolved)
  "%aI", // authorDate ISO 8601
  "%s", // subject
  "%b", // body
  "%D", // refs
].join(FMT_FIELD_SEP);

export class GitService {
  readonly cache = new GitCache();

  private readonly cwd: string;
  private changelistStore: Promise<ChangelistStore> | undefined;

  constructor(cwd: string) {
    this.cwd = cwd;
  }

  /** The repository root every git command runs against. */
  get root(): string {
    return this.cwd;
  }

  /**
   * This worktree's changelists. The file sits in the git dir, so it stays out
   * of `git status` and a linked worktree has lists of its own.
   */
  changelists(): Promise<ChangelistStore> {
    this.changelistStore ??= this.execGit([
      "rev-parse",
      "--git-path",
      CHANGELIST_FILE_NAME,
    ]).then(
      (out) => new ChangelistStore(path.resolve(this.cwd, out.trim())),
      (error) => {
        // Do not cache a failure: the repository may be fixed later.
        this.changelistStore = undefined;
        throw error;
      },
    );
    return this.changelistStore;
  }

  private async execGit(
    args: string[],
    maxBuffer = MAX_BUFFER,
    env?: Record<string, string | undefined>,
  ): Promise<string> {
    // core.quotepath=false keeps non-ASCII paths raw instead of \NNN escaped.
    // Callers still unquote, because git quotes for other reasons too.
    const { stdout } = await execFileAsync(
      "git",
      ["-c", "core.quotepath=false", ...args],
      {
        cwd: this.cwd,
        maxBuffer,
        env: {
          ...process.env,
          LC_ALL: "C",
          GIT_TERMINAL_PROMPT: "0",
          ...env,
        },
      },
    );
    return stdout;
  }

  async checkGitAvailable(): Promise<boolean> {
    try {
      await this.execGit(["rev-parse", "--is-inside-work-tree"]);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Names of the configured remotes, cached like the branch list: `%D` in log
   * output only prefixes remote-tracking branches with these names, so this
   * set is what tells a `origin/main`-style remote ref apart from a local
   * branch that merely contains a slash.
   */
  private async getRemoteNames(): Promise<Set<string>> {
    const cacheKey = "remotes";
    const cached = this.cache.get<Set<string>>(cacheKey);
    if (cached) {
      return cached;
    }
    const output = await this.execGit(["remote"]).catch(() => "");
    const names = new Set(
      output
        .trim()
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
    );
    this.cache.set(cacheKey, names);
    return names;
  }

  async getLog(options: LogOptions = {}): Promise<CommitNode[]> {
    const cacheKey = `log:${JSON.stringify(options)}`;
    const cached = this.cache.get<CommitNode[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const args = [
      "log",
      `--format=${LOG_FORMAT}${FMT_RECORD_SEP}`,
      "--date-order",
      `--max-count=${options.maxCount || DEFAULT_LOG_PAGE_SIZE}`,
    ];
    if (options.skip) {
      args.push(`--skip=${options.skip}`);
    }
    args.push(...this.logSelectionArgs(options));

    const output = await this.execGit(args).catch((err) => {
      throw describeLogError(err);
    });
    const remoteNames = await this.getRemoteNames();
    const commits = parseLogOutput(output, remoteNames);
    this.cache.set(cacheKey, commits);
    return commits;
  }

  /**
   * Which commits `getLog` lists, without paging: filters, revision and path.
   * A path filter adds `--parents` so git rewrites each commit's parents to the
   * nearest commit that is still listed; without it `%P` keeps the real
   * parents and the graph would point at commits the path filter removed.
   */
  private logSelectionArgs(options: LogOptions): string[] {
    const args = buildLogFilterArgs(options);
    const file = normalizeLogPath(this.cwd, options.file);
    if (file) {
      args.push("--parents");
    }
    args.push(options.branch ? options.branch : "--all");
    if (file) {
      args.push("--", file);
    }
    return args;
  }

  async getGraphTopology(
    options: LogOptions = {},
    prevSnapshot?: LaneSnapshot,
  ): Promise<GraphLayoutResult> {
    const commits = await this.getLog(options);
    if (!hasHistoryFilter(options)) {
      return computeGraphLayout(commits, prevSnapshot);
    }
    const onLaterPages = await this.parentsOnLaterPages(options, commits);
    return computeGraphLayout(commits, prevSnapshot, true, onLaterPages);
  }

  /**
   * In a filtered log a parent missing from the page is either on a later page
   * (the lane must stay open) or removed by the filter (the lane ends). Only
   * the second case is a hidden parent, and git can tell them apart: the
   * `--no-walk` run applies the same commit filters to just those parents.
   */
  private async parentsOnLaterPages(
    options: LogOptions,
    commits: CommitNode[],
  ): Promise<Set<string>> {
    const dangling = danglingParents(commits);
    if (
      dangling.length === 0 ||
      commits.length < (options.maxCount || DEFAULT_LOG_PAGE_SIZE)
    ) {
      return new Set();
    }
    const commitFilters = buildLogFilterArgs(options);
    if (commitFilters.length === 0) {
      // Path filter only: `--parents` already rewrote them to listed commits.
      return new Set(dangling);
    }
    try {
      const output = await this.execGit([
        "log",
        "--no-walk=unsorted",
        "--format=%H",
        ...commitFilters,
        ...dangling,
      ]);
      return new Set(output.split("\n").filter(Boolean));
    } catch {
      return new Set();
    }
  }

  /**
   * Resolves what the user typed into Go To (hash prefix, branch, tag, any
   * revision) to the full hash of the commit it names.
   */
  async resolveLogRef(query: string): Promise<string> {
    const ref = query.trim();
    const unusable =
      ref === "" ||
      ref.startsWith("-") ||
      [...ref].some((char) => char.charCodeAt(0) < 32);
    if (!unusable) {
      try {
        const output = await this.execGit([
          "rev-parse",
          "--verify",
          "--quiet",
          `${ref}^{commit}`,
        ]);
        const hash = output.trim();
        if (hash) {
          return hash;
        }
      } catch (err) {
        const stderr = (err as { stderr?: unknown }).stderr;
        if (/ambiguous/i.test(String(stderr ?? ""))) {
          throw new Error(`"${ref}" is ambiguous, type more of the hash`);
        }
      }
    }
    throw new Error(`"${ref}" is not a known commit hash, branch or tag`);
  }

  /**
   * Position of `hash` in the list `getLog` pages through for `options`, or
   * null when the commit is not in it (filtered out, or deeper than
   * `LOG_LOCATE_SCAN_LIMIT`).
   */
  async findCommitIndex(
    options: LogOptions,
    hash: string,
  ): Promise<number | null> {
    const output = await this.execGit([
      "log",
      "--format=%H",
      "--date-order",
      `--max-count=${LOG_LOCATE_SCAN_LIMIT}`,
      ...this.logSelectionArgs(options),
    ]).catch((err) => {
      throw describeLogError(err);
    });
    const index = output.split("\n").indexOf(hash);
    return index === -1 ? null : index;
  }

  async getBranches(): Promise<BranchInfo[]> {
    const cacheKey = "branches";
    const cached = this.cache.get<BranchInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const localFormat = [
      "%(refname:short)",
      "%(HEAD)",
      "%(upstream:short)",
      "%(upstream:track,nobracket)",
      "%(objectname:short)",
    ].join(REF_FMT_FIELD_SEP);

    // Remote listing needs the FULL refname to detect the per-remote HEAD
    // symref: `%(refname:short)` resolves refs/remotes/origin/HEAD to just
    // "origin" (its symref target's remote prefix), which used to leak in
    // as a bogus branch named after the remote.
    const remoteFormat = `${localFormat}${REF_FMT_FIELD_SEP}%(refname)`;

    const localOutput = await this.execGit([
      "branch",
      `--format=${localFormat}`,
    ]);

    const remoteOutput = await this.execGit([
      "branch",
      "-r",
      `--format=${remoteFormat}`,
    ]).catch(() => "");

    const branches: BranchInfo[] = [];

    for (const line of localOutput.trim().split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const fields = line.split(FIELD_SEP);
      const name = fields[0]?.trim() ?? "";
      const isCurrent = fields[1]?.trim() === "*";
      const upstream = fields[2]?.trim() || undefined;
      const track = fields[3]?.trim() ?? "";
      const lastCommitHash = fields[4]?.trim() ?? "";

      const { ahead, behind } = parseTrack(track);

      branches.push({
        name,
        isRemote: false,
        isCurrent,
        upstream,
        ahead,
        behind,
        lastCommitHash,
      });
    }

    branches.push(...parseRemoteBranchLines(remoteOutput));

    this.cache.set(cacheKey, branches);
    return branches;
  }

  async getRemoteBranches(): Promise<{ remote: string; branches: string[] }[]> {
    // Get the actual configured remotes (not inferred from tracking branches)
    const remoteOutput = await this.execGit(["remote"]).catch(() => "");
    const configuredRemotes = new Set(
      remoteOutput
        .trim()
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean),
    );

    if (configuredRemotes.size === 0) {
      return [];
    }

    const allBranches = await this.getBranches();
    const remoteBranches = allBranches.filter((b) => b.isRemote);

    const groups = new Map<string, string[]>();
    for (const branch of remoteBranches) {
      const slashIdx = branch.name.indexOf("/");
      if (slashIdx === -1) continue;
      const remote = branch.name.substring(0, slashIdx);
      // Only include branches for remotes that still exist
      if (!configuredRemotes.has(remote)) continue;
      const branchName = branch.name.substring(slashIdx + 1);
      if (!groups.has(remote)) {
        groups.set(remote, []);
      }
      groups.get(remote)?.push(branchName);
    }

    // Ensure all configured remotes appear even if they have no tracking branches yet
    for (const remote of configuredRemotes) {
      if (!groups.has(remote)) {
        groups.set(remote, []);
      }
    }

    // Sort branches alphabetically within each group (case-insensitive)
    const result: { remote: string; branches: string[] }[] = [];
    for (const [remote, branchList] of groups) {
      branchList.sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );
      result.push({ remote, branches: branchList });
    }

    return result;
  }

  async getTags(): Promise<TagInfo[]> {
    const cacheKey = "tags";
    const cached = this.cache.get<TagInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }

    const tagFormat = [
      "%(refname:short)",
      "%(objectname:short)",
      "%(objecttype)",
      "%(contents:subject)",
    ].join(REF_FMT_FIELD_SEP);

    const output = await this.execGit([
      "tag",
      "-l",
      `--format=${tagFormat}`,
    ]).catch(() => "");

    const tags: TagInfo[] = [];
    for (const line of output.trim().split("\n")) {
      if (!line.trim()) {
        continue;
      }
      const fields = line.split(FIELD_SEP);
      tags.push({
        name: fields[0]?.trim() ?? "",
        hash: fields[1]?.trim() ?? "",
        isAnnotated: fields[2]?.trim() === "tag",
        message: fields[3]?.trim() || undefined,
      });
    }

    this.cache.set(cacheKey, tags);
    return tags;
  }

  async getDiff(ref1: string, ref2: string, file?: string): Promise<string> {
    const args = ["diff", ref1, ref2];
    if (file) {
      args.push("--", file);
    }
    return this.execGit(args);
  }

  /** Unified diff of one path's staged changes (index vs HEAD). */
  async getStagedFileDiff(filePath: string): Promise<string> {
    return this.execGit(["diff", "--cached", "--", filePath]);
  }

  /** Unified diff of one path's unstaged changes (worktree vs index). */
  async getUnstagedFileDiff(filePath: string): Promise<string> {
    return this.execGit(["diff", "--", filePath]);
  }

  /**
   * Unified patch of everything `branchName` has relative to `currentBranch`
   * (diff from their merge base), the content behind the branch sidebar's
   * "Compare with Current".
   */
  async getDiffBetweenBranches(
    currentBranch: string,
    branchName: string,
  ): Promise<string> {
    return this.execGit(["diff", `${currentBranch}...${branchName}`]);
  }

  async getFileContent(ref: string, filePath: string): Promise<string> {
    if (!ref) {
      return "";
    }
    try {
      return await this.execGit(["show", `${ref}:${filePath}`]);
    } catch {
      return "";
    }
  }

  async getFileContentBuffer(ref: string, filePath: string): Promise<Buffer> {
    if (!ref) {
      return Buffer.alloc(0);
    }
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["show", `${ref}:${filePath}`],
        {
          cwd: this.cwd,
          maxBuffer: MAX_BUFFER,
          encoding: "buffer",
          env: {
            ...process.env,
            LC_ALL: "C",
            GIT_TERMINAL_PROMPT: "0",
          },
        },
      );
      return stdout;
    } catch {
      return Buffer.alloc(0);
    }
  }

  /**
   * Files that differ between `ref` and the working tree — what "Show Diff with
   * Working Tree" means for a branch.
   *
   * Untracked files are included on purpose: `git diff <ref>` never lists them,
   * but a file that does not exist in `ref` is exactly the kind of difference
   * the caller is asking about.
   */
  async getChangesAgainstRef(ref: string): Promise<WorkingTreeFile[]> {
    const [trackedOutput, statusOutput] = await Promise.all([
      this.execGit(["diff", "--name-status", "-M", ref]),
      this.execGit(["status", "--porcelain=v1", "-uall"]),
    ]);

    const files: WorkingTreeFile[] = parseDiffNameStatus(trackedOutput).map(
      (file) => ({
        path: file.newPath,
        oldPath: file.oldPath === file.newPath ? undefined : file.oldPath,
        status: toWorkingTreeStatus(file.status),
        staged: false,
      }),
    );

    for (const line of statusOutput.split("\n")) {
      if (!line.startsWith("?? ")) continue;
      files.push({
        path: unquoteGitPath(line.substring(3)),
        status: "untracked",
        staged: false,
      });
    }

    return files;
  }

  async getCommitFiles(hash: string): Promise<DiffFile[]> {
    const output = await this.execGit([
      "diff-tree",
      "--root",
      "--no-commit-id",
      "-r",
      "--name-status",
      "-M",
      hash,
    ]);
    return parseDiffNameStatus(output);
  }

  async getCommitRangeFiles(hashes: string[]): Promise<DiffFile[]> {
    if (hashes.length === 0) return [];
    if (hashes.length === 1) return this.getCommitFiles(hashes[0]);

    // Cherry-pick style: get diff-tree for each commit individually, then merge
    const perCommitFiles = await Promise.all(
      hashes.map((h) => this.getCommitFiles(h)),
    );

    const merged = new Map<string, DiffFile>();
    for (const files of perCommitFiles) {
      for (const f of files) {
        const key = f.newPath || f.oldPath;
        if (!merged.has(key)) {
          merged.set(key, f);
        }
      }
    }
    return Array.from(merged.values());
  }

  async findFileRange(
    hashes: string[],
    filePath: string,
  ): Promise<{ oldest: string; newest: string } | null> {
    // From hashes (newest first), find commits that touch this file
    const touching: string[] = [];
    for (const h of hashes) {
      const files = await this.getCommitFiles(h);
      if (files.some((f) => f.newPath === filePath || f.oldPath === filePath)) {
        touching.push(h);
      }
    }
    if (touching.length === 0) return null;
    return { newest: touching[0], oldest: touching[touching.length - 1] };
  }

  /**
   * Blame the working tree copy of a file (line numbers match editor lines).
   * Not cached: output changes on every save/edit.
   */
  async blame(
    filePath: string,
    options: BlameOptions = DEFAULT_BLAME_OPTIONS,
  ): Promise<BlameLine[]> {
    const output = await this.execGit([
      "blame",
      "--porcelain",
      "-l", // full hash; we derive shortHash locally
      ...blameFlags(options),
      "--",
      filePath,
    ]);
    return parseBlamePorcelain(output);
  }

  /**
   * Blame a file as of `ref` (a commit-ish), for annotating virtual diff
   * sides whose content is `git show ref:path` — their line numbers match
   * that revision, not the working tree. Only real revisions work here: the
   * index (`:0`) and the empty placeholder have none, callers gate on that.
   */
  async blameAt(
    ref: string,
    filePath: string,
    options: BlameOptions = DEFAULT_BLAME_OPTIONS,
  ): Promise<BlameLine[]> {
    const output = await this.execGit([
      "blame",
      "--porcelain",
      "-l",
      ...blameFlags(options),
      ref,
      "--",
      filePath,
    ]);
    return parseBlamePorcelain(output);
  }

  async getStatus(options: { ignored?: boolean } = {}): Promise<FileStatus[]> {
    const args = ["status", "--porcelain=v1"];
    // `matching` keeps ignored-file listing cheap on repos with big ignored
    // directories (node_modules) compared to the traditional mode.
    if (options.ignored) {
      args.push("--ignored=matching");
    }
    const output = await this.execGit(args);
    const files: FileStatus[] = [];

    for (const line of output.split("\n")) {
      if (line.length < 4) {
        continue;
      }
      const indexStatus = line[0];
      const workTreeStatus = line[1];
      const rest = line.substring(3);

      const { path: filePath, oldPath } = splitStatusPaths(rest);
      files.push({
        path: filePath,
        oldPath,
        indexStatus,
        workTreeStatus,
      });
    }
    return files;
  }

  async getCommitParents(hash: string): Promise<string[]> {
    const output = await this.execGit(["rev-parse", `${hash}^@`]).catch(
      () => "",
    );
    return output
      .trim()
      .split("\n")
      .filter((s) => s.length > 0);
  }

  /**
   * Whether `hash` is an ancestor of (or equal to) `HEAD` — i.e. whether the
   * current branch's history contains it, which rebasing operations require.
   * `merge-base --is-ancestor` signals "not an ancestor" with exit code 1,
   * which resolves to `false`; anything else is a real error and throws.
   */
  async isAncestorOfHead(hash: string): Promise<boolean> {
    try {
      await this.execGit(["merge-base", "--is-ancestor", hash, "HEAD"]);
      return true;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 1) {
        return false;
      }
      throw err;
    }
  }

  async getMergeState(): Promise<MergeState> {
    try {
      const mergeHead = (
        await fs.readFile(path.join(this.cwd, ".git", "MERGE_HEAD"), "utf-8")
      ).trim();
      let mergeMsg = "";
      try {
        mergeMsg = (
          await fs.readFile(path.join(this.cwd, ".git", "MERGE_MSG"), "utf-8")
        ).trim();
      } catch {}
      return { isMerging: true, mergeHead, mergeMsg };
    } catch {
      return { isMerging: false };
    }
  }

  async getCherryPickState(): Promise<CherryPickState> {
    try {
      const cherryPickHead = (
        await fs.readFile(
          path.join(this.cwd, ".git", "CHERRY_PICK_HEAD"),
          "utf-8",
        )
      ).trim();
      return { isCherryPicking: true, cherryPickHead };
    } catch {
      return { isCherryPicking: false };
    }
  }

  /**
   * Stage only the paths still unmerged in the index, for `--continue` flows.
   * The old `git add -u` swept every modified tracked file — including edits
   * the user never meant to commit — into the continuation commit.
   */
  private async stageUnmerged(): Promise<void> {
    const output = await this.execGit([
      "diff",
      "--name-only",
      "--diff-filter=U",
    ]);
    const files = output.trim().split("\n").filter(Boolean).map(unquoteGitPath);
    if (files.length > 0) {
      await this.execGit(["add", "--", ...files]);
    }
  }

  async cherryPickAction(action: "continue" | "abort" | "skip"): Promise<void> {
    if (action === "continue") {
      // Stage the resolved files before continuing (like IntelliJ IDEA does)
      await this.stageUnmerged();
      // Use --allow-empty to handle the case where cherry-pick becomes empty after conflict resolution
      try {
        await this.execGit(["cherry-pick", "--continue"]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("allow-empty")) {
          await this.execGit(["commit", "--allow-empty", "--no-edit"]);
        } else {
          throw err;
        }
      }
    } else if (action === "skip") {
      await this.execGit(["cherry-pick", "--skip"]);
    } else {
      await this.execGit(["cherry-pick", "--abort"]);
    }
    this.invalidateCache();
  }

  async getRebaseState(): Promise<{
    isRebasing: boolean;
    branchName?: string;
    step?: number;
    totalSteps?: number;
  }> {
    const rebaseMergePath = path.join(this.cwd, ".git", "rebase-merge");
    const rebaseApplyPath = path.join(this.cwd, ".git", "rebase-apply");
    try {
      await fs.access(rebaseMergePath);
      let branchName = "";
      let step = 0;
      let totalSteps = 0;
      try {
        const headName = await fs.readFile(
          path.join(rebaseMergePath, "head-name"),
          "utf-8",
        );
        branchName = headName.trim().replace("refs/heads/", "");
      } catch {}
      try {
        const msgnum = await fs.readFile(
          path.join(rebaseMergePath, "msgnum"),
          "utf-8",
        );
        step = Number.parseInt(msgnum.trim(), 10);
      } catch {}
      try {
        const end = await fs.readFile(
          path.join(rebaseMergePath, "end"),
          "utf-8",
        );
        totalSteps = Number.parseInt(end.trim(), 10);
      } catch {}
      return { isRebasing: true, branchName, step, totalSteps };
    } catch {}
    try {
      await fs.access(rebaseApplyPath);
      let branchName = "";
      let step = 0;
      let totalSteps = 0;
      try {
        const headName = await fs.readFile(
          path.join(rebaseApplyPath, "head-name"),
          "utf-8",
        );
        branchName = headName.trim().replace("refs/heads/", "");
      } catch {}
      try {
        const next = await fs.readFile(
          path.join(rebaseApplyPath, "next"),
          "utf-8",
        );
        step = Number.parseInt(next.trim(), 10);
      } catch {}
      try {
        const last = await fs.readFile(
          path.join(rebaseApplyPath, "last"),
          "utf-8",
        );
        totalSteps = Number.parseInt(last.trim(), 10);
      } catch {}
      return { isRebasing: true, branchName, step, totalSteps };
    } catch {}
    return { isRebasing: false };
  }

  async getConflictFiles(): Promise<string[]> {
    const output = await this.execGit([
      "diff",
      "--name-only",
      "--diff-filter=U",
    ]);
    return output
      .trim()
      .split("\n")
      .filter((s) => s.length > 0)
      .map(unquoteGitPath);
  }

  async getFileVersions(
    filePath: string,
  ): Promise<{ base: string; ours: string; theirs: string }> {
    const [base, ours, theirs] = await Promise.all([
      this.getFileContent(":1", filePath),
      this.getFileContent(":2", filePath),
      this.getFileContent(":3", filePath),
    ]);
    return { base, ours, theirs };
  }

  async saveMergedContent(filePath: string, content: string): Promise<void> {
    await fs.writeFile(path.join(this.cwd, filePath), content, "utf-8");
  }

  async stageFile(filePath: string): Promise<void> {
    await this.execGit(["add", filePath]);
  }

  async acceptOurs(filePath: string): Promise<void> {
    await this.execGit(["checkout", "--ours", filePath]);
    await this.execGit(["add", filePath]);
  }

  async acceptTheirs(filePath: string): Promise<void> {
    await this.execGit(["checkout", "--theirs", filePath]);
    await this.execGit(["add", filePath]);
  }

  async checkout(branchName: string): Promise<void> {
    await this.execGit(["checkout", branchName]);
    this.invalidateCache();
  }

  /** `git checkout -f`: switch anyway, discarding tracked local changes. */
  async checkoutForced(ref: string): Promise<void> {
    await this.execGit(["checkout", "-f", ref]);
    this.invalidateCache();
  }

  /**
   * Create a branch and switch to it in one step, so a refused switch leaves
   * no half-created branch behind. `reset` overwrites an existing branch.
   */
  async checkoutNewBranch(
    name: string,
    startPoint: string,
    options: { reset?: boolean; discardChanges?: boolean } = {},
  ): Promise<void> {
    const args = ["checkout"];
    if (options.discardChanges) args.push("-f");
    args.push(options.reset ? "-B" : "-b", name, startPoint);
    await this.execGit(args);
    this.invalidateCache();
  }

  async createBranch(
    newBranchName: string,
    startPoint: string,
    force = false,
  ): Promise<void> {
    const args = force
      ? ["branch", "-f", newBranchName, startPoint]
      : ["branch", newBranchName, startPoint];
    await this.execGit(args);
    this.invalidateCache();
  }

  async deleteBranch(branchName: string, force = false): Promise<void> {
    const flag = force ? "-D" : "-d";
    await this.execGit(["branch", flag, branchName]);
    this.invalidateCache();
  }

  /**
   * Local branches fully merged into `base` (default: the current branch),
   * minus the ones that cannot or should not go: the base itself, the current
   * branch and anything checked out in a worktree.
   */
  async findMergedBranches(base = "HEAD"): Promise<string[]> {
    const [output, currentBranch, worktrees] = await Promise.all([
      this.execGit(["branch", `--merged=${base}`, "--format=%(refname)"]),
      this.getCurrentBranch(),
      this.listWorktrees(),
    ]);
    return selectCleanupCandidates(parseLocalBranchRefs(output), {
      base,
      currentBranch,
      worktreeBranches: worktrees.map((w) => w.branch).filter(Boolean),
    });
  }

  /**
   * Delete branches found by `findMergedBranches`. Every branch is checked
   * against `base` again right before its removal, because the list may be
   * minutes old and `-D` would otherwise drop commits that landed since. One
   * failing branch does not stop the rest.
   */
  async deleteMergedBranches(
    branches: string[],
    base = "HEAD",
    protectedPatterns: readonly string[] = [],
  ): Promise<{
    deleted: string[];
    skipped: string[];
    failed: { branch: string; error: string }[];
  }> {
    const allowed = filterDeletable(branches, protectedPatterns);
    const skipped = branches.filter((b) => !allowed.includes(b));
    const deleted: string[] = [];
    const failed: { branch: string; error: string }[] = [];
    for (const branch of allowed) {
      try {
        if (!(await this.isAncestor(`refs/heads/${branch}`, base))) {
          failed.push({
            branch,
            error: `No longer fully merged into ${base}.`,
          });
          continue;
        }
        await this.execGit(["branch", "-D", branch]);
        deleted.push(branch);
      } catch (err) {
        failed.push({
          branch,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    this.invalidateCache();
    return { deleted, skipped, failed };
  }

  /** `merge-base --is-ancestor`: exit 1 means "no", anything else is an error. */
  private async isAncestor(ancestor: string, ref: string): Promise<boolean> {
    try {
      await this.execGit(["merge-base", "--is-ancestor", ancestor, ref]);
      return true;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 1) return false;
      throw err;
    }
  }

  async deleteRemoteBranch(remoteBranch: string): Promise<void> {
    // remoteBranch is like "origin/feature" → push --delete origin feature
    const slashIdx = remoteBranch.indexOf("/");
    const remote = remoteBranch.substring(0, slashIdx);
    const branch = remoteBranch.substring(slashIdx + 1);
    await this.execGit(["push", remote, "--delete", branch]);
    this.invalidateCache();
  }

  async addRemote(name: string, url: string): Promise<void> {
    await this.execGit(["remote", "add", name, url]);
    this.invalidateCache();
  }

  async setRemoteUrl(name: string, url: string): Promise<void> {
    await this.execGit(["remote", "set-url", name, url]);
    this.invalidateCache();
  }

  async removeRemote(name: string): Promise<void> {
    await this.execGit(["remote", "remove", name]);
    this.invalidateCache();
  }

  async renameRemote(oldName: string, newName: string): Promise<void> {
    await this.execGit(["remote", "rename", oldName, newName]);
    this.invalidateCache();
  }

  async getRemoteUrls(): Promise<{ name: string; url: string }[]> {
    const output = await this.execGit(["remote", "-v"]).catch(() => "");
    const remotes = new Map<string, string>();
    for (const line of output.trim().split("\n")) {
      const match = line.match(/^(\S+)\s+(\S+)\s+\(fetch\)$/);
      if (match) {
        const [, name, url] = match;
        if (!remotes.has(name)) {
          remotes.set(name, url);
        }
      }
    }
    return Array.from(remotes.entries()).map(([name, url]) => ({ name, url }));
  }

  async renameBranch(oldName: string, newName: string): Promise<void> {
    await this.execGit(["branch", "-m", oldName, newName]);
    this.invalidateCache();
  }

  /** Track `upstream` (a remote-tracking branch such as `origin/main`) from `branch`. */
  async setUpstream(branch: string, upstream: string): Promise<void> {
    await this.execGit(["branch", `--set-upstream-to=${upstream}`, branch]);
    this.invalidateCache();
  }

  async unsetUpstream(branch: string): Promise<void> {
    await this.execGit(["branch", "--unset-upstream", branch]);
    this.invalidateCache();
  }

  async merge(branchName: string): Promise<void> {
    await this.execGit(["merge", branchName]);
    this.invalidateCache();
  }

  async rebase(onto: string): Promise<void> {
    await this.execGit(["rebase", onto]);
    this.invalidateCache();
  }

  async rebaseAction(action: "continue" | "abort" | "skip"): Promise<void> {
    if (action === "continue") {
      // Stage the resolved files before continuing
      await this.stageUnmerged();
    }
    try {
      // A squash conflict makes `--continue` open the message editor, which
      // would hang with no terminal attached; `:` keeps git's message.
      await this.execGit(["rebase", `--${action}`], MAX_BUFFER, {
        GIT_EDITOR: ":",
      });
    } finally {
      this.invalidateCache();
      await this.removeRebaseScratchIfDone();
    }
  }

  /** Whether a rebase is waiting on the user. Safe in linked worktrees. */
  async isRebaseInProgress(): Promise<boolean> {
    for (const name of ["rebase-merge", "rebase-apply"]) {
      try {
        const p = (
          await this.execGit(["rev-parse", "--git-path", name])
        ).trim();
        await fs.access(path.resolve(this.cwd, p));
        return true;
      } catch {}
    }
    return false;
  }

  /** The message files of an interactive rebase are only needed while it runs. */
  private async removeRebaseScratchIfDone(): Promise<void> {
    try {
      if (await this.isRebaseInProgress()) return;
      const gitDir = (
        await this.execGit(["rev-parse", "--absolute-git-dir"])
      ).trim();
      await removeScratch(gitDir);
    } catch {}
  }

  async hasStagedChanges(): Promise<boolean> {
    try {
      await this.execGit(["diff", "--cached", "--quiet"]);
      return false;
    } catch (err: unknown) {
      if ((err as { code?: number }).code === 1) return true;
      throw err;
    }
  }

  private async resolveCommit(rev: string, what: string): Promise<string> {
    const safe = assertRevision(rev, what);
    try {
      return (
        await this.execGit(["rev-parse", "--verify", `${safe}^{commit}`])
      ).trim();
    } catch {
      throw new Error(`"${rev}" is not a commit.`);
    }
  }

  /**
   * Local branches (other than any checked out in a worktree) that point at
   * one of `hashes`, keyed by full commit id. Used to write `update-ref`
   * lines into a replaced todo.
   */
  private async branchesPointingAt(
    hashes: string[],
  ): Promise<Map<string, string[]>> {
    const wanted = new Set(hashes.map((h) => h.toLowerCase()));
    const output = await this.execGit([
      "for-each-ref",
      "--format=%(refname) %(objectname) %(worktreepath)",
      "refs/heads",
    ]);
    const result = new Map<string, string[]>();
    for (const line of output.split("\n")) {
      const [ref, hash, ...checkedOut] = line.split(" ");
      if (!ref || !hash || checkedOut.join(" ").trim()) continue;
      if (!wanted.has(hash)) continue;
      result.set(hash, [...(result.get(hash) ?? []), ref]);
    }
    return result;
  }

  /**
   * The commits `git rebase -i` would put in the todo, oldest first: those
   * after `base` (or all of them with `root`), merges excluded as git does
   * unless it is told to recreate them.
   */
  private async rebaseRange(options: {
    base?: string;
    root?: boolean;
  }): Promise<{ commits: CommitNode[]; hasMerges: boolean }> {
    const range = options.root
      ? ["HEAD"]
      : ["--cherry-pick", "--right-only", `${options.base ?? ""}...HEAD`];
    if (!options.root && !options.base) {
      throw new Error("Choose the commit to rebase from.");
    }
    const output = await this.execGit([
      "log",
      "--reverse",
      "--topo-order",
      "--max-parents=1",
      `--format=${LOG_FORMAT}${FMT_RECORD_SEP}`,
      ...range,
    ]);
    const merges = await this.execGit([
      "rev-list",
      "--merges",
      "--max-count=1",
      ...range,
    ]);
    return {
      commits: parseLogOutput(output),
      hasMerges: merges.trim().length > 0,
    };
  }

  /**
   * The rows of the interactive-rebase dialog. With `autosquash` the list is
   * already rearranged the way `--autosquash` would, fixups marked.
   */
  async getRebaseCommits(options: {
    base?: string;
    root?: boolean;
    autosquash?: boolean;
  }): Promise<{ commits: RebaseCommit[]; hasMerges: boolean }> {
    const base = options.root
      ? undefined
      : await this.resolveCommit(options.base ?? "", "base");
    const { commits, hasMerges } = await this.rebaseRange({
      base,
      root: options.root,
    });
    const byHash = new Map(commits.map((c) => [c.hash, c]));
    let entries: RebaseEntry[] = commits.map((c) => ({
      action: "pick",
      hash: c.hash,
      subject: c.subject,
    }));
    if (options.autosquash) entries = autosquashEntries(entries);
    return {
      hasMerges,
      commits: entries.flatMap((entry) => {
        const commit = byHash.get(entry.hash);
        if (!commit) return [];
        const row: RebaseCommit = {
          hash: commit.hash,
          shortHash: commit.shortHash,
          subject: commit.subject,
          body: commit.body.trim(),
          authorName: commit.authorName,
          authorDate: commit.authorDate,
          action: entry.action,
        };
        if (entry.flag) row.flag = entry.flag;
        return [row];
      }),
    };
  }

  /**
   * `git rebase -i` without a terminal or an editor window. A supplied todo
   * is installed through `GIT_SEQUENCE_EDITOR`, and every message editor is
   * the no-op `:`, so the call returns instead of waiting. When the rebase
   * stops (conflict, `edit`, failing `exec`) it is left in progress for the
   * existing continue / skip / abort flow and the result says so.
   */
  async interactiveRebase(
    options: InteractiveRebaseOptions,
  ): Promise<InteractiveRebaseResult> {
    if (await this.isOperationInProgress()) {
      throw new Error(
        "Finish or abort the merge, rebase, cherry-pick or revert in progress first.",
      );
    }
    if (!options.root && !options.base) {
      throw new Error("Choose the commit to rebase from.");
    }
    const base = options.root
      ? undefined
      : await this.resolveCommit(options.base ?? "", "base");
    const onto = options.onto
      ? await this.resolveCommit(options.onto, "--onto target")
      : undefined;
    const gitDir = (
      await this.execGit(["rev-parse", "--absolute-git-dir"])
    ).trim();
    await removeScratch(gitDir);

    let entries: RebaseEntry[] | undefined;
    if (options.entries) {
      if (options.rebaseMerges) {
        throw new Error(
          "An edited commit list cannot be combined with recreating merges.",
        );
      }
      const range = await this.rebaseRange({ base, root: options.root });
      if (range.hasMerges) {
        throw new Error(
          'These commits include a merge commit, which an edited list would flatten. Turn on "Rebase merges" and rebase without editing the list.',
        );
      }
      entries = matchEntriesToRange(
        options.entries,
        range.commits.map((c) => c.hash),
      );
    }

    const todoPath = entries
      ? await writeScratchTodo(gitDir, entries, {
          refsByHash: options.updateRefs
            ? await this.branchesPointingAt(entries.map((e) => e.hash))
            : undefined,
        })
      : undefined;
    const args = buildRebaseArgs({ ...options, base, onto }, !!entries);
    const env = rebaseEnv(todoPath);

    const run = async (): Promise<void> => {
      let failure: unknown;
      try {
        await this.execGit(args, MAX_BUFFER, env);
      } catch (err) {
        failure = err;
      }
      this.invalidateCache();
      if (await this.isRebaseInProgress()) {
        const conflicts = await this.getConflictFiles().catch(() => []);
        throw new RebaseStoppedError(
          describeStop(conflicts, failure ? gitErrorText(failure) : ""),
          conflicts,
        );
      }
      if (failure) throw failure;
    };

    try {
      if (options.policy === "shelve") {
        await this.withSavedChanges("shelve", "Rebase", run);
      } else {
        await run();
      }
      await removeScratch(gitDir);
      return { status: "completed" };
    } catch (err) {
      const stopped = findRebaseStop(err);
      if (stopped) {
        // The wrapper's message also says where the saved changes are.
        const message = err instanceof Error ? err.message : stopped.message;
        return { status: "stopped", message, conflicts: stopped.conflicts };
      }
      await removeScratch(gitDir);
      throw err;
    }
  }

  /**
   * Replace the message of any commit in the current branch. HEAD is amended
   * in place; an older commit is reworded by rebasing the commits after it.
   */
  async rewordCommit(
    hash: string,
    message: string,
    policy: SaveChangesPolicy = "stash",
  ): Promise<InteractiveRebaseResult> {
    if (!message.trim()) throw new Error("The commit message cannot be empty.");
    if (await this.isOperationInProgress()) {
      throw new Error(
        "Finish or abort the merge, rebase, cherry-pick or revert in progress first.",
      );
    }
    const full = await this.resolveCommit(hash, "commit");
    if (!(await this.isAncestorOfHead(full))) {
      throw new Error("That commit is not part of the current branch.");
    }
    const parents = await this.getCommitParents(full);
    const head = (await this.execGit(["rev-parse", "HEAD"])).trim();
    if (full === head) {
      // --only: change the message without committing the index.
      await this.execGit(
        [
          "commit",
          "--amend",
          "--only",
          "--allow-empty",
          "--no-verify",
          "--cleanup=whitespace",
          "-m",
          message,
        ],
        MAX_BUFFER,
        { GIT_EDITOR: ":" },
      );
      this.invalidateCache();
      return { status: "completed" };
    }
    if (parents.length > 1) {
      throw new Error("A merge commit's message cannot be edited this way.");
    }
    const { commits } = await this.getRebaseCommits(
      parents[0] ? { base: parents[0] } : { root: true },
    );
    return this.interactiveRebase({
      ...(parents[0] ? { base: parents[0] } : { root: true }),
      policy,
      entries: commits.map((c, i) => ({
        action: i === 0 ? "reword" : "pick",
        hash: c.hash,
        subject: c.subject,
        ...(i === 0 ? { message } : {}),
      })),
    });
  }

  /**
   * Fold the staged changes into an earlier commit: record a `fixup!` /
   * `squash!` commit for it, then autosquash the history above it.
   */
  async fixupCommit(
    hash: string,
    kind: "fixup" | "squash",
    policy: SaveChangesPolicy = "stash",
  ): Promise<InteractiveRebaseResult> {
    if (await this.isOperationInProgress()) {
      throw new Error(
        "Finish or abort the merge, rebase, cherry-pick or revert in progress first.",
      );
    }
    const full = await this.resolveCommit(hash, "commit");
    if (!(await this.isAncestorOfHead(full))) {
      throw new Error("That commit is not part of the current branch.");
    }
    const parents = await this.getCommitParents(full);
    if (parents.length > 1) {
      throw new Error("Changes cannot be folded into a merge commit.");
    }
    if (!(await this.hasStagedChanges())) {
      throw new Error(
        `Stage the changes you want to ${kind} into this commit first.`,
      );
    }

    await this.execGit(
      [
        "commit",
        kind === "fixup" ? `--fixup=${full}` : `--squash=${full}`,
        "--no-edit",
      ],
      MAX_BUFFER,
      { GIT_EDITOR: ":" },
    );
    this.invalidateCache();

    const from = parents[0] ? { base: parents[0] } : { root: true };
    try {
      const { hasMerges } = await this.rebaseRange(from);
      return await this.interactiveRebase({
        ...from,
        autosquash: true,
        rebaseMerges: hasMerges,
        policy,
      });
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(
        `The ${kind} commit was created, but the rebase that folds it in failed: ${detail}\n\nThe ${kind} commit is still on top of the branch.`,
        { cause: err },
      );
    }
  }

  async mergeAbort(): Promise<void> {
    await this.execGit(["merge", "--abort"]);
    this.invalidateCache();
  }

  async mergeContinue(): Promise<void> {
    // Stage the resolved files before committing
    await this.stageUnmerged();
    await this.execGit(["commit", "--no-edit"]);
    this.invalidateCache();
  }

  async checkoutAndRebase(
    branchToCheckout: string,
    rebaseOnto: string,
  ): Promise<void> {
    await this.execGit(["checkout", branchToCheckout]);
    await this.execGit(["rebase", rebaseOnto]);
    this.invalidateCache();
  }

  async push(
    branchName: string,
    force = false,
    remote = "origin",
    targetBranch?: string,
    options: { setUpstream?: boolean } = {},
  ): Promise<string> {
    const args = ["push"];
    if (force) args.push("--force-with-lease");
    if (options.setUpstream) args.push("--set-upstream");
    args.push(remote, `${branchName}:${targetBranch || branchName}`);
    const output = await this.execGit(args);
    this.invalidateCache();
    return output;
  }

  /** Whether the branch tracks something (`branch.<name>.remote` and `.merge` are both set). */
  async hasUpstream(branchName: string): Promise<boolean> {
    const [remote, merge] = await Promise.all([
      this.getConfig(`branch.${branchName}.remote`),
      this.getConfig(`branch.${branchName}.merge`),
    ]);
    return Boolean(remote && merge);
  }

  /**
   * Track `<remote>/<remoteBranch>`. `push --set-upstream` does this itself
   * only for a branch source; pushing a bare commit leaves it to the caller.
   */
  async trackRemoteBranch(
    branchName: string,
    remote: string,
    remoteBranch: string,
  ): Promise<void> {
    await this.execGit([
      "branch",
      `--set-upstream-to=${remote}/${remoteBranch}`,
      branchName,
    ]);
    this.invalidateCache();
  }

  /**
   * Get commits that are ahead of the remote tracking branch.
   * Returns commits in newest-first order.
   */
  async getAheadCommits(
    branchName: string,
    remote?: string,
  ): Promise<CommitNode[]> {
    const remoteNames = await this.getRemoteNames();
    const remoteName = remote || (await this.getDefaultRemote(branchName));
    const upstream = `${remoteName}/${branchName}`;
    // Check if upstream exists
    try {
      await this.execGit(["rev-parse", "--verify", upstream]);
    } catch {
      // No upstream — all local commits are "ahead"
      const args = [
        "log",
        `--format=${LOG_FORMAT}${FMT_RECORD_SEP}`,
        branchName,
        "--max-count=50",
      ];
      const output = await this.execGit(args);
      return parseLogOutput(output, remoteNames);
    }
    const args = [
      "log",
      `--format=${LOG_FORMAT}${FMT_RECORD_SEP}`,
      `${upstream}..${branchName}`,
    ];
    const output = await this.execGit(args);
    return parseLogOutput(output, remoteNames);
  }

  /**
   * Fetch and integrate. The method is always explicit: a bare `git pull`
   * aborts on divergent branches when `pull.rebase` is unset.
   *
   * The `stash` policy uses git's own `--autostash`, which restores the
   * changes atomically; `shelve` wraps the pull in the IDEA-style shelf.
   */
  async update(options: {
    method: "merge" | "rebase";
    policy: SaveChangesPolicy;
    branchName?: string;
    remote?: string;
  }): Promise<void> {
    const args = [
      "pull",
      options.method === "rebase" ? "--rebase" : "--no-rebase",
    ];
    if (options.policy === "stash") args.push("--autostash");
    if (options.branchName) {
      args.push(options.remote ?? "origin", options.branchName);
    }

    const run = () => this.execGit(args);
    if (options.policy === "shelve") {
      await this.withSavedChanges("shelve", "Update", run);
    } else {
      await run();
    }
    this.invalidateCache();
  }

  async pull(
    branchName?: string,
    policy: SaveChangesPolicy = "stash",
  ): Promise<void> {
    await this.update({ method: "merge", policy, branchName });
  }

  async pullRebase(
    branchName?: string,
    policy: SaveChangesPolicy = "stash",
  ): Promise<void> {
    await this.update({ method: "rebase", policy, branchName });
  }

  /** Update using the configured method (`branchDefault` reads git config). */
  async updateWithMethod(
    method: UpdateMethod,
    policy: SaveChangesPolicy,
    branchName?: string,
  ): Promise<void> {
    let resolved: "merge" | "rebase";
    if (method === "branchDefault") {
      const branch = branchName ?? (await this.getCurrentBranch());
      const branchConfig = branch
        ? await this.getConfig(`branch.${branch}.rebase`)
        : undefined;
      resolved = resolveUpdateMethod(
        method,
        branchConfig,
        await this.getConfig("pull.rebase"),
      );
    } else {
      resolved = method;
    }
    await this.update({ method: resolved, policy, branchName });
  }

  /** One config value, or undefined when it is unset. */
  async getConfig(key: string): Promise<string | undefined> {
    try {
      const out = await this.execGit(["config", "--get", key]);
      return out.trim() || undefined;
    } catch {
      return undefined;
    }
  }

  // ─── Smart operations (save local changes around another operation) ───

  private async hasTrackedChanges(): Promise<boolean> {
    const out = await this.execGit([
      "status",
      "--porcelain=v1",
      "--untracked-files=no",
    ]);
    return out.trim().length > 0;
  }

  private async stashTopSha(): Promise<string | null> {
    try {
      const out = await this.execGit([
        "rev-parse",
        "--verify",
        "--quiet",
        "refs/stash",
      ]);
      return out.trim() || null;
    } catch {
      return null;
    }
  }

  /** True while a merge, rebase, cherry-pick or revert is waiting on the user. */
  async isOperationInProgress(): Promise<boolean> {
    for (const name of [
      "MERGE_HEAD",
      "rebase-merge",
      "rebase-apply",
      "CHERRY_PICK_HEAD",
      "REVERT_HEAD",
    ]) {
      try {
        const p = (
          await this.execGit(["rev-parse", "--git-path", name])
        ).trim();
        await fs.access(path.resolve(this.cwd, p));
        return true;
      } catch {}
    }
    return false;
  }

  /**
   * Set tracked local changes aside. Returns null when there is nothing to
   * save. Untracked files are left alone on purpose: the shelf path deletes
   * what it shelves, and an untracked binary file cannot be written to a
   * text patch.
   */
  async saveLocalChanges(
    policy: SaveChangesPolicy,
    label: string,
  ): Promise<SavedChanges | null> {
    if (!(await this.hasTrackedChanges())) return null;

    if (policy === "shelve") {
      const out = await this.execGit(["diff", "HEAD", "--name-only", "-z"]);
      const files = out.split("\0").filter(Boolean);
      if (files.length === 0) return null;
      const name = await this.ideaShelveChanges(
        `${label} (changes saved by JGC)`,
        files,
      );
      return { kind: "shelf", name };
    }

    const before = await this.stashTopSha();
    await this.execGit([
      "stash",
      "push",
      "-m",
      `${label} (changes saved by JGC)`,
    ]);
    const after = await this.stashTopSha();
    // `stash push` exits 0 with "No local changes to save" and a stale top.
    if (!after || after === before) return null;
    this.invalidateCache();
    return { kind: "stash", sha: after };
  }

  async restoreLocalChanges(saved: SavedChanges): Promise<void> {
    if (saved.kind === "shelf") {
      await this.ideaUnshelveChanges(saved.name, true);
      return;
    }
    const list = (await this.execGit(["stash", "list", "--format=%H"]))
      .trim()
      .split("\n");
    const index = list.indexOf(saved.sha);
    if (index < 0) {
      throw new Error("The stash holding your local changes no longer exists.");
    }
    await this.execGit(["stash", "pop", `stash@{${index}}`]);
    this.invalidateCache();
  }

  /**
   * Run `operation` with local changes set aside, then put them back.
   *
   * If the operation stops mid-way (a conflict leaves a merge or rebase to
   * finish) the saved changes are NOT restored: applying them over a
   * half-finished operation would tangle both. The error says where they are.
   */
  async withSavedChanges<T>(
    policy: SaveChangesPolicy,
    label: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const saved = await this.saveLocalChanges(policy, label);
    const where = saved
      ? saved.kind === "shelf"
        ? `shelf "${saved.name}"`
        : "the stash (git stash list)"
      : "";

    let result: T;
    try {
      result = await operation();
    } catch (err) {
      if (!saved) throw err;
      const message = err instanceof Error ? err.message : String(err);
      if (await this.isOperationInProgress()) {
        throw new Error(
          `${message}\n\nYour local changes are saved in ${where} and were not restored because the operation is unfinished.`,
          { cause: err },
        );
      }
      try {
        await this.restoreLocalChanges(saved);
      } catch (restoreErr) {
        const detail =
          restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        throw new Error(
          `${message}\n\nYour local changes are still saved in ${where}: ${detail}`,
          { cause: err },
        );
      }
      throw err;
    }

    if (saved) {
      try {
        await this.restoreLocalChanges(saved);
      } catch (restoreErr) {
        const detail =
          restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
        throw new Error(
          `The operation succeeded, but restoring your local changes failed. They are still saved in ${where}.\n\n${detail}`,
          { cause: restoreErr },
        );
      }
    }
    this.invalidateCache();
    return result;
  }

  async fetch(
    remote = "origin",
    options?: Partial<FetchOptions>,
  ): Promise<void> {
    await this.execGit(buildFetchArgs(remote, options));
    this.invalidateCache();
  }

  // Shallow repositories

  async isShallow(): Promise<boolean> {
    return isShallowRepository(this.runGit);
  }

  async unshallow(remote?: string): Promise<void> {
    await unshallowRepository(this.runGit, remote, await this.networkEnv());
    this.invalidateCache();
  }

  async deepen(commits: number): Promise<void> {
    await deepenRepository(this.runGit, commits, await this.networkEnv());
    this.invalidateCache();
  }

  /**
   * Fetch every remote (the auto-fetch path). Resolves to whether any
   * remote-tracking branch or tag moved, so callers can stay quiet when a
   * background fetch found nothing new.
   */
  async fetchAllRemotes(options?: Partial<FetchOptions>): Promise<boolean> {
    const before = await this.remoteRefSnapshot();
    await this.execGit(buildFetchArgs(null, options));
    if ((await this.remoteRefSnapshot()) === before) return false;
    this.invalidateCache();
    return true;
  }

  private remoteRefSnapshot(): Promise<string> {
    return this.execGit([
      "for-each-ref",
      "--format=%(objectname) %(refname)",
      "refs/remotes",
      "refs/tags",
    ]);
  }

  private cherryPickEmptyFlag?: Promise<boolean>;

  /** Whether this git understands `cherry-pick --empty=`; probed once. */
  private supportsCherryPickEmpty(): Promise<boolean> {
    this.cherryPickEmptyFlag ??= this.execGit(["--version"]).then(
      gitSupportsCherryPickEmpty,
      () => false,
    );
    return this.cherryPickEmptyFlag;
  }

  async cherryPick(
    hash: string,
    options: CherryPickOptions = DEFAULT_CHERRY_PICK_OPTIONS,
  ): Promise<CherryPickOutcome> {
    try {
      return await runCherryPick(
        (args) => this.execGit(args),
        hash,
        options,
        await this.supportsCherryPickEmpty(),
      );
    } finally {
      this.invalidateCache();
    }
  }

  /** Commits of `ref` split by whether HEAD already holds a patch-equivalent. */
  async getCherryMarks(ref: string): Promise<CherryMarks> {
    try {
      return await computeCherryMarks((args) => this.execGit(args), ref);
    } catch (err) {
      if (ref.startsWith("-")) throw err;
      // No HEAD yet, or an unknown ref: nothing to compare.
      return { notCherryPicked: [], cherryPicked: [] };
    }
  }

  async checkoutCommit(hash: string): Promise<void> {
    await this.execGit(["checkout", hash]);
    this.invalidateCache();
  }

  async checkoutFileFromCommit(hash: string, filePath: string): Promise<void> {
    await this.execGit(["checkout", hash, "--", filePath]);
    this.invalidateCache();
  }

  async checkoutFileFromParent(
    hash: string,
    filePath: string,
    status?: string,
  ): Promise<void> {
    if (status === "added") {
      // File was newly added in this commit, revert means removing it
      // Use --cached to handle case where file may not exist on disk
      try {
        await this.execGit(["rm", "-f", "--", filePath]);
      } catch {
        // File might not exist in working tree or index, try removing from index only
        try {
          await this.execGit(["rm", "-f", "--cached", "--", filePath]);
        } catch {
          // File doesn't exist at all - nothing to revert
        }
        // Also try to remove the physical file if it exists
        try {
          await fs.unlink(path.join(this.cwd, filePath));
        } catch {
          // File already doesn't exist on disk
        }
      }
    } else if (status === "deleted") {
      // File was deleted in this commit, revert means restoring it from parent
      await this.execGit(["checkout", `${hash}~1`, "--", filePath]);
    } else {
      // File was modified/renamed/copied, revert to parent state
      await this.execGit(["checkout", `${hash}~1`, "--", filePath]);
    }
    this.invalidateCache();
  }

  async resetToCommit(
    hash: string,
    mode: "soft" | "mixed" | "hard" | "keep",
  ): Promise<void> {
    await this.execGit(["reset", `--${mode}`, hash]);
    this.invalidateCache();
  }

  async revertCommit(hash: string): Promise<void> {
    await this.execGit(["revert", "--no-edit", hash]);
    this.invalidateCache();
  }

  async dropCommit(hash: string): Promise<void> {
    const headHash = (await this.execGit(["rev-parse", "HEAD"])).trim();
    const isHead = hash === headHash;

    if (isHead) {
      await this.dropHeadCommit(hash);
    } else {
      await this.dropNonHeadCommit(hash);
    }
    this.invalidateCache();
  }

  /**
   * The `git format-patch` text for one commit. Returned instead of written so
   * the caller can ask the user where to put it — writing into the working
   * tree behind the user's back left untracked files and blew up on long
   * subjects (ENAMETOOLONG).
   */
  async getPatchForCommit(hash: string): Promise<string> {
    return this.execGit(["format-patch", "--stdout", hash]);
  }

  /** `<short> <subject>` for one commit — used to name export files. */
  async getCommitLabel(
    hash: string,
  ): Promise<{ short: string; subject: string }> {
    const output = await this.execGit(["log", "-1", "--format=%h%x00%s", hash]);
    const [short = "", subject = ""] = output.trim().split("\x00");
    return { short, subject };
  }

  /** Every path tracked at `hash` — the repository contents at that revision. */
  async getRepoTreeAtRevision(hash: string): Promise<string[]> {
    const output = await this.execGit(["ls-tree", "-r", "--name-only", hash]);
    return output
      .trim()
      .split("\n")
      .filter((line) => line.length > 0);
  }

  /** Diff between `hash` and the working tree (staged + unstaged). */
  async getDiffWithLocal(hash: string): Promise<string> {
    return this.execGit(["diff", hash]);
  }

  async undoCommit(hash: string): Promise<void> {
    // Only valid on HEAD commit, not on main branch
    const headHash = (await this.execGit(["rev-parse", "HEAD"])).trim();
    if (hash !== headHash) {
      throw new Error("Can only undo the HEAD commit");
    }
    const branch = (
      await this.execGit(["rev-parse", "--abbrev-ref", "HEAD"])
    ).trim();
    const isMainBranch = /^(main|master)$/i.test(branch);
    if (isMainBranch) {
      throw new Error("Cannot undo commit on main branch");
    }
    // Undo = soft reset to parent
    const parents = await this.getCommitParents(hash);
    if (parents.length === 0) {
      throw new Error("Cannot undo the initial commit");
    }
    await this.execGit(["reset", "--soft", "HEAD~1"]);
    this.invalidateCache();
  }

  private async dropHeadCommit(hash: string): Promise<void> {
    // Verify commit has a parent
    const parents = await this.getCommitParents(hash);
    if (parents.length === 0) {
      throw new Error("Cannot drop the initial commit (no parent)");
    }
    await this.execGit(["reset", "--mixed", "HEAD~1"]);
  }

  private async dropNonHeadCommit(hash: string): Promise<void> {
    // 1. Capture the target commit's diff BEFORE rebase
    const diff = await this.execGit(["diff-tree", "-p", hash]);

    // 2. Check working directory status
    const status = await this.execGit(["status", "--porcelain"]);
    const isDirty = status.trim().length > 0;

    // 3. Stash if dirty
    if (isDirty) {
      await this.execGit([
        "stash",
        "push",
        "-u",
        "-m",
        "drop-commit-autostash",
      ]);
    }

    // 4. Execute rebase to remove the commit
    try {
      await this.execGit(["rebase", "--onto", `${hash}^`, hash]);
    } catch (rebaseErr) {
      // Abort rebase on failure
      try {
        await this.execGit(["rebase", "--abort"]);
      } catch {
        // ignore abort errors
      }

      // Restore stash if it was used
      if (isDirty) {
        try {
          await this.execGit(["stash", "pop"]);
        } catch {
          // stash pop failure is secondary
        }
      }

      throw rebaseErr;
    }

    // 5. Restore stashed changes on success
    if (isDirty) {
      await this.execGit(["stash", "pop"]);
    }

    // 6. Apply dropped commit's diff to working directory via temp file
    if (diff.trim()) {
      const tmpFile = path.join(os.tmpdir(), `drop-commit-${hash}.patch`);
      try {
        await fs.writeFile(tmpFile, diff, "utf-8");
        await this.execGit(["apply", "--3way", tmpFile]);
      } catch {
        throw new Error(
          "Commit was removed from history but its changes could not be applied to the working directory",
        );
      } finally {
        try {
          await fs.unlink(tmpFile);
        } catch {
          // ignore cleanup errors
        }
      }
    }
  }

  async createBranchFromCommit(
    branchName: string,
    hash: string,
    force = false,
  ): Promise<void> {
    const args = force
      ? ["branch", "-f", branchName, hash]
      : ["branch", branchName, hash];
    await this.execGit(args);
    this.invalidateCache();
  }

  async createTag(
    tagName: string,
    hash: string,
    message?: string,
  ): Promise<void> {
    if (message) {
      await this.execGit(["tag", "-a", tagName, hash, "-m", message]);
    } else {
      await this.execGit(["tag", tagName, hash]);
    }
    this.invalidateCache();
  }

  async checkoutTag(tagName: string): Promise<void> {
    await this.execGit(["checkout", tagName]);
    this.invalidateCache();
  }

  async deleteTag(tagName: string): Promise<void> {
    await this.execGit(["tag", "-d", tagName]);
    this.invalidateCache();
  }

  async pushTag(tagName: string, remote = "origin"): Promise<string> {
    const output = await this.execGit(["push", remote, tagName]);
    this.invalidateCache();
    return output;
  }

  async mergeTag(tagName: string): Promise<void> {
    await this.execGit(["merge", tagName]);
    this.invalidateCache();
  }

  async showTagDiff(tagName: string): Promise<string> {
    return this.execGit(["diff", tagName]);
  }

  // ─── Commit Panel Operations ───────────────────────────────────────

  async getWorkingTreeChanges(): Promise<import("./types").WorkingTreeFile[]> {
    const output = await this.execGit(["status", "--porcelain=v1", "-uall"]);
    const files: import("./types").WorkingTreeFile[] = [];

    for (const line of output.split("\n")) {
      if (line.length < 4) continue;
      const indexStatus = line[0];
      const workTreeStatus = line[1];

      // Skip ignored files
      if (indexStatus === "!" && workTreeStatus === "!") continue;

      const rest = line.substring(3);

      const { path: filePath, oldPath } = splitStatusPaths(rest);

      // Determine if file is staged
      const staged =
        indexStatus !== " " && indexStatus !== "?" && indexStatus !== "!";

      // Determine status
      let status: import("./types").WorkingTreeFile["status"];
      if (indexStatus === "?" && workTreeStatus === "?") {
        status = "untracked";
      } else if (
        indexStatus === "U" ||
        workTreeStatus === "U" ||
        (indexStatus === "A" && workTreeStatus === "A") ||
        (indexStatus === "D" && workTreeStatus === "D")
      ) {
        status = "conflicted";
      } else if (indexStatus === "A" || workTreeStatus === "A") {
        status = "added";
      } else if (indexStatus === "D" || workTreeStatus === "D") {
        status = "deleted";
      } else if (indexStatus === "R" || workTreeStatus === "R") {
        status = "renamed";
      } else {
        status = "modified";
      }

      // For files that have both staged and unstaged changes, emit two entries
      if (
        staged &&
        workTreeStatus !== " " &&
        workTreeStatus !== "?" &&
        workTreeStatus !== "!"
      ) {
        // Staged version
        files.push({ path: filePath, oldPath, status, staged: true });
        // Unstaged version
        files.push({
          path: filePath,
          oldPath,
          status: "modified",
          staged: false,
        });
      } else {
        files.push({ path: filePath, oldPath, status, staged });
      }
    }
    return files;
  }

  async stageFiles(filePaths: string[]): Promise<void> {
    if (filePaths.length === 0) return;
    await this.execGit(["add", "--", ...filePaths]);
  }

  async unstageFile(filePath: string): Promise<void> {
    await this.execGit(["reset", "HEAD", "--", filePath]);
  }

  async unstageAll(): Promise<void> {
    await this.execGit(["reset", "HEAD"]);
  }

  async stageAll(): Promise<void> {
    await this.execGit(["add", "-A"]);
  }

  async commit(
    message: string,
    amend = false,
    options: CommitOptions = {},
  ): Promise<void> {
    try {
      await this.execGit(buildCommitArgs(message, amend, options));
    } catch (err) {
      const hint =
        options.gpgSign !== "never" && err instanceof Error
          ? explainSigningFailure(err.message)
          : undefined;
      throw hint ? new Error(`${(err as Error).message}\n${hint}`) : err;
    }
    this.invalidateCache();
  }

  async commitAndPush(
    message: string,
    amend = false,
    options: CommitOptions = {},
    pushBranch?: (branch: string, force: boolean) => Promise<void>,
  ): Promise<void> {
    await this.commit(message, amend, options);
    // Push current branch
    const branch = await this.getCurrentBranch();
    if (branch) {
      const force = amend;
      if (pushBranch) await pushBranch(branch, force);
      else await this.push(branch, force);
    }
  }

  /**
   * Run the enabled pre-commit checks against what a commit made now would
   * contain. `selection` is the commit panel's check-box state, applied on a
   * scratch index. An empty result means nothing to warn about.
   */
  async checkCommit(
    settings: CommitSettings,
    selection: PendingSelection = {},
  ): Promise<CommitWarning[]> {
    let files: PendingFile[] = [];
    if (settings.warnLargeFiles || settings.warnCrlf) {
      try {
        files = await readPendingCommit(this.cwd, selection, {
          sizes: settings.warnLargeFiles,
          eol: settings.warnCrlf,
        });
      } catch {
        // The checks are advisory: if git cannot answer, the commit itself
        // will report the real problem.
      }
    }
    return runCommitChecks({
      files,
      largeFileBytes: settings.warnLargeFiles
        ? thresholdBytes(settings.largeFileThresholdMB)
        : undefined,
      checkCrlf: settings.warnCrlf,
      head: settings.warnDetachedHead
        ? {
            detached: await this.isHeadDetached(),
            rebaseInProgress: await this.isRebaseInProgress(),
          }
        : undefined,
      identity: settings.warnMissingIdentity
        ? await this.getCommitIdentity()
        : undefined,
    });
  }

  /** True when HEAD points at a commit instead of a branch. */
  async isHeadDetached(): Promise<boolean> {
    try {
      await this.execGit(["symbolic-ref", "-q", "HEAD"]);
      return false;
    } catch (err) {
      // `symbolic-ref -q` exits 1 for a detached HEAD; other failures (no
      // repository, git missing) say nothing about HEAD.
      return (err as { code?: unknown }).code === 1;
    }
  }

  /** The author name and email git would use: environment first, then config. */
  async getCommitIdentity(): Promise<{ name?: string; email?: string }> {
    const env = process.env;
    const name =
      env.GIT_AUTHOR_NAME ||
      env.GIT_COMMITTER_NAME ||
      (await this.getConfig("user.name")) ||
      (await this.getConfig("author.name"));
    const email =
      env.GIT_AUTHOR_EMAIL ||
      env.GIT_COMMITTER_EMAIL ||
      env.EMAIL ||
      (await this.getConfig("user.email")) ||
      (await this.getConfig("author.email"));
    return { name: name || undefined, email: email || undefined };
  }

  // ─── GPG signing ──────────────────────────────────────────────────

  /** The program git signs with: `gpg.openpgp.program`, `gpg.program`, else `gpg`. */
  async getGpgProgram(): Promise<string> {
    return resolveGpgProgram(
      (await this.getConfig("gpg.openpgp.program")) ??
        (await this.getConfig("gpg.program")),
    );
  }

  async listGpgKeys(): Promise<GpgKey[]> {
    return listSecretKeys(await this.getGpgProgram(), this.cwd);
  }

  /** The repository's signing setup, as git config states it. */
  async getSigningConfig(): Promise<{
    keyId?: string;
    enabled: boolean;
    format?: string;
  }> {
    let enabled = false;
    try {
      const out = await this.execGit([
        "config",
        "--type=bool",
        "--get",
        "commit.gpgsign",
      ]);
      enabled = out.trim() === "true";
    } catch {}
    return {
      keyId: await this.getConfig("user.signingkey"),
      enabled,
      format: await this.getConfig("gpg.format"),
    };
  }

  /**
   * Turn signing on for this repository with `keyId`, or off with `null`
   * (the key stays configured so turning it on again is one click).
   */
  async setSigningKey(keyId: string | null): Promise<void> {
    if (keyId) {
      await this.execGit(["config", "--local", "user.signingkey", keyId]);
      await this.execGit(["config", "--local", "commit.gpgsign", "true"]);
    } else {
      await this.execGit(["config", "--local", "commit.gpgsign", "false"]);
    }
  }

  async getCurrentBranch(): Promise<string | null> {
    try {
      const output = await this.execGit(["rev-parse", "--abbrev-ref", "HEAD"]);
      const branch = output.trim();
      return branch === "HEAD" ? null : branch;
    } catch {
      return null;
    }
  }

  /**
   * Commit a single change block of one file, leaving everything else the user
   * changed out of the commit.
   *
   * The whole-file content `content` is the file as it would read if only that
   * block were applied to `HEAD` (see `committedContent`). It goes in through
   * a throwaway index, so the user's own staged state is never touched: a
   * temp index is seeded from `HEAD`, the file's entry is swapped for a blob
   * of `content`, and the resulting tree is committed on the current branch.
   * The working tree and the real index stay exactly as they were.
   *
   * Returns the new commit id.
   */
  async commitBlockChange(
    filePath: string,
    content: string,
    message: string,
  ): Promise<string> {
    // Detached HEAD has no branch to advance; update-ref would point HEAD
    // straight at a commit and lose it on the next checkout.
    const branch = await this.getCurrentBranch();
    if (!branch) {
      throw new Error("Cannot commit a single change in detached HEAD state");
    }

    // `hash-object -w --path` applies the path's CRLF/filters, so the blob
    // matches what a plain `git add` would have stored.
    const tmp = path.join(
      os.tmpdir(),
      `jgc-block-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    await fs.writeFile(tmp, content, "utf8");
    try {
      const blob = (
        await this.execGit(["hash-object", "-w", "--path", filePath, tmp])
      ).trim();

      // Keep the mode `HEAD` records for the path (executable bit etc.); a
      // hardcoded 100644 would silently drop the executable bit.
      let mode = "100644";
      try {
        const lsTree = await this.execGit(["ls-tree", "HEAD", "--", filePath]);
        const modeMatch = /^(\d{6})\s/.exec(lsTree);
        if (modeMatch) {
          mode = modeMatch[1];
        }
      } catch {
        // No HEAD entry (new file) — the default regular-file mode stands.
      }

      const indexEnv = {
        GIT_INDEX_FILE: path.join(
          os.tmpdir(),
          `jgc-index-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        ),
      };
      try {
        await this.execGit(["read-tree", "HEAD"], MAX_BUFFER, indexEnv);
        await this.execGit(
          [
            "update-index",
            "--add",
            "--cacheinfo",
            `${mode},${blob},${filePath}`,
          ],
          MAX_BUFFER,
          indexEnv,
        );
        const tree = (
          await this.execGit(["write-tree"], MAX_BUFFER, indexEnv)
        ).trim();
        const parent = (
          await this.execGit(["rev-parse", "--verify", "HEAD"])
        ).trim();
        const commit = (
          await this.execGit(["commit-tree", tree, "-p", parent, "-m", message])
        ).trim();
        await this.execGit(["update-ref", `refs/heads/${branch}`, commit]);
        this.invalidateCache();
        return commit;
      } finally {
        await fs.rm(indexEnv.GIT_INDEX_FILE, { force: true }).catch(() => {});
      }
    } finally {
      await fs.rm(tmp, { force: true }).catch(() => {});
    }
  }

  /**
   * The commit `HEAD` points at, or `null` when the folder is not a repository
   * or the repository has no commits yet.
   *
   * Callers that compare the working tree against `HEAD` need to tell "no HEAD
   * at all" from "this path is not in HEAD" (i.e. the file is new): the first
   * means there is nothing to compare, the second means everything is added.
   * The commit id doubles as a cache key for the base contents.
   */
  async headCommit(): Promise<string | null> {
    try {
      const output = await this.execGit(["rev-parse", "--verify", "HEAD"]);
      const commit = output.trim();
      return commit || null;
    } catch {
      return null;
    }
  }

  /**
   * Whether Git ignores this path.
   *
   * Ignored files get no change markers: they are not tracked, so painting them
   * all green would report a change the user never made — and opening a file
   * under `node_modules` would fill the editor with bars.
   */
  async isIgnored(filePath: string): Promise<boolean> {
    try {
      await this.execGit(["check-ignore", "-q", "--", filePath]);
      return true;
    } catch {
      // Exit code 1 means "not ignored"; anything else (no repository, bad
      // path) is treated the same way, so markers stay on.
      return false;
    }
  }

  /**
   * Contents of a file as recorded in `HEAD`, used as the base side when
   * computing line-level change markers.
   *
   * @returns the file text, or `undefined` when the path is not recorded in
   *   `HEAD` (untracked or newly added). Only meaningful once `hasCommits()`
   *   answered `true`.
   */
  async showFileAtHead(filePath: string): Promise<string | undefined> {
    try {
      return await this.execGit(["show", `HEAD:${filePath}`]);
    } catch {
      return undefined;
    }
  }

  /**
   * Get the default remote for the current branch.
   * Tries the upstream tracking remote first, then falls back to the first configured remote.
   */
  async getDefaultRemote(branch?: string): Promise<string> {
    // Try to get the upstream remote for the given branch
    if (branch) {
      try {
        const output = await this.execGit([
          "config",
          `branch.${branch}.remote`,
        ]);
        const remote = output.trim();
        if (remote) return remote;
      } catch {
        // No upstream configured
      }
    }

    // Fall back to first configured remote
    try {
      const output = await this.execGit(["remote"]);
      const remotes = output
        .trim()
        .split("\n")
        .map((r) => r.trim())
        .filter(Boolean);
      if (remotes.length > 0) {
        // Prefer "origin" if it exists, otherwise first remote
        return remotes.includes("origin") ? "origin" : remotes[0];
      }
    } catch {
      // ignore
    }

    return "origin";
  }

  async getLastCommitMessage(): Promise<string> {
    try {
      const output = await this.execGit(["log", "-1", "--format=%B"]);
      return output.trim();
    } catch {
      return "";
    }
  }

  async getRecentCommitMessages(count = 20): Promise<string[]> {
    try {
      const output = await this.execGit(["log", `-${count}`, "--format=%s"]);
      return output
        .trim()
        .split("\n")
        .filter((msg) => msg.length > 0);
    } catch {
      return [];
    }
  }

  /** The configured committer identity, or null when neither field is set. */
  async getCurrentUser(): Promise<{ name: string; email: string } | null> {
    // `git config <key>` exits 1 when the key is unset, so a half-configured
    // identity (name without email) must not throw away the value we did get.
    const read = async (key: string): Promise<string> => {
      try {
        return (await this.execGit(["config", "--get", key])).trim();
      } catch {
        return "";
      }
    };
    const [name, email] = await Promise.all([
      read("user.name"),
      read("user.email"),
    ]);
    if (!name && !email) {
      return null;
    }
    return { name, email };
  }

  /**
   * Recent commit subjects authored by `author` (an email or name, matched
   * the way `git log --author` does). Empty when the person has no commits.
   */
  async getRecentCommitSubjectsByAuthor(
    author: string,
    count = 10,
  ): Promise<string[]> {
    try {
      const output = await this.execGit([
        "log",
        `-${count}`,
        `--author=${author}`,
        "--format=%s",
      ]);
      return output
        .trim()
        .split("\n")
        .filter((msg) => msg.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Whether the path is recorded in `HEAD`. Callers deciding how to roll a
   * file back (restore vs. unstage/delete) need this distinction directly;
   * `rollbackFile` uses the same check internally.
   */
  async fileExistsInHead(filePath: string): Promise<boolean> {
    try {
      await this.execGit(["cat-file", "-e", `HEAD:${filePath}`]);
      return true;
    } catch {
      return false;
    }
  }

  async rollbackFile(filePath: string): Promise<void> {
    // Check if file exists in HEAD (i.e., was previously committed)
    const existsInHead = await this.fileExistsInHead(filePath);

    if (existsInHead) {
      // File exists in HEAD - restore to HEAD version (handles both staged and unstaged changes)
      await this.execGit(["checkout", "HEAD", "--", filePath]);
    } else {
      // File is new (not in HEAD) - remove from index and delete from disk
      try {
        await this.execGit(["rm", "-f", "--cached", "--", filePath]);
      } catch {
        // Not in index either, nothing to unstage
      }
      const fullPath = path.join(this.cwd, filePath);
      try {
        await fs.unlink(fullPath);
      } catch {
        // File already doesn't exist on disk
      }
    }
  }

  // ─── Shelf (Stash-based) Operations ───────────────────────────────

  async getShelves(): Promise<import("./types").ShelveEntry[]> {
    try {
      const output = await this.execGit([
        "stash",
        "list",
        "--format=%gd%x00%s%x00%aI%x00%D",
      ]);
      if (!output.trim()) return [];

      const entries: import("./types").ShelveEntry[] = [];
      for (const line of output.trim().split("\n")) {
        if (!line.trim()) continue;
        const parts = line.split("\x00");
        const id = parts[0] ?? "";
        const message = (parts[1] ?? "").replace(/^(WIP on|On) [^:]+:\s*/, "");
        const date = parts[2] ?? "";
        const _refs = parts[3] ?? "";
        // Extract branch from refs or message
        const branchMatch = (parts[1] ?? "").match(/^(?:WIP on|On) ([^:]+)/);
        const branch = branchMatch?.[1] ?? "";

        entries.push({ id, message, date, branch, files: [] });
      }

      // Load files for each stash
      for (const entry of entries) {
        try {
          const filesOutput = await this.execGit([
            "stash",
            "show",
            entry.id,
            "--name-only",
          ]);
          entry.files = filesOutput
            .trim()
            .split("\n")
            .filter(Boolean)
            .map(unquoteGitPath);
        } catch {
          // ignore
        }
      }

      return entries;
    } catch {
      return [];
    }
  }

  async shelveChanges(message: string, filePaths?: string[]): Promise<void> {
    if (filePaths && filePaths.length > 0) {
      // Strategy: to stash only specific files without pulling in other staged files,
      // we need to temporarily reset the index, stage only our target files, then stash.

      // 1. Save current index state by creating a temporary stash of the index
      //    We use a different approach: reset index, add targets, stash, restore index.

      // Get current status to know what's staged
      const statusBefore = await this.execGit(["status", "--porcelain=v1"]);
      const previouslyStaged: string[] = [];
      for (const line of statusBefore.split("\n")) {
        if (line.length < 4) continue;
        const indexStatus = line[0];
        if (indexStatus !== " " && indexStatus !== "?" && indexStatus !== "!") {
          const rest = line.substring(3);
          const { path: filePath } = splitStatusPaths(rest);
          previouslyStaged.push(filePath);
        }
      }

      // 2. Reset the index (unstage everything) without touching working tree
      try {
        await this.execGit(["reset", "HEAD"]);
      } catch {
        // May fail if there's no HEAD (initial commit) — that's ok
      }

      // 3. Stage only the target files
      await this.execGit(["add", "--", ...filePaths]);

      // 4. Stash only the staged files
      await this.execGit([
        "stash",
        "push",
        "--staged",
        "-m",
        message || "Shelved changes",
      ]);

      // 5. Re-stage previously staged files (that weren't stashed)
      const remainingToStage = previouslyStaged.filter(
        (f) => !filePaths.includes(f),
      );
      if (remainingToStage.length > 0) {
        try {
          await this.execGit(["add", "--", ...remainingToStage]);
        } catch {
          // Some files may no longer exist, ignore errors
        }
      }
    } else {
      // Stash all changes including untracked
      const args = ["stash", "push", "-m", message || "Shelved changes", "-u"];
      await this.execGit(args);
    }
    this.invalidateCache();
  }

  /** `git stash push` with the Stash Changes dialog's options. False when there was nothing to stash. */
  async stashChanges(options: StashPushOptions): Promise<boolean> {
    const before = await this.stashTopSha();
    await this.execGit(buildStashPushArgs(options));
    const after = await this.stashTopSha();
    this.invalidateCache();
    // `stash push` exits 0 with "No local changes to save" and a stale top.
    return after !== null && after !== before;
  }

  async unshelveChanges(
    stashId: string,
    drop = true,
    reinstateIndex = false,
  ): Promise<void> {
    await this.execGit(
      buildUnstashArgs(stashId, { pop: drop, reinstateIndex }),
    );
    this.invalidateCache();
  }

  /** `git stash branch`: new branch at the stash's base commit, stash applied and (when clean) dropped. */
  async unstashAsBranch(stashId: string, branchName: string): Promise<void> {
    assertStashRef(stashId);
    assertBranchName(branchName);
    await this.execGit(["stash", "branch", branchName.trim(), stashId]);
    this.invalidateCache();
  }

  async deleteShelve(stashId: string): Promise<void> {
    await this.execGit(["stash", "drop", stashId]);
  }

  async stashCount(): Promise<number> {
    const out = await this.execGit(["stash", "list", "--format=%gd"]);
    return out.split("\n").filter((line) => line.trim()).length;
  }

  /** Drop every stash entry. Returns how many there were. */
  async clearStashes(): Promise<number> {
    const count = await this.stashCount();
    if (count > 0) await this.execGit(["stash", "clear"]);
    this.invalidateCache();
    return count;
  }

  // ─── IDEA Shelf (patch-file based) Operations ─────────────────────

  async getIdeaShelves(): Promise<IdeaShelfEntry[]> {
    const shelfDir = path.join(this.cwd, ".idea", "shelf");
    try {
      await fs.access(shelfDir);
    } catch {
      return [];
    }

    const entries: IdeaShelfEntry[] = [];
    const dirContents = await fs.readdir(shelfDir);

    for (const item of dirContents) {
      if (!item.endsWith(".xml")) continue;
      const xmlPath = path.join(shelfDir, item);
      try {
        const xmlContent = await fs.readFile(xmlPath, "utf-8");
        const entry = this.parseIdeaShelfXml(xmlContent, shelfDir);
        if (entry) entries.push(entry);
      } catch {
        // skip malformed entries
      }
    }

    // Sort by date descending (newest first)
    entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
    return entries;
  }

  private parseIdeaShelfXml(
    xmlContent: string,
    shelfDir: string,
  ): IdeaShelfEntry | null {
    // Parse: <changelist name="..." date="..." recycled="...">
    const nameMatch = xmlContent.match(/changelist\s+name="([^"]*)"/);
    const dateMatch = xmlContent.match(/\bdate="(\d+)"/);
    const pathMatch = xmlContent.match(
      /option\s+name="PATH"\s+value="([^"]*)"/,
    );
    const descMatch = xmlContent.match(
      /option\s+name="DESCRIPTION"\s+value="([^"]*)"/,
    );

    if (!nameMatch || !pathMatch) return null;

    const name = nameMatch[1];
    const dateMs = dateMatch ? Number.parseInt(dateMatch[1], 10) : Date.now();
    const date = new Date(dateMs).toISOString();
    const description = descMatch?.[1] ?? "";

    // Resolve $PROJECT_DIR$ to workspace root
    const patchRelative = pathMatch[1].replace(/\$PROJECT_DIR\$/g, this.cwd);
    const patchPath = path.isAbsolute(patchRelative)
      ? patchRelative
      : path.join(shelfDir, patchRelative);

    // Parse files from patch
    const files = this.parseFilesFromPatchPath(patchPath);

    return { name, description, date, patchPath, files };
  }

  private parseFilesFromPatchPath(patchPath: string): string[] {
    try {
      const content = require("node:fs").readFileSync(patchPath, "utf-8");
      return this.parseFilesFromPatch(content);
    } catch {
      return [];
    }
  }

  private parseFilesFromPatch(patchContent: string): string[] {
    const files: string[] = [];
    const lines = patchContent.split("\n");
    for (const line of lines) {
      // Match: diff --git a/<old> b/<new> (bare or C-quoted per side)
      const diffPath = parseDiffGitHeader(line);
      if (diffPath !== null) {
        files.push(diffPath);
        continue;
      }
      // Match: Index: path
      const indexMatch = line.match(/^Index:\s+(.+)$/);
      if (indexMatch) {
        files.push(unquoteGitPath(indexMatch[1]));
      }
    }
    return [...new Set(files)];
  }

  /** Returns the (de-duplicated) name of the shelf that was created. */
  async ideaShelveChanges(
    message: string,
    filePaths?: string[],
  ): Promise<string> {
    const shelfDir = path.join(this.cwd, ".idea", "shelf");
    await fs.mkdir(shelfDir, { recursive: true });

    const sanitizedName = this.sanitizeShelfName(message || "Changes");
    const uniqueName = await this.getUniqueShelfName(shelfDir, sanitizedName);

    // Create shelf subdirectory
    const entryDir = path.join(shelfDir, uniqueName);
    await fs.mkdir(entryDir, { recursive: true });

    // Generate patch
    let patchContent = "";
    if (filePaths && filePaths.length > 0) {
      patchContent = await this.generatePatchForFiles(filePaths);
    } else {
      patchContent = await this.generatePatchAll();
    }

    if (!patchContent.trim()) {
      // Clean up empty directory
      await fs.rm(entryDir, { recursive: true, force: true });
      throw new Error("No changes to shelve");
    }

    // Write patch file
    const patchFilePath = path.join(entryDir, "shelved.patch");
    await fs.writeFile(patchFilePath, patchContent, "utf-8");

    // Write XML metadata
    const timestamp = Date.now();
    const xmlContent = `<changelist name="${this.escapeXml(uniqueName)}" date="${timestamp}" recycled="false">\n  <option name="PATH" value="$PROJECT_DIR$/.idea/shelf/${uniqueName}/shelved.patch" />\n  <option name="DESCRIPTION" value="${this.escapeXml(message || "")}" />\n</changelist>\n`;
    const xmlPath = path.join(shelfDir, `${uniqueName}.xml`);
    await fs.writeFile(xmlPath, xmlContent, "utf-8");

    // Revert the files in working tree
    if (filePaths && filePaths.length > 0) {
      await this.revertFiles(filePaths);
    } else {
      await this.revertAllChanges();
    }

    this.invalidateCache();
    return uniqueName;
  }

  async ideaUnshelveChanges(shelfName: string, drop?: boolean): Promise<void> {
    const shelfDir = path.join(this.cwd, ".idea", "shelf");
    const patchPath = path.join(shelfDir, shelfName, "shelved.patch");

    try {
      const patchContent = await fs.readFile(patchPath, "utf-8");
      if (patchContent.trim()) {
        // Apply patch using git apply
        try {
          await this.execGit(["apply", "--3way", patchPath]);
        } catch {
          // Try without --3way as fallback
          await this.execGit(["apply", patchPath]);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(`Failed to apply shelf "${shelfName}": ${message}`);
    }

    if (drop) {
      await this.deleteIdeaShelf(shelfName);
    }

    this.invalidateCache();
  }

  async deleteIdeaShelf(shelfName: string): Promise<void> {
    const shelfDir = path.join(this.cwd, ".idea", "shelf");
    const entryDir = path.join(shelfDir, shelfName);
    const xmlPath = path.join(shelfDir, `${shelfName}.xml`);

    // Delete directory
    try {
      await fs.rm(entryDir, { recursive: true, force: true });
    } catch {
      // ignore
    }

    // Delete XML file
    try {
      await fs.unlink(xmlPath);
    } catch {
      // ignore
    }
  }

  private sanitizeShelfName(name: string): string {
    return name
      .replace(/[<>:"/\\|?*]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 100);
  }

  async importPatchAsShelf(name: string, patchContent: string): Promise<void> {
    const shelfDir = path.join(this.cwd, ".idea", "shelf");
    await fs.mkdir(shelfDir, { recursive: true });

    const sanitized = this.sanitizeShelfName(name || "Imported");
    const shelfName = await this.getUniqueShelfName(shelfDir, sanitized);

    // Create shelf directory and write patch
    const entryDir = path.join(shelfDir, shelfName);
    await fs.mkdir(entryDir, { recursive: true });
    await fs.writeFile(
      path.join(entryDir, "shelved.patch"),
      patchContent,
      "utf-8",
    );

    // Write XML metadata
    const now = Date.now();
    const xml = `<changelist name="${shelfName}" date="${now}" recycled="false">\n  <option name="PATH" value="$PROJECT_DIR$/.idea/shelf/${shelfName}/shelved.patch" />\n  <option name="DESCRIPTION" value="${shelfName}" />\n</changelist>\n`;
    await fs.writeFile(path.join(shelfDir, `${shelfName}.xml`), xml, "utf-8");
  }

  private async getUniqueShelfName(
    shelfDir: string,
    baseName: string,
  ): Promise<string> {
    let candidate = baseName;
    let counter = 1;
    while (true) {
      const xmlPath = path.join(shelfDir, `${candidate}.xml`);
      try {
        await fs.access(xmlPath);
        // File exists, try next
        candidate = `${baseName}${counter}`;
        counter++;
      } catch {
        // File doesn't exist, use this name
        return candidate;
      }
    }
  }

  private async generatePatchForFiles(filePaths: string[]): Promise<string> {
    let patch = "";

    // Separate tracked and untracked files
    const tracked: string[] = [];
    const untracked: string[] = [];

    for (const filePath of filePaths) {
      try {
        await this.execGit(["ls-files", "--error-unmatch", filePath]);
        tracked.push(filePath);
      } catch {
        untracked.push(filePath);
      }
    }

    // Generate diff for tracked files (staged + unstaged)
    if (tracked.length > 0) {
      try {
        const diff = await this.execGit(["diff", "HEAD", "--", ...tracked]);
        patch += diff;
      } catch {
        // If HEAD doesn't exist (initial commit), diff against empty tree
        try {
          const diff = await this.execGit([
            "diff",
            "--cached",
            "--",
            ...tracked,
          ]);
          patch += diff;
        } catch {
          // ignore
        }
      }
    }

    // Generate patch for untracked files
    for (const filePath of untracked) {
      const fullPath = path.join(this.cwd, filePath);
      try {
        const content = await fs.readFile(fullPath, "utf-8");
        patch += untrackedFilePatch(filePath, content);
      } catch {
        // skip files that can't be read
      }
    }

    return patch;
  }

  private async generatePatchAll(): Promise<string> {
    let patch = "";

    // Get diff for all tracked changes
    try {
      const diff = await this.execGit(["diff", "HEAD"]);
      patch += diff;
    } catch {
      try {
        const diff = await this.execGit(["diff", "--cached"]);
        patch += diff;
      } catch {
        // ignore
      }
    }

    // Get untracked files
    try {
      const untrackedOutput = await this.execGit([
        "ls-files",
        "--others",
        "--exclude-standard",
      ]);
      const untrackedFiles = untrackedOutput
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(unquoteGitPath);

      for (const filePath of untrackedFiles) {
        const fullPath = path.join(this.cwd, filePath);
        try {
          const content = await fs.readFile(fullPath, "utf-8");
          patch += untrackedFilePatch(filePath, content);
        } catch {
          // skip binary or unreadable files
        }
      }
    } catch {
      // ignore
    }

    return patch;
  }

  private async revertFiles(filePaths: string[]): Promise<void> {
    for (const filePath of filePaths) {
      try {
        await this.execGit(["ls-files", "--error-unmatch", filePath]);
        // Tracked file: checkout from HEAD
        await this.execGit(["checkout", "HEAD", "--", filePath]);
      } catch {
        // Untracked file: delete it
        const fullPath = path.join(this.cwd, filePath);
        try {
          await fs.unlink(fullPath);
        } catch {
          // ignore
        }
      }
    }
  }

  private async revertAllChanges(): Promise<void> {
    // Reset tracked files
    try {
      await this.execGit(["checkout", "HEAD", "--", "."]);
    } catch {
      // ignore (e.g. no HEAD yet)
    }
    // Remove untracked files
    try {
      await this.execGit(["clean", "-fd"]);
    } catch {
      // ignore
    }
  }

  private escapeXml(str: string): string {
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  // ────────────────────────────────────────────
  // Submodules and sparse checkout
  // ────────────────────────────────────────────

  /** `execGit` bound for the vscode-free cores (submodules, sparse, shallow). */
  private readonly runGit = (
    args: string[],
    env?: Record<string, string | undefined>,
  ): Promise<string> => this.execGit(args, undefined, env);

  /** No prompts for passwords or ssh questions: operations that talk to a remote. */
  private networkEnv(): Promise<Record<string, string | undefined>> {
    return nonInteractiveGitEnv(this.cwd);
  }

  async listSubmodules(): Promise<SubmoduleInfo[]> {
    return listSubmodules(this.runGit);
  }

  async updateSubmodules(paths: string[] = []): Promise<void> {
    await updateSubmodules(this.runGit, paths, await this.networkEnv());
    this.invalidateCache();
  }

  async syncSubmodules(paths: string[] = []): Promise<void> {
    await syncSubmodules(this.runGit, paths);
    this.invalidateCache();
  }

  async getSparseCheckout(): Promise<SparseCheckoutStatus> {
    return sparseCheckoutStatus(this.runGit);
  }

  async enableSparseCheckout(directories: string[] = []): Promise<void> {
    await enableSparseCheckout(this.runGit, directories);
    this.invalidateCache();
  }

  async setSparseCheckout(directories: string[]): Promise<void> {
    await setSparseCheckout(this.runGit, directories);
    this.invalidateCache();
  }

  async addSparseCheckout(directories: string[]): Promise<void> {
    await addSparseCheckout(this.runGit, directories);
    this.invalidateCache();
  }

  async disableSparseCheckout(): Promise<void> {
    await disableSparseCheckout(this.runGit);
    this.invalidateCache();
  }

  // ────────────────────────────────────────────
  // Worktree operations
  // ────────────────────────────────────────────

  async listWorktrees(): Promise<WorktreeInfo[]> {
    const output = await this.execGit(["worktree", "list", "--porcelain"]);
    return parseWorktreeList(output, this.cwd);
  }

  async addWorktree(
    worktreePath: string,
    branch: string,
    newBranch?: string,
    force = false,
  ): Promise<void> {
    // `--force` is what makes a second worktree on an already-checked-out
    // branch possible: without it git aborts with "'<branch>' is already used
    // by worktree at …". The caller only asks for it after warning the user.
    const forceArgs = force ? ["--force"] : [];
    if (newBranch) {
      await this.execGit([
        "worktree",
        "add",
        ...forceArgs,
        "-b",
        newBranch,
        worktreePath,
        branch,
      ]);
    } else {
      await this.execGit([
        "worktree",
        "add",
        ...forceArgs,
        worktreePath,
        branch,
      ]);
    }
    this.invalidateCache();
  }

  /** Absolute path of the repository's `.worktreeinclude` file. */
  get worktreeIncludePath(): string {
    return path.join(this.cwd, WORKTREE_INCLUDE_FILE);
  }

  /**
   * Local-only files matched by `.worktreeinclude`, relative to the repo root.
   *
   * Git does the matching through `--exclude-from`, so `.gitignore` syntax,
   * `!` negation and `dir/` behave as users expect. `--others --ignored`
   * restricts the result to untracked files — tracked ones already travel with
   * the worktree — and `-z` keeps non-ASCII paths byte-exact.
   */
  async listWorktreeIncludeFiles(): Promise<string[]> {
    try {
      await fs.stat(this.worktreeIncludePath);
    } catch {
      // No file: git would abort with "cannot use … as an exclude file".
      return [];
    }
    const output = await this.execGit([
      "ls-files",
      "-z",
      "--others",
      "--ignored",
      "--exclude-from",
      WORKTREE_INCLUDE_FILE,
    ]);
    return output.split("\0").filter(Boolean);
  }

  async removeWorktree(worktreePath: string): Promise<void> {
    await this.execGit(["worktree", "remove", worktreePath]);
    this.invalidateCache();
  }

  /** Protect a worktree from `prune` and `remove`; the reason is shown by `worktree list`. */
  async lockWorktree(worktreePath: string, reason?: string): Promise<void> {
    const trimmed = reason?.trim();
    await this.execGit([
      "worktree",
      "lock",
      ...(trimmed ? ["--reason", trimmed] : []),
      worktreePath,
    ]);
    this.invalidateCache();
  }

  async unlockWorktree(worktreePath: string): Promise<void> {
    await this.execGit(["worktree", "unlock", worktreePath]);
    this.invalidateCache();
  }

  async pruneWorktrees(): Promise<void> {
    await this.execGit(["worktree", "prune"]);
    this.invalidateCache();
  }

  invalidateCache(pattern?: string): void {
    this.cache.invalidate(pattern);
  }
}

/**
 * Parse `git blame --porcelain -l` output.
 * Records: "<sha> <origLine> <finalLine>[ <groupSize>]" header followed by
 * metadata lines (author, author-mail, author-time, summary, ...) until a
 * "\t" content line. Keyed by finalLine = working tree line number.
 */
function parseBlamePorcelain(output: string): BlameLine[] {
  const lines: BlameLine[] = [];
  const linesByHashCache = new Map<
    string,
    Pick<
      BlameLine,
      | "shortHash"
      | "authorName"
      | "authorEmail"
      | "authorTime"
      | "authorDate"
      | "summary"
    >
  >();
  let current: BlameLine | null = null;

  for (const line of output.split("\n")) {
    if (!line) {
      continue;
    }
    if (line.startsWith("\t")) {
      // Content line: end of this record's metadata
      current = null;
      continue;
    }

    const headerMatch = /^([0-9a-f]{40}) (\d+) (\d+)(?: \d+)?$/.exec(line);
    if (headerMatch) {
      const hash = headerMatch[1];
      const finalLine = Number(headerMatch[3]);
      const uncommitted = /^0{40}$/.test(hash);

      // Metadata blocks repeat per blamed line; cache per commit hash.
      let meta = linesByHashCache.get(hash);
      if (!meta) {
        meta = {
          shortHash: "",
          authorName: "",
          authorEmail: "",
          authorTime: 0,
          authorDate: "",
          summary: "",
        };
        linesByHashCache.set(hash, meta);
      }

      current = {
        hash,
        shortHash: meta.shortHash || hash.slice(0, 8),
        authorName: meta.authorName,
        authorEmail: meta.authorEmail,
        authorTime: meta.authorTime,
        authorDate: meta.authorDate,
        lineNumber: finalLine,
        summary: meta.summary || undefined,
        uncommitted,
      };
      lines.push(current);
      continue;
    }

    // Metadata key-value line belonging to the current record
    if (current && !current.uncommitted) {
      const spaceIdx = line.indexOf(" ");
      const key = spaceIdx === -1 ? line : line.slice(0, spaceIdx);
      const value = spaceIdx === -1 ? "" : line.slice(spaceIdx + 1);
      const cached = linesByHashCache.get(current.hash);
      if (!cached) {
        continue;
      }
      switch (key) {
        case "author":
          current.authorName = value;
          cached.authorName = value;
          break;
        case "author-mail":
          current.authorEmail = value.replace(/^<|>$/g, "");
          cached.authorEmail = current.authorEmail;
          break;
        case "author-time": {
          const unixSeconds = Number(value);
          current.authorTime = unixSeconds;
          cached.authorTime = unixSeconds;
          const date = new Date(unixSeconds * 1000);
          current.authorDate = formatDate(date);
          cached.authorDate = current.authorDate;
          break;
        }
        case "summary":
          current.summary = value;
          cached.summary = value;
          break;
      }
      // Uncommitted (all-zero pseudo commit) metadata is intentionally skipped:
      // placeholder fields stay empty and the UI renders an "Uncommitted" label.
    }
  }

  return lines;
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}/${m}/${d}`;
}

function parseLogOutput(
  output: string,
  remoteNames: Set<string> = new Set(),
): CommitNode[] {
  const commits: CommitNode[] = [];
  const records = output.split(RECORD_SEP);

  for (const record of records) {
    const trimmed = record.trim();
    if (!trimmed) {
      continue;
    }
    const fields = trimmed.split(FIELD_SEP);
    if (fields.length < 9) {
      continue;
    }

    const refsStr = fields[8]?.trim() ?? "";
    const refs = parseRefs(refsStr, remoteNames);

    commits.push({
      hash: fields[0] ?? "",
      shortHash: fields[1] ?? "",
      parents: (fields[2] ?? "").split(" ").filter((s) => s.length > 0),
      authorName: fields[3] ?? "",
      authorEmail: fields[4] ?? "",
      authorDate: fields[5] ?? "",
      subject: fields[6] ?? "",
      body: fields[7] ?? "",
      refs,
    });
  }
  return commits;
}

function parseRefs(refsStr: string, remoteNames: Set<string>): RefInfo[] {
  if (!refsStr) {
    return [];
  }
  const refs: RefInfo[] = [];
  const parts = refsStr.split(",").map((s) => s.trim());

  for (const part of parts) {
    if (!part) {
      continue;
    }
    if (part === "HEAD") {
      refs.push({ type: "HEAD", name: "HEAD" });
    } else if (part.startsWith("HEAD -> ")) {
      refs.push({ type: "HEAD", name: "HEAD" });
      refs.push({ type: "branch", name: part.replace("HEAD -> ", "") });
    } else if (part.startsWith("tag: ")) {
      refs.push({ type: "tag", name: part.replace("tag: ", "") });
    } else if (part.includes("/")) {
      // `%D` prefixes remote-tracking branches with their configured remote
      // name, so a ref like `origin/main` is remote exactly when its first
      // segment is a real remote — a local `dev/sub` or `user/feature` no
      // longer reads as remote the way the old hardcoded prefix list made it.
      const firstSlash = part.indexOf("/");
      const prefix = part.substring(0, firstSlash);
      if (remoteNames.has(prefix)) {
        refs.push({ type: "remote-branch", name: part });
      } else {
        refs.push({ type: "branch", name: part });
      }
    } else {
      refs.push({ type: "branch", name: part });
    }
  }
  return refs;
}

/**
 * Build a "new file" patch for an untracked file's exact content. Splitting on
 * `\n` leaves a phantom trailing empty line when the file ends with a newline;
 * counting real lines (and emitting no hunk for an empty file) keeps `git
 * apply` from adding a blank last line when the shelf is unshelved.
 */
function untrackedFilePatch(filePath: string, content: string): string {
  // `"".split("\n")` is `[""]`, not `[]` — an empty file must stay empty or
  // the hunk would restore it as a single blank line. A trailing newline
  // otherwise produces a phantom last element; drop it.
  const lines = content === "" ? [] : content.split("\n");
  if (lines.length > 0 && content.endsWith("\n")) {
    lines.pop();
  }
  let patch = `diff --git a/${filePath} b/${filePath}\n`;
  patch += "new file mode 100644\n";
  patch += "--- /dev/null\n";
  patch += `+++ b/${filePath}\n`;
  if (lines.length === 0) {
    // An empty file: `git diff` emits headers without any hunk.
    return patch;
  }
  patch += `@@ -0,0 +1,${lines.length} @@\n`;
  for (const line of lines) {
    patch += `+${line}\n`;
  }
  if (!content.endsWith("\n")) {
    // Without this marker git apply appends a newline that was never there.
    patch += "\\ No newline at end of file\n";
  }
  return patch;
}

function parseTrack(track: string): { ahead: number; behind: number } {
  let ahead = 0;
  let behind = 0;
  const aheadMatch = track.match(/ahead (\d+)/);
  if (aheadMatch) {
    ahead = parseInt(aheadMatch[1], 10);
  }
  const behindMatch = track.match(/behind (\d+)/);
  if (behindMatch) {
    behind = parseInt(behindMatch[1], 10);
  }
  return { ahead, behind };
}

/**
 * Parse `git worktree list --porcelain` output.
 * Each worktree block is separated by an empty line.
 * Fields: worktree <path>, HEAD <sha>, branch <ref> (or detached), and
 * `locked [<reason>]` for a locked worktree. A reason with unusual characters
 * is C-quoted by git.
 */
function parseWorktreeList(output: string, mainCwd: string): WorktreeInfo[] {
  const worktrees: WorktreeInfo[] = [];
  const blocks = output.split("\n\n");

  for (const block of blocks) {
    const lines = block.trim().split("\n");
    if (lines.length === 0) continue;

    let wtPath = "";
    let head = "";
    let branch = "";
    let locked = false;
    let lockReason: string | undefined;

    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        wtPath = line.substring("worktree ".length).trim();
      } else if (line.startsWith("HEAD ")) {
        head = line.substring("HEAD ".length).trim();
      } else if (line.startsWith("branch ")) {
        // branch refs/heads/feature-x → feature-x
        const ref = line.substring("branch ".length).trim();
        branch = ref.replace(/^refs\/heads\//, "");
      } else if (line === "locked" || line.startsWith("locked ")) {
        locked = true;
        const reason = unquoteGitPath(line.substring("locked".length).trim());
        if (reason) lockReason = reason;
      }
    }

    if (wtPath) {
      worktrees.push({
        path: wtPath,
        branch,
        head,
        isMain: wtPath === mainCwd,
        locked,
        lockReason,
      });
    }
  }

  return worktrees;
}
