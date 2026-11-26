# AGENTS.md — JetBrains Git

AI agents working on this repo must read this file first.

## Project Overview

A VS Code extension that replaces the built-in Git UI with a JetBrains-style experience:
- **Git Log panel** — commit graph, commit list, branch/tag sidebar, detail panel
- **Commit panel** — working-tree changes, stage/unstage, shelve, AI commit messages
- **Conflicts panel** — 13-way merge editor
- **Diff editors** — file diff, blame, jump-to-source
- **Status bar** — branch, ahead/behind counts

## Project Structure

```
src/                    Extension Host (TypeScript + Node.js)
  ├── extension.ts        Entry point, command registration & MessageRouter handlers
  ├── git/                Git CLI wrappers (gitService, graphLayout, types)
  ├── messages/           Communication protocol (protocol, messageRouter)
  └── views/              Webview managers (mergeEditorManager, conflictsManager, diffEditorManager, html)
webview/                Webview Frontend (React 19 + Vite)
  └── src/
      ├── panel/          Git Log panel (Graph, CommitList, BranchTree, DetailPanel)
      ├── conflicts/      Conflict list page + extra = 13-Way Merge Editor
      ├── shared/         Shared modules (bridge, store, hooks, components, theme)
      └── main.tsx        Router entry (mode: panel | merge | conflicts | commit | push | rollback | worktree | changes)
```

## Architecture

```
src/                         Extension Host (TypeScript + Node.js)
├── extension.ts              Entry point, command registration, MessageRouter handlers
├── git/                      Git CLI wrappers (gitService, types, graphLayout)
├── messages/                 Communication protocol (protocol.ts, messageRouter.ts)
├── views/                    Webview managers (diffEditorManager, mergeEditorManager, html)
├── blame/                    Caret blame, blame text formatting
└── decorations/              Gutter markers, inline blame annotations

webview/                      Webview Frontend (React 19 + Vite)
└── src/
    ├── panel/                Git Log panel (Graph, CommitList, BranchTree, DetailPanel)
    ├── commit/               Commit panel (CommitTab, FileItem, Toolbar, context menus)
    ├── conflicts/            Conflict list + 13-way merge editor
    ├── changes/              Changes view (working-tree list, opens file diffs)
    ├── shared/               Shared modules
    │   ├── bridge/           postMessage wrapper (types.ts, bridge.ts)
    │   ├── store/            Zustand stores (panel-store, commit-store)
    │   ├── hooks/            usePlatform, useModifierClickSelection, useListKeyboardNavigation
    │   ├── shortcuts/        Platform-aware shortcut labels
    │   ├── components/       Reusable UI (Tooltip, FileTree)
    │   ├── theme/            CSS variables (variables.css)
    │   └── types/git.ts      Shared git types (BranchInfo, TagInfo, Commit, etc.)
    └── main.tsx              Router entry (mode: panel | merge | conflicts | commit | push | rollback | worktree | changes)
```

## Communication Protocol

Extension Host ↔ Webview communicate via `postMessage`:

1. **Request/Response** — Webview calls `bridge.request(command, params)`, host handles via `messageRouter.handle()`, returns `{ success, data | error }`
2. **Event Broadcast** — Host sends `messageRouter.broadcastEvent(event, data)`, webview subscribes via `bridge.onEvent(handler)`

**When adding a new bridge command:**
1. Add to `CommandType` in `src/messages/protocol.ts`
2. Add to `CommandType` in `webview/src/shared/bridge/types.ts` (keep in sync)
3. Add handler in `src/extension.ts` via `messageRouter.handle("commandName", async (params) => { ... })`
4. Call from webview via `bridge.request("commandName", { ...params })` or `bridgeWithProgress(...)`

**When adding a new event:**
1. Add to `EventType` in `src/messages/protocol.ts`
2. Add to `EventType` in `webview/src/shared/bridge/types.ts` (keep in sync)
3. Broadcast from host via `messageRouter.broadcastEvent("eventName", data)`
4. Subscribe in webview via `bridge.onEvent((event) => { if (event === "eventName") { ... } })`

## Bridge protocol (do not weaken)

`Bridge.request(command)` takes the closed `CommandType` union — **never widen it to `CommandType | string`.** It used to be `| string`, which made all 132 command names decorative: a typo or a rename compiled fine and only failed at runtime with "Unknown command". Removing the escape hatch immediately exposed 13 commands with handlers but no declaration, 8 missing on the webview side, a dead `getConfig` hook, and a `showWarningMessage` call with no handler that silently did nothing.

