import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { coerceEntries } from "./interactiveRebase.ts";
import {
  amendCommand,
  autosquashEntries,
  parseTodo,
  parseTodoLine,
  planTodo,
  type RebaseEntry,
  serializeTodo,
  serializeTodoLine,
  shellQuote,
  validateEntries,
} from "./rebaseTodo.ts";

const H1 = "1111111111111111111111111111111111111111";
const H2 = "2222222222222222222222222222222222222222";
const H3 = "3333333333333333333333333333333333333333";
const H4 = "4444444444444444444444444444444444444444";

function entry(
  hash: string,
  subject: string,
  action: RebaseEntry["action"] = "pick",
): RebaseEntry {
  return { action, hash, subject };
}

describe("parseTodo", () => {
  it("reads every command git can put in a todo", () => {
    const lines = parseTodo(
      [
        "label onto",
        "",
        "reset onto",
        "pick abc1234 Add parser",
        "reword def5678 Fix bug",
        "edit 1234567 Stop here",
        "squash 2345678 more",
        "fixup 3456789 tidy",
        "fixup -C 4567890 amend! thing",
        "drop 5678901 gone",
        "exec make test",
        "break",
        "merge -C 6789012 feature # Merge feature",
        "merge topic",
        "update-ref refs/heads/topic",
        "noop",
        "# Rebase abc..def onto ghi",
      ].join("\n"),
    );
    assert.deepEqual(lines, [
      { kind: "label", name: "onto" },
      { kind: "blank" },
      { kind: "reset", name: "onto" },
      {
        kind: "commit",
        action: "pick",
        hash: "abc1234",
        subject: "Add parser",
      },
      { kind: "commit", action: "reword", hash: "def5678", subject: "Fix bug" },
      { kind: "commit", action: "edit", hash: "1234567", subject: "Stop here" },
      { kind: "commit", action: "squash", hash: "2345678", subject: "more" },
      { kind: "commit", action: "fixup", hash: "3456789", subject: "tidy" },
      {
        kind: "commit",
        action: "fixup",
        hash: "4567890",
        subject: "amend! thing",
        flag: "-C",
      },
      { kind: "commit", action: "drop", hash: "5678901", subject: "gone" },
      { kind: "exec", command: "make test" },
      { kind: "break" },
      {
        kind: "merge",
        label: "feature",
        commit: { flag: "-C", hash: "6789012" },
        subject: "Merge feature",
      },
      { kind: "merge", label: "topic" },
      { kind: "update-ref", ref: "refs/heads/topic" },
      { kind: "noop" },
      { kind: "comment", text: "# Rebase abc..def onto ghi" },
    ]);
  });

  it("expands the one-letter abbreviations", () => {
    const parsed = parseTodo(
      "p a1 one\nr b2 two\ne c3 three\ns d4 four\nf e5 five\nd f6 six\nx echo hi\nb\nl lbl\nt lbl\nm lbl\nu refs/heads/x",
    );
    assert.deepEqual(
      parsed.map((line) => (line.kind === "commit" ? line.action : line.kind)),
      [
        "pick",
        "reword",
        "edit",
        "squash",
        "fixup",
        "drop",
        "exec",
        "break",
        "label",
        "reset",
        "merge",
        "update-ref",
      ],
    );
  });

  it("accepts a commit without a subject", () => {
    assert.deepEqual(parseTodoLine("pick abc1234"), {
      kind: "commit",
      action: "pick",
      hash: "abc1234",
      subject: "",
    });
  });

  it("keeps lines it does not understand as unknown", () => {
    assert.deepEqual(parseTodoLine("frobnicate abc"), {
      kind: "unknown",
      raw: "frobnicate abc",
    });
    assert.deepEqual(parseTodoLine("pick"), { kind: "unknown", raw: "pick" });
    assert.deepEqual(parseTodoLine("pick -C abc1234 x").kind, "unknown");
    assert.deepEqual(parseTodoLine("break now").kind, "unknown");
  });

  it("tolerates CRLF and treats the trailing newline as a terminator", () => {
    assert.deepEqual(parseTodo("pick a1 one\r\npick b2 two\r\n"), [
      { kind: "commit", action: "pick", hash: "a1", subject: "one" },
      { kind: "commit", action: "pick", hash: "b2", subject: "two" },
    ]);
    assert.deepEqual(parseTodo(""), []);
  });

  it("keeps subjects that look like commands intact", () => {
    assert.deepEqual(parseTodoLine("pick abc1234 exec rm -rf /"), {
      kind: "commit",
      action: "pick",
      hash: "abc1234",
      subject: "exec rm -rf /",
    });
  });
});

