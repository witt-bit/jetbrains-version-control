# Changelog / 更新日志

## [Unreleased]

### Added / 新增
- **Offer to disable the built-in Git extension** — while `jgc.onboarding.builtinGitPrompt` is `ask` (the default), JGC shows a dialog offering to set `git.enabled` to false globally, since two Git UIs running together duplicate the status bar, decorations and file watchers. Confirming disables it and offers a one-click reload. The Source Control view then shows an empty state, and VS Code keeps its activity-bar icon (the built-in Changes view stays active without providers), so the dialog also explains how to remove the icon: right-click the activity bar and uncheck Source Control. Either answer writes the setting to `never`; change it back to `ask` and the dialog returns without a reload / 当 `jgc.onboarding.builtinGitPrompt` 为 `ask`（默认）时，JGC 弹窗询问是否全局禁用 VS Code 内置 Git 扩展（`git.enabled=false`）：两套 Git 界面并存会让状态栏、装饰和文件监听重复。确认后即禁用并引导一键重载窗口。重载后"源代码管理"视图为空状态，活动栏图标 VS Code 会保留（内置 Changes 视图没有 provider 也保持激活），弹窗会说明移除方法：右键活动栏，取消勾选"源代码管理"。任一明确答复都会把设置写为 `never`；改回 `ask` 弹窗立即重现，无需重载
- **Caret line-end blame** — the line the caret sits on shows `Who, date * summary` after the code, JetBrains-style line blame that follows the caret instead of annotating every line. Your own commits read `You, …`; uncommitted (new) lines show nothing. The message is capped at 50 characters (`jgc.caretBlame.messageMaxLength`) and the hash at 8, with an ellipsis when cut. The blame snapshot is cached per document version and refreshed on save and Git changes. Settings follow GitLens: `jgc.caretBlame.enabled`, `…format` (a template with ${who} ${date} ${message} ${hash} tokens) and `…messageMaxLength` / 光标所在行的行尾显示 `Who, 日期 * 摘要`，JetBrains 式行级 blame，但跟随光标而非全量标注。本人提交显示 `You, …`；未提交（新增）的行不显示。message 最多 50 字符（`jgc.caretBlame.messageMaxLength`）、hash 最多 8 位，超出以省略号结尾，其余不限长。blame 快照按文档版本缓存，保存与 Git 变化时刷新。设置仿 GitLens：`jgc.caretBlame.enabled`、`…format`（支持 ${who} ${date} ${message} ${hash} 令牌的模板）、`…messageMaxLength`
- **AI commit message generation** — a sparkle button next to **Commit** writes the commit message for exactly the files you checked: the prompt carries only their diffs (staged entries against the index, unstaged against worktree, untracked files as content) plus the repository's recent commit subjects as a style reference, and the result streams into our own input box where you can edit it before committing / **Commit** 按钮旁新增 ✨ 按钮，只为**你勾选的文件**生成提交信息：prompt 只携带这些文件的 diff（已暂存对比 index、未暂存对比工作区、未跟踪文件取内容）和本仓库最近的提交主题作为风格参考，结果流式写入我们自己的输入框，提交前可任意编辑
  - Runs on the VS Code Language Model API (`vscode.lm`): every model you have configured works, GitHub Copilot out of the box, anything added under **Chat: Manage Language Models** (OpenRouter, Ollama, OpenAI-compatible endpoints, …), and models contributed by other extensions. JGC itself has no configuration / 基于 VS Code 的语言模型 API（`vscode.lm`）：已配置的模型都可用，GitHub Copilot 开箱即用，也可以在 **Chat: Manage Language Models**（OpenRouter、Ollama、OpenAI 兼容端点等）里添加，或使用其它扩展贡献的模型；JGC 自身没有配置项
  - Multiple models installed: the first generation asks once which to use and remembers the choice; the chevron next to the sparkle reopens the model picker any time / 装有多个模型时首次生成会询问一次并记住选择；✨ 旁的下拉箭头可随时重新选择模型
  - The style reference takes the committer's own recent commits first, falling back to the repository's latest history when this person has not committed here yet; the generated message follows the reference's language / 风格参照先取当前提交人本人的最近提交，本人尚无提交时回退到仓库最近历史；生成信息的语言跟随参照提交
  - Generating again mid-flight cancels the request; clicking with no model configured shows where to add one / 生成中再次点击即取消；未配置任何模型时点击会提示添加模型的入口
  - Requires VS Code 1.91+ (raised from 1.85), the version where the Language Model API became stable / 要求 VS Code 1.91+（从 1.85 提升），语言模型 API 自该版本起稳定可用

### Fixed / 修复
- **Caret blame follows the blame date format** — the end-of-line `${date}` token rendered the raw `YYYY/MM/DD` string git blame reports, ignoring `jgc.blame.dateFormat`, while the inline annotations on the same screen honored it. The caret blame now formats `authorTime` through the same setting (default `yyyy-MM-dd HH:mm`), and changing it refreshes the caret line live / 行尾 blame 的 `${date}` 令牌此前直接渲染 git blame 返回的 `YYYY/MM/DD` 原始字符串，不跟随 `jgc.blame.dateFormat`，而同一屏幕上的行首标注却遵守该设置。现在行尾 blame 用同一设置格式化 `authorTime`（默认 `yyyy-MM-dd HH:mm`），修改该设置后行尾标注实时刷新
- **No stray context menu on blank areas** — right-clicking empty space in the Commit, Git Log and Git Worktree panels no longer pops the raw webview menu; rows and items keep their own custom menus, and editable text fields keep copy/paste / Commit、Git Log、Git Worktree 面板的空白处右键不再弹出 webview 原生菜单；列表行仍使用各自的自定义菜单，文本输入框保留复制/粘贴

## [1.1.3] - 2026-10-25

### Changed / 变更
- **Everything lives under the Git context menu** — the editor's right-click menu has one top-level **Git** submenu: **Show File History** moved into it, and **Manage Selection...** floats the marker card over the editor's first line of the change block at the cursor, with the six actions left to right: Prev Change, Next Change, Rollback Lines, Show Diff for Lines, Copy, Commit this change / 编辑器右键菜单收敛为一个一级 **Git** 子菜单：**Show File History** 移入其中，**Manage Selection...** 则在编辑器内浮动弹出胶囊卡片，锚定光标所在变更块的首行行首，从左到右依次是 Prev Change、Next Change、Rollback Lines、Show Diff for Lines、Copy、Commit this change 六个按钮
- **Manage Selection... on the line number** — right-clicking a line number (or the gutter marker area) now offers **Manage Selection...** right next to the blame entries, opening the same floating card for the block that line belongs to / 在行号（或行号右侧的标记区域）上右键，菜单里紧挨 blame 两项就是 **Manage Selection...**，点击后为该行所属的变更块打开同一张浮动卡片
- **Jump to Source keeps your selection** — in a diff editor, **Jump to Source** now carries over the whole selection and pins the scroll position, so text you selected stays selected after the jump instead of collapsing to a bare cursor line / diff 编辑器中的 **Jump to Source** 现在会保留完整选区并固定滚动位置，之前选中的文字跳转后仍然处于选中状态，而不是收缩成一个光标点
- **Status bar shows the current branch** — the status bar item now displays the branch of the repository you are working in, with incoming/outgoing commit counts, replacing VS Code's built-in Git status bar item / 状态栏现在显示当前仓库的分支名与待推送/待拉取提交数，替代 VS Code 内置 git 的状态栏项
  - Click it for a menu of common actions: Update Project, Commit, Push, New Branch, Switch Branch and the Git Log view / 点击可打开常用操作菜单：更新项目、提交、推送、新建分支、切换分支、Git Log
  - Follows the folder of the active editor in multi-root workspaces, and refreshes on Git changes in every workspace folder / 多根工作区下自动跟随当前编辑器所在文件夹，并在各工作区的 Git 状态变化时刷新
  - A detached HEAD shows up instead of disappearing, and checking out a remote branch warns before leaving you detached / 处于 detached HEAD 时状态栏会显示提示而不是消失；检出远程分支前会先警告