- `src/messages/protocol.ts` and `webview/src/shared/bridge/types.ts` must hold **byte-identical** `CommandType` and `EventType` unions. When you add a command, add it to both (AGENTS.md "When adding a new bridge command" above).
- `EventMessage.event` is `EventType`, and `onEvent` is typed — same reasoning.
- Handler params arrive as `Record<string, unknown>`; `as` casts are unchecked. A command with a new param needs a runtime guard if the value can be absent.

## Failures must reach the user

`console.error` is invisible in production webviews. Every bridge action that can fail goes through `reportActionError(what, err)` (or `runMenuAction`, which wraps it) so the git message becomes a notification.

`pnpm run verify` fails the build if `console.error` appears anywhere in `webview/src` outside `shared/bridge/index.ts` (the error channel itself). If you genuinely need a local log, that is the file to change.

## Key Patterns

### Multi-Select (3 modes)

All list items (branches, tags, files, commits) support:
1. **Shift+click** — range selection (anchor → target)
2. **Cmd/Ctrl+click** — toggle individual items
3. **Shift+Arrow Up/Down** — keyboard range selection

**Store pattern:** Each list has `selected*` array + `lastSelected*` anchor. Range mode uses anchor to slice the visible list. Anchor stays fixed during Shift+Arrow extension.

**Shared hook:** `useListKeyboardNavigation(items, getSelected, getAnchor, onSelect)` — used by branches, tags, files, commits.

**Mutual exclusion:** Selecting in any list clears all other lists' selections. `clearAllSelections()` store action resets everything.

### Range selection rules (hard-won — do not regress)

These were iterated on repeatedly; each regression cost a full debugging round.

1. **The anchor must NOT move during Shift+Arrow extension.** Range mode (`selectBranch`/`selectTag`/`highlightFile` with `mode === "range"`) must NOT write `lastSelected*` — only `single` and `toggle` modes update the anchor. If range updates the anchor, the second Shift+Arrow re-anchors at the new target and the selection shrinks to 2 items.
2. **Keyboard navigation position = LAST selected item, not the anchor.** When extending downward from a 1-item selection, the next item must be found after the last selected one. Finding the FIRST selected item makes Shift+Arrow bounce between two rows.
3. **`isPlainArrowKey` excludes Shift.** It returns false for Shift+Arrow (it checks `!e.shiftKey`). Never gate a Shift+Arrow range-select handler with it — check `e.key === "ArrowDown" || e.key === "ArrowUp"` directly.
4. **Rows need `tabIndex={0}` + `userSelect: "none"`.** Without `tabIndex`, rows can't receive keyboard focus and container-level `onKeyDown` never fires (Tags keyboard nav silently did nothing). Without `userSelect: none`, Shift+click starts text selection instead of firing the click handler ("Shift key doesn't work").
5. **`collectVisibleLeaves` must handle tag leaves too.** It originally only read `node.branch`, so `allVisibleTags` was always an empty array — tag Shift+click and Shift+Arrow failed silently with no error. When adding a new tree type, extend this function.
6. **Cross-list mutual exclusion must cover every direction, including HEAD.** `currentBranchRowSelected` and `remoteSectionSelected` live in the panel store (not component `useState`) precisely so `selectCommit`/`selectBranch`/`selectTag` can clear them. A local-state selection cannot be cleared by the store — "clicking HEAD after branches leaves both selected". Every `set` in the store that changes one group's selection must clear all others. There are unit tests: `webview/src/shared/store/panel-store.test.ts`.
7. **Document-level keydown handlers must scope themselves.** CommitList's global keydown captured Shift+Arrow meant for Tags/Branches. Either check `e.target` against the list container ref, or attach `onKeyDown` to a focusable container (preferred — rows have `tabIndex={0}`).

### Context Menus

**The icon column is per-menu, not per-item.** `<ContextMenuItem>` does not decide this on its own — it reads `IconColumnContext`, which `<ContextMenu>` sets by scanning its own children for an `icon` prop:

- **Any item has an icon →** every row renders the 16px span, including rows without one, so labels in the same menu stay left-aligned.
- **No item has an icon →** no span is rendered at all, and text starts at the menu padding. A text-only menu must not show an empty 24px gutter on the left.

