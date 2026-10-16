# Changelog / 更新日志

## [Unreleased]

### Changed / 变更
- **Jump to Source keeps your selection** — in a diff editor, **Jump to Source** now carries over the whole selection and pins the scroll position, so text you selected stays selected after the jump instead of collapsing to a bare cursor line / diff 编辑器中的 **Jump to Source** 现在会保留完整选区并固定滚动位置，之前选中的文字跳转后仍然处于选中状态，而不是收缩成一个光标点
- **Status bar shows the current branch** — the status bar item now displays the branch of the repository you are working in, with incoming/outgoing commit counts, replacing VS Code's built-in Git status bar item / 状态栏现在显示当前仓库的分支名与待推送/待拉取提交数，替代 VS Code 内置 git 的状态栏项
  - Click it for a menu of common actions: Update Project, Commit, Push, New Branch, Switch Branch and the Git Log view / 点击可打开常用操作菜单：更新项目、提交、推送、新建分支、切换分支、Git Log
  - Follows the folder of the active editor in multi-root workspaces, and refreshes on Git changes in every workspace folder / 多根工作区下自动跟随当前编辑器所在文件夹，并在各工作区的 Git 状态变化时刷新
  - A detached HEAD shows up instead of disappearing, and checking out a remote branch warns before leaving you detached / 处于 detached HEAD 时状态栏会显示提示而不是消失；检出远程分支前会先警告

### Added / 新增
- **Turn the decorations off** — `JGC Decorations › Enabled`, `… › File Colors` and `… › Gutter Markers` switch off the Explorer colors and the gutter markers independently, so either layer can fall back to VS Code's built-in Git decorations / `JGC Decorations › Enabled`、`… › File Colors`、`… › Gutter Markers` 可分别关闭资源管理器着色与行号槽标记，某一层可退回使用 VS Code 内置 Git 的装饰
- **Explorer file colors by Git status** — file names in the Explorer are tinted by their Git status (added, modified, deleted, untracked, ignored, conflict), so built-in Git can be disabled without losing them / 资源管理器中的文件名按 Git 状态着色（新增、修改、删除、未跟踪、已忽略、冲突），禁用内置 git 后依然保留
- **Gutter change markers** — the line-number gutter shows a colored bar next to every added or modified line, and a short marker at the position where lines were deleted / 行号槽中为每个新增或修改的行显示彩色小竖条，删除位置显示较短的标记
  - With inline blame annotations on, every marker keeps the same column to the right of the blame text — lines without a label reserve that column too, so markers never slide left / 开启行内 blame 注释时，所有标记保持在注释文字右侧的同一列；无标签的行同样保留该列宽度，标记不会向左滑动
  - Files Git ignores get no markers at all, and neither do folders that are not a repository / 被 Git 忽略的文件不显示任何标记，非 Git 仓库的文件夹同样不显示
- **File and line colors follow your palette** — the six Git status colors (added, modified, deleted, untracked, ignored, conflict) are declared as `jgc.decoration.*` color IDs and can be changed in **Settings** or under `workbench.colorCustomizations`. Both the Explorer file colors and the gutter markers follow the change; the defaults are taken from IDEA's File Status Colors / 六种 Git 状态颜色（新增、修改、删除、未跟踪、已忽略、冲突）以 `jgc.decoration.*` 颜色 ID 声明，可在**设置**中或通过 `workbench.colorCustomizations` 修改，资源管理器文件色与行号槽标记会同步变化；默认取色参照 IDEA 的 File Status Colors

### Fixed / 修复
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
