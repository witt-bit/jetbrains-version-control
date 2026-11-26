# JetBrains Rider Git tooling — feature catalog and gap analysis

> Target: **JetBrains Rider 2026.3.0.2, build 263.7307.355** (`/Applications/Rider.app`, macOS aarch64, JBR Java 25).
> Method: static analysis of the shipped plugin jars. Nothing was executed and no runtime behaviour was observed.
> Companion file: [rider-git-action-catalog.md](./rider-git-action-catalog.md), a generated table of 335 VCS actions with ids, labels, classes and declared shortcuts.

## 1. How to read this document

Every claim carries one of three labels.

| Label | Meaning |
|---|---|
| **Observed** | Read directly from a shipped artifact (descriptor XML, message bundle, class constants, `javap` output). |
| **Inferred** | A reasoned reading of observed facts that was not confirmed by running Rider. |
| **Unknown** | Not established. Listed in section 8. |

"Extension" means this repository (`jetbrains-git`). Its status column is based on `grep` over `src/` and `webview/src/` plus the README, so "Missing" means *not found by search*, not *proved absent*.

## 2. What Rider's Git tooling is

**Observed.**

- It is **JVM code, not .NET**. Rider ships the stock IntelliJ `git4idea` plugin and the platform VCS modules; Rider-specific VCS code is small.
- Plugin directories under `Contents/plugins/`: `vcs-git`, `vcs-git-commit-modal`, `platform-vcs-plugin`, `vcs-github`, `vcs-gitlab`, `vcs-perforce`. Related jars in `Contents/lib/`: `intellij.rider.vcs.jar`, `intellij.rider.vcs.git.jar`, `intellij.platform.vcs.*`, `intellij.platform.diff*`, `intellij.platform.lvcs*`.
- `vcs-git.jar` holds 3,111 entries, 3,089 of them classes (REA evidence `ev_ff71d0d24265404b7f6d67c6a564893f0e69d24b9005a226653537dbefa120b5`, parent inventory `ev_9399ebf6…`).
- Git is driven through the **`git` command line** (`git4idea.commands.GitImpl` builds CLI argument lists; see section 4). `intellij.libraries.jgit.jar` is also bundled; that the Git plugin's command layer does not use it is **inferred** from `GitImpl`'s contents.
- Rider's own additions (from `intellij.rider.vcs.xml` and `intellij.rider.vcs.git.xml`):
  - check-in handlers for reformat, rearrange, optimize imports and code cleanup;
  - the `VcsAuthorCodeVisionProvider` code lens;
  - a default VCS root policy and a "VCS changed files" scope presenter;
  - a Git hook into the file-system explorer.

Descriptor totals after parsing the CDATA-embedded content modules: 590 action and group definitions in 22 module descriptors (207 groups), and 931 extension-point records across 251 distinct extension points.

## 3. Surfaces

**Observed** (extension points and descriptors).

| Surface | Detail |
|---|---|
| Tool windows | `Commit` (left), `Version Control` (bottom; hosts the Log, Shelf, Stage, Stash, Worktrees, Conflicts, Committed and Incoming tabs through `changesViewContent`), `Pull Requests`, `Merge Requests`, `Commit_Guest`. |
| Settings pages | `vcs.Git` (`git4idea.config.GitVcsPanel`), `vcs.log`, GitHub, GitLab, under `project.propVCSSupport.Mappings`. App-level `diff.base`. |
| Status bar widgets | `git` (branch widget), `IncomingChanges`, `light.edit.git`. |
| Annotation gutter | Git annotation options, GitHub/GitLab hooks, show-in-file-history. |
| Editor notifications | ignored→exclude, outdated Git version, changelist conflict, annotate warnings, merge-conflict resolve, index virtual file, **worktree-include** (`GitWorktreeIncludeEditorNotificationProvider`). |
| File types | `.gitignore`, git exclude, `.ignore`, `.patch`/`.diff`. |
| Clone dialog | URL, GitHub, GitHub Enterprise and GitLab tabs. |
| Notification groups | `Vcs Messages`, `Vcs Important Notifications`, `Vcs Notifications`, `Vcs Silent Notifications`. |
| Configuration volume | 103 registry keys, 23 advanced settings, 46 project settings and 18 application settings. |

