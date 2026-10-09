# AI Commit Message 生成 — 调研记录与结论

> 状态：**已暂停**，等待后续决策
> 最后更新：2026-10-08
> 调研者：JGC 维护者 + AI 助手

---

## 1. 需求陈述

在 Commit 面板（JetBrains 风格）加一个 ✨ 按钮，一键用 AI 生成 commit message 并自动填入输入框。

**核心诉求（用户明确的三条硬性要求）：**

| # | 要求 | 说明 |
|---|---|---|
| 1 | 不依赖 VS Code 原生 Git | 我们的插件就是用来**替代**原生能力的，不能要求用户开着原生 git |
| 2 | 按用户勾选的文件生成 | 用户改了 10 个文件只提交 3 个，message 就该只描述这 3 个 |
| 3 | 结果进我们自己的输入框 | 劫持输出后填入 JGC 的输入框，原生 git 的 message 输入框不再需要 |

**附加约束：**
- 不做「用户填 API Key / 填模型 URL」这类配置
- 希望复用用户**已安装的 AI 插件**（Qoder、CodeGeeX、Copilot），用谁家就调谁家

---

## 2. 调研环境

```
macOS
VS Code 1.141.0 (commit 已内置 Copilot Chat v0.69.0)
```

**已安装的 AI 扩展：**

| 扩展 ID | 版本 | 位置 |
|---|---|---|
| `alibaba-cloud.tongyi-lingma`（即 Qoder，view id 为 `QoderCN`） | 2.6.10 | `~/.vscode/extensions/` |
| `aminer.codegeex` | 2.27.6 | `~/.vscode/extensions/` |
| `deepgenx.codegenx` | 0.1.8 | `~/.vscode/extensions/` |
| `GitHub.copilot-chat` | 0.69.0 | VS Code 应用包内置 |

**重要：** Copilot 是 VS Code 内置的，**不在** `~/.vscode/extensions/` 里。早期调研时只扫了用户扩展目录，漏掉了它，导致一度误判「本机没有任何可用 AI 通路」。排查任何 VS Code 内置能力时务必同时扫：
- `~/.vscode/extensions/`
- `~/.cursor/extensions/`
- `/Applications/Visual Studio Code.app/Contents/Resources/app/extensions/` ← 内置扩展在这

---

## 3. 各厂商 commit message 能力拆解

### 3.1 命令清单（已逐个核实存在）

| 命令 | 提供方 | 贡献位置 |
|---|---|---|
| `tongyi.command.generateCommitMessage` | `Alibaba-Cloud.tongyi-lingma` | `scm/title` `navigation@-1002` |
| `tongyi.command.abort.generateCommitMessage` | 同上 | 同上 |
| `codegeex.commit.message` | `AMiner.codegeex` | `scm/title` `navigation` |
| `github.copilot.git.generateCommitMessage` | `GitHub.copilot-chat` | `scm/inputBox` |

注：`github.copilot.git.generateCommitMessage` 来自 `github.copilot-chat`，**不是** `github.codespaces`。

VS Code **内置 git 扩展自身不生成** commit message，只有：
- `git.commitMessageAccept`（when:false）
- `git.commitMessageDiscard`（when:false）

它们用于编辑 AI 内联建议，`scm/inputBox` 贡献为 `NONE`。

Copilot 还有 4 个 sessions 相关命令（agent 自动提交，非 message 生成，**待调研**）：
```
github.copilot.cli.sessions.commitToWorktree
github.copilot.cli.sessions.commitToRepository
github.copilot.sessions.commit
github.copilot.sessions.commitAndSync
```

### 3.2 返回值实测

| 命令 | 返回 | 耗时 | 文字去向 |
|---|---|---|---|
| `github.copilot.git.generateCommitMessage` | `undefined` | ~1700-1900ms | VS Code 原生 SCM 输入框 |
| `tongyi.command.generateCommitMessage` | `undefined` | **0ms** | 同上 |

**两个厂商都不返回值。** 命令的职责就是「把文字填进原生输入框」。

Qoder 返回 0ms 的原因：其 `when` 含 `QoderCN.Chat.active`，该 context key 仅在 Qoder 聊天面板打开时为 true，handler 直接 return。**需要先打开 Qoder 面板才真正执行。**

### 3.3 各家内部实现（从 bundle 逆向后还原）

#### Qoder / 通义灵码

调用链：
```
tongyi.command.generateCommitMessage
  → authStatus() 登录校验
  → initGitApi()          → extensions.getAPI("vscode.git")
  → getContextFilesFromGitDiff()
  → getContextFilesFromGitLog()
  → LSP: commitMsg/generate
  → 流式写 inputBox.value
```

