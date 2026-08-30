import type { LocaleDict } from "./t";

/**
 * 一次性打包所有语言词典(构建期由 vite 内联到单个 JS bundle,CSP 只加 nonce 在入口)。
 * 新语言 = 在 src/l10n/ 放一个 <locale>.json,这里会自动并入,无需改动。
 */
// `import: "default"` makes vite hand us the parsed JSON object directly.
// (plain { eager: true } wraps JSON as `{ default: {...} }`, which would make
// every key lookup miss and t() fall back to the raw key).
const files = import.meta.glob("../../l10n/*.json", {
  eager: true,
  import: "default",
});

type JsonModule = LocaleDict | { default: LocaleDict };

export function allDictionaries(): Record<string, LocaleDict> {
  const out: Record<string, LocaleDict> = {};
  for (const [path, module] of Object.entries(files)) {
    const match = path.match(/([^/]+)\.json$/);
    if (!match) continue;
    const mod = module as JsonModule;
    const dict =
      mod && typeof mod === "object" && "default" in mod
        ? (mod.default as LocaleDict)
        : (mod as LocaleDict);
    out[match[1]] = dict;
  }
  return out;
}
