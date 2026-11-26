# 更新日志

[English](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG.md) · **简体中文**

1.0.0 之前的版本已归档到 [CHANGELOG-archive.md](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG-archive.md)。

## [Unreleased]

### 新增

- **Shelf 工具栏** — Shelf 页新增类似 JetBrains Shelf 窗口的工具栏：Unshelve、Restore（保留 shelf）、Create Patch、Copy as Patch to Clipboard、Delete、Import Patches 与 Import Patches from Clipboard。点击 shelf 即可选中，未选中时相关按钮不可用。
- **更新方式** — `jgc.update.method`（`merge`、`rebase` 或 `branchDefault`）决定 Update Project、Pull 与分支更新如何整合上游改动，`jgc.update.saveChangesPolicy`（`stash` 或 `shelve`）决定更新期间如何暂存本地改动。
- **智能切换（Smart Checkout）** — 切换分支、标签、提交或新建分支时，工作区有改动不再直接失败：弹窗提供 Smart（暂存、切换、恢复）、Force（丢弃改动，需二次确认）或取消。会被覆盖的未跟踪文件只给出说明，不提供破坏性选项。
- **Stash 选项** — Stash 页工具栏新增 Stash Changes...（保留暂存区、包含未跟踪文件）、Unstash As...（作为新分支、pop、恢复暂存区）与 Clear All Stashes...。
- **Blame 选项** — `jgc.blame.ignoreWhitespace` 与 `jgc.blame.detectMovements`（`none`、`inner`、`outer`）控制 blame 如何归属每一行。
- **Cherry-pick 选项** — `jgc.cherryPick.emptyStrategy`（`ask`、`skip`、`createEmpty`）处理变为空的提交，`jgc.cherryPick.appendSourceHash` 追加 `-x`，Git Log 工具栏新增开关，用淡色显示已经 cherry-pick 到 HEAD 的提交。空 cherry-pick 之后继续操作现在会提交而不是报错。
- **Fetch 选项** — `jgc.fetch.prune`、`jgc.fetch.tagsMode` 与后台自动 fetch（`jgc.fetch.autoFetch`、`jgc.fetch.autoFetchIntervalMinutes`）。
- **分支扩展操作** — Clean Up Merged Branches...、分支菜单中的 Set / Unset Upstream，以及工作树的 Lock / Unlock（已锁定的工作树显示锁图标且不能删除）。
- **推送被拒绝时就地恢复** — 分支菜单推送、Commit and Push 与 Push All up to Here 在被拒绝时可选择合并、变基或带租约强推，并自动重试一次。Push 面板新增带租约强推与"记住我的选择"。首次推送自动设置上游（`jgc.push.autoSetUpstream`、`jgc.push.rejectedAction`）。
- **受保护分支** — `jgc.protectedBranches`（默认 `main`、`master`，支持 `*` 通配）禁止对这些分支强制推送，删除前需明确确认，并且不会出现在 Clean Up Merged Branches 中。
- **提交选项与检查** — Commit 面板新增齿轮菜单，可切换签署（sign-off）与是否运行 Git 钩子；提交前会对大文件、CRLF 换行、游离 HEAD 或变基进行中、缺失 `user.name` / `user.email` 给出警告，并提供"仍然提交"确认。每项检查都可在设置（`jgc.commit.*`）中关闭。
- **GPG 签名** — "Choose GPG Key..." 选择密钥并启用签名；`jgc.commit.gpgSign`（`auto`、`always`、`never`）可强制或禁用单次提交的签名。
- **仓库命令** — 克隆仓库（带进度与取消，不会交互式询问凭据）、为尚非仓库的工作区创建 Git 仓库、子模块的列出 / 更新 / 同步 / 打开、稀疏检出管理，以及 Unshallow / Deepen。`jgc.clone.recurseSubmodules` 控制克隆时是否递归子模块。

