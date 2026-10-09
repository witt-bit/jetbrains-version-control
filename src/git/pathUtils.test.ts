import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  parseDiffNameStatus,
  splitStatusPaths,
  unquoteGitPath,
} from "./pathUtils.ts";

// git 的 core.quotePath 默认 true：任何含非 ASCII 字节的路径在 porcelain /
// name-status 输出里都会被 C 风格八进制转义并用双引号包裹。
// 这些用例的输入字符串就是 git 实际打印的字节。

describe("unquoteGitPath", () => {
  it("decodes octal-escaped UTF-8 Chinese path", () => {
    // "\346\226\207\346\241\243.java"
    assert.equal(
      unquoteGitPath('"\\346\\226\\207\\346\\241\\243.java"'),
      "文档.java",
    );
  });

  it("decodes a nested Chinese directory from the reported bug", () => {
    assert.equal(
      unquoteGitPath(
        '"my-project/docs/\\344\\270\\255\\346\\226\\207\\347\\233\\256\\345\\275\\225/AdminAuthService.java"',
      ),
      "my-project/docs/中文目录/AdminAuthService.java",
    );
  });

  it("leaves an already raw path untouched", () => {
    assert.equal(
      unquoteGitPath("my-project/docs/中文目录/AdminAuthService.java"),
      "my-project/docs/中文目录/AdminAuthService.java",
    );
  });

  it("strips quotes around a path containing a space", () => {
    // git status quotes space-containing paths even with core.quotepath=false
    assert.equal(unquoteGitPath('"b c.txt"'), "b c.txt");
  });

  it("decodes an escaped double quote inside the path", () => {
    assert.equal(unquoteGitPath('"f\\"g.txt"'), 'f"g.txt');
  });

  it("decodes an escaped backslash inside the path", () => {
    assert.equal(unquoteGitPath('"a\\\\b.txt"'), "a\\b.txt");
  });

  it("decodes escaped tab and newline", () => {
    assert.equal(unquoteGitPath('"a\\tb"'), "a\tb");
    assert.equal(unquoteGitPath('"a\\nb"'), "a\nb");
  });

  it("keeps an unbalanced leading quote as part of the path", () => {
    assert.equal(unquoteGitPath('"unclosed.txt'), '"unclosed.txt');
  });

  it("maps an empty quoted path to an empty string", () => {
    assert.equal(unquoteGitPath('""'), "");
  });

  it("returns an empty string unchanged", () => {
    assert.equal(unquoteGitPath(""), "");
  });
});

describe("splitStatusPaths", () => {
  it("reads a single modified path", () => {
    assert.deepEqual(splitStatusPaths("my-project/application-dev.yml"), {
      path: "my-project/application-dev.yml",
      oldPath: undefined,
    });
  });

  it("splits an unquoted rename into new and old path", () => {
    assert.deepEqual(splitStatusPaths("old/dir/a.java -> new/dir/a.java"), {
      path: "new/dir/a.java",
      oldPath: "old/dir/a.java",
    });
  });

  it("splits and decodes a quoted rename with octal escapes", () => {
    assert.deepEqual(
      splitStatusPaths(
        '"\\346\\226\\207\\344\\273\\266.java" -> "\\345\\255\\220\\347\\233\\256\\345\\275\\225/\\346\\226\\207\\344\\273\\266.java"',
      ),
      { path: "子目录/文件.java", oldPath: "文件.java" },
    );
  });

  it("does not treat a quoted file name containing an arrow as a rename", () => {
    // git prints "a -> b.txt" for a single file literally named that way;
    // splitting on the first " -> " would wrongly report a rename.
    assert.deepEqual(splitStatusPaths('"a -> b.txt"'), {
      path: "a -> b.txt",
      oldPath: undefined,
    });
  });

  it("splits a quoted rename whose paths contain spaces", () => {
    assert.deepEqual(splitStatusPaths('"b c.txt" -> "d e.txt"'), {
      path: "d e.txt",
      oldPath: "b c.txt",
    });
  });

  it("keeps a trailing escaped quote out of the rename split", () => {
    assert.deepEqual(splitStatusPaths('"a\\"b.txt" -> "\\"c.txt"'), {
      path: '"c.txt',
      oldPath: 'a"b.txt',
    });
  });
});

describe("parseDiffNameStatus", () => {
  it("parses an added file with an octal-escaped path", () => {
    assert.deepEqual(
      parseDiffNameStatus('A\t"\\346\\226\\207\\344\\273\\266.java"'),
      [
        {
          oldPath: "文件.java",
          newPath: "文件.java",
          status: "added",
          isBinary: false,
        },
      ],
    );
  });

  it("parses a deleted file", () => {
    assert.deepEqual(parseDiffNameStatus("D\tdocs/gone.md"), [
      {
        oldPath: "docs/gone.md",
        newPath: "docs/gone.md",
        status: "deleted",
        isBinary: false,
      },
    ]);
  });

  it("parses a plain modification", () => {
    assert.deepEqual(parseDiffNameStatus("M\tpom.xml"), [
      {
        oldPath: "pom.xml",
        newPath: "pom.xml",
        status: "modified",
        isBinary: false,
      },
    ]);
  });

  it("parses a rename with a similarity score and decoded paths", () => {
    assert.deepEqual(
      parseDiffNameStatus(
        'R100\t"\\346\\226\\207\\344\\273\\266.java"\t"\\345\\255\\220\\347\\233\\256\\345\\275\\225/\\346\\226\\207\\344\\273\\266.java"',
      ),
      [
        {
          oldPath: "文件.java",
          newPath: "子目录/文件.java",
          status: "renamed",
          isBinary: false,
        },
      ],
    );
  });

  it("parses a copy", () => {
    assert.deepEqual(parseDiffNameStatus("C100\tsrc/a.java\tsrc/b.java"), [
      {
        oldPath: "src/a.java",
        newPath: "src/b.java",
        status: "copied",
        isBinary: false,
      },
    ]);
  });

  it("parses several entries and ignores blank lines", () => {
    assert.deepEqual(parseDiffNameStatus("M\ta.txt\n\nD\tb.txt\n"), [
      {
        oldPath: "a.txt",
        newPath: "a.txt",
        status: "modified",
        isBinary: false,
      },
      {
        oldPath: "b.txt",
        newPath: "b.txt",
        status: "deleted",
        isBinary: false,
      },
    ]);
  });

  it("returns an empty list for empty output", () => {
    assert.deepEqual(parseDiffNameStatus(""), []);
    assert.deepEqual(parseDiffNameStatus("   \n  "), []);
  });
});