### Added / 新增
- **Marker hover card (IDEA-style)** — hovering a change marker or any changed line shows a card of exactly that block: modified lines are word-diffed with the changed words highlighted in the editor's diff colors, a deleted block shows the content as it reads in `HEAD`, an insertion shows just the actions; the six action buttons are the bundled JetBrains UI icons (light and dark theme variants), and **Manage Selection...** in the Git context menu floats the same card over the block, staying open until you act on it / 悬停变更标记或任意变更行会显示该块的改动卡片：修改行按词级高亮变化的部分（取编辑器 diff 主题色），删除块直接显示 `HEAD` 中的内容，新增块只有操作按钮；六个操作按钮用打包的 JetBrains UI 图标（浅色/深色两套），右键 Git 菜单的 **Manage Selection...** 会把同一张卡片浮在该块上方，保持显示直到你操作它
  - **Prev Change / Next Change** walk between blocks in the file, wrapping around / 在文件的变更块之间循环跳转
  - **Rollback Lines** reverts exactly this block to `HEAD`, keeping unsaved-buffer semantics / 只回滚该块到 `HEAD`，支持未保存的缓冲内容
  - **Show Diff for Lines** opens the `HEAD ↔ Working Tree` diff and lands on the block / 打开 `HEAD ↔ Working Tree` 的 diff 并定位到该块
  - **Copy** takes the current lines (or the deleted content from `HEAD`) / 复制当前内容（删除块复制 `HEAD` 中的内容）
  - **Commit this change** commits only this block through a throwaway index, leaving the rest of the file — staged or not — exactly as it was / 通过临时 index 只提交该块，文件其余的暂存与未暂存状态原样保留
- **Turn the decorations off** — `JGC Decorations › Enabled`, `… › File Colors` and `… › Gutter Markers` switch off the Explorer colors and the gutter markers independently, so either layer can fall back to VS Code's built-in Git decorations / `JGC Decorations › Enabled`、`… › File Colors`、`… › Gutter Markers` 可分别关闭资源管理器着色与行号槽标记，某一层可退回使用 VS Code 内置 Git 的装饰
- **Explorer file colors by Git status** — file names in the Explorer are tinted by their Git status (added, modified, deleted, untracked, ignored, conflict), so built-in Git can be disabled without losing them / 资源管理器中的文件名按 Git 状态着色（新增、修改、删除、未跟踪、已忽略、冲突），禁用内置 git 后依然保留
- **Gutter change markers** — the line-number gutter shows a colored bar next to every added or modified line, and a short marker at the position where lines were deleted / 行号槽中为每个新增或修改的行显示彩色小竖条，删除位置显示较短的标记
  - With inline blame annotations on, every marker keeps the same column to the right of the blame text — lines without a label reserve that column too, so markers never slide left / 开启行内 blame 注释时，所有标记保持在注释文字右侧的同一列；无标签的行同样保留该列宽度，标记不会向左滑动
  - Files Git ignores get no markers at all, and neither do folders that are not a repository / 被 Git 忽略的文件不显示任何标记，非 Git 仓库的文件夹同样不显示
- **File and line colors follow your palette** — the six Git status colors (added, modified, deleted, untracked, ignored, conflict) are declared as `jgc.decoration.*` color IDs and can be changed in **Settings** or under `workbench.colorCustomizations`. Both the Explorer file colors and the gutter markers follow the change; the defaults are taken from IDEA's File Status Colors / 六种 Git 状态颜色（新增、修改、删除、未跟踪、已忽略、冲突）以 `jgc.decoration.*` 颜色 ID 声明，可在**设置**中或通过 `workbench.colorCustomizations` 修改，资源管理器文件色与行号槽标记会同步变化；默认取色参照 IDEA 的 File Status Colors

### Fixed / 修复
- **Each line-number column toggles its own blame** — in a diff editor, the blame menu entries used `activeTextEditor`, which does not reliably follow the pane you interacted with, so both columns' entries drove the same side: annotating one side and then closing from the other column killed the first side's blame. The gutter menu now has a single **Toggle Git Blame Annotations** entry that acts on the editor the menu was opened on — VS Code forwards the clicked editor's URI (`{ lineNumber, uri }`) and the command annotates or clears exactly that editor, so each column, and each diff side, opens and closes its own blame independently / diff 编辑器里 blame 菜单项此前取的是 `activeTextEditor`（并不总是跟随你实际操作的栏），两列的菜单因此控制同一侧：给一侧打开 blame 后从另一列关闭，会关掉第一侧的 blame。现在行号菜单只有一个 **Toggle Git Blame Annotations** 入口，作用于菜单打开时所在的那一列——VS Code 会转发被点击编辑器的 URI（`{ lineNumber, uri }`），命令只对该编辑器做打开或关闭——每一列、diff 的每一侧都独立开关自己的 blame
  - Blame works on both sides of a diff: virtual sides are blamed at the revision they display (`git blame <ref> -- <path>`), so line numbers match that side; sides without a git revision (empty placeholder, index, shelf content) say so instead of failing silently / diff 两列都能打开 blame：虚拟侧按其显示的版本执行 blame（`git blame <ref> -- <path>`），行号与该侧一致；没有 git 版本的侧（空占位、index、shelve 内容）会明确提示而不是无响应
