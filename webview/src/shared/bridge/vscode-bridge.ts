import type {
  Bridge,
  CommandType,
  EventMessage,
  EventType,
  RequestMessage,
  ResponseMessage,
} from "./types";

declare function acquireVsCodeApi(): {
  postMessage(msg: unknown): void;
  getState(): unknown;
  setState(state: unknown): void;
};

/**
 * Commands that legitimately outlast the default deadline: a commit waits on
 * the user's answer to a pre-commit warning, on Git hooks and on GPG
 * passphrase prompts. A timeout would report failure for a commit that then
 * goes through.
 */
const UNBOUNDED_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  "amendCommit",
  "commitAndPush",
  "commitChanges",
]);

const REQUEST_TIMEOUT_MS = 10_000;
// Pushes can wait on a quick pick or a pull-then-push round trip.
const LONG_RUNNING_TIMEOUT_MS = 10 * 60_000;
const LONG_RUNNING_COMMANDS: ReadonlySet<CommandType> = new Set<CommandType>([
  "deleteBranch",
  "deleteBranchPrompt",
  "executePush",
  "pushAllUpToHere",
  "pushBranch",
]);

export function createVSCodeBridge(): Bridge {
  const vscode = acquireVsCodeApi();
  const pendingRequests = new Map<
    string,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  const eventHandlers = new Set<(event: EventType, data: unknown) => void>();

  window.addEventListener("message", (e: MessageEvent) => {
    const msg = e.data;
    if (msg.type === "response") {
      const resp = msg as ResponseMessage;
      const pending = pendingRequests.get(resp.id);
      if (pending) {
        pendingRequests.delete(resp.id);
        if (resp.success) {
          pending.resolve(resp.data);
        } else {
          pending.reject(new Error(resp.error?.message ?? "Unknown error"));
        }
      }
    } else if (msg.type === "event") {
      const evt = msg as EventMessage;
      for (const h of eventHandlers) {
        h(evt.event, evt.data);
      }
    }
  });

  return {
    request(command, params = {}) {
      return new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timeout = UNBOUNDED_COMMANDS.has(command)
          ? undefined
          : setTimeout(
              () => {
                pendingRequests.delete(id);
                reject(new Error(`Request '${command}' timed out`));
              },
              LONG_RUNNING_COMMANDS.has(command)
                ? LONG_RUNNING_TIMEOUT_MS
                : REQUEST_TIMEOUT_MS,
            );

        pendingRequests.set(id, {
          resolve: (v) => {
            clearTimeout(timeout);
            resolve(v);
          },
          reject: (e) => {
            clearTimeout(timeout);
            reject(e);
          },
        });

        const msg: RequestMessage = { type: "request", id, command, params };
        vscode.postMessage(msg);
      });
    },
    onEvent(handler) {
      eventHandlers.add(handler);
      return () => {
        eventHandlers.delete(handler);
      };
    },
  };
}