describe("serializeTodo", () => {
  it("round-trips a todo exactly", () => {
    const text = [
      "label onto",
      "",
      "reset onto",
      "pick abc1234 Add parser",
      "fixup -C 4567890 amend! thing",
      "exec make test",
      "break",
      "merge -C 6789012 feature # Merge feature",
      "merge topic",
      "update-ref refs/heads/topic",
      "noop",
      "# comment",
      "",
    ].join("\n");
    assert.equal(serializeTodo(parseTodo(text)), text);
  });

  it("normalizes abbreviations to full names", () => {
    assert.equal(
      serializeTodo(parseTodo("p a1 one\nf b2 two\nx echo\n")),
      "pick a1 one\nfixup b2 two\nexec echo\n",
    );
  });

  it("parse(serialize(lines)) is the identity", () => {
    const lines = parseTodo(
      "pick a1 one\nreword b2 two\nexec x\nbreak\nlabel l\nreset l\nmerge m\n# c\n\nbogus line",
    );
    assert.deepEqual(parseTodo(serializeTodo(lines)), lines);
  });

  it("emits nothing for an empty list", () => {
    assert.equal(serializeTodo([]), "");
  });

  it("collapses a multi-line subject so it cannot inject a command", () => {
    assert.equal(
      serializeTodoLine({
        kind: "commit",
        action: "pick",
        hash: "abc1234",
        subject: "innocent\nexec rm -rf ~",
      }),
      "pick abc1234 innocent exec rm -rf ~",
    );
  });

  it("refuses a multi-line exec or id", () => {
    assert.throws(() => serializeTodoLine({ kind: "exec", command: "a\nb" }));
    assert.throws(() =>
      serializeTodoLine({
        kind: "commit",
        action: "pick",
        hash: "abc\nexec x",
        subject: "",
      }),
    );
  });
});

describe("validateEntries", () => {
  it("accepts an ordinary list", () => {
    assert.equal(
      validateEntries([entry(H1, "a"), entry(H2, "b", "squash")]),
      undefined,
    );
  });

  it("rejects an empty list, bad ids and unknown actions", () => {
    assert.match(validateEntries([]) ?? "", /no commits/);
    assert.match(validateEntries([entry("zzz", "a")]) ?? "", /not a commit id/);
    assert.match(
      validateEntries([entry(H1, "a", "rewrite" as never)]) ?? "",
      /Unknown rebase action/,
    );
  });

  it("rejects a squash or fixup with nothing before it", () => {
    assert.match(
      validateEntries([entry(H1, "a", "fixup"), entry(H2, "b")]) ?? "",
      /Cannot fixup the first commit/,
    );
    assert.match(
      validateEntries([
        entry(H1, "a", "drop"),
        entry(H2, "b", "squash"),
        entry(H3, "c"),
      ]) ?? "",
      /Cannot squash the first commit/,
    );
  });
});

describe("shellQuote", () => {
  it("single-quotes and escapes embedded quotes", () => {
    assert.equal(shellQuote("/tmp/it's here", "linux"), `'/tmp/it'\\''s here'`);
  });

  it("uses forward slashes for Windows paths", () => {
    assert.equal(
      shellQuote("C:\\Users\\me\\msg.txt", "win32"),
      "'C:/Users/me/msg.txt'",
    );
  });
});

