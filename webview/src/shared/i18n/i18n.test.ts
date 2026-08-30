import { describe, expect, it } from "vitest";
import { allDictionaries } from "./bundle";
import { getLocale, setLocale, t, tpl } from "./t";

describe("i18n dictionary loading", () => {
  it("loads all locale dictionaries as plain objects (not { default })", () => {
    const dicts = allDictionaries();
    const locales = Object.keys(dicts);
    expect(locales).toContain("en");
    expect(locales).toContain("zh-cn");
    // A plain dict must resolve known keys directly (fails if wrapped in {default})
    const en = dicts["en"];
    expect(en["worktree.colBranch"]).toBe("Branch");
    expect(en["panel.searchPlaceholder"]).toBe("Search commits...");
    const zh = dicts["zh-cn"];
    expect(zh["worktree.colBranch"]).toBe("分支");
  });
});

describe("t() / tpl()", () => {
  it("returns English by default", () => {
    setLocale("en");
    expect(getLocale()).toBe("en");
    expect(t("worktree.colBranch")).toBe("Branch");
  });

  it("switches to zh-cn and interpolates params", () => {
    setLocale("zh-cn");
    expect(getLocale()).toBe("zh-cn");
    expect(t("worktree.colBranch")).toBe("分支");
    // interpolation
    expect(t("worktree.branchExists", { branch: "main" })).toBe(
      "分支 'main' 已存在",
    );
  });

  it("falls back to English for missing locale and prints key only when unknown", () => {
    setLocale("xx");
    expect(getLocale()).toBe("en");
    setLocale("en");
    expect(t("definitely.not.a.key")).toBe("definitely.not.a.key");
  });

  it("plural via _one/_other", () => {
    expect(tpl("worktree.deleteConfirmMany", 1)).toBe("Delete 1 worktree?");
    expect(tpl("worktree.deleteConfirmMany", 3)).toBe("Delete 3 worktrees?");
  });
});
