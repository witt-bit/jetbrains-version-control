# JetBrains Git Control (JGC) — i18n 国际化开发计划

> 分支:`feat/i18n`(基于 main 的全新 worktree)
> 撰写时间:2026-08-28
> 状态:进行中(Phase A 核心 + Phase B 试点已跑通)

## 执行进度(2026-08-28) — Phase A~C + D.2 完成 ✅

> **前端(webview)国际化完整落地**:29 个组件接入 `t()/tpl()`,en/zh-cn 各 235 个 key,build + biome 全绿。
> **D.2 contributes 本地化完成并提交**:`package.json` 22 处 title/name/category 模板化为 `%contrib.*%`,`scripts/sync-nls.mjs` 从 `webview/src/l10n/*.json` 派生 `package.nls.json` / `package.nls.zh-cn.json`(单一语言源)。VS Code 的图表活动栏、命令面板标题、视图名、配置标题全部随语言切换。

**已提交:**
- `302e4c4` feat(i18n): localize webview frontend (en/zh-cn)…(Phase A~C)
- 后续一提交:D.2 contributes 本地化 + sync-nls.mjs

**待办(建议新开窗口做,风险更低):**
- **D.1(原 A5 未做)**:打开 `"l10n": "./l10n"` + 建 `l10n/bundle.l10n.json` 模板。
- **D.3**:扩展进程 ~30 处 `show{Info,Error,Warning}Message`(含 `${}` 模板与按钮文案)+ `gitService` 错误 → `vscode.l10n.t()`。**建议在独立会话完成**,因其格式特定、调用点含插值与按钮参数,半途切换易留下坏通知。
- **E**:README/CHANGELOG、`package.nls.*` 提交校验、冒烟(F5 中英文)。

| Phase | 内容 | 状态 |
|---|---|---|
| A1 | `webview/src/l10n/en.json` + 首批 push key | ✅ |
| A2 | `webview/src/shared/i18n/`(bundle / t / tpl / index) | ✅ |
| A3 | `html.ts` 注入 `data-locale`(jgc.locale 覆盖 > env.language);`extension.ts` 无需改动(集中注入) | ✅ |
| A4 | `main.tsx` 挂载 `setLocale`;vite `import.meta.glob` 自动收集语言 | ✅ |
| B1 | `push/App.tsx` 全部字符串替换为 `t()/tpl()`,含插值 + 复数 | ✅ |
| B2 | `compile`(扩展)+ `build:web`(webview)+ `biome check` 均绿 | ✅ |
| A5 | `scripts/sync-nls.mjs` + package.json `"l10n"` + contributes `%key%` 模板化 | ⏭ 延至 Phase D(需改 27 处 contributes title) |
| D1/2 | 扩展通知 + gitService 错误 → `vscode.l10n.t()` | ⏭ Phase D |
| C1 | `shared/components`(CommitInfo 的 `on {date}`) | ✅ |
| C2 | `panel` 全部(Toolbar / CommitContextMenu / BranchTree / BranchSidebar / CommitList / DetailPanel等) | ✅ |
| C3 | `commit` 全部(CommitMessageArea / CommitTab / Toolbar / Shelf·IdeaShelf 菜单与 Tab) | ✅ |
| C4 | `conflicts` 全部(App / MergeStandaloneApp / MergeContainer / MergeGutter) | ✅ |
| C5 | `rollback`(App)| ✅ |
| 验证 | full `pnpm run build` + `biome` + key 完整性扫描(en=zh=235,全部 key 已定义、无缺失、无重复、无未使用) | ✅ |

**重要技术取舍(相对初版方案调整):** 翻译源文件实际落在 **`webview/src/l10n/*.json`**(非仓库根 `l10n/`),理由:
- vite root = `webview/`,`import.meta.glob` 需要**仓库根内稳定相对路径**;放 webview/src 下可同包收集,**无跨 root 边界、无 copy 步骤**。
- 扩展端补齐时,由 `scripts/sync-nls.mjs` **从 `webview/src/l10n/*.json` 派生** `package.nls.<locale>.json` 与 `l10n/bundle.l10n.<locale>.json`,仍是"一语言一源文件"。

**待办(后续 Phase):** C(铺开前端)→ D(扩展 l10n + sync 脚本)+ E(全量 zh-cn 已就绪、README/CHANGELOG、冒烟)。详见 §5。

---

## 1. 现状调研(结论先行)