请求参数（`CommitMsgParams`）：
```ts
{
  stream: true,
  requestId: UUID,
  codeDiffs: string[],        // 切分后的 diff 数组
  commitMessages: string[],   // git log 最近 3 条完整 message
  preferredLanguage: string   // "简体中文" | "English" | 默认
}
```

diff 策略（值得借鉴的双重上限设计）：
```js
const [indexFiles, diff] = await Promise.all([r.diffIndexWithHEAD(), r.diffWithHEAD()]);
diff.split(/(?=diff --git a\/.+ b\/.+\n)/).filter(Boolean);
// 文件数 ≤ 50，累计字符 ≤ 70000
if (s.length > 50) break;
if (total > 7e4) break;
```

传输：自建 WebSocket + LSP JSON-RPC
- 请求 `commitMsg/generate`
- 流式 `commitMsg/answer`（增量 text）→ `commitMsg/finish`（statusCode：200 成功 / 403 / 408）
- 超时 120 秒

相关设置：
```
QoderCN.PreferredLanguage forCommitMessage   默认/简体中文/English
QoderCN.CommitMessageStyle
```

#### CodeGeeX

调用链：
```
codegeex.commit.message
  → tE(context, true)  取仓库路径
  → Fi(cwd, {staged:true}) || Fi(cwd)   有 staged 就只用 staged
  → ao.queryNonStream(payload)
  → A.inputBox.value = I.data.text
```

请求参数（比 Qoder 干净）：
```ts
{
  prompt: "", code: "",
  commit_message: {
    git_diff: string,        // 整段 diff
    commit_history: string,  // git log --no-merges --pretty="%s" -10
    commit_type: "default" | "auto" | "conventional"
  },
  machineId: env.machineId,
  locale: <界面语言>,
  command: "commit_message_v1"
}
```

**它的 diff 命令本身就支持按文件过滤：**
```js
["diff", staged ? "--cached" : "", file ? `-- ${file}` : ""].filter(Boolean).join(" ")
// → git diff --cached -- <file>
```
> ⚠️ **待验证**：`codegeex.commit.message` 的命令参数 `A` 是否真的只用了 `rootUri`，能否传入自定义 diff。这是唯一可能改变结论的线索。

三种风格（设置 `Codegeex.CommitMessageStyle`）：

| 值 | commit_type |
|---|---|
| `Default` | `default` |
| `Auto` | `auto`（附 10 条 log 让 AI 自判风格） |
| `ConventionalCommits` | `conventional` |

传输：普通 HTTP
```
POST https://api.codegeex.cn:8443{prefix}/code/chatCodeSseV3/chat?stream=false
header: code-token
```
diff 截断上限 1000 行。

#### Copilot

源码在 `microsoft/vscode` 仓库（非打包版）：
`extensions/copilot/src/extension/prompt/vscode-node/gitCommitMessageServiceImpl.ts`

```ts
const resources = repository.state.indexChanges.length > 0
  ? repository.state.indexChanges
  : [...repository.state.workingTreeChanges, ...repository.state.untrackedChanges];
```

参数：`repositoryName, branchName, changes, recentCommitMessages, attemptCount`

**三个值得借鉴的设计：**

1. **近期 message 分两份**—— 仓库最近 5 条 + **用户自己**最近 5 条（`git log --author`）
   ```ts
   const commits = await repository.log({ maxEntries: 5 });
   const userCommits = await repository.log({ maxEntries: 5, author });
   ```
   「仓库风格」和「个人措辞习惯」是两回事，分开喂效果更好。
   > 我们已有 `getRecentCommitMessages` bridge，但只返回一份，可升级为两份。

2. **重试计数带 diff 指纹** —— diff 未变才 +1，变了归零，避免反复点得到同一句话。

3. **存活率追踪** —— 提交时用 4-gram 相似度比对生成内容与实际提交内容（仅 telemetry）。

---

## 4. 关键机制：Git API 在 VS Code 10.0 被拆分了

```
vscode.git-base v10.0.0   ← 真正的实现
vscode.git       v10.0.0   ← UI 层
```

`vscode.git` 的 `exports` 只是 enablement 开关：

```js
// vscode.git/dist/main.js
getAPI() {
  if (!this._gitBaseApi) {
    let e = extensions.getExtension("vscode.git-base").exports;
    t = r => { this._gitBaseApi = r ? e.getAPI(1) : void 0 };
    if (e.onDidChangeEnablement(t), t(e.enabled), !this._gitBaseApi)
      throw new Error("vscode.git-base extension is not enabled.");
  }
  return this._gitBaseApi;
}
```

