import * as vscode from "vscode";

/**
 * One-time prompt to disable VS Code's built-in Git extension.
 *
 * JGC replaces the native Git UI, and running both means duplicate status
 * bar items, duplicate SCM decorations and double file watching. The plugin
 * cannot make that call for the user, so it asks once: on consent it flips
 * `git.enabled` to false at the **global** scope; on dismissal or decline it
 * remembers the decision and never asks again.
 */

/** globalState key remembering that the user already answered the prompt. */
const PROMPT_STATE_KEY = "jgc.builtinGitPrompt.answered";

export class BuiltinGitPrompt implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private asking = false;

  constructor(private readonly globalState: vscode.Memento) {
    // A workspace usually settles (folders, git repos) a beat after startup;
    // asking too early can surface before the window is even interactive.
    const timer = setTimeout(() => void this.maybePrompt(), 1_500);
    this.disposables.push({
      dispose: () => clearTimeout(timer),
    });
  }

  dispose(): void {
    for (const d of this.disposables) {
      d.dispose();
    }
    this.disposables.length = 0;
  }

  private async maybePrompt(): Promise<void> {
    if (this.globalState.get<boolean>(PROMPT_STATE_KEY)) {
      return;
    }
    const builtin = vscode.extensions.getExtension("vscode.git");
    if (!builtin) {
      return;
    }
    const enabled = vscode.workspace
      .getConfiguration("git")
      .get<boolean>("enabled", true);
    if (!enabled) {
      // Already off — nothing to migrate, but remember so we never check again.
      await this.globalState.update(PROMPT_STATE_KEY, true);
      return;
    }

    if (this.asking) {
      return;
    }
    this.asking = true;
    try {
      const choice = await vscode.window.showInformationMessage(
        "JetBrains Git Control can replace the built-in Git UI. Disable VS Code's built-in Git extension (git.enabled = false)?",
        "Disable built-in Git",
        "Keep both",
      );
      if (choice === undefined) {
        // Dismissed without deciding — ask again on the next session.
        return;
      }
      if (choice === "Disable built-in Git") {
        await vscode.workspace
          .getConfiguration("git")
          .update("enabled", false, vscode.ConfigurationTarget.Global);
        // Settle the prompt before offering the reload, so dismissing the
        // reload question does not resurrect this one.
        await this.globalState.update(PROMPT_STATE_KEY, true);
        // git.enabled only takes effect after a reload. Once it does, no SCM
        // provider remains registered (unless another SCM extension is
        // installed) and VS Code itself hides the Source Control icon — its
        // view container is declared `hideIfEmpty`.
        const reload = await vscode.window.showInformationMessage(
          "Built-in Git is now disabled. Reload the window to apply it — the Source Control icon disappears from the activity bar once no other source control extension is active.",
          "Reload Now",
        );
        if (reload === "Reload Now") {
          await vscode.commands.executeCommand("workbench.action.reloadWindow");
        }
        return;
      }
      // Either explicit answer settles the prompt for good.
      await this.globalState.update(PROMPT_STATE_KEY, true);
    } finally {
      this.asking = false;
    }
  }
}
