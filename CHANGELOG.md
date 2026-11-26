# Changelog

**English** · [简体中文](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG.zh_CN.md)

Releases before 1.0.0 are archived in [CHANGELOG-archive.md](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG-archive.md).

## [Unreleased]

### Added

- **Shelf toolbar** — The Shelf tab now has a toolbar like the JetBrains Shelf window: Unshelve, Restore (keeps the shelf), Create Patch, Copy as Patch to Clipboard, Delete, Import Patches and Import Patches from Clipboard. Click a shelf to select it; the shelf actions are disabled until one is selected.
- **Update method** — `jgc.update.method` (`merge`, `rebase` or `branchDefault`) decides how Update Project, Pull and branch updates integrate upstream changes, and `jgc.update.saveChangesPolicy` (`stash` or `shelve`) decides how local changes are carried across the update.
- **Smart checkout** — Checking out a branch, tag or commit, or creating a branch, no longer fails on a dirty working tree: a prompt offers Smart (stash, switch, restore), Force (discard, with a second confirmation) or Cancel. Untracked files that would be overwritten are explained instead of offering a destructive option.
- **Stash options** — Stash Changes... (keep index, include untracked), Unstash As... (as a new branch, pop, reinstate index) and Clear All Stashes... from the Stash tab toolbar.
- **Blame options** — `jgc.blame.ignoreWhitespace` and `jgc.blame.detectMovements` (`none`, `inner`, `outer`) control how blame attributes lines.
- **Cherry-pick options** — `jgc.cherryPick.emptyStrategy` (`ask`, `skip`, `createEmpty`) handles commits that become empty, `jgc.cherryPick.appendSourceHash` adds `-x`, and a Log toolbar toggle dims commits already cherry-picked onto HEAD. Continuing after an empty cherry-pick now commits it instead of failing.
- **Fetch options** — `jgc.fetch.prune`, `jgc.fetch.tagsMode` and background auto-fetch (`jgc.fetch.autoFetch`, `jgc.fetch.autoFetchIntervalMinutes`).
- **Branch extras** — Clean Up Merged Branches..., Set / Unset Upstream in the branch menu, and Lock / Unlock for worktrees (a locked worktree shows a lock and cannot be deleted).
- **Rejected pushes recover in place** — Pushes from the branch menu, Commit and Push and Push All up to Here now offer Merge, Rebase or Force with lease when rejected, then retry once. The Push panel adds Force with lease and a "Remember my choice" option. A first push sets the upstream (`jgc.push.autoSetUpstream`, `jgc.push.rejectedAction`).
- **Protected branches** — `jgc.protectedBranches` (default `main`, `master`; `*` globs allowed) refuses force pushes to those branches, asks for explicit confirmation before deleting them and keeps them out of Clean Up Merged Branches.
- **Commit options and checks** — The commit panel gains a gear menu with sign-off and run-Git-hooks switches, and warns before committing large files, CRLF line endings, a detached HEAD or rebase in progress, or a missing `user.name` / `user.email`, with a "Commit anyway" prompt. Each check can be turned off in settings (`jgc.commit.*`).
- **GPG signing** — Choose GPG Key... picks a key and turns signing on; `jgc.commit.gpgSign` (`auto`, `always`, `never`) forces or disables signing per commit.
- **Repository commands** — Clone Repository (with progress and cancel, never prompts for credentials), Create Git Repository for a workspace that is not one yet, submodule list / update / sync / open, sparse checkout management, and Unshallow / Deepen. `jgc.clone.recurseSubmodules` controls submodule cloning.

