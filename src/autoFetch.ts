import * as vscode from "vscode";
import { AutoFetchScheduler, runAutoFetchPass } from "./git/autoFetch.ts";
import { readFetchSettings } from "./git/fetchOptions.ts";
import type { GitService } from "./git/gitService";
import type { MessageRouter } from "./messages/messageRouter";

/**
 * Wire the auto-fetch timer to the `jgc.fetch.*` settings.
 *
 * The scheduling rules live in `git/autoFetch.ts`; this file only supplies the
 * vscode side: settings, change events and the refresh broadcast. A pass is
 * silent — failures go to the log, never a popup — and the UI is refreshed
 * only when a fetch really moved a ref.
 */
export function registerAutoFetch(
  context: vscode.ExtensionContext,
  deps: {
    services: () => readonly GitService[];
    messageRouter: MessageRouter;
    /** True while a user-triggered operation is in flight. */
    isBusy: () => boolean;
    log: (message: string) => void;
  },
): AutoFetchScheduler {
  const read = () => {
    const config = vscode.workspace.getConfiguration("jgc");
    return readFetchSettings((key) => config.get(key));
  };

  const scheduler = new AutoFetchScheduler({
    isBusy: deps.isBusy,
    onError: (err) =>
      deps.log(
        `Auto-fetch failed: ${err instanceof Error ? err.message : String(err)}`,
      ),
    runPass: async () => {
      const { prune, tagsMode } = read();
      const result = await runAutoFetchPass(deps.services(), {
        prune,
        tagsMode,
      });
      for (const { root, error } of result.failures) {
        deps.log(
          `Auto-fetch skipped ${root}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (result.changed) {
        deps.messageRouter.broadcastEvent("gitStateChanged", { scope: "all" });
      }
    },
  });

  const apply = () => {
    const { autoFetch, autoFetchIntervalMinutes } = read();
    scheduler.configure(autoFetch, autoFetchIntervalMinutes);
  };
  apply();

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration("jgc.fetch")) apply();
    }),
    { dispose: () => scheduler.dispose() },
  );
  return scheduler;
}