describe("planTodo", () => {
  it("writes plain actions straight through", () => {
    const planned = planTodo(
      [
        entry(H1, "one"),
        entry(H2, "two", "squash"),
        entry(H3, "three", "drop"),
        entry(H4, "four", "edit"),
      ],
      (i) => `/m/${i}`,
    );
    assert.equal(
      planned.text,
      `pick ${H1} one\nsquash ${H2} two\ndrop ${H3} three\nedit ${H4} four\n`,
    );
    assert.deepEqual(planned.messages, []);
  });

  it("keeps a reword without a message as git's own reword", () => {
    const planned = planTodo([entry(H1, "one", "reword")], (i) => `/m/${i}`);
    assert.equal(planned.text, `reword ${H1} one\n`);
  });

  it("turns a reword with a message into pick plus an amend", () => {
    const planned = planTodo(
      [
        { ...entry(H1, "one", "reword"), message: "New subject\n\nBody" },
        entry(H2, "two"),
      ],
      (i) => `/m/${i}`,
      { platform: "linux" },
    );
    assert.equal(
      planned.text,
      [
        `pick ${H1} one`,
        `exec ${amendCommand("/m/0", "linux")}`,
        `pick ${H2} two`,
        "",
      ].join("\n"),
    );
    assert.deepEqual(planned.messages, [
      { path: "/m/0", content: "New subject\n\nBody" },
    ]);
  });

  it("amends after the last member of a squash group", () => {
    const planned = planTodo(
      [
        { ...entry(H1, "one", "reword"), message: "Combined" },
        entry(H2, "two", "squash"),
        entry(H3, "three", "fixup"),
        entry(H4, "four"),
      ],
      (i) => `/m/${i}`,
      { platform: "linux" },
    );
    assert.deepEqual(planned.text.split("\n"), [
      `pick ${H1} one`,
      `squash ${H2} two`,
      `fixup ${H3} three`,
      `exec ${amendCommand("/m/0", "linux")}`,
      `pick ${H4} four`,
      "",
    ]);
  });

  it("moves a branch after its commit's group is finished", () => {
    const planned = planTodo(
      [
        entry(H1, "one"),
        entry(H2, "two", "squash"),
        entry(H3, "three"),
        entry(H4, "four", "drop"),
      ],
      (i) => `/m/${i}`,
      {
        refsByHash: new Map([
          [H1, ["refs/heads/a"]],
          [H2, ["refs/heads/b"]],
          [H4, ["refs/heads/c"]],
        ]),
      },
    );
    assert.deepEqual(planned.text.split("\n"), [
      `pick ${H1} one`,
      `squash ${H2} two`,
      "update-ref refs/heads/a",
      "update-ref refs/heads/b",
      `pick ${H3} three`,
      `drop ${H4} four`,
      "update-ref refs/heads/c",
      "",
    ]);
  });

  it("gives each message its own file", () => {
    const planned = planTodo(
      [
        { ...entry(H1, "one", "reword"), message: "A" },
        { ...entry(H2, "two", "reword"), message: "B" },
      ],
      (i) => `/m/${i}`,
    );
    assert.deepEqual(
      planned.messages.map((m) => m.path),
      ["/m/0", "/m/1"],
    );
  });

  it("carries the fixup -C flag", () => {
    const planned = planTodo(
      [entry(H1, "one"), { ...entry(H2, "amend! one", "fixup"), flag: "-C" }],
      (i) => `/m/${i}`,
    );
    assert.match(planned.text, new RegExp(`fixup -C ${H2} amend! one`));
  });

  it("refuses an invalid list", () => {
    assert.throws(
      () => planTodo([entry(H1, "a", "squash")], (i) => `/m/${i}`),
      /Cannot squash/,
    );
  });
});