Never conditionally drop the span item-by-item (`{icon && <span/>}`) — that is exactly the misalignment this rule exists to prevent. If a menu's rows are produced in a way the child scan cannot see, pass `reserveIconColumn` to `<ContextMenu>` explicitly. `ContextMenu.test.tsx` covers all four cases (no icons, mixed, nested fragments/conditionals, explicit override).

Every menu renders through the shared primitives in
`webview/src/shared/components/ContextMenu.tsx` (+ `ContextMenu.css`):

- `useContextMenuDismiss(menuRef, onClose)` — the one close-on-outside/Escape/blur/scroll/resize hook. Never re-add document listeners by hand.
- `<ContextMenu x y minWidth>` — the fixed-position portal container with viewport clamping. It also owns the stacking order: `CONTEXT_MENU_Z_INDEX` (50000) must stay above panel chrome (the panel progress bar is 10000) and below dialogs (99999+).
  Portalling to `document.body` is **not** enough on its own — a `position: fixed` node with `z-index: auto` still paints below any positive-z-index element regardless of DOM order, which is how the CommitList header (`position: relative; z-index: 3`, `opacity: 0.6`) ended up painting *over* open menus, bleeding the Message/Author/Date/Hash row through and keeping its column-resize handles on the cursor. `ContextMenu.test.tsx` guards the z-index.
- `<ContextMenuItem onClick icon shortcut checked disabled>` — a `<button>` row; `checked` renders the ✓ column for toggles, `disabled` is native.
- `<ContextMenuHeader>` / `<ContextMenuSeparator>`.

**Menu actions must not fail silently.** Use `runMenuAction(onClose, what, fn)` from `shared/bridge` for every item that calls the bridge — it closes the menu, runs the call, and reports failures through `showErrorNotification` (the webview console is invisible in production). Handlers that need extra user input first (confirm/input/quick-pick) keep their own try/catch but must still surface the error, not just `console.error`.

Menu components:
- `BranchContextMenu` — Checkout, New Branch, Push, Rename, Delete, etc.
- `TagContextMenu` — Checkout, Show Diff, Merge, New Worktree, Push (asks which remote via `showQuickPick`), Delete
- `HeadContextMenu` — New Branch, Show Diff, New Worktree, Update, Push, Rename
- `CommitContextMenu`, `FileContextMenu` — icons via `~icons/codicon/*`
- `CommitFileContextMenu`, `ShelfContextMenu`, `IdeaShelfContextMenu`, `ShelfFileContextMenu`, `IdeaShelfFileContextMenu`
- `DirContextMenu` (CommitTab), `ShelfBgContextMenu` (IdeaShelfTab), `HeaderViewOptionsMenu` (Toolbar), `SettingsMenu` (BranchSidebar), `HeaderColumnMenu` (CommitList)

**Right-click menus open in two steps when a dialog follows:** context menu first, then the dialog on menu-item click. If a document-level `mousedown` (capture) closes the menu, it must check the click is outside the menu ref — otherwise the menu closes before the item's `click` fires and the dialog never opens.

### Dialogs

Dialog style reference is the New Worktree dialog (`webview/src/worktree/NewWorktreeDialog.tsx` + `worktree.css`):
- Title centered at top
- Field rows: right-aligned label (fixed width) on the left, `flex: 1` input on the right, same row
- Footer: Cancel on the **left edge**, the primary action on the right edge (`justify-content: space-between`); Cancel is transparent + border, OK is `--vscode-button-background`; disabled OK uses `opacity: 0.5`, not a different background color
- Inputs: `--vscode-input-background/border/foreground`
- Primary/secondary buttons must look different: OK = filled blue, Cancel = transparent. Use `--vscode-button-*` variables directly, not `--buttonBackground` (unreliable)

### Worktree setup (`.worktreeinclude` + setup script)

Mirrors the IDEA New Worktree dialog: a collapsible **Copy local project setup** section (collapsed by default, header reads `N of 2 settings on`) with two independent options.

**Copy files listed in `.worktreeinclude`.** A new worktree is a clean checkout, so every gitignored local file — `.env`, `.vscode/settings.json`, certificates — is missing from it. `.worktreeinclude` lists those files at the repository root using `.gitignore` syntax, and they are copied across. Rules that matter:

- The file is created **only when the section is expanded**, never for users who leave it collapsed, and it is created as a plain file — **not** added to `.gitignore`, not `git add`-ed. Whether it is committed is the user's decision; committing it shares the pattern list with the team.
- Matching is delegated to git (`git ls-files -z --others --ignored --exclude-from=.worktreeinclude`), so `!` negation, `dir/` and every other `.gitignore` subtlety behaves natively. Do not hand-roll a glob matcher.
- `--others --ignored` means **untracked only**, which is the point: tracked files already travel with the worktree and copying them would overwrite the clean checkout with local edits.
- Git aborts with `fatal: cannot use … as an exclude file` when the file is missing, so `listWorktreeIncludeFiles` stats it first.
- `parseIncludePatterns` drops comments and blank lines — a blank pattern would match everything.
- Copies recreate directories and overwrite the destination, and refuse absolute or `..` paths so a pattern cannot escape either root.

**Run setup script.** The user picks the script with the folder-icon button; the IDE runs it once, with the new worktree path as its only argument and as the working directory, **before** the project opens. A failing script never removes the worktree and never fails the creation — the result carries `scriptError` and the dialog reports it while still opening the project. `runSetupScript` distinguishes "never started" (`ENOENT`/`EACCES`, e.g. missing execute bit) from "ran and failed", because the two need different messages.

Both choices plus the script path are remembered per workspace in `localStorage`; nothing is written to settings.

### Changelists (overlay model)

An overlay on top of the index, **not** a replacement for it: the Staged group, Unversioned Files and Merge Conflicts behave exactly as without changelists, and only tracked, unstaged, non-conflicted changes belong to a list (`isListable` host-side, `isMovable` in the webview). Do not add an exclusive mode that hides the index.

- Assignments live host-side in `jgc-changelists.json` under `git rev-parse --git-path` (one per worktree, never in the repo). `getWorkingTreeChanges` and `getChangesViewFiles` annotate each file with `changelist`; the webview never computes membership itself.
- Any host path that makes changes vanish for good must forget them: commit paths go through `withChangelistCleanup`, rollbacks call `forgetResolvedPaths`. Shelve and stash deliberately do not — `reconcile` keeps an assignment for `STALE_AFTER_DAYS` (7) so a restored file returns to its list.
- Group with `groupByChangelist` (Commit panel) / `groupFilesByChangelist` (Changes view). They share one visibility rule: the default list shows when it has files, or when it is active **and** a named list exists; named lists always show, even empty, because they are the only drop target.
- Drag and drop carries paths under `CHANGELIST_DRAG_TYPE`. Only rows where `isMovable(file)` get an `onDragStart`; groups accept only drags that carry that type.
- Mutating handlers broadcast `commitStateChanged`; every webview action goes through `runMenuAction` / `reportActionError`.

### Shortcut Labels

Platform-aware labels in `webview/src/shared/shortcuts.ts`:
- macOS: `⌘D`, `⌥⌘A`, `⌘⌫`, etc.
- Windows/Linux: `Ctrl + D`, `Alt + Ctrl + A`, `Ctrl + ⌫`, etc.

All keybindings use `jgc.commitPanelFocused` as the `when` clause.

### Caret Blame

End-of-line blame showing `Who, date * summary` after the code on the caret line. Follows `jgc.blame.dateFormat` setting. Snapshot cached per document version.

### The Changes view (on-demand container)

VS Code cannot hide a contributed `viewsContainers` entry conditionally. The way to get a container that only exists while it is in use is to gate its **view** and let the container follow:

```jsonc
// package.json
"git-brains-changes": [
  { "type": "webview", "id": "git-brains.changes", "name": "Changes",
    "when": "jgc.changesViewVisible" }
]
```

A container whose views are all hidden is not contributed to the activity bar, so the icon appears only while `jgc.changesViewVisible` is true. `ChangesViewProvider` owns that key: `reveal()` sets it true (then waits a tick — the container does not exist until the `when` clause re-evaluates — and opens `workbench.view.extension.git-brains-changes`), `hide()` sets it false again.