## 4. Git CLI surface

**Observed.** `git4idea.commands.GitCommand` declares **49 subcommands** (read with `javap -c` on the class initialiser):

`add, blame, branch, for-each-ref, cat-file, checkout, sparse-checkout, check-attr, check-ignore, commit, commit-tree, config, cherry, cherry-pick, clone, diff, fetch, init, log, shortlog, ls-files, ls-tree, ls-remote, merge, merge-base, merge-tree, mv, notes, pull, push, rebase, remote, reset, restore, revert, rev-list, rev-parse, reflog, rm, show, stash, status, submodule, tag, update-index, update-ref, hash-object, hook, version, worktree`

Flags observed as string constants in `GitImpl`: `--abort --exclude-standard --force --force-with-lease --ignore-other-worktrees --ignored --merge --no-commit --no-verify --others --porcelain --progress --prune --recurse-submodules --resolve-undo --set-upstream --set-upstream-to --stdin --unmerged --unset-upstream --verify`, plus `-1 -B -D -b -d -f -m -t -z`.

Rebase options (`GitRebaseOption`): `--interactive --onto --root --autosquash --no-autosquash --keep-empty --update-refs --rebase-merges` (`--preserve-merges` is also present, as a legacy spelling).

`GitImpl` entry points: `addRemote branchCreate branchDelete checkAttr checkout checkoutNewBranch cherryPick clone config createNewTag createWorkingTree deleteTag deleteWorkingTree diff fetch init listWorktrees lockWorkingTree lsRemote merge pruneWorktrees push rebase rebaseAbort rebaseContinue rebaseSkip remotePrune removeRemote renameBranch renameRemote reset resetMerge revert runHook setRemoteUrl setUpstream show stashPop stashSave unlockWorkingTree unsetUpstream updateReference`.

`GitBrancher` operations: `checkout checkoutNewBranch checkoutNewBranchStartingFrom compare compareAny createBranch createNewTag deleteBranch(es) deleteRemoteBranch(es) deleteRemoteTag deleteTag(s) merge rebase rebaseOnCurrent renameBranch renameBranchAndUnsetUpstream showDiff showDiffWithLocal`.

**Extension usage of those 49** (search of `src/`, non-test): used — `add blame branch cat-file checkout check-ignore commit commit-tree config cherry-pick diff fetch for-each-ref log ls-files ls-tree merge merge-base pull push rebase remote reset revert rev-parse rm show stash status tag update-index update-ref hash-object worktree`.
Not found — `sparse-checkout check-attr cherry clone init shortlog ls-remote merge-tree mv notes restore rev-list reflog submodule hook version`.

## 5. Feature catalog and extension status

Rider action ids are in the companion catalog. "Have" = found and working per README or code; "Partial" = present with fewer options; "Missing" = not found.

### 5.1 Branches and navigation