- **Git Log message and path filters** — The message filter has Match Case and Regex toggles, and a new Path filter takes a file or folder. Git applies both across the whole history, and they stay in force while scrolling and refreshing. The text box no longer matches hash substrings; use Go To instead.
- **Go To Hash / Branch / Tag** — Cmd+Shift+L (Ctrl+Shift+L) finds a commit by hash, branch or tag, loading more history until it appears and lifting any filter that hides it. Ctrl+L focuses the filter box.
- **Interactive rebase** — Interactively Rebase from Here... on any commit opens a dialog with per-commit pick / reword / edit / squash / fixup / drop, reordering, `--onto`, autosquash, keep-empty, update-refs and rebase-merges.
- **Edit Commit Message, Fixup and Squash Into** — on a commit's context menu.
- **Changelists** — Group unstaged changes into named lists in the Commit panel, like IDEA's Changes view. Create, rename, delete and Set Active from a list's right-click menu or the New Changelist toolbar button; new changes land in the active list. Drag files (or a whole selection) onto a list, or use Move to Another Changelist... from a file or folder menu. Shelve Changelist... shelves just that list's files. After a partial commit, an offer moves the files you left behind into a new list (`jgc.changelists.offerMoveOnPartialCommit`). The Changes view gets a Changelist grouping. Lists are stored per worktree inside the git directory, never in the repository, and the Staged group, Unversioned Files and Merge Conflicts behave as before. `jgc.changelists.enabled` turns the feature off.

### Improved

- Continuing a rebase no longer opens an editor.

### Fixed

- A hook-declined push no longer offers Merge / Rebase as if it were a rejected push.
- Amend-and-push is checked against the protected branches before the commit is rewritten.

## [1.2.0] - 2026-11-14

### Added

- **Git Reset dialog** — Reset Current Branch to Here... on a commit opens a dialog with four modes (Soft, Mixed, Hard, Keep), each explaining what it does to the working tree and the index.
- **More commit context menu actions** — Create Patch... (export the commit as a patch file), Show Repository at Revision (list the files at that revision), Compare with Local (diff against the working tree), Undo Commit... (revert the current commit; unavailable on main/master and on non-HEAD commits), Push All up to Here... (push the current branch up to that commit) and Go to Child / Parent Commit.
- **Remote context menu** — Right-clicking a remote's folder offers Edit Remote... and Remove Remote with confirmation. The folder row now matches the section header: one click selects, double click expands or collapses.
- **Manage Remotes dialog** — Lists every remote with its name and URL, and adds, renames, re-addresses or removes them, with an option to fetch right away.
- **HEAD row context menu** — New branch, compare with working tree, new worktree, update, push and rename.
- **Tag context menu** — Checkout, compare with working tree, merge into the current branch, new worktree, push to a chosen remote and delete; a multi-selection shows delete only.
- **Caret line-end blame** — The line the caret sits on shows `Who, date * summary` after the code, with `You` for your own commits and nothing for uncommitted lines. Template, message length and date format are configurable.
- **AI-generated commit messages** — The sparkle next to **Commit** writes a message for the checked files only, streams it into the input box, and can be edited or cancelled at any point. It uses any model configured in VS Code; with several installed it asks once and remembers, and the chevron reopens the picker.
- **List multi-selection** — Branches, tags and files support Shift+click ranges, Cmd/Ctrl+click toggling and Shift+Arrow keyboard ranges.
- **Copy local project setup when creating a worktree** — The New Worktree dialog gains a collapsible setup section, off by default, with two independent options.
  - **Copy files listed in .worktreeinclude** carries your local-only files — env files, editor settings, certificates — into the new worktree. The list is committed or kept private as you prefer, uses `.gitignore` syntax, is created when you open the section, and can be edited from the dialog.
  - **Run setup script** runs the script you pick once, passing the new worktree path as its argument, before the project opens. The worktree is kept even if the script fails, and the choice can be cleared again from the same row.
- **Built-in Git prompt** — A first-run prompt offers to disable VS Code's built-in Git so two Git UIs do not duplicate the status bar and decorations. It applies to the current workspace only and can be switched back at any time.
- **Changes view** — The branch context menu gains Show Diff with Working Tree: it lists everything that differs between that branch and the working tree, untracked files included, grouped by module and by directory (both on by default, switchable from the eye button) with Expand All / Collapse All. Double-click a file to open its diff against the branch; after that a single click replaces that same tab, so the editor keeps exactly one diff tab however many files you look at. The toolbar's ✕ closes the panel again — closing editor tabs never does.

