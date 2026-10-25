import * as vscode from "vscode";

/**
 * One-time prompt to disable VS Code's built-in Git extension, driven by a
 * user-visible setting so the behaviour can be inspected and flipped:
 *
 *   jgc.onboarding.builtinGitPrompt = "ask" | "never"   (default: "ask")
 *
 * While the setting reads "ask" and the built-in Git is enabled, JGC shows
 * the dialog once per session start (and immediately when the user flips the
 * setting back to "ask"). Any explicit answer — disable or keep — writes
 * "never" back into the setting, which the user can always change again.
 */

const CONFIG_SECTION = "jgc.onboarding";
const CONFIG_KEY = "builtinGitPrompt";

type PromptMode = "ask" | "never";

export class BuiltinGitPrompt implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private asking = false;

  constructor(private readonly log?: (message: string) => void) {
    // A workspace usually settles (folders, git repos) a beat after startup;
    // asking too early can surface before the window is even interactive.
    const timer = setTimeout(() => void this.maybePrompt(), 1_500);
    this.disposables.push(
      { dispose: () => clearTimeout(timer) },
      // Flipping the setting back to "ask" re-triggers the dialog at once —
      // no window reload needed.
      vscode.workspace.onDidChangeConfiguration((e) => {
        if (e.affectsConfiguration(`${CONFIG_SECTION}.${CONFIG_KEY}`)) {
          void this.maybePrompt();
        }
      }),
    );
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  private mode(): PromptMode {
    return vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .get<PromptMode>(CONFIG_KEY, "ask");
  }

  private async settle(): Promise<void> {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(CONFIG_KEY, "never", vscode.ConfigurationTarget.Global);
  }

  private async maybePrompt(): Promise<void> {
    if (this.mode() !== "ask") {
      this.log?.("builtin git prompt: skipped, setting is 'never'");
      return;
    }
    const builtin = vscode.extensions.getExtension("vscode.git");
    if (!builtin) {
      this.log?.("builtin git prompt: skipped, vscode.git not installed");
      return;
    }
    const enabled = vscode.workspace
      .getConfiguration("git")
      .get<boolean>("enabled", true);
    if (!enabled) {
      this.log?.("builtin git prompt: skipped, git.enabled is already false");
      return;
    }
    if (this.asking) {
      return;
    }
    this.asking = true;
    this.log?.("builtin git prompt: asking");
    try {
      const choice = await vscode.window.showInformationMessage(
        vscode.l10n.t(
          "JetBrains Git Control can replace the built-in Git UI. Disable VS Code's built-in Git extension (git.enabled = false)?",
        ),
        vscode.l10n.t("Disable built-in Git"),
        vscode.l10n.t("Keep both"),
      );
      if (choice === undefined) {
        // Dismissed without deciding — the setting stays "ask" and the
        // dialog returns with the next session (or the next flip).
        return;
      }
      // Either explicit answer settles the prompt.
      await this.settle();
      if (choice === vscode.l10n.t("Disable built-in Git")) {
        await vscode.workspace
          .getConfiguration("git")
          .update("enabled", false, vscode.ConfigurationTarget.Global);
        const reload = await vscode.window.showInformationMessage(
          vscode.l10n.t(
            "Built-in Git is now disabled. Reload the window to apply it. To remove the Source Control icon from the activity bar, right-click the activity bar and uncheck Source Control.",
          ),
          vscode.l10n.t("Reload Now"),
        );
        if (reload === vscode.l10n.t("Reload Now")) {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
      }
    } finally {
      this.asking = false;
    }
  }
}