- **Git 日志的信息与路径过滤** — 信息过滤新增区分大小写与正则开关，新增的 Path 过滤可按文件或文件夹筛选。两者都由 git 在完整历史上执行，滚动加载和刷新时保持有效。文本框不再匹配哈希片段，请改用 Go To。
- **转到哈希 / 分支 / 标签** — ⌘⇧L（Ctrl+Shift+L）按哈希、分支或标签定位提交，会按需加载历史，并在过滤条件挡住目标时自动解除。Ctrl+L 聚焦过滤框。
- **交互式变基** — 在任意提交上选择 Interactively Rebase from Here...，可逐个提交选择 pick / reword / edit / squash / fixup / drop、调整顺序，并支持 `--onto`、autosquash、保留空提交、update-refs、rebase-merges。
- **编辑提交信息、Fixup 与 Squash Into** — 位于提交右键菜单。
- **更改列表（Changelists）** — 与 IDEA 的 Changes 视图一样，可在 Commit 面板中把未暂存的改动分到命名列表里。通过列表右键菜单或工具栏的 New Changelist 按钮创建、重命名、删除并设为活动列表；新改动会进入活动列表。可把文件（或整个选区）拖到某个列表上，也可在文件或文件夹菜单中选择 Move to Another Changelist...。Shelve Changelist... 只搁置该列表中的文件。部分提交之后，会提示把未提交的文件移入一个新列表（`jgc.changelists.offerMoveOnPartialCommit`）。Changes 视图新增按 Changelist 分组。列表按工作树存放在 git 目录内，不会写入仓库；Staged 分组、Unversioned Files 与 Merge Conflicts 的行为不变。`jgc.changelists.enabled` 可关闭该功能。

### 优化

- 继续变基时不再弹出编辑器。

### 修复

- 钩子拒绝的推送不再被当作"被拒绝的推送"而提供合并 / 变基。
- Amend 并推送会在改写提交之前先检查是否为受保护分支。

## [1.2.0] - 2026-11-14

### 新增

- **Git Reset 弹窗** — 右键提交选择 Reset Current Branch to Here... 打开弹窗，可在 Soft、Mixed、Hard、Keep 四种模式中选择，每种模式都说明对工作区与暂存区的影响。
- **提交右键菜单新增操作** — Create Patch...（把该提交导出为补丁文件）、Show Repository at Revision（查看该版本的文件清单）、Compare with Local（与该版本对比工作区差异）、Undo Commit...（撤销当前提交，主分支与非 HEAD 提交不可用）、Push All up to Here...（把当前分支推送到该提交）、Go to Child / Parent Commit（在相邻提交间跳转）。
- **Remote 右键菜单** — 在 Remote 区块的 remote 文件夹上右键可执行 Edit Remote... 与 Remove Remote，删除前会要求确认。该行行为与区块标题一致：单击选中，双击展开或折叠。
- **Manage Remotes 弹窗** — 列出所有 remote 的名称与地址，可新增、改名、修改地址与删除，勾选 Fetch Remote 可立即拉取。
- **HEAD 行右键菜单** — 新建分支、与工作区比较、新建工作树、Update、Push、Rename。
- **标签右键菜单** — Checkout、与工作区比较、合并到当前分支、新建工作树、推送到指定 remote、删除；多选时只显示删除。
- **行尾 blame** — 光标所在行的行尾显示 `作者, 时间 * 摘要`，本人提交显示 You，未提交的行不显示。模板、摘要长度与日期格式均可配置。
- **AI 生成提交信息** — Commit 按钮旁的 ✨ 只为已勾选的文件生成提交信息，边生成边写入输入框，可随时编辑或取消。使用 VS Code 已配置的任意语言模型；装有多个时首次会询问一次并记住，✨ 旁的下拉箭头可随时切换。
- **列表多选** — Git Log 的分支、标签与 Commit 面板的文件均支持 Shift+点击范围选择、Cmd/Ctrl+点击逐个切换、Shift+方向键键盘范围选择。
- **新建工作树时复制本地项目配置** — New Worktree 对话框新增可折叠的 setup 区块，默认关闭，包含两个独立选项。
  - **Copy files listed in .worktreeinclude** — 把本地专用文件（env、编辑器设置、证书等）一并复制进新工作树。列表使用 `.gitignore` 语法，展开区块时自动创建，可直接在对话框内编辑，是否提交进仓库由你决定。
  - **Run setup script** — 运行你选择的脚本，把新工作树路径作为参数传入，并在打开项目之前执行。脚本失败不会删除工作树，选择后也可以在原处清空。
