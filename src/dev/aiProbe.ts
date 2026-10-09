import { execFile } from "node:child_process";
import * as vscode from "vscode";

/**
 * TEMP dev probe. Three questions:
 *  1. Does `vscode.lm.selectChatModels()` return models?
 *  2. Can we send our own request and get a commit message back?
 *  3. Can we invoke Qoder's / Copilot's commit-message commands, and do they
 *     return the text to us?
 * Dev-only, never ships.
 */

type LooseModel = {
  vendor?: string;
  id?: string;
  name?: string;
  sendRequest: (
    messages: unknown[],
    options?: unknown,
    token?: vscode.CancellationToken,
  ) => Promise<{ text: AsyncIterable<string> }>;
};

/** Minimal shape of the built-in `vscode.git` extension API we need. */
type GitAPI = {
  repositories: {
    inputBox: { value: string; onDidChange: vscode.Event<void> };
  }[];
  openRepository: (uri: vscode.Uri) => Promise<unknown>;
};

const VENDOR_COMMANDS = [
  "tongyi.command.generateCommitMessage",
  "github.copilot.git.generateCommitMessage",
  "codegeex.commit.message",
];

function getLm() {
  return (
    vscode as unknown as {
      lm?: {
        selectChatModels: (sel?: unknown) => Promise<LooseModel[]>;
        LanguageModelChatMessage?: { User: (t: string) => unknown };
      };
    }
  ).lm;
}

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("git", args, { cwd, maxBuffer: 32 * 1024 * 1024 }, (e, out) =>
      e ? reject(e) : resolve(out),
    );
  });
}

function describe(v: unknown): string {
  if (v === undefined) return "undefined  ← text NOT returned to us";
  if (v === null) return "null";
  if (typeof v === "string") {
    return `string(${v.length}) = ${JSON.stringify(v.slice(0, 400))}`;
  }
  try {
    return `${typeof v} = ${JSON.stringify(v).slice(0, 400)}`;
  } catch {
    return `${typeof v} (unserialisable)`;
  }
}