### Improved

- **Consistent context menus** — Every menu in the app now looks and behaves the same: it stays inside the viewport, closes on outside click, Esc, scroll or window blur, and aligns icons and shortcuts. Text-only menus no longer leave an empty icon gutter.
- **Menu shortcuts work** — Shortcuts shown in the Commit panel menus are real VS Code keybindings, labelled per platform (`⌘D`, `⌥⌘A` on macOS; `Ctrl + D`, `Alt + Ctrl + A` on Windows/Linux), and active only while the Commit panel has focus.
- **Tag push picks a remote** — Pushing a tag asks which configured remote to use instead of assuming origin.
- **Icons in the New Worktree branch list** — Branches, remote branches and tags are now marked with the same glyphs the Git Log branch tree uses: a filled tag for the branch that is currently checked out, a dashed tag for tags, a branch marker for everything else. The `(current)`, `remote` and `tag` words they replace are gone.
- **Branches that are already checked out are flagged** — The picker and the field show, in light grey, which worktree already holds the selected branch. It is information only: creating the worktree still goes through.
- **The Commit panel and the Git Control panel are independent** — Clicking the Commit icon no longer reveals or focuses the Git Control panel, and collapsing Commit no longer closes it, so a panel you closed stays closed and a dialog open in the panel is not closed behind your back.
- **Brand mark in the status bar** — A separate icon sits to the right of the branch indicator and shows or hides the Git Control panel; the branch itself still opens the Git actions menu. Re-opening restores the panel as you left it, so a Worktrees session comes back as Worktrees rather than being forced onto Git Log. A status bar item cannot render an image, so the mark is the codicon whose shape matches the extension icon.
- **Dialogs in the panel get the whole panel** — Opening New Worktree hides the Git Log view, and opening Create Branch hides the Worktrees view, so each form is not squeezed into a share of the panel; the borrowed view comes back on close. Both forms can be dragged by any blank area and always stay inside the panel, and scrolling a branch list no longer scrolls the dialog behind it.
- **Show Tags actually works** — The sidebar's Show Tags toggle now really shows and hides the Tags section.
- **Clearer HEAD row** — The sidebar's HEAD entry reads `HEAD (Current Branch)`.
- **Simpler blame settings** — `jgc.blame.displayMode` and `jgc.blame.aroundLines` are gone: the line-number annotations always cover the whole file and only the end-of-line blame follows the caret.
- **Fewer redundant settings** — `jgc.shortcut.jumpToSourceLabel` is removed; the Jump to Source label always shows the default bindings.
- **Tidier Command Palette** — Seven development-only commands no longer appear.
- **Changelog split by language** — Release notes now come as an English file and a Simplified Chinese file, with everything before 1.0.0 archived separately, so each version is shorter to scan and the two languages are easier to keep in sync.

### Fixed

- **Phantom branch named after each remote** — The Remote section listed an extra branch named after the remote; it now shows only real remote branches.
- **Stray native menu on empty panels** — Right-clicking empty space in the Commit, Git Log and Worktree panels no longer pops the raw webview menu, while text inputs keep copy and paste.
- **Silent operation failures** — Failed Git operations from menus and panels now raise a notification carrying Git's own message instead of failing silently.
- Fix context menus being drawn behind the Git Log column header: right-clicking the topmost commit in a short panel let the Message / Author / Date / Hash row show through the menu, and its resize handles still took the cursor.
- Fix the Changes view flickering between two diff tabs, and its panel closing itself: file diffs now open as preview tabs so each click replaces the previous one in place, and closing every editor tab no longer leaves the sidebar collapsed with nothing selected.

## [1.1.3] - 2026-10-25