- **内置 Git 提示** — 首次启动询问是否关闭 VS Code 内置 Git，避免两套界面并存造成状态栏与装饰重复。仅在当前工作区生效，可随时改回。
- **Changes 视图** — 分支右键菜单新增 Show Diff with Working Tree：列出该分支与工作区之间的全部差异，含未跟踪文件，默认按 Module 与 Directory 两级分组（可在眼睛按钮里分别关闭），并提供 Expand All / Collapse All。双击文件打开与分支的 diff，之后单击其它文件即覆盖这个标签页 —— 无论看多少个文件，编辑器里始终只有一个 diff 标签。关闭面板用工具栏上的 ✕，关闭编辑器标签不会连带关闭它。

### 优化

- **右键菜单样式统一** — 应用内所有右键菜单的样式与行为一致：自动避让视口边缘，点击外部、Esc、滚动、窗口失焦均关闭，图标与快捷键对齐。纯文字菜单不再留出空图标位。
- **菜单快捷键生效** — 菜单中标注的快捷键已绑定为真实 VS Code 快捷键，并按平台显示（macOS `⌘D`、`⌥⌘A`；Windows/Linux `Ctrl + D`、`Alt + Ctrl + A`），仅在 Commit 面板获得焦点时触发。
- **标签推送可选择 remote** — 不再固定推送到 origin，改为从已配置的 remote 中选择。
- **New Worktree 分支列表加入图标** — 分支、远程分支与标签改用 Git Log 分支树同一套图形：当前检出的分支为实心标签，标签为虚线标签，其余为分支图标。原先的 `(current)`、`remote`、`tag` 文字随之去掉。
- **已检出分支会被标出** — 下拉项与输入框以浅灰文字显示该分支已在哪个工作树中检出，字段下方给出一句说明。这只是提示，不影响创建。
- **Commit 面板与 Git Control 面板互不干涉** — 点击 Commit 图标不再显示或聚焦 Git Control 面板，折叠 Commit 也不再关闭它；你关掉的面板会保持关闭，面板里打开的弹窗也不会被顺手关掉。
- **状态栏品牌标记** — 分支指示器右侧新增一个独立图标，点击显示或隐藏 Git Control 面板；分支本身仍打开 Git 操作菜单。再次打开时面板恢复成上次的样子 —— 上次停在 Worktrees 就仍是 Worktrees，不会被强行切回 Git Log。状态栏 item 不支持图片，故使用与扩展图标同字形的 codicon。
- **面板内的弹窗独占面板** — 打开 New Worktree 时隐藏 Git Log 视图，打开 Create Branch 时隐藏 Worktrees 视图，表单不再被压缩到面板的一部分；关闭后让出的视图复原。两个表单都可在任意空白处拖动，且始终不会移出面板范围；滚动分支列表时也不会再带动背后的弹窗滚动。
- **Show Tags 真实生效** — 侧栏齿轮菜单的 Show Tags 现在真正控制 Tags 区块的显示与隐藏。
- **HEAD 行更名** — 侧栏的 HEAD 入口显示为 `HEAD (Current Branch)`。
- **简化 blame 配置** — 移除 `jgc.blame.displayMode` 与 `jgc.blame.aroundLines`，行号列 blame 固定全文件显示，只有行尾 blame 跟随光标。
- **移除冗余设置** — 移除 `jgc.shortcut.jumpToSourceLabel`，Jump to Source 的快捷键标签固定显示默认绑定。
- **精简命令面板** — 移除 7 条开发调试命令，不再出现在命令面板中。
- **更新日志按语言拆分** — 更新日志拆为英文与简体中文两份，1.0.0 之前的历史单独归档，每个版本更易快速浏览，两份也更容易保持一致。

### 修复

- **Remote 区块多出假分支** — 每个 remote 下方会多出一个与 remote 同名的分支，现已移除，只显示真实存在的远程分支。
- **面板空白处弹出原生菜单** — Commit、Git Log 与 Worktree 面板的空白处右键不再弹出 webview 原生菜单，输入框保留复制粘贴。
- **操作失败无提示** — 菜单与面板发起的 Git 操作失败后会给出带 Git 原始错误信息的提示，不再静默失败。
- 修复 Git Log 表头遮挡右键菜单的问题：面板高度较窄时，在最上面的提交上右键，Message / Author / Date / Hash 表头会透到菜单上，表头的列宽拖拽手柄也仍然响应光标。
- 修复 Changes 视图切换文件时闪出两个 diff 标签，以及关闭全部编辑器后侧边栏被折叠、无任何选中项的问题：文件 diff 改为预览标签，单击即可原位替换上一张；关闭全部编辑器后视图会自动恢复选中。

