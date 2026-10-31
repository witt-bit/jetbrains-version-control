# AGENTS.md — JetBrains Git Control

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
      └── main.tsx        Router entry (mode: panel | merge | conflicts)
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
    ├── shared/               Shared modules
    │   ├── bridge/           postMessage wrapper (types.ts, bridge.ts)
    │   ├── store/            Zustand stores (panel-store, commit-store)
    │   ├── hooks/            usePlatform, useModifierClickSelection, useListKeyboardNavigation
    │   ├── shortcuts/        Platform-aware shortcut labels
    │   ├── components/       Reusable UI (Tooltip, FileTree)
    │   ├── theme/            CSS variables (variables.css)
    │   └── types/git.ts      Shared git types (BranchInfo, TagInfo, Commit, etc.)
    └── main.tsx              Router entry (mode: panel | merge | conflicts)
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

## Key Patterns

### Multi-Select (3 modes)

All list items (branches, tags, files, commits) support:
1. **Shift+click** — range selection (anchor → target)
2. **Cmd/Ctrl+click** — toggle individual items
3. **Shift+Arrow Up/Down** — keyboard range selection

**Store pattern:** Each list has `selected*` array + `lastSelected*` anchor. Range mode uses anchor to slice the visible list. Anchor stays fixed during Shift+Arrow extension.

**Shared hook:** `useListKeyboardNavigation(items, getSelected, getAnchor, onSelect)` — used by branches, tags, files, commits.

**Mutual exclusion:** Selecting in any list clears all other lists' selections. `clearAllSelections()` store action resets everything.

### Context Menus

Each list item type has its own context menu component:
- `BranchContextMenu` — Checkout, New Branch, Push, Rename, Delete, etc.
- `TagContextMenu` — Checkout, Show Diff, Merge, New Worktree, Push, Delete
- `HeadContextMenu` — New Branch, Show Diff, New Worktree, Update, Push, Rename
- `CommitFileContextMenu` — Show Diff, Stage, Rollback, Shelve, Delete, Jump to Source

All menus use `createPortal` to render outside the component tree.

### Shortcut Labels

Platform-aware labels in `webview/src/shared/shortcuts.ts`:
- macOS: `⌘D`, `⌥⌘A`, `⌘⌫`, etc.
- Windows/Linux: `Ctrl + D`, `Alt + Ctrl + A`, `Ctrl + ⌫`, etc.

All keybindings use `jgc.commitPanelFocused` as the `when` clause.

### Caret Blame

End-of-line blame showing `Who, date * summary` after the code on the caret line. Follows `jgc.blame.dateFormat` setting. Snapshot cached per document version.

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

## Build Commands

```bash
pnpm run compile          # check-types + lint + esbuild (extension)
pnpm run build:web        # tsc + vite build (webview)
pnpm run build            # both
pnpm run watch            # Dev mode (esbuild + tsc + vite parallel watch)
pnpm run package          # Production build for vsce
```

**Always run `pnpm run compile` after making changes.**

## Code Conventions

### Icons (IMPORTANT — read before adding any icon)

**Always use `unplugin-icons` (`~icons/codicon/*`), never hand-written inline SVG paths.**

```tsx
import CodiconAdd from "~icons/codicon/add";
import CodiconTrash from "~icons/codicon/trash";

<button style={{ color: "var(--vscode-foreground)" }}>
  <CodiconAdd />
</button>
```

Pitfalls learned the hard way (cost a full debugging session):
1. **CSS variables do NOT work in SVG presentation attributes.** `fill="var(--x)"` is invalid — `fill`/`stroke` are not CSS properties. Use `style={{ color: ... }}` + `fill="currentColor"`, or let `unplugin-icons` handle it (it emits `fill="currentColor"` already).
2. **Global `button { padding: 6px 14px }` crushes icon-only buttons.** The global stylesheet gives every button 28px horizontal padding. An icon button with inline `width: 28` under `box-sizing: border-box` ends up with a **negative content area** — the SVG is squeezed to zero and becomes invisible. Always set `padding: 0` on icon-only buttons.
3. **`unplugin-icons` emits `width/height: 1.2em`** — size follows the parent `font-size`. Set `fontSize` on the button (e.g. `fontSize: 13` → ~15.6px icon).
4. **`currentColor` inherits through `color` only.** If the icon is invisible but the parent renders, check the inherited `color` chain — use `var(--vscode-foreground)` (always defined in webviews), not `--app-fg`.
5. **Debugging workflow:** when an icon is invisible, bisect with (a) a bare hardcoded-color SVG outside the button, (b) the same SVG inside the button with a red border. If the border shows but the icon doesn't, it's a layout/squeeze problem, not color.

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

## Version Pinning

- Do not upgrade React or Vite versions proactively
- VS Code engine: `^1.91.0`