### Added

- **Change hover card** — Hovering a change marker or any changed line shows a card for that block: word-level highlighting for modifications, the HEAD content for deletions, and six actions — Prev Change, Next Change, Rollback Lines, Show Diff for Lines, Copy and Commit this change.
  - Manage Selection... floats the same card over the block at the caret and keeps it open until you act on it.
  - Commit this change commits just that block and leaves the rest of the file exactly as it was.
- **Explorer colours by Git status** — File names are tinted by added, modified, deleted, untracked, ignored and conflict status, so they survive disabling the built-in Git extension.
- **Gutter change markers** — A coloured bar marks every added or modified line and a short marker shows where lines were deleted; ignored files and non-repositories show nothing.
  - With inline blame on, markers keep one column and lines without a label reserve that column too.
- **Decorations can be switched off per layer** — JGC Decorations › Enabled, File Colors and Gutter Markers toggle the two layers independently, so either can fall back to VS Code's built-in decorations.
- **Customisable status colours** — The six Git status colours are exposed as `jgc.decoration.*` IDs and can be changed in Settings or `workbench.colorCustomizations`, defaulting to IDEA's palette.
- **Status bar shows the current branch** — The status bar shows the current branch with incoming and outgoing commit counts in place of the built-in Git item; clicking it opens the usual actions.
  - It follows the active editor's folder in multi-root workspaces and refreshes on any Git change. A detached HEAD is shown instead of disappearing, and checking out a remote branch warns first.
- **Editor context menu folds into one Git submenu** — Show File History moves into it, and the line-number menu gains a Manage Selection... entry.

### Improved

- **Jump to Source keeps your selection** — In a diff editor the selection and the scroll position survive the jump instead of collapsing to a bare cursor line.
- **Faster blame on large files** — Per-line label lookup uses a prebuilt line map instead of rescanning the whole output.

### Fixed

- **Each diff column controls its own blame** — The line-number menu has a single Toggle Git Blame Annotations entry that acts only on the editor the menu was opened on, so neither the two columns nor the two diff sides affect each other.
  - Virtual sides are blamed at the revision they display, and sides without a Git revision say so instead of doing nothing.
- **Commit badge appears immediately** — The pending-changes badge shows as soon as the window loads, without clicking the Commit icon first.
- **Committing respects your checkboxes** — Files that were staged but unchecked no longer end up in the commit.
- **Saving a file no longer resets the Git Log** — A plain save no longer clears the selected commit or the collapsed sequences, and does not scroll back to the top.
- **Compare with Current shows the real diff** — The branch sidebar action shows the merge-base diff instead of opening two empty documents.
- **Worktree refresh works again** — The refresh command no longer invokes itself in a loop.
- **Rollback keeps local copies** — A new file with unstaged edits is no longer deleted from disk when local copies are kept; it is only unstaged.
- **Drop Commit no longer fakes a timeout** — The operation stops reporting a timeout after 30 seconds while the rebase is still running.
- **Rollback Lines leaves other edits alone** — Rolling back one block no longer saves unrelated unsaved edits in the same file.
- **IDEA shelves restore escaped text correctly** — A literal `\n` inside a shelved file is no longer decoded into a real newline.
- **Unshelving no longer adds a blank line** — Restoring a shelf with untracked files no longer appends an empty line, and empty files produce a valid patch.
- **Local branches with a slash stay local** — Branches such as `dev/sub` are classified against the configured remotes instead of a hardcoded prefix list.
- **Continue stages only the conflicts** — Continuing a cherry-pick, rebase or merge no longer stages other modified files.
- **Block commit keeps the executable bit** — Committing a single block takes the file mode from HEAD instead of writing 100644.
- **Amend keeps your message** — Enabling Amend fills the previous message only when the box is empty.
- **Commit file lists no longer get mixed up** — Switching commits quickly no longer shows the previous commit's file list.
- **Deleted files open a diff again** — Deleted entries render as *content before deletion → empty* instead of failing with "file not found", and the HEAD ↔ Staged diff really compares against the index. Fixed by @dunlingzi in #8, reported in #7.
- **Gutter markers follow your edits** — Inserting lines above an edit no longer turns the whole modified region green.
  - Blocks separated only by a blank line merge into one modification when either side exceeds five lines, matching VS Code's quick diff.