对整个代码库做了字符串面排查,关键事实如下:

| 项 | 结论 |
|---|---|
| **内置语言** | UI 字符串 **全部为硬编码英文**;CJK 只出现在**代码注释**里(`webview/src/shared/types/git.ts`、`webview/src/shared/theme/variables.css`),不是用户可见文本 |
| **已有 i18n 框架** | **无**。无 `vscode.l10n`、无 `i18next`、无 `react-intl` |
| **字符串分布的 4 个面** | ① `package.json` contributes(27 个 title/description)② `src/extension.ts`(30 处消息)③ `src/git/gitService.ts`(错误文案)④ `webview` 前端(62 文件 / 16.7k 行,JSX 文本 + title 属性 + 插值模板串,如 `Pushed {count} commits to {remote}/{branch}`) |
| **Webview 注入机制** | `src/views/html.ts` 用通用 `data-*` 注入状态 → `webview/src/main.tsx` 读 `root.dataset.mode` 选 App(**这是理想的 locale 注入点**) |
| **构建栈** | pnpm + esbuild(扩展) + vite(webview)+ biome;webview 已有 `~icons/`(unplugin-icons) |

**核心矛盾**:Webview 运行在浏览器里,受 **CSP 限制、无 Node API**,**不能直接调用 `vscode.l10n`**。因此 90% 的工作量在前端,需要一个自定义的轻量 i18n,并在 webview 创建时把当前语言注入进去。

---

## 2. 目标

1. 全部 4 个语言面可被翻译,且**同一语言扩展端与 Webview 严格同源**,不出现"菜单英文、面板中文"撕裂。
2. **新增一种语言 = 只维护 1 个翻译文件**,其余由构建自动派生。
3. **自动跟随 VS Code 显示语言**,改语言后 Reload Window 即整体生效。
4. 不引入重依赖,保持项目"自研、少依赖"的既有风格。
5. 兼容现有构建链(`pnpm run compile` / `build:web`),`biome check` 通过。

---

## 3. 架构总览:一语言一源文件

核心决策:**一个语言一个 JSON 源文件,扩展端与 Webview 共享同一份字典**,避免碎片化。

```
jetbrains-version-control.feat-i18n/
├── l10n/                          ← 唯一翻译源,每个语言一个文件
│   ├── en.json                      push.rejectedTitle = "Push Rejected" ...
│   ├── zh-cn.json
│   └── ja.json
├── scripts/
│   └── sync-nls.mjs               ← 构建时从 l10n/*.json 派生 package.nls.<locale>.json
├── package.json                   ← 开启 "l10n": "./l10n"
└── webview/src/shared/i18n/
    ├── store.ts                     Zustand: { locale, messages } + initI18n(locale)
    ├── t.ts                          导出 t(key, params?) 轻量插值;plural(n, forms)
    ├── languages.ts                  语言枚举 + 展示名(供扩展下拉/覆盖配置)
    └── bundle.ts                     import.meta.glob(l10n/*.json, eager) 打包进 webview
```

### 3.1 语言解析链(自动跟随)

```
用户改 VS Code Display Language (locale.json)
        │  (改语言后需 Reload Window 才生效 — 无运行时变更事件,这是正常且最佳的做法)
        ▼
vscode.env.language        ──(扩展进程权威来源,"en" | "zh-cn" | "ja"...)
        │
        ├──▶ contributes     VS Code 自动加载 package.nls.<locale>.json        ✅ 自动
        ├──▶ 扩展消息         vscode.l10n.t() 自动解析 bundle.l10n.<locale>.json ✅ 自动
        │
        └──▶ Webview 面板     <cmd: html.ts> data-locale="${语言}"  → 建 view 时注入
                              <view: main.tsx> initI18n(root.dataset.locale)     ✅ 每次打开自动
```

---

## 4. 四个语言面的具体方案

### 4.1 `package.json` contributes(27 key)

- 开启 `"l10n": "./l10n"`。
- 新增 `package.nls.json`(英文模板)+ 每个语言 `package.nls.<locale>.json`。
- **这些文件由 `scripts/sync-nls.mjs` 从 `l10n/<locale>.json` 自动生成**(挑 `contrib.*` 前缀的 key),避免手动维护第三处。生成物**提交进 git**(VS Code 构建时不跑我们脚本)。
- *为什么不直接手写 package.nls*:contributes 的 key 和前端 key 属于同一句文案,双写必漂移。生成是唯一保证同源的办法。