**正确用法：**
```ts
const api = await vscode.extensions.getExtension("vscode.git").activate();
const gitApi = api.getAPI(1);   // ← 这一步极易遗漏
gitApi.repositories;             // Repository[]
gitApi.openRepository(uri);     // 也在这一层
```

`git.enabled: false` 会让 `getAPI(1)` 直接 throw。

`Repository.inputBox` 有 **getter + setter**：
```js
var Av = class { set value(e){ this.#e.value = e } get value(){ return this.#e.value } }
```
即：**inputBox.value 可读，也可写回。**

---

## 5. 已排除的方案

### 5.1 劫持原生输入框（读取 vendor 命令结果）

**原理：** 订阅 `inputBox.onDidChange`，调 vendor 命令，取走文字填入我们的框，再清空原生框（有 setter，可清）。

**为什么否决：**

| 要求 | 劫持方案 |
|---|---|
| 1. 不依赖原生 Git | ❌ 依赖 `vscode.git-base` 启用 + SCM 面板打开；`git.enabled:false` 直接死 |
| 2. 按勾选文件生成 | ❌ **死结**，见 5.2 |
| 3. 结果进我们的框 | ✅ 可行 |

### 5.2 要求 2 是所有 vendor 封装的死结

Qoder 和 Copilot 的 diff 上下文都**写死在实现里，无参数入口**：

```ts
repository.state.indexChanges.length > 0
  ? repository.state.indexChanges                              // 全部 staged
  : [...repository.state.workingTreeChanges, ...repository.state.untrackedChanges];  // 全部工作区
```

用户勾 3 个文件提交，message 却描述 10 个文件 —— **这是错误的 message，比没有更糟。**

绕过方案（临时改 index）已评估并否决：
```
保存 .git/index → git reset → git add 勾选文件 → 调 vendor → 还原 index
```
- 会让所有 vendor 的面板 UI 短暂出错（CodeGeeX 检查 `A.rootUri`，Qoder 走 LSP）
- 崩溃会留下脏 index
- 为一个便利功能动用户 git 状态，风险收益比不合适

### 5.3 直接封装 vendor 的内部 HTTP/WebSocket

请求格式和提示词组织都能 100% 照抄，但**鉴权过不去**：

| 厂商 | Token 存储 | 可获取性 |
|---|---|---|
| CodeGeeX | `context.secrets`（`secrets.get(c)`） | ❌ |
| Qoder | 登录 token，自建 WS | ❌ |
| Copilot | OAuth，私有服务 | ❌ |

三层封锁：
1. `SecretStorage` 是 **per-extension 隔离**的，无跨扩展接口
2. 两家的 `activate()` **未导出任何 API 对象**（无 `createApiProxy`/`registerApi`）
3. 磁盘上加密存储，绕过等于偷取凭据

且用他人 token 调他人服务违反服务条款；私有协议随时可能变更。

### 5.4 国内厂商不会注册 `vscode.lm`（已全量验证）

| 检查项 | Qoder | CodeGeeX | CodeGenX |
|---|---|---|---|
| `languageModelChatProviders` | ❌ | ❌ | ❌ |
| `languageModelTools` | ❌ | ❌ | ❌ |
| `chatParticipants` | ❌ | ❌ | ❌ |
| `chatViews` | ❌ | ❌ | ❌ |
| `enabledApiProposals` | 0 个 | 0 个 | 0 个 |

VS Code 给第三方 AI 扩展的**全部**接入点，他们一个都没接。完全不接标准，等于自愿放弃被所有第三方扩展调用。

---

## 6. 剩余的三个真实选项

### A. `vscode.lm`（仅 Copilot 可用）

```ts
const models = await vscode.lm.selectChatModels();
// 本机实测返回 7 个：copilot vendor 下 gpt-4o-mini / auto / copilot-utility
// / copilot-utility-small / gpt-5.6-luna / copilot-dictation-cleanup-luna
// / copilotcli:auto
const model = models.find(m => m.id === "auto") ?? models[0];
const res = await model.sendRequest(messages, {}, token);
for await (const frag of res.text) { /* 流式 */ }
```

✅ 满足全部三条技术要求：上下文可控（我们自己拼 diff）、流式、不碰原生输入框
❌ 国内用户基本用不了
❌ `engines.vscode` 须从 `^1.85.0` 提到 `^1.104.0`（`vscode.lm` 在此之前是 proposed API，Marketplace 禁止）

Copilot consent 要求：`selectChatModels` 必须在用户主动操作（命令/按钮）时调用 —— ✨ 按钮天然满足。

### B. 自建后端（用户配一次 base URL）