export function registerAiProbe(context: vscode.ExtensionContext): void {
  if (context.extensionMode !== vscode.ExtensionMode.Development) return;

  const channel = vscode.window.createOutputChannel("JGC AI Probe");
  context.subscriptions.push(channel);
  const log = (s: string) => channel.appendLine(s);

  // 1. enumerate models
  context.subscriptions.push(
    vscode.commands.registerCommand("jgc.dev.aiProbe.test", async () => {
      channel.show(true);
      const lm = getLm();
      if (!lm) return void log("vscode.lm NOT available");
      const models = await lm.selectChatModels();
      log(`${models.length} model(s)`);
      for (const m of models) {
        log(`  vendor=${m.vendor} id=${m.id} name=${m.name}`);
      }
    }),
  );

  // 2. our own request
  context.subscriptions.push(
    vscode.commands.registerCommand("jgc.dev.aiProbe.generate", async () => {
      channel.show(true);
      const lm = getLm();
      const folder = vscode.workspace.workspaceFolders?.[0];
      if (!lm?.LanguageModelChatMessage || !folder) {
        return void log("lm or workspace unavailable");
      }

      const model =
        (await lm.selectChatModels()).find((m) => m.id === "auto") ??
        (await lm.selectChatModels())[0];
      if (!model) return void log("no models");

      const cwd = folder.uri.fsPath;
      const diff = (await git(cwd, ["diff", "HEAD"])).slice(0, 6000);
      const recent = await git(cwd, ["log", "-5", "--pretty=%s"]);
      log(`model=${model.vendor}/${model.id}  diff=${diff.length} chars`);

      const started = Date.now();
      try {
        const res = await model.sendRequest(
          [
            lm.LanguageModelChatMessage.User(
              [
                "Write a git commit message for this diff.",
                "Rules: ONE line, imperative, no trailing period, no markdown, no code fences, no preamble.",
                "",
                "Recent commit messages:",
                recent.trim(),
                "",
                "Diff:",
                diff,
              ].join("\n"),
            ),
          ],
          {},
          undefined,
        );
        let full = "";
        for await (const frag of res.text) full += frag;
        log(`--- response (${Date.now() - started}ms) ---`);
        log(full);
        void vscode.window.showInformationMessage(
          `AI Probe: generated ${full.length} chars`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log(`sendRequest threw after ${Date.now() - started}ms: ${msg}`);
        void vscode.window.showErrorMessage(`AI Probe: ${msg}`);
      }
    }),
  );

  // 4. hijack: invoke the vendor command, then read the text it injected into
  //    the built-in Git extension's SCM input box.
  for (const id of VENDOR_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `jgc.dev.aiProbe.hijack.${id}`,
        async () => {
          channel.show(true);
          try {
            const gitExt = vscode.extensions.getExtension<GitAPI>("vscode.git");
            log(`vscode.git found: ${Boolean(gitExt)}`);
            if (!gitExt) return;

            let api = gitExt.exports;
            log(`  isActive=${gitExt.isActive}  exports=${typeof api}`);
            if (!api) {
              log("  exports undefined -> activating...");
              api = await gitExt.activate();
              log(`  after activate: exports=${typeof api}`);
            }
            if (!api) {
              log("  ABORT: vscode.git exposes no API object");
              return;
            }
            log(`  api keys: ${Object.keys(api).join(", ")}`);
            log(
              `  repositories=${api.repositories?.length ?? "n/a"}  openRepository=${typeof api.openRepository}`,
            );

            const folder = vscode.workspace.workspaceFolders?.[0];
            let repo = api.repositories?.[0];
            if (!repo && folder && typeof api.openRepository === "function") {
              log("  calling openRepository()...");
              await api.openRepository(folder.uri);
              repo = api.repositories?.[0];
            }
            if (!repo) {
              log("  ABORT: no repository available");
              return;
            }

            const box = repo.inputBox as
              | { value: string; onDidChange?: vscode.Event<void> }
              | undefined;
            log(
              `  repo.inputBox=${typeof box}  onDidChange=${typeof box?.onDidChange}`,
            );
            log(`  value before = ${JSON.stringify(box?.value)}`);
            const onChange = box?.onDidChange;
            if (typeof onChange !== "function") {
              log("  ABORT: inputBox.onDidChange is not a function");
              return;
            }

            const captured = await new Promise<string>((resolve) => {
              let done = false;
              const finish = (v: string) => {
                if (done) return;
                done = true;
                sub.dispose();
                resolve(v);
              };
              const sub = onChange(() => {
                log("  (onDidChange fired)");
                finish(box?.value ?? "");
              });
              void vscode.commands.executeCommand(id).then(
                (r) => log(`  executeCommand resolved: ${typeof r}`),
                (e) => log(`  executeCommand rejected: ${String(e)}`),
              );
              setTimeout(
                () => finish("<<TIMEOUT: input box never changed>>"),
                25000,
              );
            });

            log(`--- captured from ${id} ---`);
            log(JSON.stringify(captured));
          } catch (err) {
            const msg =
              err instanceof Error ? (err.stack ?? err.message) : String(err);
            log(`EXCEPTION: ${msg}`);
          }
        },
      ),
    );
  }

  // 3. invoke vendor commands -- one command per vendor, so a hang or throw in
  //    one does not hide the other vendors' results.
  for (const id of VENDOR_COMMANDS) {
    context.subscriptions.push(
      vscode.commands.registerCommand(
        `jgc.dev.aiProbe.vendor.${id}`,
        async () => {
          channel.show(true);
          const registered = new Set(await vscode.commands.getCommands(true));
          log(`--- ${id} ---`);
          if (!registered.has(id)) {
            log("  NOT REGISTERED (extension missing or not activated)");
            void vscode.window.showWarningMessage(`${id} not registered`);
            return;
          }

          log("  registered, executing... watch the UI as well");
          const started = Date.now();
          try {
            const r = await vscode.commands.executeCommand(id);
            log(`  returned after ${Date.now() - started}ms:`);
            log(`  ${describe(r)}`);
            void vscode.window.showInformationMessage(
              `AI Probe: returned ${typeof r}`,
            );
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            log(`  threw after ${Date.now() - started}ms: ${msg}`);
            void vscode.window.showErrorMessage(msg);
          }
          log("  >> did text appear in the Source Control input box?");
        },
      ),
    );
  }
}