- **Headings are no longer all caps** — Group headers, section headers and file counts in the Commit, Push and Git Log panels keep their normal casing.
- **Non-ASCII filenames** — Chinese and other non-ASCII names are no longer shown as octal escapes and every Git operation on them works again, including names with spaces, quotes or arrows. Reported by @dunlingzi in #3, fixed in #4.
- **IDEA shelf file lists are complete** — A shelf no longer omits files whose path Git had quoted.

## [1.1.2] - 2026-10-08

### Added

- **Triple-click to open the source file** — In the Commit panel file list a single click selects, a double click opens the diff and a triple click opens the file.
- **Shift range selection** — Shift+click selects a contiguous run of files in the Commit panel.
- **Jump to Source shortcut** — F4, plus Cmd+↓ on macOS and Ctrl+↓ on Windows/Linux. It works in the Commit panel, the Git Log Changed Files list and inside a diff editor, and can be rebound.
- **Commit badge** — The Commit icon in the activity bar shows how many files are pending, matching the built-in Source Control view.
- **New setting** — `jgc.shortcut.jumpToSourceLabel` controls the text beside Jump to Source in context menus; leave it empty to hide the text.

### Improved

- **Package 33% smaller** — The download shrank from 3.69 MB to 2.48 MB by dropping editor and IDE working files that were shipped by mistake, along with two unreferenced images.

### Fixed

- **Changed Files header was all caps** — It keeps its normal casing.
- **Double-click selected the file name as text** — Double-clicking a file no longer highlights its name.
- **New files did not appear right away** — The Commit panel refreshes as soon as an untracked file is created, renamed or deleted.
- **A stray border appeared while pressing Shift** — The border around the Commit file list is gone.
- **Selection kept files that no longer existed** — A refresh no longer keeps a selection pointing at removed files.

## [1.1.1] - 2026-09-12

### Added

- **Search by commit hash** — Type a commit hash in the search bar to find commits.

### Fixed

- **Commit panel text could be selected** — The file list no longer responds to mouse text selection.
- **Worktree table header was all caps** — It keeps its normal casing.

## [1.1.0] - 2026-08-29

### Added

- **Git Worktree panel** — A sidebar panel manages Git worktrees, listing branch and path with the main worktree protected from deletion.
  - The New Worktree dialog offers a searchable branch and tag dropdown (local branches, `origin/*`, tags), input filtering, an auto-filled project name and a live duplicate-name check.
  - Opening a worktree can cancel, reuse the current window or open a new one, defaulting to the `jgc.worktree.openBehavior` setting.
  - It includes a Prune button and a collapsible sidebar, defaults the location to the repository root and remembers it per repository.

## [1.0.0] - 2026-08-28

### Added

- **Inline Git blame annotations** — WebStorm-style inline blame for every line, with click-to-jump into the Git Log commit graph.
  - The line-number menu toggles between Annotate with Git Blame and Close Annotations.
  - The annotation view multi-selects Revision, Date, Author and Commit Number columns, colours by author or by commit age (or not at all), and shows names as initials, last name, first name, full name or email — keeping at least one column.
  - Colour follows commit age and can be adjusted with `jgc.blame.colorMode`; the date format comes from `jgc.blame.dateFormat` and the hash is hidden by default.

### Improved

- **Renamed to JetBrains Git Control** — Short brand JGC; the extension ID changed from `idea-like-git-graph` to `jetbrains-git-control`.

### Fixed

- **Git Log panel text could be selected** — The file list no longer responds to mouse text selection.
