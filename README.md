<a name="readme-top"></a>

<div align="center">

<img src="images/icon.png" width="128" />

<h1>JetBrains Git Control</h1>

<strong>The IntelliJ IDEA / JetBrains Git experience for VS Code and Cursor</strong>

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.91.0%2B-blue)](https://code.visualstudio.com/)
[![Version](https://img.shields.io/github/v/tag/witt-bit/jetbrains-version-control?label=version&color=green)](https://github.com/witt-bit/jetbrains-version-control/releases)

**English** · [简体中文](https://github.com/witt-bit/jetbrains-version-control/blob/main/README.zh_CN.md) · [Changelog](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG.md)

> A fork of [aotemj/jetbrains-git-graph](https://github.com/aotemj/jetbrains-git-graph) — itself forked from [zhyc9de/jet-git](https://github.com/zhyc9de/jet-git) — extended with inline Git blame annotations, commit-graph navigation, a shelf/stash commit panel and full IDEA-style context menus.

</div>

---

## Highlights

- **Git Log graph** — branch tree with Local / Remote / Tags, colour-coded lanes, resizable columns and commit filters
- **IDEA-style commit panel** — stage by checkbox, shelf and stash, per-block commit, AI-generated messages
- **Annotate with Git Blame** — inline annotations on every line, plus a caret line-end blame that follows the cursor
- **Full context menus** — branch, tag, HEAD, commit, changed file and remote, all modelled on IntelliJ IDEA
- **3-way merge editor** and a conflict list, instead of VS Code's block-by-block conflict UI
- **Git Worktree panel**, Explorer status colours and gutter change markers — so the built-in Git extension can be switched off entirely

## Features

### Git Log

![Git Graph](images/git-graph.png)

- **Branch tree** — Local / Remote / Tags groups, directory grouping, search filter, `HEAD (Current Branch)` row
- **Commit list** — colour-coded branch lanes, resizable Message / Author / Date / Hash columns, collapsible commit sequences
- **Detail panel** — commit message plus a changed-file tree
- **Filters** — by branch, author and date range
- **Multi-selection** — Shift+click ranges, Cmd/Ctrl+click to toggle, Shift+Arrow from the keyboard

### Commit Panel

Working-tree changes with a JetBrains layout.

- **Only checked files are committed** — a staged but unchecked file is unstaged for the commit and restored afterwards
- **Shelf and stash** — shelve, unshelve, view a shelf diff and import patches, alongside IDEA-format shelves
- **Jump to Source** — `F4`, or `Cmd+↓` / `Ctrl+↓`, from the file list, the Git Log changed files and inside a diff editor
- **AI commit message** — see below
- **Group by directory**, show or hide unversioned files, and a pending-changes badge on the activity bar icon

### AI Commit Message

A sparkle button next to **Commit** writes the message for exactly the files you checked, streaming into the input box so you can edit before committing.

- Runs on the VS Code Language Model API (`vscode.lm`): GitHub Copilot out of the box, plus models added under **Chat: Manage Language Models** (OpenRouter, Ollama, OpenAI-compatible endpoints) or contributed by other extensions — JGC itself has no configuration
- Only the checked files: staged entries diff against the index, unstaged against the worktree, untracked files contribute their content
- Style reference: the committer's own recent commits first, falling back to the repository's latest history; the message follows the reference's language
- Several models installed: asked once and remembered, the chevron beside the sparkle reopens the picker, and clicking again cancels a running generation
- A failure or a cancel restores whatever you had already typed

### Annotate with Git Blame

WebStorm-style inline blame on every line, with click-to-jump into the Git Log commit graph.

- **Every line annotated** — configurable columns: revision, date, author, commit number
- **Name styles** — initials, last name, first name, full name or email
- **Age-based colouring** — new → blue, mid → green, old → grey, or colour by author, or no colour at all
- **Each diff column is independent** — toggling blame on one side leaves the other side alone
- **Configurable** — `jgc.blame.columns`, `jgc.blame.colorMode`, `jgc.blame.nameStyle`, `jgc.blame.dateFormat`

### Caret Line-End Blame

`Who, date * summary` at the end of the line the caret is on, following the cursor instead of annotating every line.

- **Own commits read `You`**; uncommitted lines show nothing
- **Template** — `jgc.caretBlame.format` with `${who}`, `${date}`, `${message}` and `${hash}` tokens
- **Date format** — `${date}` renders through `jgc.blame.dateFormat`, the same setting as the inline annotations
- **Caps** — summary at 50 characters, hash at 8, cut with an ellipsis
- **Toggle** — `jgc.caretBlame.enabled`

### Explorer Colours and Gutter Markers

- **File colours** — Explorer file names are tinted by added, modified, deleted, untracked, ignored and conflict status
- **Gutter markers** — a coloured bar beside every added or modified line, a short marker where lines were deleted
- **Change hover card** — hovering a marker or a changed line shows that block: modified lines are word-diffed, a deleted block shows its HEAD content, with Prev Change / Next Change / Rollback Lines / Show Diff for Lines / Copy / Commit this change
- **Switched off independently** — `jgc.decorations.enabled`, `jgc.decorations.fileColors`, `jgc.decorations.gutterMarkers`

### 3-Way Merge Editor

![3-Way Merge Editor](images/three-way-merge.png)

- Three-column layout: Theirs | Result | Yours
- Conflict highlighting with per-block action buttons
- Full syntax highlighting

### Conflict Management

![Conflict List](images/conflicts-list.png)

- Quick actions: accept theirs, accept yours, merge
- Integrated with the VS Code Source Control panel

### Git Worktree

JetBrains-style worktree management in the activity bar sidebar.

- **Worktree list** — every worktree with its branch and path, the main worktree protected from deletion
- **New Worktree** — searchable dropdown for local branches, `origin/*` and tags, with input validation, auto-filled project name and a live duplicate-name check
- **Open project** — native VS Code dialog: this window or a new one
- **Prune** — clean up stale worktree metadata
- **Behaviour** — `jgc.worktree.openBehavior`: `ask` (default), `thisWindow` or `newWindow`

### Status Bar

- Current branch with incoming and outgoing commit counts, replacing the built-in Git item
- Click for Update Project, Commit, Push, New Branch, Switch Branch and the Git Log view
- Follows the active editor in multi-root workspaces; a detached HEAD is shown rather than disappearing

### Remote Management

- **Manage Remotes...** on the Remote section header of the sidebar — list, add, rename, re-address and remove remotes, with an optional fetch right after
- **Edit Remote / Remove Remote** on any remote's folder row, with a confirmation before removing
- **Built-in Git prompt** — a first-run offer to disable VS Code's built-in Git so two Git UIs do not duplicate the status bar and decorations; it applies to the current workspace and can be switched back

---

## Context Menus

<details>
<summary><b>Branch (right-click)</b></summary>

- Checkout
- New Branch from 'branch'...
- Checkout and Rebase onto 'current'
- Rebase 'current' onto 'branch'
- Merge 'branch' into 'current'
- Rename...
- Delete (with force-delete fallback)
- Update
- Push...

</details>

<details>
<summary><b>HEAD row (right-click)</b></summary>

- New Branch from 'branch'...
- Show Diff with Working Tree
- New Worktree from 'branch'...
- Update
- Push...
- Rename...

</details>

<details>
<summary><b>Tag (right-click)</b></summary>

- Checkout
- Show Diff with Working Tree
- Merge 'tag' into 'branch'
- New Worktree from 'tag'...
- Push to remote...
- Delete (a multi-selection shows Delete only)

</details>

<details>
<summary><b>Commit (right-click)</b></summary>

- Copy Revision Number
- Cherry-Pick
- Create Patch...
- Checkout Revision
- Show Repository at Revision
- Compare with Local
- Reset Current Branch to Here... (Soft / Mixed / Hard / Keep)
- Revert Commit
- Undo Commit... (HEAD only, not on main or master)
- Drop Commit
- Push All up to Here...
- New Branch...
- New Tag...
- Go to Child Commit / Go to Parent Commit
- Show in Git Log (when the Commit list is filtered by a file)

</details>

<details>
<summary><b>Changed file (right-click)</b></summary>

- Show Diff
- Edit Source (with its shortcut)
- Open Repository Version
- Revert Selected Changes
- Cherry-Pick Selected Changes
- Copy Path
- Copy File Name
- History Up to Here

</details>

<details>
<summary><b>Remote (right-click)</b></summary>

- On a remote's folder: Edit Remote, Remove Remote
- On the Remote section header: Manage Remotes...

</details>

---

## Configuration

Search for `JGC` in VS Code Settings.

| Setting | Description | Default |
|---------|-------------|---------|
| `jgc.decorations.enabled` | Explorer colours and gutter markers | `true` |
| `jgc.decorations.fileColors` | Explorer file colours | `true` |
| `jgc.decorations.gutterMarkers` | Gutter change markers | `true` |
| `jgc.blame.columns` | Annotated columns | `["date", "author"]` |
| `jgc.blame.colorMode` | Colouring mode | `order` |
| `jgc.blame.nameStyle` | Name display style | `fullName` |
| `jgc.blame.dateFormat` | Date format | `yyyy-MM-dd HH:mm` |
| `jgc.blame.foregroundColorLight` | Annotation colour, light themes | `#57606a` |
| `jgc.blame.foregroundColorDark` | Annotation colour, dark themes | `#8b949e` |
| `jgc.caretBlame.enabled` | Caret line-end blame | `true` |
| `jgc.caretBlame.format` | Caret blame template | `${who}, ${date} * ${message}` |
| `jgc.caretBlame.messageMaxLength` | Maximum characters of the summary | `50` |
| `jgc.worktree.openBehavior` | How projects open from a worktree | `ask` |
| `jgc.onboarding.builtinGitPrompt` | Offer to disable the built-in Git extension | `ask` |

The six status colours are also exposed as `jgc.decoration.*` colour IDs, so they can be overridden under `workbench.colorCustomizations`.

---

## Installation

**From the Marketplace** — search for **JetBrains Git Control**.

**From a .vsix**

1. Download the latest `.vsix` from [releases](https://github.com/witt-bit/jetbrains-version-control/releases)
2. `Cmd+Shift+P` → "Extensions: Install from VSIX..."

## Requirements

- VS Code 1.91.0 or newer (the Language Model API became stable in 1.91)
- Git installed and on `PATH`

## Local Development

```bash
git clone https://github.com/witt-bit/jetbrains-version-control.git
cd jetbrains-version-control
pnpm install
cd webview && pnpm install && cd ..
```

Press **F5** to launch the Extension Development Host.

```bash
pnpm run watch          # Watch mode
pnpm run build          # Production build (extension + webview)
pnpm run compile        # Type-check, verify, lint and bundle the extension
pnpm run test:unit      # Unit tests
pnpm run vsce:package   # Package as .vsix
```

See [AGENTS.md](./AGENTS.md) for the architecture and the conventions this codebase follows.

## Credits

- Original: [aotemj/jetbrains-git-graph](https://github.com/aotemj/jetbrains-git-graph)
- Fork from: [zhyc9de/jet-git](https://github.com/zhyc9de/jet-git)
- Icons: [IntelliJ IDEA Icons](https://intellij-icons.jetbrains.design/) (Apache 2.0)

## License

[MIT](./LICENSE)