| Rider feature | Observed detail | Extension |
|---|---|---|
| Branches popup (`Git.Branches`, `control shift BACK_QUOTE`; the Mac keymaps *remove* `meta shift BACK_QUOTE`) | Local/remote/tags; settings for recent branches, show tags, grouping, filter by action and by repository (`GitVcsSettings`) | Partial: `showMyBranches`, favorites, group-by-directory, show-tags toggle |
| New Branch dialog | Checkout, set tracking, unset upstream, overwrite existing, per-root | Partial: `createBranch`, `createBranchPrompt`; no tracking/overwrite options |
| Checkout, Checkout and Rebase onto Current, Checkout Revision | `checkout.and.rebase.onto.in.one.step` | Have: `checkoutBranch`, `checkoutAndRebase`, `checkoutCommit` |
| Rename, Delete (local, remote, tracking), Delete tag on remote | | Have: `renameBranch`, `deleteBranch`, `deleteTag` |
| **Smart checkout** | Dialog offers stash or shelve, checkout, then unstash. Policy is `GitSaveChangesPolicy` = `STASH` \| `SHELVE` | Have: Smart / Force / Cancel prompt (`src/git/smartCheckout.ts`, `src/views/smartCheckoutRunner.ts`). Smart uses stash |
| Worktree conflict on checkout | "Checkout Anyway" (`--ignore-other-worktrees`) | Missing |
| Compare with Branch or Tag, Compare with Local | `GitCompareWithRefAction`; swap sides setting | Have: `compareWithCurrent`, `compareWithLocal` |
| Find Merged Local Branches, Clean Up Branches | `Git.FindMergedLocalBranches`, `Git.Cleanup.Branches` | Have: Clean Up Merged Branches... (`src/git/branchCleanup.ts`, `src/commands/branchExtras.ts`) |
| Set / unset upstream | `GitImpl.setUpstream`, `unsetUpstream`; `GitBrancher.renameBranchAndUnsetUpstream` | Have (`src/git/branchUpstream.ts`) |

### 5.2 Update, fetch, push

| Rider feature | Observed detail | Extension |
|---|---|---|
| Update Project (`control T`) | Merge, Rebase or *Branch Default* (`UpdateMethod` also has `RESET`); save policy stash or shelve; "Filter Update Project info by paths"; auto-opens Update Info tab | Partial: `jgc.update.method` and `jgc.update.saveChangesPolicy` drive pull and update (`src/git/gitSettings.ts`); no Update Info tab, no `RESET` |
| Pull dialog (`Git.Pull`) | Repository, remote, branch; options `--ff-only`, `--no-ff`, `--squash`, `--no-commit`, `--rebase` (`pull.option.*`) | Partial: `pullMerge`, `pullRebase`; no option picker |
| Fetch | Fetch tags mode `DEFAULT / PRUNE_TAGS / ALL_TAGS / NO_TAGS`; `--prune`; auto-fetch; incoming check strategy `FETCH / LS_REMOTE / NONE` | Partial: prune, tags mode and timer-based auto-fetch (`src/git/fetchOptions.ts`, `src/git/autoFetch.ts`); no incoming-check strategy |
| Push dialog (`control shift K`) | Commits preview, per-branch target, new/upstream column, `--set-upstream`, Push tags (`ALL` / `FOLLOW`), force (`--force-with-lease` when *Use Safe Force Push* is on) | Partial: `openPushPanel`, `executePush`, `--force-with-lease`, set-upstream on first push (`jgc.push.autoSetUpstream`); no tags mode |
| **Push Rejected** flow | Dialog offers Merge or Rebase (*Rebase Anyway* when published), "remember" checkbox, `auto.update.on.push.rejected` | Have: `pushBranch`, `commitAndPush`, `pushAllUpToHere` and the Push panel offer Merge, Rebase or Force with lease, with a remembered choice (`jgc.push.rejectedAction`, `src/git/pushRejection.ts`, `src/views/pushRecovery.ts`). A hook-declined push is not treated as rejected |
| Protected branches | Patterns list, optional sync of GitHub branch-protection rules, force-push prohibited patterns (`GitSharedSettings`) | Partial: `jgc.protectedBranches` (`src/git/protectedBranches.ts`) refuses force push and confirms deletion; no GitHub rule sync |
| Commit and Push (`control alt K`), *Show Push dialog for Commit and Push*, preview only for protected branches | | Partial: `commitAndPush` always pushes |
| Push All up to Here, Push Selected Commits | | Have: `pushAllUpToHere` |
| Incoming/outgoing counts and incoming-changes widget | `IncomingChanges` widget, `git.update.incoming.outgoing.info` advanced setting | Partial: status bar shows ahead/behind |

### 5.3 Commit and staging

