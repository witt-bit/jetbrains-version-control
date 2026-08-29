#!/usr/bin/env node
/**
 * sync-nls.mjs — 从 webview 翻译源(webview/src/l10n/<locale>.json)派生 VS Code 本地化产物。
 *
 * 产出:
 *   package.nls.json              contributes 的英文模板(供 package.json 里的 %contrib.*% 占位)
 *   package.nls.<locale>.json     每个语言的 contributes 翻译
 *
 * 单一语言源 = webview/src/l10n/<locale>.json;此后台脚本把其中 `contrib.*` 前缀的 key
 * 导出为 package.nls,保证 contributes 与 Webview 文案同源。
 *
 * 用法:node scripts/sync-nls.mjs
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const l10nDir = join(root, "webview", "src", "l10n");

const CONTRIB_PREFIX = "contrib.";

/** 读入所有语言词典,按 locale 归组。 */
function loadDictionaries() {
  const dicts = {};
  for (const file of readdirSync(l10nDir)) {
    const m = file.match(/^([^.]+)\.json$/);
    if (!m) continue;
    dicts[m[1]] = JSON.parse(readFileSync(join(l10nDir, file), "utf8"));
  }
  return dicts;
}

/**
 * 只取 `contrib.*` 前缀的 key。key 保持完整(含前缀),以精确匹配 package.json 里的
 * `%contrib.*%` 占位符(如 `%contrib.app.panel%` ↔ key `contrib.app.panel`)。
 */
function contribOnly(dict) {
  const out = {};
  for (const [key, value] of Object.entries(dict)) {
    if (key.startsWith(CONTRIB_PREFIX)) {
      out[key] = value;
    }
  }
  return out;
}

function main() {
  const dicts = loadDictionaries();
  const english = dicts["en"];
  if (!english) {
    console.error("Missing en dictionary in " + l10nDir + "; aborting.");
    process.exit(1);
  }

  // package.nls.json — English template (source of truth for %key% fallback).
  writeFileSync(
    join(root, "package.nls.json"),
    JSON.stringify(contribOnly(english), null, 2) + "\n",
  );

  // package.nls.<locale>.json — per-language contributes translation.
  for (const [locale, dict] of Object.entries(dicts)) {
    if (locale === "en") continue; // en is the template itself
    writeFileSync(
      join(root, `package.nls.${locale}.json`),
      JSON.stringify(contribOnly(dict), null, 2) + "\n",
    );
  }

  const locales = Object.keys(dicts).join(", ");
  console.log(`sync-nls: regenerated package.nls*.json for [${locales}]`);
}

main();