- **Commit badge shows without opening the panel** — two things conspired to keep the pending-changes badge on the activity bar's Commit icon hidden until the first click on it. The extension declared no `activationEvents`, so VS Code activated it only through contributions (`onView`, `onCommand`) — meaning the badge code did not run at all until some JGC UI was touched; the extension now activates with `onStartupFinished`, so it comes alive with the window. And a `WebviewView` is resolved lazily, so `WebviewView.badge` does not exist until the view has been opened once (microsoft/vscode#146330); the badge now rides a hidden tree view in the same container, whose `TreeView.badge` reaches the container icon without any resolution. The count now shows on window load and tracks every change, click or no click / 活动栏 Commit 图标上的待提交数角标此前只有第一次点击后才会出现，两个原因叠加：其一，扩展没有声明 `activationEvents`，VS Code 只按贡献点隐式激活（`onView`、`onCommand`）——没碰过任何 JGC 界面之前角标代码根本没运行；现在扩展以 `onStartupFinished` 随窗口启动激活。其二，`WebviewView` 是懒解析的，首次打开前 `WebviewView.badge` 不存在（microsoft/vscode#146330）；现在角标由同容器内一个隐藏的 TreeView 承载，`TreeView.badge` 无需解析即可作用到容器图标。窗口一加载就显示数量，并随每次变更更新
- **Committing respects your checkboxes** — files that were staged but UNchecked still landed in the commit, because `git commit -m` swept the whole index in. Unchecked staged files are now unstaged for the commit and re-staged afterwards, so only the checked files are committed; Commit and Commit & Push behave the same / Commit 面板中已暂存但未勾选的文件此前仍会被提交（`git commit -m` 会带入整个暂存区）。现在提交前先对这些文件取消暂存、提交后再恢复，只有勾选的文件进入提交；Commit 与 Commit & Push 行为一致
- **Saving a file no longer resets the Git Log panel** — every Git state event rebuilt the graph, so a plain file save (a `status` event) cleared the selected commit, the collapsed sequences and scrolled the list back to the first 200 commits. The panel now ignores `status` and `mergeState` events and only rebuilds when commits, branches or tags can actually change / 此前任意 Git 状态事件都会重建提交图——单纯保存文件（status 事件）也会清空选中的提交、折叠的提交序列，并把列表卷回前 200 条。现在面板忽略 status 与 mergeState 事件，只在提交/分支/标签真正变化时刷新
- **Compare with Current shows the real diff** — the branch sidebar action opened two empty virtual documents because the URIs carried no `ref`. It now shows the merge-base patch of the selected branch against the current one / 分支侧边栏的 Compare with Current 此前打开的是两个空虚拟文档（URI 缺少 `ref`）。现在显示所选分支相对当前分支基于 merge-base 的 patch 内容
- **Worktree panel refresh works again** — the Refresh Worktrees command invoked itself, looping forever when triggered. It now tells the panel to refetch / Worktree 面板的刷新命令此前会无限调用自身；现在改为通知面板重新拉取数据
- **Rollback keeps new files on disk when you ask** — a new file that also had unstaged edits was classified as "modified" by the rollback panel, so it was deleted from disk even with delete-local-copies unchecked. Rollback now classifies by whether the file exists in `HEAD`; keeping the file only unstages it / 回滚面板此前会把「已暂存新增且又有未暂存修改」的文件误判为 modified，即使不勾选删除本地副本也会将其从磁盘删除。现在按文件是否存在于 `HEAD` 判定，保留文件时仅将其移出暂存区
- **Drop Commit no longer fakes a timeout** — the operation reported "Operation timed out" after 30 seconds while the rebase kept running in the background. The fake timeout is gone (the progress indicator runs until the rebase actually finishes), and commits that are not on the current branch are rejected up front / Drop Commit 超过 30 秒会报「Operation timed out」，但 rebase 仍在后台继续。现在移除假超时（进度指示等待 rebase 真正结束），且不属于当前分支历史的提交会被提前拒绝
- **Rollback Lines keeps your other unsaved edits unsaved** — rolling back one block force-saved the whole file, silently publishing unrelated edits with it. Only a previously clean document is written through now / 卡片中的 Rollback Lines 此前会保存整个文件，把同文件里其它未保存的修改一并写盘。现在只有回滚前没有未保存修改的文件才会自动保存
- **IDEA shelves restore text containing backslash escapes** — the base revision was unescaped with sequential replaces, so a literal `\n` inside the shelved file (e.g. inside string literals) turned into a real newline. Unescaping is now a single pass / IDEA Shelf 恢复时，shelved 文件中的字面 `\n` 序列（如字符串字面量里）会被错误解码成真实换行。现在改为单遍转义解析
- **Unshelving untracked files no longer appends a blank line** — the generated patch counted the phantom line after the trailing newline, so the restored file ended with an extra empty line; empty files now produce a valid patch too / 恢复包含 untracked 文件的 shelf 时，文件末尾会多出一个空行（patch 行数把末尾换行多算了一行）；空文件现在也能生成合法 patch
- **Local branches with a slash are local again** — ref badges guessed remote-vs-local from a hardcoded prefix list, so branches like `dev/sub` or `user/feature` showed as remote branches. Classification now checks the first segment against the actually configured remotes / 带斜杠的本地分支（如 `dev/sub`、`user/feature`）此前基于硬编码前缀被误判为远程分支。现在用实际配置的 remote 名单判定
- **Continue flows stage only the resolved conflicts** — cherry-pick, rebase and merge "Continue" used `git add -u`, staging every modified file including changes you never meant to commit. Only still-unmerged paths are staged now / cherry-pick、rebase、merge 的 Continue 此前使用 `git add -u`，会把所有已修改文件（包括并不想提交的改动）一起暂存。现在只暂存仍未合并的冲突文件
- **Block commit keeps the executable bit** — committing a single change block always recorded mode `100644`, silently un-executing executable files; the mode now comes from `HEAD` / 单块提交（Commit this change）此前固定写入 100644 权限，可执行文件会丢失可执行位；现在从 `HEAD` 继承文件 mode
- **Amend keeps the message you typed** — enabling Amend overwrote whatever message was already in the box with the last commit message / 勾选 Amend 会用上一次提交信息覆盖输入框中已输入的内容；现在仅在输入框为空时填入
- **Commit file lists no longer race** — clicking commit B while commit A's changed-files request was still loading could show A's file list under B / 快速切换选中提交时，旧请求晚返回可能把 A 的文件列表显示在 B 之下
- **Faster blame on large files** — the per-line label lookup rescanned the whole blame output linearly; it now uses a prebuilt line→index map / 大文件 blame 的逐行标签查找由线性重扫改为预建的行号映射
- **Deleted files open a diff again** — clicking a deleted (`D`) entry in the Commit panel failed the whole diff editor with "cannot open editor: file not found", because the diff always used the on-disk working-tree file as its right side, and a deleted file is no longer on disk. Deleted entries now render as *content before deletion → empty*, the same way IDEA's Git UI and VS Code's built-in Git show them / 在 Commit 面板点击删除（`D`）条目时，整个 diff 编辑器报「由于找不到该文件，因此无法打开编辑器」——diff 右侧固定取磁盘上的工作区文件，而已删除的文件已不在磁盘上。现在删除条目按「删除前内容 → 空」展示，与 IDEA 的 Git UI 和 VS Code 内置 Git 一致
  - Staged deletions diff against the index revision, unstaged ones against an empty virtual document / 已暂存的删除对比 index 版本，未暂存的删除对比空虚拟文档
  - The `HEAD ↔ Staged` diff now really compares against the index instead of the working tree, so the title matches the content / `HEAD ↔ Staged` 的 diff 右侧现在真正对比暂存区（index）而非工作区，标题与内容一致
  - Fixed by @dunlingzi in #8, reported in #7 / 由 @dunlingzi 在 #8 中修复，#7 报告
- **Gutter markers now read your edits, not the diff's alignment** — line classification was rewritten around jsdiff's block semantics (`removed+added` runs pair into one modified block), replacing the old node-diff3 + per-line similarity heuristics that lost track of line identity when lines were inserted above an edit, turning whole regions green / 行号槽标记的行分类改为基于 jsdiff 的块语义（`removed+added` 区块配对为一个修改块），替换原先 node-diff3 加逐行相似度推断的方案——插入新行后整片修改行被误判为新增（绿色）的问题由此解决
  - Blocks that only a blank line separates join into one modification when either side is large enough (more than 5 lines), the same rule VS Code's own quick diff applies — without it, a rewrite whose old and new lines happen to straddle a blank line would split into a green insertion and a gray deletion / 两个变更块之间仅隔空行时，任一侧超过 5 行即合并为一个修改块——与 VS Code 原生 quick diff 的启发式一致，否则跨空行的改写会被拆成绿色新增加灰色删除
  - The classification ships with regression tests built from the original failing scenarios / 分类逻辑附带由原始出错场景提炼的回归测试