| Rider feature | Observed detail | Extension |
|---|---|---|
| Commit tool window, amend, commit message history | `Vcs.ShowMessageHistory`, `Vcs.*` and `ChangesView.*` actions | Have: commit panel, `amendCommit`, `getRecentCommitMessages`, changelists (5.6) |
| **Staging area mode** | `Enable staging area` (disables changelists); Stage, Unstage, Stage Without Content, Stage All, Rollback; staged vs local virtual files | Partial: `stageFile`, `unstageFile`, `stageAll`, `unstageAll`. Changelists coexist with the index instead of replacing it, so there is no exclusive mode that disables them |
| Partial commit by lines/chunks | Include/exclude lines into commit, split chunks | Partial: gutter hover card "Commit this change" |
| Commit options | Sign-off (`shouldSignOffCommit`), *Do not run commit hooks* (`--no-verify`), author (`getCommitAuthors`), commit renames separately, amend | Partial: amend, sign-off, run-hooks switch (`src/git/commitSettings.ts`); no author override, no commit-renames-separately |
| **GPG signing** | Per-root key chooser, GPG pinentry agent setup | Partial: key chooser and `jgc.commit.gpgSign` (`src/git/gpg.ts`); not applied to cherry-pick, revert, rebase or merge-continue commits; one key for the workspace, not per root |
| Commit checks (`vcsCheckinHandlerFactory`) | Warn on CRLF, files over *N* MB (large files), detached HEAD or mid-rebase, bad file names, user name unset, unresolved merge; commit-message inspections (subject/body limits) | Partial: CRLF, large files, detached HEAD / rebase, missing identity (`src/git/commitChecks.ts`); no bad-file-name, unresolved-merge or message checks |
| Commit All when nothing staged | `commit.all.text` | Missing |
| AI commit message | Not found in the Git/VCS descriptors analysed (JetBrains AI is a separate plugin and was not analysed) | Extension feature |

### 5.4 History rewriting and the Log

| Rider feature | Observed detail | Extension |
|---|---|---|
| Log graph, filters (branch, author, date, path), column set, details panel, parents/children navigation, Go To Hash/Branch/Tag, text filter (`control L`) | 60 action/group definitions in `intellij.platform.vcs.log.impl` | Partial: graph, branch/author/date filters, detail panel, message filter with Match Case and Regex, Path filter, Go To Hash/Branch/Tag (`src/git/logFilter.ts`, `LogFilterBar.tsx`) |
| **Interactive Rebase from Here** | `GitInteractiveRebaseAction`; actions Pick, Reword, Edit, Fixup, Squash, Drop, Update Ref; "Stop to Edit"; Git Commands preview | Have: dialog with per-commit actions and reordering (`src/git/interactiveRebase.ts`, `InteractiveRebaseDialog.tsx`); no drag and drop |
| **Fixup / Squash Into / Squash Commits** | `GitCommitFixupBySubjectAction`, `GitCommitSquashBySubjectAction`, `GitSquashLogAction` | Have: `fixupCommit`, `squashCommit` (Squash Into); the squash message cannot be edited |
| **Edit Commit Message (Reword)** | `GitRewordAction` | Have: `rewordCommit`, `RewordDialog.tsx` |
| Drop Commits, Undo Commit | Confirmation setting `show.rebase.log.drop.confirmation` | Have: `dropCommit` (uses `rebase --onto`), `undoCommit` |
| Rebase dialog | Source branch, new base, old base, `--onto`, `--interactive`, `--update-refs`, `--rebase-merges`, `--keep-empty`, `--root`, `--autosquash` | Partial: the interactive dialog has `--onto`, autosquash, keep-empty, update-refs and rebase-merges; plain `rebaseBranch` has no option set |
| Rebase abort / continue / skip, cherry-pick continue/abort/skip, merge abort | | Have: `rebaseAction`, `getRebaseState`, `cherryPickAction`, `getCherryPickState`, `mergeAction` |
| Cherry-pick | Empty-commit strategy `SKIP` \| `CREATE_EMPTY`; add *(cherry picked from …)* suffix for protected branches; *Highlight Not Cherry-Picked Commits* | Have: empty strategy, `-x` (`jgc.cherryPick.appendSourceHash` is a plain setting, not tied to protected branches) and the Log highlight toggle (`src/git/cherryPick.ts`, `cherryMarks.ts`); `cherryPickFileChanges` ignores these settings |
| Revert Commit, Reset Current Branch to Here | Reset modes `SOFT / MIXED / HARD / KEEP` | Have: `revertCommit`, `resetToCommit` with `GitResetDialog` |
| Extract Selected Changes to Separate Commit, Drop Selected Changes | | Missing |
| Create Patch, Copy Revision Number / Subject, Show Repository at Revision | | Have: `createPatchFromCommit`, `showRepositoryAtRevision` |
| Unshallow repository | `Git.Unshallow` | Have: Unshallow / Deepen (`src/git/shallow.ts`) |

