<a name="readme-top"></a>

<div align="center">

<img src="images/icon.png" width="128" />

<h1>JetBrains Git Control</h1>

The **IntelliJ IDEA / JetBrains Git** experience for **VS Code** and **Cursor**: Git graph visualization, IDEA-style commit panel with shelf and stash, branch management with context menus, cherry-pick, rebase, merge, a 3-way merge editor, and WebStorm-style **Annotate with Git Blame** inline annotations.

> **Note**: This project is a fork of [JetBrains Git - IntelliJ IDEA Git Graph, Commit & Shelf for VS Code](https://github.com/aotemj/jetbrains-git-graph), extended with inline git blame annotations and commit-graph navigation.

> Fork of [zhyc9de/jet-git](https://github.com/zhyc9de/jet-git) with full IntelliJ IDEA-style context menus and UI enhancements.

**English** · [简体中文](./README.zh_CN.md)

</div>

---

## Features

### Inline Git Blame Annotations

WebStorm-style inline blame annotations for every line, with click-to-jump to the Git Log commit graph.

- **Every line annotated**: the blame column shows on all lines of the file, while the caret line-end blame (below) follows the cursor
- **Configurable columns**: revision, date, author, commitNumber (select what you need)
- **Name styles**: initials, last name, first name, full name, email
- **Age-based coloring**: gradient colors based on commit age (new→blue, mid→green, old→gray)
- **Left alignment**: all lines right-aligned, even without blame annotations

### Caret Line-End Blame

`Who, date * summary` at the end of the line the caret is on, JetBrains-style line blame that follows the caret instead of annotating every line.

- **Own commits read `You`**; uncommitted (new) lines show nothing
- **Template** (`jgc.caretBlame.format`): `${who}`, `${date}`, `${message}`, `${hash}` tokens
- **Date format**: `${date}` renders through `jgc.blame.dateFormat` (default `yyyy-MM-dd HH:mm`), the same setting as the inline blame annotations
- **Caps**: message at 50 characters (`jgc.caretBlame.messageMaxLength`), hash at 8, cut with an ellipsis
- Toggle with `jgc.caretBlame.enabled`

### AI Commit Message

A sparkle button next to **Commit** writes the message for exactly the files you checked, streaming into the input box so you can edit before committing.

- Runs on the VS Code Language Model API (`vscode.lm`): GitHub Copilot out of the box, plus models added under **Chat: Manage Language Models** (OpenRouter, Ollama, OpenAI-compatible endpoints) or contributed by other extensions; JGC itself has no configuration
- Only the checked files: staged entries diff against the index, unstaged against the worktree, untracked files contribute content
- Style reference: the committer's own recent commits first, falling back to the repository's latest history; the message follows the reference's language
- Several models installed: asked once and remembered; the chevron beside the sparkle reopens the picker; clicking again cancels a running generation

### Branch Context Menu

Right-click any branch to checkout, create, merge, rebase, rename, delete, push, or pull — just like IntelliJ IDEA.

![Branch Checkout](images/checkout.gif)

### Commit Context Menu

Right-click any commit to copy hash, cherry-pick, checkout revision, reset, revert, create branch or tag.

![Commit Context Menu](images/commit-context-menu.gif)

### Changed Files Context Menu

Right-click files in the Changed Files panel: show diff, edit source, open repository version, revert/cherry-pick file changes, copy path.

### Git Graph

![Git Graph](images/git-graph.png)

- **Branch Tree** — branches organized by Local / Remote / Tags with search filter
- **Commit List** — color-coded branch lines, resizable columns (Message, Author, Date, Hash)
- **Detail Panel** — commit message and changed file tree
- **Filters** — filter by Branch, User, Date range

### 3-Way Merge Editor

![3-Way Merge Editor](images/three-way-merge.png)

- Three-column layout: Theirs | Result | Yours
- Conflict highlighting with per-block action buttons
- Full syntax highlighting

### Conflict Management

![Conflict List](images/conflicts-list.png)

- Quick actions: Accept Yours / Accept Theirs / Merge
- Integration with VS Code Source Control panel

### Git Worktree

JetBrains-style worktree management panel in the Activity Bar sidebar.

- **Worktree list** — view all worktrees with branch and path columns
- **New Worktree** — searchable dropdown for branches (local + origin/*) and tags, with input validation and auto-fill
- **Open Project** — double-click to open with native VS Code dialog (This Window / New Window)
- **Prune** — clean up stale worktree metadata with JetBrains clearCash icon
- **Sidebar collapse** — toggle toolbar visibility
- **Settings** — `jgc.worktree.openBehavior`: ask (default) / thisWindow / newWindow

---

## All Context Menu Actions

<details>
<summary><b>Branch (right-click)</b></summary>

- Checkout
- New Branch from...
- Checkout and Rebase onto current
- Rebase current onto branch
- Merge into current
- Rename (local only)
- Delete (with force-delete fallback)
- Update (pull)
- Push

</details>

<details>
<summary><b>Commit (right-click)</b></summary>

- Copy Revision Number
- Cherry-Pick
- Checkout Revision
- Reset Current Branch to Here (Mixed/Soft/Hard)
- Revert Commit
- New Branch...
- New Tag...

</details>

<details>
<summary><b>Changed Files (right-click)</b></summary>

- Show Diff
- Edit Source
- Open Repository Version
- Revert Selected Changes
- Cherry-Pick Selected Changes
- Copy Path
- Copy File Name

</details>

---

## Configuration

Configure in VS Code Settings under `JGC`:

| Setting | Description | Default |
|---------|-------------|---------|
| `jgc.blame.columns` | Columns to display | `["date", "author"]` |
| `jgc.blame.colorMode` | Coloring mode | `order` |
| `jgc.blame.nameStyle` | Name display style | `fullName` |
| `jgc.blame.dateFormat` | Date format | `yyyy-MM-dd HH:mm` |
| `jgc.caretBlame.enabled` | Caret line-end blame | `true` |
| `jgc.caretBlame.format` | Caret blame template | `${who}, ${date} * ${message}` |
| `jgc.caretBlame.messageMaxLength` | Max characters of the summary part | `50` |
| `jgc.decorations.enabled` | Explorer colors + gutter markers | `true` |
| `jgc.decorations.fileColors` | Explorer file colors | `true` |
| `jgc.decorations.gutterMarkers` | Gutter change markers | `true` |
| `jgc.worktree.openBehavior` | How to open projects from worktrees | `ask` |

---

## Installation

**From Marketplace:**

Search for **"JetBrains Git Control"** or **"JGC"** in VS Code Extensions.

**From .vsix:**

1. Download the latest `.vsix` from [releases](https://github.com/witt-bit/jetbrains-version-control/releases)
2. `Cmd+Shift+P` → "Extensions: Install from VSIX..."

## Requirements

- VS Code 1.91.0+
- Git installed and in PATH

## Local Development

```bash
git clone https://github.com/witt-bit/jetbrains-version-control.git
cd jetbrains-version-control
pnpm install
cd webview && pnpm install && cd ..
```

Press **F5** to launch Extension Development Host.

```bash
pnpm run watch          # Watch mode
pnpm run build          # Production build
pnpm run vsce:package   # Package as .vsix
```

## Credits

- Original: [aotemj/jetbrains-git-graph](https://github.com/aotemj/jetbrains-git-graph)
- Fork from: [zhyc9de/jet-git](https://github.com/zhyc9de/jet-git)
- Icons: [IntelliJ IDEA Icons](https://intellij-icons.jetbrains.design/) (Apache 2.0)

## License

[MIT](./LICENSE)