### 4.2 扩展进程消息(`extension.ts` + `gitService.ts`)

- 打开 `"l10n": "./l10n"` 后,`vscode.l10n.t("key", { param })` 可用。
- 把 `showInformationMessage/showErrorMessage` 及抛给用户的错误文案改为 `vscode.l10n.t()`。
- `bundle.l10n.json`(模板)由 `sync-nls.mjs` 从 `l10n/<locale>.json` 归一化生成(格式对齐 VS Code 的 `[key, message, {params}]` 三元素组)。
- **库函数内部** `gitService.ts` 抛错处传**翻译 key + 参数**,由**最外层 controller** 统一 `vscode.l10n.t()` 渲染为文案。避免 gitService 依赖 vscode.l10n(保持纯逻辑层可测)。

### 4.3 Webview 前端(工作量主体)

- `webview/src/shared/i18n/bundle.ts:` `import.meta.glob("../../../../l10n/*.json", { eager: true })` 把**所有语言**打进 webview bundle(体积小),运行时按 locale 选,`en` 兜底。
- `store.ts`/`t.ts`:
  - `initI18n(locale)` 由 `main.tsx` 在挂载前调用。
  - `t("push.rejectedTitle")`、`t("push.pushed", { count, remote, branch })`。
  - `tpl("push.pushedFiles", n)` 复数简化:key 拆成 `..._one` / `..._other`,或用 `plural(n, [零, 单, 多])`,按本项目实际需要选一种,避免引 ICU。
- 组件替换:逐文件把硬编码串改为 `t()`。含插值(`Pushed {n} commits`)与复数。
- **注入接线(已确认零改动)**:
  - `src/views/html.ts`:`dataAttrs.push(\`data-locale="${escapeHtml(locale)}"\`)`。
  - `src/extension.ts activate()`:`const locale = vscode.env.language;` 传入各 webview options。
  - `webview/src/main.tsx`:`const locale = root.dataset.locale ?? "en"; initI18n(locale);`。

---

## 5. 工作项 / 任务拆解(建议顺序)

### Phase A — 基础设施(骨架)
- [ ] A1. 建 `l10n/en.json`(从 webview + 扩展现有字符串抽 key,扁平命名空间如 `push.rejectedTitle`)
- [ ] A2. 建 `webview/src/shared/i18n/`(store / t / bundle / languages)
- [ ] A3. `html.ts` 注入 `data-locale` + `extension.ts activate()` 取 `vscode.env.language`
- [ ] A4. `main.tsx` 挂载 `initI18n`;`tsconfig` + `vite-env` 处理 `import.meta.glob` 类型
- [ ] A5. `scripts/sync-nls.mjs` + package.json 开 `"l10n": "./l10n"` + `package.nls.json` 生成
- [ ] A6. 跑通 `pnpm run compile` + `build:web`,验证注入不破坏 CSP

### Phase B — 试点面板(push,最小闭环)
- [ ] B1. 用 `push/App.tsx` 做试点,完整替换全部字符串为 `t()`,演示插值 + 复数 + 兜底
- [ ] B2. 手动验证:英文 / 临时改 locale 看中文渲染

### Phase C — 铺开前端
- [ ] C1. `shared/components`(Tooltip、CommitInfo、FileTree 等共用件)→ 最优先,因为被各面板复用
- [ ] C2. `panel`(Git Log 主面板,最大)
- [ ] C3. `commit`(提交面板)
- [ ] C4. `conflicts`(冲突 + 3-way Merge)
- [ ] C5. `rollback`
- [ ] C6. `push` 收尾(若 Phase B 已做,则是复查)

### Phase D — 扩展进程文案
- [ ] D1. `extension.ts` 30 处通知改 `vscode.l10n.t()`
- [ ] D2. `gitService.ts` 错误改 key + 最外层渲染

### Phase E — 收尾
- [ ] E1. 新增 `zh-cn.json` 全量翻译(中文兜底核验)
- [ ] E2. `languages.ts` 注册展示名;可选配置 `jvc.locale`(空=跟随 VS Code,否则强制覆盖)
- [ ] E3. README 双语补 i18n 说明;CHANGELOG `[Unreleased]` 记录
- [ ] E4. 全量 `pnpm run compile` + `build` + `biome check` 通过
- [ ] E5. 冒烟:英文 / 中文各过一遍主流程(Git Log、Commit、Push、Rollback、Merge)