### 5.5 Stash and shelf

| Rider feature | Observed detail | Extension |
|---|---|---|
| Stash Changes dialog | *Keep index*, *Include untracked*, message | Have: Stash Changes... with keep index and include untracked (`src/git/stash.ts`, `StashChangesDialog.tsx`) |
| Unstash dialog | Stash list, *Pop*, *Reinstate index*, *As new branch*, View, Drop, Clear | Have: Unstash As... (new branch, pop, reinstate index), Clear All Stashes..., pop / apply / drop |
| Stash tab, *Combine stashes and shelves in one tab* | `settings.enable.stashes.and.shelves` | Have (stash tab) |
| Stash Silently, Stash Files, Clear, Unstash As, Refresh, Preview Diff | `Git.Stash.Silently`, `Git.Stage.Stash.Files`, `Git.Stash.Clear`, `Git.Stash.UnstashAs`, `Git.Stash.Refresh`, `Git.Stash.Toggle.Split.Preview` | Not found |
| Show Diff for a stash against the *local file* or the *parent commit* | `settings.stash.show.diff.*` | Unverified |
| Shelf: shelve, unshelve, silently, rename, import patches | `Vcs.Shelve*`, `ShelvedChanges.*` | Have: `ideaShelveChanges`, `ideaUnshelveChanges`, `importPatches`, `copyShelfPatchToClipboard` |

### 5.6 Changes view, diff, annotate, history

| Rider feature | Observed detail | Extension |
|---|---|---|
| Changes view: group by Directory, Module, Repository; show ignored | | Have: Changes view with Module/Directory tree |
| Changelists (create, move, set active, delete) | `ChangesView.*` | Have, as an overlay on the index (gap 15): `getChangelists`, `createChangelist`, `renameChangelist`, `deleteChangelist`, `setActiveChangelist`, `moveToChangelist`; Commit panel groups, drag and drop, Shelve Changelist, partial-commit offer, Changes view grouping. No line-level changelists (`Vcs.MoveChangedLinesToChangelist`) |
| Rollback, Rollback Lines | | Have: `rollbackFile(s)`, gutter `marker.rollbackLines` |
| Diff viewer | Combined diff, three-way merge, align changes, open in editor tab | Partial: `openDiffEditor`, 3-way merge editor |
| Annotate (blame) | `AnnotateDetectMovementsOption` `NONE / INNER / OUTER`, ignore-whitespace toggle (both app-level settings) | Have: `jgc.blame.ignoreWhitespace` and `jgc.blame.detectMovements` (`src/git/blameOptions.ts`); configurable columns/colours |
| File history, history for selection | `Vcs.ShowTabbedFileHistory`, `…ForSelection` | Partial: `showFileHistory`; no selection history |
| Local History (put label, revert, project history) | 4 actions in `intellij.platform.lvcs.impl` plus 2 Git-aware | Missing |
| `.gitignore`/exclude actions, *Ignored → exclude* notification | | Missing |
| Merge conflict resolver, Accept Yours / Theirs, Revert Resolved | `Git.ResolveConflicts`, `Git.RevertResolved`, `conflicts.*` strings (both added, deleted by you/them, …) | Have: 3-way merge editor, conflict list, `acceptOurs`, `acceptTheirs` |
| Staged-version compare (HEAD / Staged / Local, three-way) | `Git.Stage.Compare.*`, `Git.Stage.ThreeSideDiff` | Not found |

