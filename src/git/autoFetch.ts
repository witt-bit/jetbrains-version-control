/**
 * Auto-fetch: a periodic background `git fetch` of every repository.
 *
 * Vscode-free on purpose: the timer is injected, so the scheduling rules
 * (skip while busy, never overlap, restart only on a real change, stop on
 * dispose) are unit-tested with a fake clock.
 */

import type { FetchOptions } from "./fetchOptions.ts";

export interface TimerApi {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export const systemTimers: TimerApi = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as NodeJS.Timeout),
};

/** What a single tick did. */
export type TickOutcome = "ran" | "failed" | "skipped-busy" | "skipped-running";

export interface AutoFetchSchedulerOptions {
  /** True while another operation is using the repositories; the tick is skipped. */
  isBusy: () => boolean;
  /** One fetch pass over the repositories. */
  runPass: () => Promise<void>;
  /** A failed pass must never surface as a popup: the host just logs it. */
  onError?: (err: unknown) => void;
  timers?: TimerApi;
}

const MS_PER_MINUTE = 60_000;

export class AutoFetchScheduler {
  private readonly isBusy: () => boolean;
  private readonly runPass: () => Promise<void>;
  private readonly onError: (err: unknown) => void;
  private readonly timers: TimerApi;
  private handle: unknown = undefined;
  private scheduledMinutes = 0;
  private running = false;
  private disposed = false;

  constructor(options: AutoFetchSchedulerOptions) {
    this.isBusy = options.isBusy;
    this.runPass = options.runPass;
    this.onError = options.onError ?? (() => {});
    this.timers = options.timers ?? systemTimers;
  }

  /** True while the timer is armed. */
  get active(): boolean {
    return this.handle !== undefined;
  }

  /**
   * Apply the settings. The timer is only replaced when the interval really
   * changed, so an unrelated settings edit does not push the next fetch back.
   */
  configure(enabled: boolean, intervalMinutes: number): void {
    if (this.disposed) return;
    if (!enabled) {
      this.stop();
      return;
    }
    if (
      this.handle !== undefined &&
      this.scheduledMinutes === intervalMinutes
    ) {
      return;
    }
    this.stop();
    this.scheduledMinutes = intervalMinutes;
    this.handle = this.timers.setInterval(() => {
      void this.tick();
    }, intervalMinutes * MS_PER_MINUTE);
  }

  async tick(): Promise<TickOutcome> {
    if (this.disposed || this.running) return "skipped-running";
    if (this.isBusy()) return "skipped-busy";
    this.running = true;
    try {
      await this.runPass();
      return "ran";
    } catch (err) {
      this.onError(err);
      return "failed";
    } finally {
      this.running = false;
    }
  }

  dispose(): void {
    this.disposed = true;
    this.stop();
  }

  private stop(): void {
    if (this.handle === undefined) return;
    this.timers.clearInterval(this.handle);
    this.handle = undefined;
    this.scheduledMinutes = 0;
  }
}

/** The slice of `GitService` an auto-fetch pass needs. */
export interface AutoFetchTarget {
  readonly root: string;
  isOperationInProgress(): Promise<boolean>;
  fetchAllRemotes(options: Partial<FetchOptions>): Promise<boolean>;
}

export interface AutoFetchPassResult {
  /** Some repository received new refs or tags. */
  changed: boolean;
  /** Repositories left alone because a merge, rebase or similar is waiting. */
  skipped: string[];
  failures: { root: string; error: unknown }[];
}

/**
 * Fetch every repository once. A repository in the middle of a merge or
 * rebase is skipped; a failing one (offline, bad credentials) is recorded and
 * does not stop the others.
 */
export async function runAutoFetchPass(
  targets: readonly AutoFetchTarget[],
  options: Partial<FetchOptions>,
): Promise<AutoFetchPassResult> {
  const result: AutoFetchPassResult = {
    changed: false,
    skipped: [],
    failures: [],
  };
  for (const target of targets) {
    try {
      if (await target.isOperationInProgress()) {
        result.skipped.push(target.root);
        continue;
      }
      if (await target.fetchAllRemotes(options)) result.changed = true;
    } catch (error) {
      result.failures.push({ root: target.root, error });
    }
  }
  return result;
}
