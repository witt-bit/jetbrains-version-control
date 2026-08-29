import type { LocaleDict } from "./t";

/**
 * 一次性打包所有语言词典(构建期由 vite 内联到单个 JS bundle,CSP 只加 nonce 在入口)。
 * 新语言 = 在 src/l10n/ 放一个 <locale>.json,这里会自动并入,无需改动。
 */
const files = import.meta.glob("../l10n/*.json", { eager: true });

export function allDictionaries(): Record<string, LocaleDict> {
  const out: Record<string, LocaleDict> = {};
  for (const [path, module] of Object.entries(files)) {
    const match = path.match(/([^/]+)\.json$/);
    if (!match) continue;
    out[match[1]] = module as LocaleDict;
  }
  return out;
}