### 5.7 Remotes, repository, worktrees, hosting

| Rider feature | Observed detail | Extension |
|---|---|---|
| Manage Remotes | add, rename, re-address, remove, fetch after add | Have: `addRemote`, `removeRemote`, `renameRemote`, `setRemoteUrl` |
| Worktrees tool + New Worktree dialog | Copy `.worktreeinclude` files (`git ls-files --others --ignored --exclude-from`), run setup script, "N of 2 settings on" | Have; mirrors the dialog |
| Worktree lock/unlock | `Git.WorkingTrees.ToggleLock`, `GitImpl.lockWorkingTree` / `unlockWorkingTree` | Have: Lock / Unlock in the worktree menu; a locked worktree cannot be deleted |
| Clone, Create Git Repository, Share Project on GitHub | `clone.recurse.submodules` advanced setting | Partial: Clone (`src/git/cloneRepo.ts`) and Create Git Repository (`src/git/initRepo.ts`); no Share Project on GitHub |
| Submodules, sparse checkout | `--recurse-submodules` flag, `sparse-checkout` command | Have: `src/git/submodules.ts`, `src/git/sparseCheckout.ts` |
| GitHub: Pull Requests tool window, create/review PR, gists, Actions, sync fork | ~34 actions | Missing, deferred (gap 17) |
| GitLab: Merge Requests, snippets, CI YAML inspections | ~31 actions | Missing, deferred (gap 17) |

## 6. Settings catalog (Git page and related)

**Observed** from `GitVcsSettings`, `GitVcsApplicationSettings`, `GitSharedSettings`, `GitBundle` and the `intellij.vcs.git.shared` descriptors.

- **Commit**: warn on CRLF, warn on detached HEAD or rebase, warn on large files (limit in MB), warn on bad file names, sign off commit, commit renames separately, preview push on commit and push (and only for protected branches), no-verify.
- **Update**: update method (`BRANCH_DEFAULT / MERGE / REBASE`, with `RESET` as an enum member), save changes policy (`STASH / SHELVE`), auto-update after rejected push, filter update info by paths.
- **Push**: protected branches, force-push prohibited patterns, sync GitHub branch-protection rules, safe force push, tag mode (`ALL / FOLLOW`), remembered push targets.
- **Fetch and incoming**: auto-fetch, check remote for incoming changes, strategy (`FETCH / LS_REMOTE / NONE`), tags mode.
- **Staging and stash**: enable staging area, combined stashes and shelves tab, stash diff against local or parent, split diff preview in stashes.
- **Cherry-pick**: empty-commit strategy, add suffix on published commits.
- **Reset**: remembered mode.
- **Annotate**: detect movements, ignore whitespace.
- **Log**: Drop-commit confirmation.
- **Credentials and executable**: path to git, credential helper, GPG key per root.
- **Branches**: sync across roots (`DvcsSyncSettings`), recent branches, show tags, filter by action/repository, swap sides in compare, branch cleanup symbol.
- **Advanced settings** (23 total; documented ones): recurse submodules on clone, safe force push, incoming/outgoing info, auto-open Update Info, do not run commit hooks, read content with filters/textconv, Windows certificate store, branch cleanup symbol, show branch in recent projects, Git tab in Search Everywhere.

The extension now exposes **38** settings: the original 14 (`jgc.decorations.*`, `jgc.blame.*` appearance, `jgc.caretBlame.*`, `jgc.worktree.openBehavior`, `jgc.onboarding.builtinGitPrompt`) plus 22 Git-behaviour settings under `jgc.update.*`, `jgc.fetch.*`, `jgc.push.*`, `jgc.protectedBranches`, `jgc.commit.*`, `jgc.cherryPick.*`, `jgc.blame.{ignoreWhitespace,detectMovements}` and `jgc.clone.recurseSubmodules`, plus the two `jgc.changelists.*` settings (`enabled`, `offerMoveOnPartialCommit`). Their **defaults were chosen, not read from Rider** (see §8).

