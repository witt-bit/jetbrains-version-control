import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface SetupScriptResult {
  /** False only when the script could not be started at all. */
  started: boolean;
  ok: boolean;
  /** Combined stdout/stderr tail, for the notification when it fails. */
  output: string;
}

const MAX_OUTPUT = 4000;

function tail(text: string): string {
  const trimmed = text.trim();
  return trimmed.length > MAX_OUTPUT ? trimmed.slice(-MAX_OUTPUT) : trimmed;
}

/**
 * Runs the worktree setup script once, with the new worktree path as its only
 * argument and the new worktree as the working directory.
 *
 * A failing script never fails the worktree: the caller keeps the worktree and
 * only reports the problem. The same is true when the script cannot be started
 * (missing interpreter, no execute bit) — that is reported, not thrown.
 */
export async function runSetupScript(
  scriptPath: string,
  worktreePath: string,
): Promise<SetupScriptResult> {
  try {
    const { stdout, stderr } = await execFileAsync(scriptPath, [worktreePath], {
      cwd: worktreePath,
      maxBuffer: 10 * 1024 * 1024,
      // Never let a script hang on interactive input during creation.
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return { started: true, ok: true, output: tail(stdout + stderr) };
  } catch (err) {
    const error = err as NodeJS.ErrnoException & {
      stdout?: string;
      stderr?: string;
    };
    // ENOENT / EACCES mean nothing ran; anything else means it ran and failed.
    const started = error.code !== "ENOENT" && error.code !== "EACCES";
    return {
      started,
      ok: false,
      output: tail(
        [error.stdout ?? "", error.stderr ?? "", error.message]
          .filter(Boolean)
          .join("\n"),
      ),
    };
  }
}
