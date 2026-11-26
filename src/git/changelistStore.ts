/**
 * Persistence for changelists: one small JSON file per worktree.
 *
 * The file lives in the git dir (`git rev-parse --git-path`), so it is never
 * part of the working tree, never shows up in `git status`, and a linked
 * worktree gets its own lists instead of sharing the main checkout's.
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  type ChangelistResult,
  type ChangelistState,
  createDefaultState,
  parseState,
  serializeState,
} from "./changelists.ts";

export const CHANGELIST_FILE_NAME = "jgc-changelists.json";

export class ChangelistStore {
  private readonly file: string;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: string) {
    this.file = file;
  }

  get filePath(): string {
    return this.file;
  }

  /** The stored state, or the default one when the file is missing or unreadable. */
  async read(): Promise<ChangelistState> {
    let text: string;
    try {
      text = await fs.readFile(this.file, "utf8");
    } catch {
      return createDefaultState();
    }
    try {
      return parseState(JSON.parse(text));
    } catch {
      return createDefaultState();
    }
  }

  /**
   * Apply a change under the store's lock. The state is written only when the
   * change returns a different object, so a no-op never touches the disk.
   */
  update<R extends ChangelistResult>(
    change: (state: ChangelistState) => R,
  ): Promise<R> {
    const run = this.queue.then(async () => {
      const before = await this.read();
      const result = change(before);
      if (result.ok && result.state !== before) await this.write(result.state);
      return result;
    });
    // A failed write must not wedge every later update.
    this.queue = run.catch(() => undefined);
    return run;
  }

  /**
   * Reconcile or prune without a user-facing result: returns the state the
   * caller should render, writing only when it changed.
   */
  transform(
    change: (state: ChangelistState) => ChangelistState,
  ): Promise<ChangelistState> {
    const run = this.queue.then(async () => {
      const before = await this.read();
      const after = change(before);
      if (after !== before) await this.write(after);
      return after;
    });
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async write(state: ChangelistState): Promise<void> {
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    await fs.writeFile(
      tmp,
      `${JSON.stringify(serializeState(state), null, 2)}\n`,
    );
    try {
      await fs.rename(tmp, this.file);
    } catch (error) {
      await fs.rm(tmp, { force: true });
      throw error;
    }
  }
}