## 7. Gap analysis and suggested backlog

Ranked by user value against implementation cost. Status is as of this branch: gaps 1–15 are implemented (uncommitted from gap 15 on), gaps 16–17 are deliberately deferred. The extension's `CommandType` union now has 169 commands (139 when this catalog was written; the "132" in `AGENTS.md` is a historical figure from when the union was closed).

| # | Gap | Rider evidence | Cost | Status |
|---|---|---|---|---|
| 1 | Interactive rebase, Fixup, Squash, Reword | `GitRebaseOption`, `rebase.entry.action.name.*`, five `Git.*` actions | High | Done. `GIT_SEQUENCE_EDITOR` writes the todo list from a dialog. No drag and drop, no squash-message editing. |
| 2 | Push Rejected flow at every push entry point, set-upstream on first push, remember choice | `push.rejected.*` strings, `--set-upstream` | Medium | Done, with Force with lease as a third option. |
| 3 | Update method and save policy settings | `UpdateMethod`, `GitSaveChangesPolicy` | Medium | Done. Replaces the hardcoded `--autostash`. No `RESET`, no Update Info tab. |
| 4 | Smart checkout | `smart.operation.dialog.*` | Medium | Done (Smart / Force / Cancel; Smart stashes). |
| 5 | Fetch options: prune, tags mode, auto-fetch | `GitFetchTagsMode`, `auto.fetch.*` | Low | Done. |
| 6 | Commit options and checks: sign-off, no-verify, large-file, CRLF, detached-HEAD warnings | `settings.*`, `vcsCheckinHandlerFactory` entries | Low | Done, plus a missing-identity check. |
| 7 | Stash dialog options: keep index, unstash as branch, clear | `stash.*`, `unstash.*` | Low | Done. |
| 8 | Protected branches | `GitSharedSettings` | Low-medium | Done, minus GitHub rule sync. |
| 9 | Branch cleanup, find merged branches, set/unset upstream, worktree lock | Actions listed in 5.1, 5.7 | Low | Done. |
| 10 | Cherry-pick empty strategy, *Highlight Not Cherry-Picked* | `EmptyCherryPickResolutionStrategy` | Low | Done. |
| 11 | Log text/regex/path filters, Go To Hash | `Vcs.Log.*` | Medium | Done. The text box no longer matches hash substrings; use Go To. |
| 12 | Annotate movement detection and whitespace toggle | `AnnotateDetectMovementsOption` | Low | Done. |
| 13 | Clone, Init, submodules, sparse checkout, unshallow | `GitCommand` | Medium | Done. |
| 14 | GPG signing | `settings.configure.sign.gpg.*` | Medium | Done for commits; see the limits below. |
| 15 | Changelists | `ChangesView.*` | High | Done, as an overlay: the index and the Staged group are unchanged, so there is no exclusive mode. Lists group tracked, unstaged changes only. See the limits below. |
| 16 | Local History | `intellij.platform.lvcs.impl` | High | Deferred: Git has no equivalent, and VS Code has its own Timeline. |
| 17 | GitHub / GitLab integration | `vcs-github`, `vcs-gitlab` | Very high | Deferred: better as separate extensions, and the existing GitHub and GitLab extensions already cover most of it. |

Where the extension already matches or exceeds Rider: worktree `.worktreeinclude` and setup script, three-way merge editor, AI commit message, caret blame, gutter markers with a hover card, Explorer colours.

### 7.1 Known limits of the implementation