✅ 上下文可控、流式、不碰原生框
✅ **国内用户真正可用** —— 指向任何 OpenAI 兼容服务，或本地 Ollama（零 key）
❌ 用户需配置一次

### C. 不做，仅提示

在 Commit 面板给提示：「使用 AI 生成 commit message 请安装 GitHub Copilot」。

---

## 7. 上下文构造要点（无论选哪个都要做）

**diff 范围 = `selectedFiles`（复选框勾选），不是全量。** 我们的 store 已有 `selectedFiles: Set<string>`，key 为 `${path}:${staged}`。

三态 diff：
| 文件状态 | 命令 | 语义 |
|---|---|---|
| staged | `git diff --cached -- <file>` | HEAD → index |
| unstaged | `git diff -- <file>` | index → 工作区 |
| untracked | `git diff --no-index /dev/null <file>` | 整文件新增 |

> `gitService.getDiff(ref1, ref2, file?)` 已支持 pathspec，但区分不了 staged/unstaged，需加一个方法。

**「diff 太多」在源头解决**：用户勾 3 个就只有 3 个文件的 diff。剩下的预算问题只有单文件超大，用单文件字节上限 + **明确告知模型哪些被截断**。

**提示词调教要点（按重要性）：**
1. **语言跟随** —— 明确要求「与近期 commit message 使用相同语言」（中文仓库最容易被生成英文）
2. **风格靠推断** —— 喂近期 message 让它模仿，不要硬编码「用 Conventional Commits」
3. **输出契约** —— 单行、≤72 字符、祈使句、无句末句号、纯文本
4. **明确禁止** —— 不要 markdown / 代码围栏 / 「Here is your commit message:」类前言
5. **输出清洗层独立于 prompt** —— LLM 不可靠，必须代码兜底剥离围栏、引号、前言

**UI：** ✨ 按钮放在 `CommitMessageArea.tsx:108` 的 `commit-amend-row`；流式写入让用户看到文字在生成；**只填入不自动提交**；加重试。

---

## 8. 待验证事项（下轮优先做这个）

1. **`codegeex.commit.message` 的命令参数 `A` 到底能传什么？**
   源码里 handler 是 `async generateCommitMessage(A)`，内部只用了 `A.rootUri`。但 `Fi(cwd, {staged, file})` 这个 helper **支持传 file** —— 如果命令参数能一路传下去，或存在其他注入 diff 的入口，方案可能不同。
   **这是唯一可能改变结论的线索。**

2. **用户实际使用的 VS Code 版本分布** —— 量化「升 engine 到 1.104 到底损失多少用户」。

3. **Copilot sessions 的 4 个命令** —— `github.copilot.sessions.commit` 等，可能有可借鉴的 agent 提交流程。

---

## 9. 附：代码现状

已提交的探测代码（**dev-only，不进发布包**）：

```
src/dev/aiProbe.ts     ← 探测工具，ExtensionMode.Development 才注册
```

package.json 中注册的调试命令（发布前需删除）：

```
JGC: Test AI Model Availability        jgc.dev.aiProbe.test
JGC: Test AI Commit Message Generation jgc.dev.aiProbe.generate
JGC: Test Vendor: Qoder                jgc.dev.aiProbe.vendor.tongyi.command.generateCommitMessage
JGC: Test Vendor: Copilot              jgc.dev.aiProbe.vendor.github.copilot.git.generateCommitMessage
JGC: Test Vendor: CodeGeeX             jgc.dev.aiProbe.vendor.codegeex.commit.message
JGC: Test Hijack: Qoder                jgc.dev.aiProbe.hijack.tongyi.command.generateCommitMessage
JGC: Test Hijack: Copilot              jgc.dev.aiProbe.hijack.github.copilot.git.generateCommitMessage
JGC: Test Hijack: CodeGeeX             jgc.dev.aiProbe.hijack.codegeex.commit.message
```

> ⚠️ **发布 1.1.3+ 前必须清理** `src/dev/aiProbe.ts` 及上述 package.json 命令条目。
> （`extensionMode !== Development` 的守卫已确保它们不会在正式环境注册。）

---

## 10. 结论摘要

在当前 VS Code 生态下，「入口自己做、背后委托给用户已装的国内 AI 插件」**技术上无解** —— 不是封装能力问题，而是：

1. 厂商完全封闭，只暴露命令不暴露 API
2. 要求 2（按勾选文件生成）与「vendor 自己算全量 diff」根本冲突
3. 唯一官方委托机制 `vscode.lm` 他们不接

**现实选择是 A（仅 Copilot）或 B（用户配一次 endpoint，能覆盖国内用户）。**

需求已暂停，等待后续决策。