---

## 6. 扩展一门新语言(最终用户体验)

> **加语言 = 3 步,第 2 步可选。**

1. 复制 `l10n/en.json` → `l10n/fr.json`,翻译。(**唯一必须**)
2. *(可选)* `languages.ts` 加一行 `fr: "Français"`,作为切换项。
3. `node scripts/sync-nls.mjs` 自动生成 `package.nls.fr.json` → 构建即生效。

之后全自动:
- **contributes**:VS Code 读 `package.nls.fr.json` → 命令/菜单自动法语。
- **扩展消息**:`vscode.l10n` 自动切。
- **Webview**:`import.meta.glob` 将 `fr.json` 打进包,`data-locale="fr"` 即用;缺 key 自动回落 `en`。

---

## 7. 关键决策与理由(评审请重点看这里)

| 决策 | 选项 | 选择 | 理由 |
|---|---|---|---|
| Webview 词典加载 | 运行时 fetch / **构建期打包** | **import.meta.glob 打包** | CSP 禁外联;无需改桥协议、无异步空窗;新语言加 JSON 自动进包 |
| 单一翻译源 | 每语言 1 文件 / 多处 | **每语言 1 文件 `l10n/<locale>.json`** | contributes+扩展+webview 三到四处同源,派生生成 `package.nls`+`bundle.l10n` |
| Webview 框架 | react-intl / **自研 `t()`** | **自研轻量 t()** | 保持项目"自研、少依赖";只做 `{param}` 插值 + 简化复数 |
| 运行时切语言 | 监听事件 / **Reload Window** | **Reload Window** | VS Code 无语言变更事件;Reload 是最稳、零代理做法 |
| 兜底 | abort / **en 回落 + 输出 key** | **en 回落 + 输出 key** | 缺 key 不白屏、不断裂,便于排查 |
| locale 来源 | 仅 `vscode.env.language` / **+可选配置覆盖** | **默认跟随,可选 `jvc.locale`** | 默认零配置自动跟随;覆盖留给调试/特需 |

---

## 8. 风险与注意事项

1. **Pluralization(复数)**:英文 `1 file / N files`,中文无复数形态。用"key 拆分 + 简化复数函数",**不引 ICU MessageFormat**,保持体积与心智小。
2. **上拉插值/跨度**:模板串里有 `Pushed {n} commits to {a}/{b}` 这类,统一 `{param}` 语法,严禁字符串拼接进翻译。
3. **`dist` 与 `l10n` 打包**:确认 `.vscodeignore` 会把 `l10n/`、`package.nls.*.json`、`bundle.l10n.*.json` 打进 vsix(这些必须在发布包内)。
4. **`import.meta.glob` 相对路径**:webview/src 到仓库根 `l10n/` 的路径要正确(`../../../…`),vite 需把 `l10n` 纳入其文件观察/内容安全。若不想跨层引用,可让构建脚本把 `l10n/*.json` 拷入 `webview/src/l10n/`(一次 copy),前端永远用稳定相对路径。
5. **生成物提交进 git**:`package.nls.*.json`、`bundle.l10n.*.json` 由脚本生成但**提交**,因为 vsce 构建不执行我们的脚本。
6. **key 命名纪律**:全部扁平 `namespace.key`,避免嵌套导致合并麻烦;所有 key 加进 `en.json` 为绝对基准。
7. **不升级 React/Vite**(既约):i18n 不依赖版本升级,只加自己的 store + glob。若 `import.meta.glob` 在现有 vite 版本可用,直接复用,否则走 copy-into-webview 方案。

---

## 9. 决策记录(已拍板 2026-08-28)

| # | 问题 | 决策 | 说明 |
|---|---|---|---|
| 1 | 复数方案 | **key 拆分 `_one`/`_other`** | `push.files_one`/`push.files_other`;`t(key,{count})` 自动按 count 选形态;与 VS Code nls 惯例一致 |
| 2 | `jvc.locale` 配置 | **要,默认留空** | 默认空 = 跟随 `vscode.env.language`;填了强制某语言。用于调试/单独预览,一处读取 + 覆盖注入 |
| 3 | 试点面板 | **先 push** | push 最小且含对话框/插值/复数,跑通闭环后再铺 panel |
| 4 | 首期语言集 | **en + zh-cn** | 中文兜底核验最方便;后续加语言走 §6 流程 |

> 后续如调整,更新本表并在行内注明改动理由。