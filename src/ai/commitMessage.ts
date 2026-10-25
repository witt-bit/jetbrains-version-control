import * as vscode from "vscode";
import {
  buildCommitPrompt,
  type PromptFile,
  type StyleReference,
} from "./prompt";

export {
  buildCommitPrompt,
  type PromptFile,
  type StyleReference,
} from "./prompt";

/**
 * AI-generated commit messages, built on the neutral `vscode.lm` layer:
 * `selectChatModels()` enumerates every model the user has made available —
 * GitHub Copilot, VS Code's native BYOK ("Chat: Manage Language Models"),
 * or any extension-contributed provider such as Unify Chat Provider. JGC adds
 * no settings of its own; the only configuration surface is VS Code's.
 */

const MODEL_STATE_KEY = "jgc.ai.commitModel";

/**
 * Owns model selection and one in-flight generation. The last accepted model
 * is remembered per workspace; with several models installed the first
 * generation asks once via QuickPick.
 */
export class AiCommitMessageController implements vscode.Disposable {
  private cancellation: vscode.CancellationTokenSource | undefined;

  constructor(private readonly workspaceState: vscode.Memento) {}

  get busy(): boolean {
    return this.cancellation !== undefined;
  }

  /** Every model currently available to us; empty means the ✨ flow is off. */
  async listModels(): Promise<vscode.LanguageModelChat[]> {
    const lm = (vscode as typeof vscode & { lm?: typeof vscode.lm }).lm;
    if (!lm) {
      return [];
    }
    try {
      return await lm.selectChatModels({});
    } catch {
      return [];
    }
  }

  cancel(): void {
    this.cancellation?.cancel();
  }

  /** The model reference currently remembered, if any. */
  getCurrentModelRef(): { vendor: string; id: string } | null {
    return (
      this.workspaceState.get<{ vendor: string; id: string }>(
        MODEL_STATE_KEY,
      ) ?? null
    );
  }

  /** Persist (or, with undefined, clear) the model to use for generation. */
  rememberModel(ref?: { vendor: string; id: string }): void {
    void this.workspaceState.update(MODEL_STATE_KEY, ref);
  }

  /**
   * Open the model picker on demand (the ✨ neighbor chevron). The current
   * choice is marked; picking one persists it. Returns the chosen ref, or
   * null when dismissed / no models exist.
   */
  async chooseModel(): Promise<{ vendor: string; id: string } | null> {
    const models = await this.listModels();
    if (models.length === 0) {
      void vscode.window.showInformationMessage(
        "JGC: No language model available. Add one via 'Chat: Manage Language Models', or install and sign into GitHub Copilot.",
      );
      return null;
    }
    const current = this.getCurrentModelRef();
    const picked = await vscode.window.showQuickPick(
      models.map((m) => ({
        label: `${m.vendor} · ${m.name || m.id}`,
        description:
          current && current.vendor === m.vendor && current.id === m.id
            ? "current"
            : undefined,
        model: m,
      })),
      { placeHolder: "Choose the model for commit message generation" },
    );
    if (!picked) {
      return null;
    }
    const ref = { vendor: picked.model.vendor, id: picked.model.id };
    this.rememberModel(ref);
    return ref;
  }

  /**
   * Generate a commit message describing exactly `files`. `onDelta` receives
   * the text as it streams so the webview can fill the input box live.
   * Rejects with `vscode.CancellationError` when cancelled.
   */
  async generate(
    files: PromptFile[],
    style: StyleReference,
    onDelta: (text: string) => void,
  ): Promise<string> {
    if (this.cancellation) {
      throw new Error("A generation is already in progress");
    }
    const models = await this.listModels();
    const model = await this.resolveModel(models);
    if (!model) {
      throw new vscode.CancellationError();
    }

    const source = new vscode.CancellationTokenSource();
    this.cancellation = source;
    try {
      const message = vscode.LanguageModelChatMessage.User(
        buildCommitPrompt(files, style),
      );
      const response = await model.sendRequest([message], {}, source.token);
      let text = "";
      for await (const chunk of response.text) {
        if (source.token.isCancellationRequested) {
          throw new vscode.CancellationError();
        }
        text += chunk;
        onDelta(chunk);
      }
      return text.trim();
    } finally {
      source.dispose();
      this.cancellation = undefined;
    }
  }

  dispose(): void {
    this.cancellation?.dispose();
    this.cancellation = undefined;
  }
  /**
   * Remembered model → sole model → one-time QuickPick. Returns undefined
   * when there are no models or the user dismissed the picker.
   */
  private async resolveModel(
    models: vscode.LanguageModelChat[],
  ): Promise<vscode.LanguageModelChat | undefined> {
    if (models.length === 0) {
      // Enumeration can legitimately be empty even for Copilot users: models
      // are hidden until the per-extension consent is granted, and consent can
      // only be granted from a request — so guide instead of staying silent.
      void vscode.window.showInformationMessage(
        "JGC: No language model available. Add one via 'Chat: Manage Language Models', or install and sign into GitHub Copilot (the model appears after the first consent).",
      );
      return undefined;
    }
    const remembered = this.workspaceState.get<{ vendor: string; id: string }>(
      MODEL_STATE_KEY,
    );
    if (remembered) {
      const found = models.find(
        (m) => m.vendor === remembered.vendor && m.id === remembered.id,
      );
      if (found) {
        return found;
      }
    }
    if (models.length === 1) {
      const only = models[0];
      this.remember(only);
      return only;
    }
    const picked = await vscode.window.showQuickPick(
      models.map((m) => ({
        label: `${m.vendor} · ${m.name || m.id}`,
        model: m,
      })),
      { placeHolder: "Choose the model for commit message generation" },
    );
    if (!picked) {
      return undefined;
    }
    this.remember(picked.model);
    return picked.model;
  }

  private remember(model: vscode.LanguageModelChat): void {
    void this.workspaceState.update(MODEL_STATE_KEY, {
      vendor: model.vendor,
      id: model.id,
    });
  }
}