**Hiding is explicit, and `closeChangesView` (the panel's toolbar ✕) is its only caller.** Three automatic triggers were tried and all were wrong:

- `onDidChangeVisibility(false)` cannot tell "Close All" from "the user switched the sidebar" — both deactivate the container, so closing editor tabs took the panel with it. Discriminators all failed too: an empty-editor-area check fires before the editors are actually gone, `tabGroups.onDidChangeTabs` timestamps re-selected a sidebar the user had just left, and a debounce only moved the race.
- `onDidDispose` is **not** a close either. VS Code disposes a webview view whenever it stops being shown, so hiding from there removed the container on any switch and left the activity bar with nothing selected.

An explicit close has no ambiguity. The cost, by design: switching the sidebar away leaves the container in place until the user closes it.

**"Close All" collapses the sidebar, and that is VS Code's doing — the damage is repaired, never prevented.** Closing every editor tab collapses the sidebar *part* (activity bar keeps all its icons, nothing lit) even though nothing in our code ran: verified with a timestamped trace where `hide()` was called zero times. What VS Code *does* have is `LayoutService`'s per-part `onDidVisibilityChange` feedback loop whose sidebar branch is **unguarded**, while the panel branch is guarded with `PANEL_HIDDEN === f` — so any visibility blip on the sidebar part becomes a full `setSideBarHidden(true)`, which hides the part, calls `hideActivePaneComposite(0)` (nothing lit) and moves focus. That matches the symptom exactly. (Which layout event supplies the blip is still not proven; see the note below.)

Prevention is impossible from an extension, and this was measured, not assumed:

- The collapse happens **synchronously inside the command's own task**, so it is painted before the frame ends.
- `tabGroups.onDidChangeTabs` is a **cross-process IPC** event, so it always arrives after that paint; our restore command is yet another round trip. **At least one frame of collapse is always rendered.**
- There is no `setPartVisible` API, `hideIfEmpty` is forced `true` for every contributed container, and the built-in `workbench.action.closeAllEditors` cannot be intercepted.

So the repair is as tight as the host allows: `ChangesViewProvider` records the diff tab it opened (`noteDiffTabOpened(title)`) and restores on **`tabGroups.onDidChangeTabs`**, immediately, with one 400 ms retry for the turn where the host's tab model lags. Reacting to `onDidChangeVisibility` instead (the first attempt) meant a flat 400 ms of visible collapse. The guard is deliberately narrow — only when *our own* tab is in `e.closed` **and** the editor area is now empty; editors still open means the user switched the sidebar, and then nothing happens.

The restore command matters: `<viewId>.focus` with `{ preserveFocus: true }` is the only one that re-selects the container, *unhides* the sidebar part (`doOpenPaneComposite` → `setPartHidden(false, …)`) **and** leaves focus in the editor. `workbench.view.extension.<id>` always steals focus.

The only zero-flicker fix is a user setting, not code: `"workbench.editor.closeEmptyGroups": false` keeps the empty editor group, so `removeGroup` never runs and no re-layout happens. Not written automatically — it changes close behaviour for every editor in the window.

Related, still unfixed: `mergeEditorManager` runs `workbench.action.maximizeEditorHideSidebar` and never restores it, which leaves the sidebar hidden for the rest of the session — the same visible symptom by a different route.

**The list is a tree.** Group By → Module (each workspace folder, the IDEA notion of a module, annotated host-side in `getChangesViewFiles`) and Group By → Directory are both on by default and combine into module → directory → file. The eye button is the shared `IconViewOptions` glyph; the Expand All / Collapse All button is a single toggle that flips both the icon and the whole `collapsed` set. Folder rows carry the same chevrons the Git Log sidebar uses (`IconChevronDown` / `IconChevronRight`), and file rows keep an empty chevron-width spacer so names stay aligned.

**Clicks: the double click opens, the single click only replaces.** That is done with a *preview* editor — the only way VS Code replaces a tab without ever showing two. `EditorGroupModel.openEditor` routes a `pinned: false` open through `replaceEditor(preview, editor, …)`, a single change event that swaps the group's preview slot in place; no second tab is ever laid out. Consequences that are easy to get wrong:

- **Never pin the tab.** `workbench.action.keepEditor` sets `pinned: true`, after which the `replaceEditor` branch never runs again and every open adds a tab. The single-tab path therefore never calls it. `findChangesDiffTab` treats a pinned tab as absent (`tab.isPreview`), so a stray pin cannot wedge the list.
- Closing the old tab by hand and opening the new one (tried first) always paints a frame with both tabs, whichever order you pick.
- `preview` is ignored entirely when the user sets `workbench.editor.enablePreview: false`; then nothing can replace in place.

The single click also sends `requireExistingTab` and is refused when that tab is gone, which makes the first open necessarily a double click. The tab is tracked by its title, not by "some git-brains diff exists", so a Commit-panel diff is never mistaken for it.

## Workflow rules (from repeated feedback)

1. **Run `pnpm run compile` after every change — the FULL command, both builds, and READ the output.** Grepping only for `error TS` hides biome's diagnostics block entirely (`Formatter would have printed…`, `noUnusedImports`, `organizeImports` are errors that fail the build with exit 1). Use `tail`/full output for the final check. `compile` now runs `check-types && verify && lint && esbuild` where `verify` greps for known regression patterns (empty imports, missing `onClose` on `<ContextMenu>`, stray `useContextMenuDismiss` outside the shared component). Biome warnings are non-fatal on this machine (memory-limited), so the grep-based `verify` step catches the specific mistakes that keep recurring. Never report "done" on an unverified build — run `pnpm run compile && (cd webview && pnpm run build)` before claiming anything.
2. **Don't commit prematurely.** Batch related fixes into one commit; avoid a trail of "fix the fix" commits. **Never commit without explicit user instruction** — the user must verify first. If the user says "开始吧" or similar after presenting changes, that counts as instruction. If not, present the changes and wait.
3. **Verify before claiming done.** Walk through the actual interaction paths (all directions, all orderings) before saying "fixed". The mutual-exclusion bug was reported three times because only Commit→others was checked, not Branch→HEAD or HEAD→Remote.
4. **When a fix doesn't work, stop and re-diagnose.** Don't apply another plausible-looking patch. Bisect with a minimal reproduction (e.g. hardcoded-color SVG) to isolate the variable.
5. **Write unit tests for interaction rules that broke once.** The mutual-exclusion rules now have tests so regressions fail CI, not user testing.
6. **Reuse existing solutions first.** Before writing a custom SVG/tooltip/dialog, check how the same problem was solved elsewhere in the repo (`unplugin-icons`, shared `Tooltip`, worktree dialog styles). The icon bug was solved by adopting the project's existing `~icons/codicon/*` pattern instead of hand-written SVGs.
7. **Update CHANGELOG.md** for user-facing changes (Added/Changed/Fixed under `[Unreleased]`), in English + Chinese, before committing.

## Build & Test

```bash
pnpm run compile          # check-types + lint + esbuild (extension)
pnpm run build:web        # tsc + vite build (webview)
pnpm run build            # both
pnpm run test:unit        # unit tests (vitest)
pnpm run package          # production build for vsce
```

**Always run `pnpm run compile` after making changes.**

## Tech Stack

- **Extension Host**: TypeScript, Node.js, child_process (execFile), esbuild
- **Webview**: React 19, Zustand, allotment, @tanstack/react-virtual, shiki, diff, node-diff3
- **Communication**: postMessage request-response + event broadcast (MessageRouter)
- **Graph Rendering**: SVG + DOM (not Canvas)
- **Package Manager**: pnpm (monorepo, pnpm-workspace.yaml)

## Key Design Decisions

- Direct Git CLI calls (no simple-git), custom `\x00` delimiter parsing
- Self-implemented graph layout algorithm (greedy lane allocation + LaneSnapshot)
- 3-way merge via node-diff3, 2-way diff via diff library
- Single MessageRouter architecture shared by all Webviews
- Bridge protocol maintained in sync across `webview/src/shared/bridge/types.ts` and `src/messages/protocol.ts`

## Version Pinning

- Do not upgrade React or Vite versions proactively
- VS Code engine: `^1.91.0`

## Code Conventions

### Icons (IMPORTANT — read before adding any icon)

**Menu icons are the original IntelliJ-style glyphs, pinned by `webview/src/shared/components/icons.test.tsx` (23 tests). Do NOT touch them — the shapes are byte-identical to v1.1.3 and a test fails if you drift.**

History (learn from it): a codicon-only migration replaced the original menu icons with look-alikes. The glyphs came out WRONG because no codicon shape matched the IntelliJ glyphs (Cherry-Pick showed a pull-request, Shelve showed the Rollback arrow, both Copy variants were flattened to one). The whole thing shipped because there was no shape guard — the shape tests now catch it.

Current layout:
- `webview/src/shared/components/icons.tsx` — 18 shared menu icons (Add, Apply, Branch, CherryPick, ClipboardImport, CopyPath, Delete, Diff, Edit, FolderOpen, Import, Jump, Patch, Remove, Rollback, Shelve, Tag, Unshelve). All verbatim from the v1.1.3 inline components.
- `CommitContextMenu.tsx` / `FileContextMenu.tsx` — panel-only variants (`IconCopy` with 1 rect vs 4 rects, `IconRevert` compact-decimal vs full-precision path) stay inline because their original shapes differ.
- `~icons/codicon/*` via unplugin-icons is fine for NEW UI elements that don't have a legacy icon (toolbar buttons, the Remote Manager dialog's add/remove/edit, etc.).