- GPG signing flags are not applied to cherry-pick, revert, rebase, continue or merge-continue commits.
- `cherryPickFileChanges` ignores the cherry-pick settings, and `-x` is not applied after a conflict is resolved.
- `ideaShelveChanges` without a file list runs `git clean -fd` (pre-existing).
- The Push panel's `isUpToDate` is probably always false (pre-existing).
- `getRebaseState` is not worktree-safe, and `rebaseAction("continue")` throws when the rebase stops again on a second conflict (both pre-existing).
- A `withProgress` modal leaves the panel progress bar visible while it runs.
- The Log's "History: file ✕" chip was replaced by the Path filter.
- Changelists cover the primary repository only; files from other workspace folders are untagged and show in the default list.
- Changelists are file-level. IDEA's line-level `Vcs.MoveChangedLinesToChangelist` is not implemented, and the Changes view shows lists read-only (no drag and drop there).
- A path that stops being changed keeps its list for 7 days (`STALE_AFTER_DAYS`), so a shelved or stashed file returns to its original list when restored in that time, and to the active list afterwards. Commit and rollback forget their paths at once.
- New changelists are not made active on creation (the prompt is a plain input box, so there is no "make active" checkbox); use Set Active Changelist.
- The partial-commit offer (`jgc.changelists.offerMoveOnPartialCommit`) approximates IDEA's `OFFER_MOVE_TO_ANOTHER_CHANGELIST_ON_PARTIAL_COMMIT`, which was reconstructed from memory rather than read from the bytecode, and it never fires for the default list.

Where the extension already matches or exceeds Rider: worktree `.worktreeinclude` and setup script, three-way merge editor, AI commit message, caret blame, gutter markers with a hover card, Explorer colours.

## 8. Unknowns and limits

- **No runtime evidence.** Nothing was launched. Dialog layout, defaults and the order of steps are read from strings and class constants, not seen.
- **Default values** of the settings listed in section 6 were not read from the `State` classes. Only names and enum members are established. The extension's defaults were chosen, not copied from Rider: `jgc.update.saveChangesPolicy` = `stash`, `jgc.protectedBranches` = `["main", "master"]` (`*` matches `/`, case-sensitive), large-file threshold 10 MB, `jgc.clone.recurseSubmodules` = false, plus the cherry-pick, fetch and blame defaults.
- **The implementation has not run in a real VS Code host.** It is covered by unit tests against real temporary git repositories and by webview component tests. The auto-fetch timer, the modal prompts, the new dialogs and the status-bar "Create Git Repository" hint are untested there. `gpg` is not installed on the build machine, so signing was tested only through a stand-in `gpg.program`.
- **Interactive-rebase editor behaviour**, **smart-checkout flow**, and **push-rejection handling** are inferred from message keys and class names. Their bytecode was not followed.
- **macOS keymap shortcuts** are mostly not in these descriptors (19 actions declare one). The platform keymap resources were not extracted.
- Rider's own merge tool was not analysed beyond its action ids and `conflicts.*` strings.
- The 53 actions with no resolved text (branch-popup and dynamic actions) take their labels from `GitBundle` at runtime.
- REA has no JVM-class decompiler. Class facts come from `javap -c -p -constants` run on the host against classes unzipped from the jars. Only the `vcs-git.jar` inventory is a retained REA Evidence record.
- Extension "Missing" statuses come from text search. A feature implemented under unexpected names would be reported as missing.

## 9. Reproducing this

1. Unzip descriptors, bundles and classes from `plugins/vcs-git/lib/vcs-git.jar`, `plugins/vcs-git/lib/modules/*.jar`, `plugins/platform-vcs-plugin/lib/modules/*.jar`, `plugins/vcs-github`, `plugins/vcs-gitlab` and `lib/intellij.platform.resources.en.jar` (for `ActionsBundle`).
2. Parse each `plugin.xml` plus the content modules inlined as `<module name="…"><![CDATA[<idea-plugin>…</idea-plugin>]]></module>`. Parsing only the outer XML yields zero actions.
3. Resolve labels through `action.<id>.text` in `ActionsBundle` and the `*Bundle` files, stripping mnemonic underscores.
4. Run `javap -p -c -constants` on `git4idea.commands.GitCommand`, `GitImpl`, `GitRebaseOption`, `GitVcsSettings`, `GitVcsApplicationSettings` and the enums.