## [1.1.3] - 2026-10-25

### 新增

- **变更悬停卡片** — 悬停行号槽的变更标记或任意变更行，会显示该改动块的卡片：修改行按词高亮变化部分，删除块显示其在 HEAD 中的内容，并提供 Prev Change、Next Change、Rollback Lines、Show Diff for Lines、Copy、Commit this change 六个操作。
  - Manage Selection... 把同一张卡片浮动到光标所在改动块上方，保持显示直到执行操作。
  - Commit this change 只提交这一个块，文件其余部分的暂存状态原样保留。
- **资源管理器按 Git 状态着色** — 文件名按新增、修改、删除、未跟踪、已忽略、冲突着色，关闭内置 Git 后依然保留。
- **行号槽变更标记** — 每个新增或修改的行右侧显示彩色竖条，删除位置显示短标记；被忽略的文件与非 Git 仓库不显示标记。
  - 开启行内 blame 时标记保持在同一列，无标签的行也预留该列宽度。
- **装饰可分层关闭** — JGC Decorations › Enabled、File Colors、Gutter Markers 可分别关闭资源管理器着色与行号槽标记，某层可退回使用内置 Git 的装饰。
- **状态颜色可自定义** — 六种 Git 状态颜色以 `jgc.decoration.*` 颜色 ID 暴露，可在设置或 `workbench.colorCustomizations` 中修改，默认取色参照 IDEA。
- **状态栏显示当前分支** — 状态栏显示当前仓库的分支与待推拉提交数，替代内置 Git 的状态栏项，点击可打开常用操作菜单。
  - 多根工作区跟随当前编辑器所在文件夹，各处 Git 变化都会刷新。detached HEAD 会明确提示，检出远程分支前先给出警告。
- **编辑器右键菜单收敛为单个 Git 子菜单** — Show File History 移入其中，行号右键菜单新增 Manage Selection... 入口。

### 优化

- **Jump to Source 保留选区** — 在 diff 编辑器中跳转后，选中的文本与滚动位置都保持不变，不再收缩成一个光标点。
- **大文件 blame 更快** — 逐行标签查找改为预建的行号映射，取代线性重扫。

### 修复

- **diff 编辑器两列各自控制 blame** — 行号菜单只有一个 Toggle Git Blame Annotations 入口，只作用于菜单所在的编辑器，两列与 diff 的两侧互不影响。
  - 虚拟侧按其显示的版本执行 blame，没有 Git 版本的侧会明确提示而不是无响应。
- **Commit 角标立即显示** — 待提交数角标在窗口加载后即出现，不再需要先点一次 Commit 图标。
- **提交遵守勾选** — 已暂存但未勾选的文件不再被一并提交。
- **保存文件不再重置 Git Log** — 单纯保存文件不再清空选中的提交与折叠状态，也不再滚回列表顶部。
- **Compare with Current 显示真实差异** — 分支侧边栏的该操作改为展示所选分支相对当前分支的 merge-base 差异，不再打开两个空文档。
- **Worktree 刷新恢复正常** — 刷新命令不再循环调用自身。
- **回滚保留本地新文件** — 已暂存新增且又有未暂存修改的文件不再被误删，改为仅移出暂存区。
- **Drop Commit 不再假超时** — 操作超过 30 秒不再报超时，进度指示会等到 rebase 真正结束。
- **Rollback Lines 不牵连其他修改** — 只回滚该块，同文件其他未保存的修改不会被一并写盘。
- **IDEA Shelf 正确还原转义文本** — 文件内容里的字面 `\n` 不再被解码成换行。
- **恢复 Shelf 不再多出空行** — 含未跟踪文件时还原的文件末尾不再追加空行，空文件也能正常生成补丁。
- **带斜杠的本地分支不再误判为远程** — 分支归属改为按实际配置的 remote 判断。
- **Continue 只暂存冲突文件** — cherry-pick、rebase、merge 的 Continue 不再把其他已修改文件一起暂存。
- **单块提交保留可执行权限** — 不再固定写入 100644，文件权限从 HEAD 继承。
- **Amend 不覆盖已输入的信息** — 勾选 Amend 时只有输入框为空才填入上一次的提交信息。
- **提交文件列表不再错位** — 快速切换选中提交不会再显示上一个提交的文件列表。
- **已删除文件可以打开 diff** — 删除条目按「删除前内容 → 空」展示，不再报文件找不到，且 HEAD ↔ Staged 的标题与内容一致。由 @dunlingzi 在 #8 中修复，#7 报告。
- **行号槽标记按改动块判定** — 在改动上方插入新行后，整片修改行不再被误判为新增。
  - 两个改动块仅隔一个空行、且任一侧超过 5 行时合并为一个修改块，与 VS Code 原生 quick diff 一致。
