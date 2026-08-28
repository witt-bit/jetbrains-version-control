<a name="readme-top"></a>

<div align="center">

<img src="images/icon.png" width="128" />

# JetBrains Git Control

**最完整的 IntelliJ IDEA / JetBrains Git 体验，适用于 VS Code 和 Cursor**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.85.0%2B-blue)](https://code.visualstudio.com/)
[![Version](https://img.shields.io/badge/Version-1.0.0-green)](./package.json)

</div>

---

## ✨ 功能特性

### 📝 内联 Git Blame 注解

在编辑器中直接显示每一行的 Git 提交信息，像 IntelliJ IDEA 一样。

- **多种显示模式**：全文件 / 仅光标行 / 光标前后 N 行
- **可配置列**：revision、date、author、commitNumber（按需选择）
- **多种命名风格**：缩写、姓氏、名字、全名、邮箱
- **年龄着色**：按提交新旧程度渐变着色（新→蓝、中→绿、旧→灰）
- **左对齐**：未注解行也向右对齐，保持代码整洁

### 🔀 Git Graph 可视化

![Git Graph](images/git-graph.png)

- **分支树**：按本地/远程/标签组织分支，支持搜索过滤
- **提交列表**：彩色分支线，可调整列宽（Message、Author、Date、Hash）
- **详情面板**：提交信息和变更文件树
- **过滤器**：按分支、用户、日期范围过滤

### 🔀 三路合并编辑器

![3-Way Merge Editor](images/three-way-merge.png)

- 三栏布局：Theirs | Result | Yours
- 冲突高亮，每个冲突块有操作按钮
- 完整的语法高亮

### 📋 冲突管理

![Conflict List](images/conflicts-list.png)

- 快速操作：Accept Yours / Accept Theirs / Merge
- 与 VS Code 源代码管理面板集成

---

## 🖱️ 右键菜单

### 分支右键菜单

- Checkout（检出）
- New Branch from...（从...创建新分支）
- Checkout and Rebase onto current（检出并变基到当前）
- Rebase current onto branch（将当前变基到分支）
- Merge into current（合并到当前）
- Rename（重命名，仅本地）
- Delete（删除，支持强制删除）
- Update（拉取）
- Push（推送）

### 提交右键菜单

- Copy Revision Number（复制提交哈希）
- Cherry-Pick（拣选）
- Checkout Revision（检出此提交）
- Reset Current Branch to Here（重置当前分支，支持 Mixed/Soft/Hard）
- Revert Commit（还原提交）
- New Branch...（新分支）
- New Tag...（新标签）

### 变更文件右键菜单

- Show Diff（显示差异）
- Edit Source（编辑源文件）
- Open Repository Version（打开仓库版本）
- Revert Selected Changes（还原选中变更）
- Cherry-Pick Selected Changes（拣选选中变更）
- Copy Path（复制路径）
- Copy File Name（复制文件名）

---

## 📦 安装

### 从 Marketplace 安装

在 VS Code 扩展市场搜索 **"JetBrains Git Control"** 或 **"JGC"**。

### 从 .vsix 安装

1. 从 [Releases](https://github.com/witt-bit/jetbrains-version-control/releases) 下载最新的 `.vsix` 文件
2. `Cmd+Shift+P` → "Extensions: Install from VSIX..."

---

## ⚙️ 配置

在 VS Code 设置中搜索 `JGC`：

| 配置项 | 说明 | 默认值 |
|--------|------|--------|
| `jgc.blame.enabled` | 启用内联 blame 注解 | `true` |
| `jgc.blame.columns` | 显示的列 | `["revision", "author", "date"]` |
| `jgc.blame.colorMode` | 着色模式 | `order` |
| `jgc.blame.nameStyle` | 名称显示风格 | `lastName` |
| `jgc.blame.displayMode` | 显示范围 | `full` |
| `jgc.blame.aroundLines` | 上下文行数（around 模式） | `5` |
| `jgc.blame.dateFormat` | 日期格式 | `yyyy-MM-dd HH:mm` |

---

## 🔧 本地开发

```bash
git clone https://github.com/witt-bit/jetbrains-version-control.git
cd jetbrains-version-control
pnpm install
cd webview && pnpm install && cd ..
```

按 **F5** 启动扩展开发宿主。

```bash
pnpm run watch          # 监听模式
pnpm run build          # 生产构建
pnpm run vsce:package   # 打包为 .vsix
```

---

## 📋 系统要求

- VS Code 1.85.0+
- Git 已安装并在 PATH 中

---

## 🙏 致谢

- 原始项目：[aotemj/jetbrains-git-graph](https://github.com/aotemj/jetbrains-git-graph)
- Fork 来源：[zhyc9de/jet-git](https://github.com/zhyc9de/jet-git)
- 图标：[IntelliJ IDEA Icons](https://intellij-icons.jetbrains.design/) (Apache 2.0)

---

## 📄 许可证

[MIT](./LICENSE)

---

<div align="center">

**如果觉得有用，请给个 ⭐ Star 支持一下！**

</div>