**Adding a new icon:**
1. Check `icons.tsx` first — if it exists, use it (or alias a named import).
2. If it's a fresh UI element with no legacy icon, use `~icons/codicon/*`.
3. Never invent a new inline `<svg>` unless it's a genuinely new custom glyph — put it in `icons.tsx` with a source comment and extend `icons.test.tsx` with the expected markup.

Pitfalls learned the hard way (cost multiple debugging sessions):
1. **CSS variables do NOT work in SVG presentation attributes.** `fill="var(--x)"` is invalid — `fill`/`stroke` are not CSS properties. Use `style={{ color: ... }}` + `fill="currentColor"`, or let `unplugin-icons` handle it (it emits `fill="currentColor"` already).
2. **Global `button { padding: 6px 14px }` crushes icon-only buttons.** The global stylesheet gives every button 28px horizontal padding. An icon button with inline `width: 28` under `box-sizing: border-box` ends up with a **negative content area** — the SVG is squeezed to zero and becomes invisible. Always set `padding: 0` on icon-only buttons.
3. **`unplugin-icons` emits `width/height: 1.2em`** — size follows the parent `font-size`. Set `fontSize` on the button (e.g. `fontSize: 13` → ~15.6px icon).
4. **`currentColor` inherits through `color` only.** If the icon is invisible but the parent renders, check the inherited `color` chain — use `var(--vscode-foreground)` (always defined in webviews), not `--app-fg`.
5. **Debugging workflow:** when an icon is invisible, bisect with (a) a bare hardcoded-color SVG outside the button, (b) the same SVG inside the button with a red border. If the border shows but the icon doesn't, it's a layout/squeeze problem, not color.
6. **When swapping icon libraries, verify shape equality, not just semantics.** A "right" icon by name (CherryPick→git-pull-request) can still render the wrong glyph — codicon and IntelliJ glyph libraries have completely different designs. Guard the shapes with a byte-level test.

