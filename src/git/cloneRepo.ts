import { execFile, spawn } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** How a failed clone is explained to the user. */
export type CloneFailureKind =
  | "auth"
  | "hostKey"
  | "notFound"
  | "network"
  | "targetExists"
  | "gitMissing"
  | "other";

export class CloneError extends Error {
  kind: CloneFailureKind;
  /** The tail of git's own output, with credentials removed. */
  output: string;

  constructor(kind: CloneFailureKind, message: string, output = "") {
    super(message);
    this.name = "CloneError";
    this.kind = kind;
    this.output = output;
  }
}

export class CloneCancelledError extends Error {
  constructor() {
    super("Clone cancelled");
    this.name = "CloneCancelledError";
  }
}

export interface CloneProgress {
  /** git's phase label, e.g. "Receiving objects". */
  phase: string;
  /** Percentage within the phase; absent for phases git reports without one. */
  percent?: number;
  /** Text after the percentage: counts and transfer rate. */
  detail: string;
  /** Monotonic 0..100 estimate across the whole clone, for a progress bar. */
  overall: number;
}

export interface CloneOptions {
  url: string;
  /** Absolute path of the directory to create (or an existing empty one). */
  targetDir: string;
  recurseSubmodules?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: CloneProgress) => void;
}

const MAX_OUTPUT = 8_000;

/** Phase -> [start, end] of the overall bar. Remote-side phases are not shown. */
const PHASE_RANGES: Record<string, [number, number]> = {
  "Receiving objects": [0, 70],
  "Resolving deltas": [70, 85],
  "Updating files": [85, 100],
  "Checking out files": [85, 100],
};

const PROGRESS_LINE = /^(?:remote: )?([A-Za-z][A-Za-z ]*?):\s+(\d+)%\s*(.*)$/;
const PHASE_ONLY_LINE = /^(?:remote: )?([A-Za-z][A-Za-z ]*?):\s+(.*)$/;

/**
 * One line of `git clone --progress` stderr, e.g.
 * `Receiving objects:  45% (45/100), 1.2 MiB | 2.0 MiB/s`.
 */
export function parseCloneProgress(line: string): CloneProgress | null {
  const text = line.trim();
  if (!text) return null;
  const withPercent = PROGRESS_LINE.exec(text);
  if (withPercent) {
    const phase = withPercent[1] ?? "";
    const percent = Number(withPercent[2]);
    const range = PHASE_RANGES[phase];
    const overall = range
      ? Math.round(range[0] + ((range[1] - range[0]) * percent) / 100)
      : 0;
    return { phase, percent, detail: (withPercent[3] ?? "").trim(), overall };
  }
  const phaseOnly = PHASE_ONLY_LINE.exec(text);
  if (phaseOnly && !/^(fatal|error|warning)$/i.test(phaseOnly[1] ?? "")) {
    return {
      phase: phaseOnly[1] ?? "",
      detail: (phaseOnly[2] ?? "").trim(),
      overall: 0,
    };
  }
  return null;
}

/**
 * Git rewrites progress lines in place with `\r`, so a chunk can hold several
 * lines and end mid-line: the unfinished tail is carried to the next chunk.
 */
export function splitProgressChunk(
  carry: string,
  chunk: string,
): { lines: string[]; rest: string } {
  const parts = (carry + chunk).split(/[\r\n]+/);
  const rest = parts.pop() ?? "";
  return { lines: parts.filter(Boolean), rest };
}

/** The default folder name git would pick for a clone URL. */
export function repoNameFromUrl(url: string): string {
  const segments = url
    .trim()
    .split(/[/\\:]/)
    .filter((part) => part.length > 0);
  const last = segments[segments.length - 1] ?? "";
  const name = last.replace(/\.git$/i, "");
  return name || "repository";
}

/** A problem with the URL the user typed, or undefined when it is acceptable. */
export function cloneUrlProblem(url: string): string | undefined {
  const value = url.trim();
  if (!value) return "Enter a repository URL or path";
  if (value.startsWith("-")) return "A repository URL cannot start with '-'";
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f]/.test(value)) {
    return "A repository URL cannot contain control characters";
  }
  return undefined;
}

