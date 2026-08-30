<a name="readme-top"></a>

<div align="center">

<img src="images/icon.png" width="128" />

<h1>JetBrains Git Control</h1>

The most complete **IntelliJ IDEA / JetBrains Git** experience for **VS Code** and **Cursor**. Includes Git graph visualization, IDEA-style commit panel with shelf and stash, branch management with context menus, cherry-pick, rebase, merge, 3-way merge editor, and WebStorm-style **Annotate with Git Blame** inline annotations. Works like WebStorm, PyCharm, GoLand, and Rider's Git tooling.

> **Note**: This project is a fork of [JetBrains Git - IntelliJ IDEA Git Graph, Commit & Shelf for VS Code](https://github.com/aotemj/jetbrains-git-graph), extended with inline git blame annotations and commit-graph navigation.

> Fork of [zhyc9de/jet-git](https://github.com/zhyc9de/jet-git) with full IntelliJ IDEA-style context menus and UI enhancements.

**English** · [简体中文](./README.zh_CN.md)

</div>

---

## Features

### Inline Git Blame Annotations

WebStorm-style inline blame annotations for every line, with click-to-jump to the Git Log commit graph.

- **Display modes**: whole file / cursor line only / N lines around cursor
- **Configurable columns**: revision, date, author, commitNumber (select what you need)
- **Name styles**: initials, last name, first name, full name, email
- **Age-based coloring**: gradient colors based on commit age (new→blue, mid→green, old→gray)
- **Left alignment**: all lines right-aligned, even without blame annotations

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
| `jgc.blame.enabled` | Enable inline blame annotations | `true` |
| `jgc.blame.columns` | Columns to display | `["revision", "author", "date"]` |
| `jgc.blame.colorMode` | Coloring mode | `order` |
| `jgc.blame.nameStyle` | Name display style | `lastName` |
| `jgc.blame.displayMode` | Display scope | `full` |
| `jgc.blame.aroundLines` | Context lines (around mode) | `5` |
| `jgc.blame.dateFormat` | Date format | `yyyy-MM-dd HH:mm` |
| `jgc.worktree.openBehavior` | How to open projects from worktrees | `ask` |
| `jgc.locale` | UI language for the JGC panels. Leave empty to follow the VS Code display language (`en`, `zh-cn`, …). Set a value to force a language. Requires a window reload. | *(follow VS Code)* |

---

## Localization / 国际化

JGC follows the **VS Code display language** automatically. Change your language via
Preferences → Configure Display Language, then **Reload Window** — every surface switches
together (webview panels, the activity bar, command palette, notifications, merge editor):

- Webview panels (Git Log, Commit, Push, Rollback, Conflicts, Worktree) use a custom `t()/tpl()`
  helper with the dictionaries bundled into the extension
- VS Code contribution points (views, commands, configuration title) localize via `package.nls.<locale>.json`
- Extension notifications localize via the `vscode.l10n` API and `l10n/bundle.l10n.<locale>.json`

**Adding a language** (only one step required):

1. Copy `webview/src/l10n/en.json` → `webview/src/l10n/<locale>.json` (e.g. `fr.json`) and translate
   every value. This single file drives *all* surfaces (webview strings + `contrib.*` keys).
2. Optional: register a display name for the language.
3. Run `pnpm run generate:nls` to regenerate `package.nls.<locale>.json` and commit it,
   then rebuild.

Missing keys fall back to English, so a partial translation never breaks the UI.

---

## Installation

**From Marketplace:**

Search for **"JetBrains Git Control"** or **"JGC"** in VS Code Extensions.

**From .vsix:**

1. Download the latest `.vsix` from [releases](https://github.com/witt-bit/jetbrains-version-control/releases)
2. `Cmd+Shift+P` → "Extensions: Install from VSIX..."

## Requirements

- VS Code 1.85.0+
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