describe("autosquashEntries", () => {
  it("moves fixup! and squash! commits behind their target", () => {
    const result = autosquashEntries([
      entry(H1, "Add parser"),
      entry(H2, "Add lexer"),
      entry(H3, "fixup! Add parser"),
      entry(H4, "squash! Add lexer"),
    ]);
    assert.deepEqual(
      result.map((e) => [e.subject, e.action]),
      [
        ["Add parser", "pick"],
        ["fixup! Add parser", "fixup"],
        ["Add lexer", "pick"],
        ["squash! Add lexer", "squash"],
      ],
    );
  });

  it("keeps several fixups in their original order", () => {
    const result = autosquashEntries([
      entry(H1, "target"),
      entry(H2, "other"),
      entry(H3, "fixup! target"),
      entry(H4, "squash! target"),
    ]);
    assert.deepEqual(
      result.map((e) => e.hash),
      [H1, H3, H4, H2],
    );
  });

  it("matches by hash prefix and by subject prefix", () => {
    const byHash = autosquashEntries([
      entry(H1, "first"),
      entry(H2, "second"),
      entry(H3, `fixup! ${H1.slice(0, 8)}`),
    ]);
    assert.deepEqual(
      byHash.map((e) => e.hash),
      [H1, H3, H2],
    );
    const byPrefix = autosquashEntries([
      entry(H1, "Add the parser module"),
      entry(H2, "second"),
      entry(H3, "fixup! Add the parser"),
    ]);
    assert.deepEqual(
      byPrefix.map((e) => e.hash),
      [H1, H3, H2],
    );
  });

  it("follows a fixup of a fixup to the original commit", () => {
    const result = autosquashEntries([
      entry(H1, "target"),
      entry(H2, "other"),
      entry(H3, "fixup! target"),
      entry(H4, "fixup! fixup! target"),
    ]);
    assert.deepEqual(
      result.map((e) => e.hash),
      [H1, H3, H4, H2],
    );
  });

  it("turns amend! into fixup -C", () => {
    const [, second] = autosquashEntries([
      entry(H1, "target"),
      entry(H2, "amend! target"),
    ]);
    assert.equal(second?.action, "fixup");
    assert.equal(second?.flag, "-C");
  });

  it("leaves a fixup whose target is missing or later in place", () => {
    const entries = [
      entry(H1, "fixup! ghost"),
      entry(H2, "fixup! later"),
      entry(H3, "later"),
    ];
    assert.deepEqual(autosquashEntries(entries), entries);
  });

  it("only moves pick entries", () => {
    const result = autosquashEntries([
      entry(H1, "target"),
      entry(H2, "other"),
      entry(H3, "fixup! target", "drop"),
    ]);
    assert.deepEqual(
      result.map((e) => [e.hash, e.action]),
      [
        [H1, "pick"],
        [H2, "pick"],
        [H3, "drop"],
      ],
    );
  });

  it("does not mutate its input", () => {
    const input = [entry(H1, "target"), entry(H2, "fixup! target")];
    const copy = structuredClone(input);
    autosquashEntries(input);
    assert.deepEqual(input, copy);
  });
});

describe("coerceEntries", () => {
  it("keeps the known fields and drops everything else", () => {
    const result = coerceEntries([
      { action: "reword", hash: H1, subject: "a", message: "new", extra: 1 },
      { action: "fixup", hash: H2, subject: "b", flag: "-C" },
      { action: "pick", hash: H3, subject: "c", flag: "--bogus", message: 7 },
    ]);
    assert.deepEqual(result, [
      { action: "reword", hash: H1, subject: "a", message: "new" },
      { action: "fixup", hash: H2, subject: "b", flag: "-C" },
      { action: "pick", hash: H3, subject: "c" },
    ]);
  });

  it("rejects payloads a webview should never send", () => {
    assert.throws(() => coerceEntries(undefined));
    assert.throws(() => coerceEntries({}));
    assert.throws(() => coerceEntries([null]));
    assert.throws(() =>
      coerceEntries([{ action: "exec", hash: H1, subject: "" }]),
    );
    assert.throws(() =>
      coerceEntries([{ action: "pick", hash: 1, subject: "" }]),
    );
    assert.throws(() => coerceEntries([{ action: "pick", hash: H1 }]));
  });
});