- **All-caps headings** — headings across the Commit, Push and Git Log panels were forced to all caps: the Commit panel's file group headers and their file counts, the section headers in the Commit toolbar, Git Log list and branch sidebar context menus, and the Push panel's remote branch sections. `UNVERSIONED FILES` and `12 FILES` now read `Unversioned Files` and `12 files`, `ON SINGLE CLICK` reads `On Single Click`, `REMOTE` and `BRANCH` read `Remote` and `Branch` / Commit、Push、Git Log 面板的标题此前被强制转为全大写：Commit 面板的文件分组标题及文件计数、Commit 工具栏与 Git Log 列表与分支侧边栏右键菜单的分节标题、Push 面板的远程分支分节标题。`UNVERSIONED FILES` 与 `12 FILES` 现显示为 `Unversioned Files` 与 `12 files`，`ON SINGLE CLICK` 显示为 `On Single Click`，`REMOTE`、`BRANCH` 显示为 `Remote`、`Branch`
- **Non-ASCII filenames** — Chinese and other non-ASCII filenames were shown as octal escape sequences such as `\344\270\255\346\226\207.txt` instead of `中文.txt`, and every Git operation on them (open diff, stage, discard, shelve) failed. Reported by @dunlingzi in #3, fixed in #4 / 中文等非 ASCII 文件名会显示成八进制转义串（如 `\344\270\255\346\226\207.txt`）而非文件名本身，且对这些文件的 Git 操作（打开 diff、暂存、撤销、shelve）全部失败 - 由 @dunlingzi 在 #3 中报告，#4 修复
  - Paths are now decoded before use, so Git receives the real filename / 路径在使用前会先解码，Git 收到的是真实文件名
  - Filenames containing a space, a double quote or an arrow are handled too, including a file literally named `a -> b` / 同时也能正确处理含空格、双引号或箭头的文件名，包括名字里就带 `a -> b` 的文件
- **Files missing from an IDEA shelf** — a shelf could omit files whose name forced Git to quote the path, so restoring it left those changes behind / IDEA Shelf 的文件列表可能漏掉路径被 Git 加引号的文件，恢复后这些改动会丢失

## [1.1.2] - 2026-10-08

### Added / 新增
- **Triple-click jumps to source** — in the Commit panel file list: single click selects, double click opens the diff, triple click opens the file / Commit 面板文件列表支持三击跳转源码：单击选中，双击打开 diff，三击打开文件
- **Shift-click range selection** — select a contiguous run of files in the Commit panel / Commit 面板支持按住 Shift 连续选择多个文件
- **Jump to Source shortcut** — `F4`, plus `Cmd+↓` on macOS and `Ctrl+↓` on Windows/Linux / 跳转源码快捷键：`F4`，macOS 额外支持 `Cmd+↓`，Windows/Linux 支持 `Ctrl+↓`
  - Works in the Commit panel, the Git Log Changed Files list, and inside a diff editor / Commit 面板、Git Log 的 Changed Files 列表、diff 编辑器内均可用
  - In a diff editor it opens the file on disk and jumps to the line the cursor is on / 在 diff 编辑器中会打开磁盘上的文件并定位到光标所在行
  - Can be rebound in **Preferences: Open Keyboard Shortcuts** / 可在 **Preferences: Open Keyboard Shortcuts** 中重新绑定
  - Context menus show the shortcut beside **Jump to Source** and **Edit Source** / 右键菜单中 **Jump to Source** 与 **Edit Source** 旁显示快捷键
- **Commit badge** — the Commit entry in the activity bar shows how many files are pending, matching the count in VS Code's own Source Control view / Commit 侧边栏图标显示待处理的文件数量，与 VS Code 自带源代码管理视图的数字一致
- **New setting** `jgc.shortcut.jumpToSourceLabel` — text shown beside the shortcut in context menus; leave empty to hide it / 新增设置 `jgc.shortcut.jumpToSourceLabel`，控制右键菜单中快捷键的显示文案，留空则隐藏

### Changed / 变更
- **Smaller extension package** — the VSIX shrank from 3.69 MB to 2.48 MB, a 33% reduction, so download and install are faster / 扩展包体积从 3.69 MB 缩减到 2.48 MB，减少 33%，下载与安装更快
  - Editor and IDE working files that were being packaged by mistake are no longer shipped / 不再打包误混入的编辑器与 IDE 工作文件
  - Two unused images were dropped / 移除两张未被引用的图片

### Fixed / 修复
- The **Changed Files** header was shown in all caps / **Changed Files** 标题显示为全大写
- Double-clicking a file in **Changed Files** highlighted its name as text / 双击 **Changed Files** 里的文件会把文件名选成文字
- Newly created, renamed or deleted untracked files did not appear in the Commit panel until an unrelated action triggered a refresh / 新建、重命名或删除未追踪文件后，Commit 面板不会立即刷新，需要其他操作触发
- Pressing Shift showed a stray border around the Commit file list / 按 Shift 会在 Commit 文件列表周围出现多余边框
- Selection could keep referring to files that no longer existed after a refresh / 刷新后选中状态会残留已不存在的文件

## [1.1.1] - 2026-09-12

### Added / 新增
- **Commit hash search** — search commits by hash in the search bar / 搜索栏支持按 commit hash 搜索提交

### Fixed / 修复
- **Commit panel text selection** — disabled mouse text selection in commit panel file list / 禁用 commit 面板文件列表的文字选中
- **Worktree table header uppercase** — removed `text-transform: uppercase` from worktree table header / 移除 worktree 表头的全大写样式

