import { allDictionaries } from "./bundle";

export interface LocaleDict {
  [key: string]: string;
}

export type Params = Record<string, string | number>;

const dicts = allDictionaries();
const en: LocaleDict = dicts.en ?? {};
let active = "en";

/** 设置当前语言;返回实际生效的语言(未知语言回落到 en)。 */
export function setLocale(locale: string): string {
  const normalized = (locale ?? "").toLowerCase().trim() || "en";
  active = normalized in dicts ? normalized : "en";
  return active;
}

export function getLocale(): string {
  return active;
}

/** 精确查找:当前语言 → 英文兜底 → 原样输出 key。 */
function lookup(key: string): string {
  const current = dicts[active];
  if (current && current[key] !== undefined) return current[key];
  if (en[key] !== undefined) return en[key];
  return key;
}

/**
 * 翻译并填充 `{param}` 占位符。
 * ```ts
 * t("push.rejectedMessage", { branch: "main" });
 * ```
 */
export function t(key: string, params?: Params): string {
  let text = lookup(key);
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      text = text.replaceAll(`{${name}}`, String(value));
    }
  }
  return text;
}

/**
 * 复数翻译:取 `key + _one` / `key + _other`,并把 count 注入为 `{count}`。
 * 若该语言未定义复数形态,回落到 base key。
 * ```ts
 * tpl("push.pushed", 3, { remote, branch });
 * ```
 */
export function tpl(key: string, count: number, params?: Params): string {
  const injected: Params = { ...(params ?? {}), count };
  const suffix = count === 1 ? "_one" : "_other";
  const specific = `${key}${suffix}`;
  // 复数形态未定义 → 用 base key(单复数同形,如中文)。
  return lookup(specific) === specific
    ? t(key, injected)
    : t(specific, injected);
}