/** A problem with the folder name the user typed, or undefined. */
export function cloneNameProblem(name: string): string | undefined {
  const value = name.trim();
  if (!value) return "Enter a folder name";
  if (value === "." || value === "..") return "Enter a real folder name";
  if (/[/\\]/.test(value)) {
    return "The name must not contain path separators";
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: rejecting control characters is the point
  if (/[\u0000-\u001f]/.test(value)) return "Invalid character in the name";
  return undefined;
}

/**
 * Hide secrets in text that may echo a URL: `https://user:token@host/...`
 * becomes `https://***@host/...`. SSH-style users (`ssh://git@host`) carry no
 * secret and stay readable unless they hold a password.
 */
export function redactUrlCredentials(text: string): string {
  return text.replace(
    /\b([a-z][a-z0-9+.-]*:\/\/)([^/@\s]+)@/gi,
    (_match, scheme: string, userInfo: string) => {
      const web = /^(https?|ftps?):\/\//i.test(scheme);
      if (web) return `${scheme}***@`;
      const colon = userInfo.indexOf(":");
      return colon >= 0
        ? `${scheme}${userInfo.slice(0, colon)}:***@`
        : `${scheme}${userInfo}@`;
    },
  );
}

/** The meaningful failure line of git's output, e.g. `fatal: repository … does not exist`. */
function lastFatalLine(output: string): string {
  const lines = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const fatal = [...lines].reverse().find((line) => /^fatal:/i.test(line));
  return fatal ?? lines[lines.length - 1] ?? "";
}

/**
 * The line of a failed git call worth showing a person: execFile errors carry
 * `stderr`, whose last `fatal:`/`error:` line says what happened, while
 * `err.message` is the full command line plus all output. Credentials in URLs
 * are masked.
 */
export function gitFailureMessage(err: unknown): string {
  const stderr = (err as { stderr?: unknown } | null)?.stderr;
  if (typeof stderr === "string" && stderr.trim()) {
    const lines = stderr
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const known = [...lines].reverse().find((l) => /^(fatal|error):/i.test(l));
    return redactUrlCredentials(known ?? lines[lines.length - 1] ?? "");
  }
  return redactUrlCredentials(err instanceof Error ? err.message : String(err));
}

/** Turn git's stderr into a stable category and a message a person can act on. */
export function classifyCloneFailure(stderr: string): {
  kind: CloneFailureKind;
  message: string;
} {
  const detail = redactUrlCredentials(lastFatalLine(stderr));
  const suffix = detail ? ` (${detail})` : "";

  if (
    /terminal prompts disabled|could not read (Username|Password)|unable to get (password|username)|Authentication failed|Permission denied \((publickey|keyboard)|HTTP Basic: Access denied|returned error: (401|403)|invalid credentials/i.test(
      stderr,
    )
  ) {
    return {
      kind: "auth",
      message: `Authentication is required. JGC never asks for passwords while cloning, so set up a Git credential helper or an SSH key for this host and try again${suffix}`,
    };
  }
  if (/host key verification failed/i.test(stderr)) {
    return {
      kind: "hostKey",
      message: `The server's SSH host key is not trusted yet. Connect to it once from a terminal to accept the key, then try again${suffix}`,
    };
  }
  if (/already exists and is not an empty directory/i.test(stderr)) {
    return {
      kind: "targetExists",
      message: `The target folder already exists and is not empty${suffix}`,
    };
  }
  if (
    /repository not found|does not exist|does not appear to be a git repository|returned error: 404|not found/i.test(
      stderr,
    )
  ) {
    return {
      kind: "notFound",
      message: `Repository not found. Check the URL${suffix}`,
    };
  }
  if (
    /could not resolve host|failed to connect|connection (refused|timed out|reset)|network is unreachable|unable to access|early eof|operation timed out/i.test(
      stderr,
    )
  ) {
    return {
      kind: "network",
      message: `Could not reach the server. Check the URL and your network connection${suffix}`,
    };
  }
  return {
    kind: "other",
    message: detail || "git clone failed",
  };
}

/**
 * The `GIT_SSH_COMMAND` that stops ssh from prompting (passphrases, host-key
 * questions), or undefined when the user's own `GIT_SSH` program must stay in
 * charge. An existing command or `core.sshCommand` is kept and extended.
 */
export function batchSshCommand(
  env: Record<string, string | undefined>,
  configuredSshCommand: string | undefined,
): string | undefined {
  const existing = env.GIT_SSH_COMMAND?.trim();
  if (existing) return `${existing} -o BatchMode=yes`;
  if (env.GIT_SSH?.trim()) return undefined;
  const configured = configuredSshCommand?.trim();
  return `${configured || "ssh"} -o BatchMode=yes`;
}

async function readSshCommandConfig(cwd: string): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["config", "--get", "core.sshCommand"],
      { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
    );
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Environment for git processes that must never wait for a person: no
 * terminal or askpass prompt, no credential-manager UI, no ssh prompt.
 * Stored credentials (keychain, credential helpers) still work.
 */
export async function nonInteractiveGitEnv(
  cwd: string,
  base: NodeJS.ProcessEnv = process.env,
): Promise<NodeJS.ProcessEnv> {
  const env: NodeJS.ProcessEnv = {
    ...base,
    LC_ALL: "C",
    GIT_TERMINAL_PROMPT: "0",
    // An empty value (not unset) also overrides core.askPass and SSH_ASKPASS.
    GIT_ASKPASS: "",
    GCM_INTERACTIVE: "never",
  };
  const ssh = batchSshCommand(env, await readSshCommandConfig(cwd));
  if (ssh) env.GIT_SSH_COMMAND = ssh;
  return env;
}

/** A problem that makes `targetDir` unusable for a clone, or undefined. */
export async function cloneTargetProblem(
  targetDir: string,
): Promise<string | undefined> {
  try {
    const stat = await fs.stat(targetDir);
    if (!stat.isDirectory()) return `${targetDir} exists and is not a folder`;
    const entries = await fs.readdir(targetDir);
    if (entries.length > 0) {
      return `${targetDir} already exists and is not empty`;
    }
    return undefined;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw err;
  }
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.stat(target);
    return true;
  } catch {
    return false;
  }
}

/**
 * `git clone --progress`, standalone: needs no repository and no GitService.
 *
 * Resolves with the cloned directory. Rejects with `CloneCancelledError` when
 * `signal` aborts (a directory this call created is removed again) and with a
 * `CloneError` carrying a classified, user-readable message otherwise.
 */
export async function cloneRepository(
  options: CloneOptions,
): Promise<{ directory: string }> {
  const { url, targetDir, signal } = options;
  const urlProblem = cloneUrlProblem(url);
  if (urlProblem) throw new CloneError("other", urlProblem);
  if (signal?.aborted) throw new CloneCancelledError();

  const targetProblem = await cloneTargetProblem(targetDir);
  if (targetProblem) throw new CloneError("targetExists", targetProblem);

  const parent = path.dirname(targetDir);
  await fs.mkdir(parent, { recursive: true });
  const createdByUs = !(await pathExists(targetDir));
  const env = await nonInteractiveGitEnv(parent);
  if (signal?.aborted) throw new CloneCancelledError();

  const args = ["clone", "--progress"];
  if (options.recurseSubmodules) args.push("--recurse-submodules");
  args.push("--", url.trim(), targetDir);

  await new Promise<void>((resolve, reject) => {
    const child = spawn("git", args, {
      cwd: parent,
      env,
      stdio: ["ignore", "ignore", "pipe"],
    });
    let carry = "";
    let output = "";
    let aborted = false;

    const onAbort = () => {
      aborted = true;
      child.kill("SIGTERM");
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    const finish = () => signal?.removeEventListener("abort", onAbort);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      output = (output + chunk).slice(-MAX_OUTPUT);
      const { lines, rest } = splitProgressChunk(carry, chunk);
      carry = rest;
      for (const line of lines) {
        const progress = parseCloneProgress(line);
        if (progress) options.onProgress?.(progress);
      }
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      finish();
      reject(
        err.code === "ENOENT"
          ? new CloneError("gitMissing", "Git was not found on this machine")
          : new CloneError("other", err.message),
      );
    });

    child.on("close", (code) => {
      finish();
      if (aborted) {
        reject(new CloneCancelledError());
      } else if (code === 0) {
        resolve();
      } else {
        const { kind, message } = classifyCloneFailure(output);
        reject(
          new CloneError(kind, message, redactUrlCredentials(output.trim())),
        );
      }
    });

    // Cancelled between the checks above and the process starting.
    if (signal?.aborted) onAbort();
  }).catch(async (err: unknown) => {
    // git removes what it created on failure and on SIGTERM; a hard kill (or
    // Windows, where there is no SIGTERM) can leave the directory behind.
    if (createdByUs) {
      await fs.rm(targetDir, { recursive: true, force: true }).catch(() => {});
    }
    throw err;
  });

  return { directory: targetDir };
}