## [1.1.0] - 2026-08-29
### Added / 新增
- **Git Worktree** — sidebar panel for managing Git worktrees (JetBrains-style) / Git Worktree 侧边栏面板（JetBrains 风格）
  - Worktree list with branch, path columns; main worktree protection / 工作树列表显示分支和路径列，主工作树受保护不可删除
  - New Worktree dialog: searchable branch/tag dropdown (local + origin/* + tags), input filtering, auto-fill project name / 新建工作树对话框：可搜索分支/标签下拉、输入过滤、自动填充项目名
  - Branch name validation: real-time duplicate check with red border / 分支名校验：实时检查重名并红框提示
  - Open Project dialog (native VS Code): Cancel / This Window / New Window / 打开项目对话框（原生 VS Code API）
  - `jgc.worktree.openBehavior` setting: ask (default) / thisWindow / newWindow / 配置项控制打开行为
  - Prune button with JetBrains clearCash icon / 清理按钮使用 JetBrains clearCash 图标
  - Sidebar collapse/expand toggle / 侧边栏折叠/展开切换
  - Location defaults to repo root, remembers per-repo preference / Location 默认为仓库根目录，按仓库记忆上次选择

## [1.0.0] - 2026-08-28
### Added / 新增
- **Annotate with Git Blame** — WebStorm-style inline blame annotations for every line, with click-to-jump to the Git Log commit graph / WebStorm 风格的行内 blame 注释，点击注释跳转到 Git Log 提交图并定位提交
  - Gutter (line number) right-click menu: `Annotate with Git Blame` / `Close Annotations` / 行号右键菜单触发，菜单项互斥切换
  - **Annotation View** submenu (nested under gutter menu): multi-select columns Revision / Date (default on) / Author (default on) / Commit Number, plus nested **Colors** (Author / Order (default) / Hide) and **Names** (Initials / Last Name / First Name / Full Name / Email) radio submenus; at least one column must stay enabled / 注释视图子菜单：Revision、Date（默认选）、Author（默认选）、Commit Number 多选；内嵌 Colors（Author / Order（默认）/ Hide 单选）与 Names（作者名显示方式单选）子菜单；至少保留一列
  - JetBrains-style age-based coloring, configurable via `jgc.blame.colorMode` / 按提交新旧程度渐变着色（新→蓝、中→绿、旧→灰）
  - Display scope config: whole file / cursor line only / N lines around cursor (`jgc.blame.displayMode`) / 展示范围可配置：全文件 / 仅光标行 / 光标前后 N 行
  - Date format config (`jgc.blame.dateFormat`, default `yyyy-MM-dd HH:mm`), hash off by default / 日期格式可配置，默认不显示 hash

### Changed / 变更
- Renamed extension to **JetBrains Git Control** (short brand: JGC); extension ID changed from `idea-like-git-graph` to `jetbrains-git-control` / 插件更名为 JetBrains Git Control（短标识 JGC），扩展 ID 由 `idea-like-git-graph` 改为 `jetbrains-git-control`

### Fixed / 修复
- **GitLog panel text selection** — disabled mouse text selection in GitLog panel file list / 禁用 Git Log 面板文件列表的文字选中

## [0.4.17] - 2026-06-20

### Added / 新增
- **Push Panel: multi-remote switching** — push panel now supports switching between multiple remotes (e.g. origin, fork) via a dropdown selector, with separate branch input / Push 面板支持多 remote 切换，remote 下拉选择和 branch 输入框独立

### Fixed / 修复
- **Push Panel: stale remote list** — uses `git remote` directly; deleted remotes no longer appear / 修复已删除的 remote 仍显示的问题
- **Push Panel: default remote detection** — auto-detects correct default remote from upstream tracking config / 自动检测正确的默认 remote
- **Push Panel: ahead commits respect selected remote** — commit list updates dynamically when switching remotes / 切换 remote 后 commit 列表动态更新
- **Dark theme: commit panel** — fixed tabs, toolbar buttons, textarea border, checkboxes, buttons (Cancel/Commit and Push) all using hardcoded light colors / 修复 commit 面板深色主题下各组件颜色不正确
- **Dark theme: file name colors** — commit panel and FileTree now use IDEA Dark Island palette (blue for modified, green for added, etc.) instead of invisible dark-on-dark colors / 文件名颜色改为 IDEA Dark Island 风格，深色主题下清晰可见
- **Dark theme: dropdown menus** — all dropdown/context menu backgrounds, borders, hover states, separators fixed across git log, commit panel, push panel / 所有下拉菜单和右键菜单深色主题适配
- **Dark theme: push/rollback panels** — Cancel button, menu items, checkbox styling all fixed / Push/Rollback 面板按钮和 checkbox 深色适配

## [0.4.16] - 2026-06-20

### Added / 新增
- **Push Panel: multi-remote switching** — push panel now supports switching between multiple remotes (e.g. origin, fork) via a dropdown selector / Push 面板支持切换多个 remote（如 origin、fork）
- **Push Panel: separate remote selector & branch input** — remote is selected from a list, branch name is typed in a text input, independent of each other / Remote 下拉选择和 Branch 输入框分离，互不影响

### Fixed / 修复
- **Push Panel: stale remote list** — remote list now uses `git remote` directly and invalidates cache, deleted remotes no longer appear / 修复已删除的 remote 仍显示在列表中的问题
- **Push Panel: default remote detection** — opening push panel now detects the correct default remote from upstream tracking config instead of hardcoding "origin" / 打开 Push 面板时自动检测正确的默认 remote，不再硬编码 origin
- **Push Panel: ahead commits respect selected remote** — commit list updates dynamically when switching remotes, comparing against the correct remote tracking branch / 切换 remote 后 commit 列表会根据所选 remote 重新计算

## [0.4.15] - 2026-06-10

### Fixed / 修复
- **Revert Selected Changes for added files** — no longer fails with "pathspec did not match" when reverting a file that was newly added in a commit / 修复 Revert Selected Changes 对新增文件报 pathspec 错误
- **Rollback for staged new files** — correctly removes file from index and disk for files not yet in HEAD (untracked → staged → rollback) / 修复已暂存的新文件 Rollback 报 ENOENT 错误
- **Remote branch checkout** — "Checkout" on a remote branch (e.g. `origin/dev`) now creates a local tracking branch (`dev`) instead of entering detached HEAD / 远程分支 Checkout 现在创建本地跟踪分支而非 detached HEAD
- **New Branch default name** — "New Branch from 'origin/stg'" dialog now defaults to `stg` instead of `origin/stg` / 从远程分支创建新分支时默认名去掉 remote 前缀
- **Ref tag/branch labels truncated** — commit message now properly shrinks with ellipsis so tag/branch labels always display fully / 修复 tag/branch 标签被 commit message 挤压截断的问题

## [0.4.14] - 2026-06-09

### Added / 新增
- **Drop Commit** — right-click a commit in git log to drop it from history while preserving its changes as unstaged modifications (IDEA-style) / 右键 commit 支持 Drop Commit，移除 commit 但保留变更到工作区
- **Push Panel: editable remote branch target** — click "origin : main" label to type a custom push target branch name / Push 面板支持点击编辑远程分支目标
- **Push Panel: draggable split divider** — drag the vertical divider between commit list and file changes to resize panes / Push 面板分割线支持拖拽调整宽度
- **Push Panel: progress bar + native notification** — indeterminate progress bar during push, VS Code notification on completion / Push 时显示进度条，完成后弹出原生通知
- **Push Panel: reuse FileTree + CommitInfo** — right side now uses the same FileTree (with tree/flat toggle) and CommitInfo components as git log / Push 面板右侧复用 git log 的文件树和 commit 详情组件
- **Rollback Panel** — dedicated confirmation tab (like Push Panel) with file tree, checkboxes, "Delete local copies of added files" option, and Rollback/Cancel buttons / 全新 Rollback 确认面板，类似 Push 面板，带文件树 + checkbox + 删除选项
- **(JetGit) Edit Source** — right-click in diff editor to jump to the source file at the same line / Diff 编辑器右键跳转到源文件
- **Ref tag icons: dual icons for merged labels** — "origin & dev" now shows both remote (purple) + local (green) overlapping tag icons / 合并标签显示双色重叠图标

### Changed / 变更
- **Rollback uses highlighted files** — rollback button now operates on mouse-click selected (highlighted) files, not checkbox-selected files / Rollback 按钮根据鼠标点击高亮的文件操作
- **No default checkbox selection** — commit panel no longer auto-selects all files on load / Commit 面板不再默认全选文件
- **(JetGit) Show File History** — renamed from "Show File History" to clearly indicate plugin origin, focuses git log panel before filtering / 文案改为 (JetGit) Show File History，点击时先聚焦 git log 面板
- **Ref icon styling** — 16px icons, 5px overlap spacing, white-fill with 1.2px colored stroke for IDEA-like layered effect / 图标调大到 16px，间距 5px，白色填充+彩色描边

### Fixed / 修复
- **Pull --rebase with unstaged changes** — added `--autostash` flag so rebase works even with uncommitted changes (matches IDEA behavior) / pull --rebase 加 --autostash，有未提交变更时也能正常 rebase
- **Edit Source path resolution** — correctly resolves `git-brains:/` URI paths to workspace files / Edit Source 正确解析 diff URI 到工作区文件

## [0.4.11] - 2026-06-06

### Changed / 变更
- **IDEA-style graph colors** — lane colors updated to match IntelliJ IDEA's softer, professional palette (blue, red, green, golden, purple, teal, orange, light teal) / Git graph 配色更新为 IDEA 风格的柔和专业色系
- **IDEA-style angular lines** — graph lines changed from Bézier curves to IDEA-style diagonal transitions (vertical → diagonal → vertical) / 分支线从贝塞尔曲线改为 IDEA 风格的斜线过渡
- **Stub lines with arrows** — branch tips whose parents are beyond the loaded range now show a solid line with a downward arrow (matching IDEA) instead of dashed stubs / 超出加载范围的分支末端改为实线+向下箭头
- **Branch ahead/behind indicators** — shows green ↗ for ahead and teal ↙ for behind on branch names in the tree (IDEA style) / 分支树显示绿色 ↗ ahead 和青色 ↙ behind 标记
- **Ref icon colors** — remote-branch and tag icon colors updated to match the new graph palette / Ref 图标颜色与 graph 配色统一

### Fixed / 修复
- **Graph hidden by header** — git graph SVG no longer renders above the column header when scrolling; header properly clips the graph / 滚动时 graph 不再穿过表头
- **Node-text overlap** — improved per-row max column tracking to prevent graph nodes from overlapping commit message text / 改进每行最大列计算，防止节点与文字重叠
- **Date-order sorting** — git log now uses `--date-order` for commit ordering consistent with IDEA / git log 使用 `--date-order` 排序，与 IDEA 一致

## [0.4.10] - 2026-06-04

### Added / 新增
- **Create Branch dialog** — replaced native input box with a custom dialog featuring "Checkout branch" and "Overwrite existing branch" checkboxes, matching JetBrains style / 创建分支改为自定义对话框，支持 "Checkout branch" 和 "Overwrite existing branch" 选项
- **Inline error in Create Branch dialog** — shows git error message (e.g. branch already exists) directly in the dialog instead of only logging to console / 创建分支失败时在对话框内显示错误提示

### Fixed / 修复
- **Rollback toolbar button** — the Rollback button in the commit panel toolbar now works (was missing onClick handler) / Commit 面板工具栏的 Rollback 按钮现在可以正常使用

## [0.4.9] - 2026-06-03

### Added / 新增
- **Tooltip on truncated branch names** — hover over ellipsized branch names to see full name via custom Tooltip / 悬浮被截断的分支名显示完整名称（使用自定义 Tooltip）
- **Tooltip on truncated commit messages** — hover over ellipsized commit subjects to see full message / 悬浮被截断的 commit message 显示完整内容
- **Tooltip on ref/tag labels** — hover over branch/tag labels in commit rows to see full ref names / 悬浮 commit 行的 ref/tag 标签显示完整名称
- **Directory rollback** — added "Rollback..." option to folder context menu to revert all files in directory / 文件夹右键菜单新增 "Rollback..." 选项

### Fixed / 修复
- **Tooltip renders via portal** — tooltips now render to document.body, preventing clipping by overflow:hidden containers / Tooltip 通过 portal 渲染到 body，不再被父容器裁剪
- **Tooltip auto-flip** — when near viewport top edge, tooltip automatically flips to bottom / Tooltip 靠近顶部时自动翻转到下方显示
- **Context menu viewport overflow** — file and folder context menus auto-adjust position near viewport edges / 右键菜单靠近边缘时自动调整位置
- **Context menu dismiss on blur** — clicking outside webview now closes context menus / 点击 webview 外部关闭右键菜单
- **Preserve file selection on refresh** — refresh no longer resets checkbox state, preserves user selections / 刷新不再重置勾选状态
- **Behind count font size** — reduced to 0.85em to match branch name size / behind 数字字体缩小匹配分支名
- **Thin scrollbar** — 6px scrollbar that doesn't expand on hover / 6px 细滚动条，悬浮不变宽

## [0.4.8] - 2026-06-02

### Added / 新增
- **Column visibility toggle** — right-click the column header or use the eye icon (View Options) in the toolbar to show/hide Author, Date, Hash columns, similar to IntelliJ IDEA / 右键表头或点击工具栏眼睛图标可切换显示/隐藏 Author、Date、Hash 列，类似 IDEA 的 Columns 菜单
- **View Options button** — eye icon button on the far right of the toolbar with a dropdown for column visibility / 工具栏最右侧新增眼睛图标按钮，下拉菜单控制列显示
- **Branch panel collapse button in sidebar** — the "<" collapse button is now at the top of the left toolbar (BranchSidebar), matching JetBrains layout / 分支面板收起按钮移到左侧工具栏顶部，与 JetBrains 布局一致
- **New Branch input pre-filled** — "New Branch from..." now pre-fills the input with the source branch name (fully selected) / "New Branch from..." 现在预填源分支名称并全选

### Fixed / 修复
- **Diff icon** — replaced with official JetBrains `expui/vcs/diff.svg` icon (two offset arrows → ←) across all context menus and toolbars / 所有右键菜单和工具栏的 diff 图标替换为 JetBrains 官方 `expui/vcs/diff.svg`
- **Compare with Current icon** — now uses the official diff icon instead of the external-link style / "Compare with Current" 按钮改用官方 diff 图标
- **Group By Directory icon** — replaced with JetBrains `groupByPackage` icon (folder inside brackets) / "Group By Directory" 图标改为 JetBrains `groupByPackage` 风格（方括号内文件夹）
- **Settings icon** — replaced with stroke-based gear icon for better clarity / 设置图标替换为描边齿轮，更清晰
- **Ref badges right-aligned** — tag/branch labels in the git log are now right-aligned within the message column / Git log 中的 tag/分支名标签现在右对齐
- **Context menu viewport overflow** — file and directory context menus now auto-adjust position when near viewport edges / 文件和文件夹右键菜单现在在靠近视口边缘时自动调整位置
- **Context menu dismiss on blur** — clicking outside the webview (editor, other panels) now correctly closes context menus / 点击 webview 外部（编辑器、其他面板）现在能正确关闭右键菜单
- **Directory rollback** — added "Rollback..." option to folder context menu to revert all files in the directory / 文件夹右键菜单新增 "Rollback..." 选项，可还原目录内所有文件

### Changed / 变更
- **Panel layout** — uses `proportionalLayout={false}` so collapsing left/right panels gives all space to the center git log / 面板布局改为非等比分配，收起侧面板时空间全部给中间 git log
- **All buttons have tooltips** — enforced tooltip on every interactive button / 所有按钮强制添加 tooltip

## [0.4.7] - 2026-05-31

### Added / 新增
- **Merge conflict banner** — displays "Merging {branch}" with continue/abort buttons when merge conflicts are detected, matching IntelliJ IDEA behavior / 合并冲突时显示 "Merging {branch}" 横幅，带继续/终止按钮，与 IDEA 行为一致
- **Merge Conflicts file group** — conflicted files are separated into a dedicated "Merge Conflicts" group with a "Resolve" link / 冲突文件单独分组为 "Merge Conflicts"，带 "Resolve" 链接
- **Rebase banner** — displays "Rebasing {branch} (step/total)" with continue/abort buttons during rebase / Rebase 时显示进度横幅和操作按钮
- **Custom fast Tooltip** — 300ms delay tooltip component replacing slow native browser tooltips across all buttons / 自定义 300ms 快速 Tooltip 组件，替换所有按钮的原生浏览器提示

### Fixed / 修复
- **Merge editor Apply button** — accepting a single side now auto-resolves the conflict block, enabling the Apply button immediately / 合并编辑器中接受单侧变更后立即启用 Apply 按钮
- **Rebase/Merge continue button** — opens conflict resolution panel when unresolved conflicts exist, commits only when all resolved / 有未解决冲突时打开冲突面板，全部解决后才执行 commit

### Changed / 变更
- **Rebase continue/abort icons** — replaced with JetBrains official expui-style icons (double chevron >> and ×) / 替换为 JetBrains 官方 expui 风格图标
- **Merge editor buttons** — restyled to match plugin design (rounded corners, hover effects) / 合并编辑器按钮样式统一为插件风格（圆角、hover 效果）
- **Tooltip unified** — all toolbar, merge editor, and gutter buttons now use the custom Tooltip component / 所有工具栏、合并编辑器和 gutter 按钮统一使用自定义 Tooltip

## [0.4.6] - 2026-05-30

### Added / 新增
- **Current branch sorted to top** — the checked-out branch (or folder containing it) is always shown first in the Local branch tree / 当前分支（或包含它的文件夹）始终排在 Local 分支树最顶部
- **Commit message history dropdown** — click the clock icon next to "Amend" to pick from recent commit messages / 点击 Amend 旁的时钟图标可选择最近的 commit message
- **Refresh syncs both panels** — the refresh button in the commit panel now also refreshes the git log view / Commit 面板的刷新按钮现在同时刷新 Git Log 视图

### Fixed / 修复
- History dropdown opens upward to avoid being clipped by panel boundary / 历史下拉菜单向上弹出，避免被面板边界裁剪
- History dropdown dismisses on outside click / 点击外部区域关闭历史下拉菜单

## [0.4.4] - 2026-05-28

### Added / 新增
- **IDEA-style compact Git Graph** — narrower lanes, smaller nodes, thinner lines / IDEA 风格紧凑 Git 图 — 更窄的通道、更小的节点、更细的线条
- **Per-row text indent** — commit message starts right after the graph for that row, not global max width / 每行文字缩进基于该行 graph 宽度，不再使用全局最大宽度
- **IDEA-style ref tag icons** — outline tag icons with overlapping layout, color-coded / IDEA 风格标签图标 — 线条轮廓标签重叠显示，颜色区分
- **Ref merge rules** — local + remote same-name branches merge as "origin & branchName" / 同名本地+远程分支合并显示为 "origin & branchName"
- **Detail panel email** — author email shown as clickable mailto link / 详情面板显示作者邮箱（可点击）
- **URL highlighting** — links in commit messages are clickable / 提交信息中的链接可点击
- **Mailmap support** — uses %aN/%aE for consistent author identity / 支持 .mailmap 统一作者身份
- **Delete files** — right-click file or directory to delete (with confirmation) / 右键删除文件或目录（带确认）
- **Default directory view** — commit panel defaults to directory tree mode / Commit 面板默认使用目录树视图

### Fixed / 修复
- origin/HEAD filtered from ref display / 过滤 origin/HEAD 不显示
- HEAD shows only icon in list row (no text) / HEAD 在列表行只显示图标
- Local branches with slashes (feat/xxx) correctly classified / 带斜杠的本地分支正确分类
- Empty email no longer shows `<>` / 空邮箱不再显示 `<>`
- Graph-to-text gap increased for readability / 增加 graph 和文字间距
- Per-row indent considers all lanes passing through each row / 每行缩进考虑所有经过该行的 lane

### Changed / 变更
- Git graph COLUMN_WIDTH: 16→10, line stroke: 1.6→1.2, node radius reduced / Git 图列宽、线粗、节点半径缩小
- Ref display: background badges → outline tag icons / 标签显示从背景色方块改为轮廓图标

## [0.4.3] - 2026-05-27

### Fixed / 修复
- Larger checkboxes (16px) for better visibility / 更大的复选框（16px）提升可见性
- Removed yellow/orange focus outline on unchecked checkboxes / 移除取消选中时的黄色聚焦边框
- Checkbox accent color uses IDEA blue (#3574f0) / 复选框选中颜色使用 IDEA 蓝色
- "Commit and Push" button hover color matches toolbar style (#ededed) / "Commit and Push" 按钮悬浮颜色与工具栏一致

## [0.4.2] - 2026-05-27

### Added / 新增
- Clicking Commit icon in Activity Bar now opens both sidebar and bottom Git Log panel simultaneously / 点击 Activity Bar 的 Commit 图标同时打开侧边栏和底部 Git Log 面板
- Clicking again to collapse also closes the bottom panel / 再次点击收起时同时关闭底部面板
- Custom larger SVG icon for Commit in Activity Bar / Activity Bar 使用更大的自定义 SVG 图标

## [0.4.1] - 2026-05-26

### Added / 新增
- **Next/Previous File Diff Navigation** — jump between file diffs with keyboard shortcuts
  **下一个/上一个文件 Diff 导航** — 用快捷键在文件 diff 之间跳转
  - Cmd+F7: next file diff / 下一个文件 diff
  - Cmd+Shift+F7: previous file diff / 上一个文件 diff
  - Status bar shows current position (e.g. "File 2/5: filename.tsx") / 状态栏显示当前位置
  - Commands: `git-brains.nextDiff` / `git-brains.prevDiff` (rebindable in Keyboard Shortcuts) / 可在键盘快捷键设置中自定义绑定
- **Directory node checkboxes** in tree view / 目录树视图中的文件夹复选框
  - Check/uncheck recursively selects/deselects all files under a directory / 勾选/取消勾选递归选中/取消目录下所有文件
  - Indeterminate state when partially selected / 部分选中时显示半选状态
- **Keyboard arrow navigation** — Up/Down arrows move highlight between files / 上下箭头键在文件间移动高亮

### Fixed / 修复
- Directory tree expanded state now persists across tab switches / 目录树展开状态在切换标签页后保持不变
- Show all individual untracked files (use `git status -uall`) instead of directory summaries / 显示所有未跟踪文件而非目录摘要
- Directory tree indentation matches IDEA style with proper nesting / 目录树缩进匹配 IDEA 风格
- Chevron arrow placed before checkbox in directory rows (matches IDEA) / 文件夹行中箭头在复选框前面

## [0.4.0] - 2026-05-26

### Added / 新增
- **IDEA-style Commit Panel** — new sidebar panel (Activity Bar) replicating IntelliJ's commit workflow
  **IDEA 风格 Commit 面板** — 新增侧边栏面板，复刻 IntelliJ 的提交工作流
  - File changes grouped by Changes / Staged / Unversioned Files / 文件变更按 Changes / Staged / Unversioned Files 分组
  - Checkbox-based file selection for partial commits / 基于复选框的文件选择，支持部分提交
  - Commit message input with Ctrl+Enter shortcut / 提交信息输入框，支持 Ctrl+Enter 快捷提交
  - Commit / Commit and Push buttons / Commit 和 Commit and Push 按钮
  - Amend commit support (auto-loads previous message) / Amend 提交支持（自动加载上次提交信息）
  - Right-click context menu: Show Diff, Jump to Source, Add to VCS/Unstage, Rollback, Shelve Changes / 右键菜单：查看差异、跳转源码、暂存/取消暂存、回滚、搁置变更
  - Cmd+Click multi-select for batch operations / Cmd+点击多选，支持批量操作
  - Group by Directory toggle with tree view (collapsible folders) / 按目录分组切换，支持树形视图（可折叠文件夹）
  - View Options menu (eye icon): Group By Directory, Show Unversioned Files / 视图选项菜单（眼睛图标）：按目录分组、显示未跟踪文件
  - Expand All / Collapse All toolbar buttons / 展开全部/折叠全部工具栏按钮
- **IDEA-compatible Shelf** — real shelf stored in `.idea/shelf/` (compatible with IntelliJ IDEA)
  **IDEA 兼容 Shelf** — 真正的 shelf 功能，存储在 `.idea/shelf/`（与 IntelliJ IDEA 完全兼容）
  - Patch-based storage format matching IDEA's XML + unified diff / 基于 patch 的存储格式，匹配 IDEA 的 XML + unified diff
  - Expandable shelf entries showing individual file changes / 可展开的 shelf 条目，显示每个文件的变更
  - Right-click context menu: Unshelve, Restore, Create Patch, Copy as Patch to Clipboard, Import Patches, Delete / 右键菜单：取消搁置、恢复、创建补丁、复制补丁到剪贴板、导入补丁、删除
  - Show Diff opens side-by-side diff editor (base vs modified) / Show Diff 打开左右对比差异编辑器（原始 vs 修改后）
  - Import Patches from external .patch/.diff files / 从外部 .patch/.diff 文件导入补丁
  - Right-click on empty area to Import Patches / 空白区域右键可导入补丁
- **Stash Tab** — git stash management (renamed from previous "Shelf")
  **Stash 标签页** — git stash 管理（从之前的 "Shelf" 重命名）
  - Expandable stash entries with file details / 可展开的 stash 条目，显示文件详情
  - Right-click context menu: Unshelve, Restore, Delete / 右键菜单：弹出、应用、删除
  - Per-file context menu: Show Diff, Jump to Source, Copy Path / 单文件右键菜单：查看差异、跳转源码、复制路径
- All icons sourced from [JetBrains IntelliJ Icons](https://intellij-icons.jetbrains.design/) (Apache 2.0)
  所有图标来源于 [JetBrains IntelliJ Icons](https://intellij-icons.jetbrains.design/)（Apache 2.0 许可）
- Unified design language: 6px border-radius, consistent hover colors (#ededed), IDEA blue focus (#3574f0)
  统一设计语言：6px 圆角、一致的悬浮颜色（#ededed）、IDEA 蓝色聚焦（#3574f0）
- File status colors matching IDEA: green (added), blue (modified), red (unversioned), gray (deleted)
  文件状态颜色匹配 IDEA：绿色（新增）、蓝色（修改）、红色（未跟踪）、灰色（删除）
- Unknown file types use IDEA-style three-line text icon / 未知文件类型使用 IDEA 风格三横线文本图标

### Changed / 变更
- Tab order: Commit | Shelf | Stash (matches IDEA layout) / 标签页顺序：Commit | Shelf | Stash（匹配 IDEA 布局）
- Global button/input border-radius unified to 6px via `--radius` CSS variable / 全局按钮/输入框圆角统一为 6px
- Tab hover/active styles match IDEA (rounded, light blue active state #dfe7f5) / 标签页悬浮/选中样式匹配 IDEA（圆角、淡蓝色选中状态）
- Context menu hover color matches existing branch panel (#e8f0fe) / 右键菜单悬浮颜色与分支面板一致
- Commit message textarea focus border uses IDEA blue (#3574f0) / 提交信息输入框聚焦边框使用 IDEA 蓝色

### Fixed / 修复
- Binary files (zip, png) now open correctly via Jump to Source / 二进制文件（zip、png）现在可以通过"跳转源码"正确打开
- Single-file shelve no longer pulls in unrelated staged files / 单文件搁置不再连带其他已暂存文件
- Shelf/Stash lists auto-refresh after operations / Shelf/Stash 列表在操作后自动刷新

## [0.3.5] - 2025-05-25

### Added
- Status bar button "IDEA Git" at the bottom to quickly open/focus the Git Graph panel

## [0.3.4] - 2025-05-25

### Fixed
- Input hover/focus border now uses hardcoded IDEA blue (#3574f0) instead of VS Code theme variable which was overriding it

## [0.3.3] - 2025-05-25

### Changed
- User and Date filter dropdowns now also have search input (same as Branch)
- Removed unused FilterDropdown component

## [0.3.2] - 2025-05-25

### Added
- Branch filter dropdown now has a search input for quick filtering when there are many branches

## [0.3.1] - 2025-05-25

### Fixed
- Filter dropdowns (Branch/User/Date) now close when clicking anywhere outside, scrolling, or window blur

## [0.3.0] - 2025-05-25

### Changed
- Input border colors match IDEA: default `#c4c4c4`, focus/hover `#3574f0`

## [0.2.9] - 2025-05-25

### Fixed
- Refresh button (built-in) also respects minimum 1s progress bar display

## [0.2.8] - 2025-05-25

### Fixed
- Progress bar shows for minimum 1 second, ensuring animation is always visible even for fast operations

## [0.2.7] - 2025-05-25

### Fixed
- Remove duplicate refresh button from panel title (keep VS Code's built-in one)

## [0.2.6] - 2025-05-25

### Fixed
- Progress bar animation improved: thicker (3px), faster (1s), gradient glow effect for better visibility

## [0.2.5] - 2025-05-25

### Fixed
- Progress bar now shows immediately when clicking git operations (checkout, push, pull, merge, rebase, cherry-pick, reset, revert, delete) instead of waiting for server response

## [0.2.4] - 2025-05-25

### Added
- Auto-maximize editor when opening Diff viewer (same as Merge editor)

## [0.2.3] - 2025-05-25

### Added
- Auto-maximize editor when opening 3-Way Merge Editor for full-screen experience

## [0.2.2] - 2025-05-25

### Added
- IDEA-style blue progress bar during async git operations (checkout, push, pull, merge, rebase, cherry-pick, reset, revert)

## [0.2.1] - 2025-05-25

### Added
- **Show File History command** — right-click a file in editor or Explorer → "IDEA Git: Show File History"
- Also available from Command Palette
- Triggers file history view in the Git Log panel

### Changed
- Command category renamed to "IDEA Git" for easy recognition

## [0.1.9] - 2025-05-25

### Added
- **Show in Git Log** — when viewing file history, right-click a commit to jump back to full log view at that commit
- **Tab-style file history** — file filter displays as a closeable tab (`History: filename.tsx ×`)

## [0.1.8] - 2025-05-25

### Fixed
- Changed Files panel now only shows the filtered file when "History Up to Here" is active

## [0.1.7] - 2025-05-25

### Added
- **History Up to Here** — right-click a file → show only commits that modified it (`git log -- <file>`)
- File filter indicator in toolbar with clear button

## [0.1.6] - 2025-05-25

### Added
- SEO keywords for Marketplace discoverability
- Improved description with more searchable terms

## [0.1.4] - 2025-05-25

### Fixed
- Repository URL now points to the correct fork

## [0.1.3] - 2025-05-25

### Added
- Chinese README (简体中文文档)
- GIF demos for branch checkout and commit context menu

## [0.1.1] - 2025-05-25

### Added
- **Branch Context Menu** — Checkout, New Branch, Checkout and Rebase, Rebase, Merge, Rename, Delete, Update, Push
- **Commit Context Menu** — Copy Revision Number, Cherry-Pick, Checkout Revision, Reset (Mixed/Soft/Hard), Revert, New Branch, New Tag
- **Changed Files Context Menu** — Show Diff, Edit Source, Open Repository Version, Revert Selected Changes, Cherry-Pick Selected Changes, Copy Path, Copy File Name
- **Branch search** — filter branches and tags by name
- **Commit filters** — filter by Branch, User, Date range
- **Resizable columns** — drag to adjust Author, Date, Hash column widths
- **Hash column** — short commit hash in dedicated column
- **Current branch indicator** — shows name next to "Current Branch"
- **IntelliJ IDEA icons** — official SVG icons from intellij-icons.jetbrains.design (Apache 2.0)
- **Context menu icons** — Cherry-Pick (cherry), Revert (undo arrow), Copy, Edit, Diff, Branch, Tag
- **IDEA-style menu colors** — light background, soft shadow, subtle borders

### Changed
- Search inputs match IDEA style with search icon and clear button
- Filter dropdowns use stroke-based chevron icons
- Folder icons use official IntelliJ folder SVG (light fill + stroke)
- Context menus render via React portal for proper positioning
- Menu auto-adjusts position to stay within viewport
- Menu dismisses on outside click, scroll, blur, and resize

## [0.0.4] - Original

- Git Graph visualization
- 3-Way Merge Editor
- Conflict List management
- Diff Editor
