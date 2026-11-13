# 更新日志

[English](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG.md) · **简体中文**

1.0.0 之前的版本已归档到 [CHANGELOG-archive.md](https://github.com/witt-bit/jetbrains-version-control/blob/main/CHANGELOG-archive.md)。

## [Unreleased]

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
- **内置 Git 提示** — 首次启动询问是否关闭 VS Code 内置 Git，避免两套界面并存造成状态栏与装饰重复。仅在当前工作区生效，可随时改回。
- **Changes 视图** — 分支右键菜单新增 Show Diff with Working Tree：列出该分支与工作区之间的全部差异，含未跟踪文件，默认按 Module 与 Directory 两级分组（可在眼睛按钮里分别关闭），并提供 Expand All / Collapse All。双击文件打开与分支的 diff，之后单击其它文件即覆盖这个标签页 —— 无论看多少个文件，编辑器里始终只有一个 diff 标签。关闭面板用工具栏上的 ✕，关闭编辑器标签不会连带关闭它。

### 优化

- **右键菜单样式统一** — 应用内所有右键菜单的样式与行为一致：自动避让视口边缘，点击外部、Esc、滚动、窗口失焦均关闭，图标与快捷键对齐。纯文字菜单不再留出空图标位。
- **菜单快捷键生效** — 菜单中标注的快捷键已绑定为真实 VS Code 快捷键，并按平台显示（macOS `⌘D`、`⌥⌘A`；Windows/Linux `Ctrl + D`、`Alt + Ctrl + A`），仅在 Commit 面板获得焦点时触发。
- **标签推送可选择 remote** — 不再固定推送到 origin，改为从已配置的 remote 中选择。
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

- **插件更名** — 更名为 JetBrains Git Control（短标识 JGC），扩展 ID 由 `idea-like-git-graph` 改为 `jetbrains-git-control`。

### 修复

- **Git Log 面板文字可被选中** — 文件列表不再响应鼠标文字选择。