Working reference styles for icon-only buttons:

```tsx
const iconButtonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 22,
  height: 22,
  padding: 0,              // ← critical, see pitfall #2
  background: "transparent",
  border: "none",
  borderRadius: 4,
  color: "var(--vscode-foreground)",
  cursor: "pointer",
  fontSize: 13,            // codicon = 1.2em → ~15.6px
};
```

### Formatting & Linting

- **Formatter & linter:** `biome check` (config in `biome.json`)
- **Quote style:** double quotes, trailing commas
- **Import sorting:** Biome auto-sorts imports
- **No non-null assertions** (`!`) — use optional chaining (`?.`) or null checks
- **TypeScript strict mode** — all types must be explicit

## Key Files to Read

| File | Purpose |
|---|---|
| `src/extension.ts` | Entry point, all bridge handlers, command registration |
| `src/messages/protocol.ts` | Communication protocol types |
| `webview/src/shared/bridge/types.ts` | Webview-side protocol types (keep in sync) |
| `webview/src/shared/store/panel-store.ts` | Git Log panel store (selections, branches, tags, commits) |
| `webview/src/shared/store/commit-store.ts` | Commit panel store (changes, stage, shelve) |
| `webview/src/shared/hooks/useModifierClickSelection.ts` | Click-based multi-select hook |
| `webview/src/shared/hooks/useListKeyboardNavigation.ts` | Keyboard navigation for lists |
| `webview/src/shared/shortcuts.ts` | Platform-aware shortcut labels |
| `src/git/gitService.ts` | All Git CLI operations |
| `webview/src/panel/components/BranchTree.tsx` | Branch/tag sidebar with context menus |