- **标题不再全大写** — Commit、Push、Git Log 面板的分组标题、分节标题与文件计数恢复为正常大小写。
- **中文等非 ASCII 文件名** — 不再显示为八进制转义串，所有 Git 操作恢复正常，含空格、双引号或箭头的文件名同样处理。由 @dunlingzi 在 #3 中报告，#4 修复。
- **IDEA Shelf 文件列表不再遗漏** — 路径曾被 Git 加引号的文件不会在恢复时丢失。

## [1.1.2] - 2026-10-08

### 新增

- **三击跳转源码** — Commit 面板文件列表单击选中、双击打开 diff、三击打开文件。
- **Shift 连续选择** — Commit 面板支持按住 Shift 选择连续多个文件。
- **跳转源码快捷键** — F4，macOS 另支持 Cmd+↓，Windows/Linux 支持 Ctrl+↓。在 Commit 面板、Git Log 的 Changed Files 与 diff 编辑器内均可用，可在键盘快捷方式中重新绑定。
- **Commit 角标** — 侧栏 Commit 图标显示待处理文件数量，与内置源代码管理视图一致。
- **新增设置** — `jgc.shortcut.jumpToSourceLabel` 控制右键菜单中 Jump to Source 旁的文案，留空则隐藏。

### 优化

- **安装包缩小 33%** — 从 3.69 MB 降到 2.48 MB，不再打包误混入的编辑器与 IDE 工作文件，并移除两张未引用的图片。

### 修复

- **Changed Files 标题全大写** — 恢复为正常大小写。
- **双击选中文件名文字** — 双击 Changed Files 中的文件不再把文件名选成文字。
- **新文件不立即出现** — 新建、重命名或删除未跟踪文件后，Commit 面板立即刷新。
- **按 Shift 出现多余边框** — Commit 文件列表周围的边框已移除。
- **选中残留已删除文件** — 刷新后不再保留指向已不存在文件的选择。

## [1.1.1] - 2026-09-12

### 新增

- **按提交哈希搜索** — 在搜索栏中直接输入 commit hash 查找提交。

### 修复

- **Commit 面板文字可被选中** — 文件列表不再响应鼠标文字选择。
- **工作树表头全大写** — 恢复为正常大小写。

## [1.1.0] - 2026-08-29

### 新增

- **Git Worktree 面板** — 侧边栏管理 Git 工作树，列表展示分支与路径，主工作树受保护不可删除。
  - 新建工作树对话框：可搜索的分支与标签下拉（本地分支、`origin/*`、标签）、输入过滤、自动填充项目名、分支名实时重名校验。
  - 打开项目时可选择取消、在当前窗口或新窗口打开，默认行为由 `jgc.worktree.openBehavior` 决定。
  - 提供 Prune 清理按钮与侧栏折叠展开，路径默认取仓库根目录并按仓库记忆上次选择。

## [1.0.0] - 2026-08-28

### 新增

- **行内 Git Blame 注释** — 为每一行显示 WebStorm 风格的行内 blame，点击可跳到 Git Log 提交图并定位该提交。
  - 行号右键菜单提供 Annotate with Git Blame 与 Close Annotations 互斥切换。
  - 注释视图可多选 Revision、Date、Author、Commit Number 列，颜色可按作者、按提交新旧或隐藏，作者名可选缩写、姓、名、全名或邮箱，至少保留一列。
  - 按提交新旧渐变着色，可用 `jgc.blame.colorMode` 调整；日期格式由 `jgc.blame.dateFormat` 控制，默认不显示 hash。

### 优化

- **插件更名** — 更名为 JetBrains Git（短标识 JGC），扩展 ID 由 `idea-like-git-graph` 改为 `jetbrains-git-control`。

### 修复

- **Git Log 面板文字可被选中** — 文件列表不再响应鼠标文字选择。
