import type { Bridge, CommandType } from "./types";
import { createVSCodeBridge } from "./vscode-bridge";

export const bridge: Bridge = createVSCodeBridge();

/**
 * Report a failed menu/bridge action to the user. The webview console is
 * invisible in production builds — every catch that would otherwise do
 * `console.error` must call this instead (AGENTS.md: menu actions must not
 * fail silently).
 */
export async function reportActionError(
  what: string,
  err: unknown,
): Promise<void> {
  console.error(`${what} failed:`, err);
  const detail = err instanceof Error ? err.message : String(err);
  try {
    await bridge.request("showErrorNotification", {
      message: `${what} failed: ${detail}`,
    });
  } catch {
    // The error channel itself failed; the console line is all we have.
  }
}

/**
 * Run a context-menu action with the standard lifecycle: close the menu
 * first, then execute. Progress is shown for git operations via
 * `bridgeWithProgress`; failures surface through `reportActionError`.
 */
export async function runMenuAction(
  onClose: () => void,
  what: string,
  fn: () => Promise<unknown>,
): Promise<void> {
  onClose();
  try {
    await fn();
  } catch (err) {
    void reportActionError(what, err);
  }
}

/**
 * Execute a bridge request with progress indicator.
 * Sets operationInProgress=true immediately, resets on completion.
 * Minimum display time of 1s to ensure the animation is visible.
 */
export async function bridgeWithProgress(
  command: CommandType,
  params?: Record<string, unknown>,
): Promise<unknown> {
  const { usePanelStore } = await import("../store/panel-store");
  usePanelStore.setState({ operationInProgress: true });
  const start = Date.now();
  try {
    const result = await bridge.request(command, params);
    const elapsed = Date.now() - start;
    if (elapsed < 1000) {
      await new Promise((r) => setTimeout(r, 1000 - elapsed));
    }
    return result;
  } finally {
    usePanelStore.setState({ operationInProgress: false });
  }
}

export type {
  Bridge,
  EventMessage,
  RequestMessage,
  ResponseMessage,
} from "./types";
