import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AutoFetchScheduler,
  type AutoFetchTarget,
  runAutoFetchPass,
  type TimerApi,
} from "./autoFetch.ts";

class FakeTimers implements TimerApi {
  nextHandle = 1;
  readonly active = new Map<number, { callback: () => void; ms: number }>();
  created = 0;

  setInterval(callback: () => void, ms: number): unknown {
    const handle = this.nextHandle++;
    this.active.set(handle, { callback, ms });
    this.created++;
    return handle;
  }

  clearInterval(handle: unknown): void {
    this.active.delete(handle as number);
  }

  /** Fire every armed timer once. */
  fire(): void {
    for (const { callback } of [...this.active.values()]) callback();
  }
}

const flush = () => new Promise<void>((resolve) => setImmediate(resolve));

describe("AutoFetchScheduler", () => {
  const make = (overrides: {
    isBusy?: () => boolean;
    runPass?: () => Promise<void>;
    onError?: (err: unknown) => void;
  }) => {
    const timers = new FakeTimers();
    const scheduler = new AutoFetchScheduler({
      isBusy: () => false,
      runPass: async () => {},
      ...overrides,
      timers,
    });
    return { timers, scheduler };
  };

  it("arms one timer at the interval and disarms when disabled", () => {
    const { timers, scheduler } = make({});
    scheduler.configure(true, 15);
    assert.equal(scheduler.active, true);
    assert.deepEqual(
      [...timers.active.values()].map((t) => t.ms),
      [900_000],
    );

    scheduler.configure(false, 15);
    assert.equal(scheduler.active, false);
    assert.equal(timers.active.size, 0);
  });

  it("keeps the timer when nothing relevant changed, replaces it on a new interval", () => {
    const { timers, scheduler } = make({});
    scheduler.configure(true, 15);
    scheduler.configure(true, 15);
    assert.equal(timers.created, 1, "same settings must not reset the clock");

    scheduler.configure(true, 5);
    assert.equal(timers.created, 2);
    assert.equal(timers.active.size, 1, "the old timer is cleared");
    assert.deepEqual(
      [...timers.active.values()].map((t) => t.ms),
      [300_000],
    );
  });

  it("runs a pass on each timer firing", async () => {
    let passes = 0;
    const { timers, scheduler } = make({
      runPass: async () => {
        passes++;
      },
    });
    scheduler.configure(true, 1);
    timers.fire();
    await flush();
    timers.fire();
    await flush();
    assert.equal(passes, 2);
  });

  it("skips the tick while another operation is running", async () => {
    let busy = true;
    let passes = 0;
    const { scheduler } = make({
      isBusy: () => busy,
      runPass: async () => {
        passes++;
      },
    });
    assert.equal(await scheduler.tick(), "skipped-busy");
    assert.equal(passes, 0);

    busy = false;
    assert.equal(await scheduler.tick(), "ran");
    assert.equal(passes, 1);
  });

  it("never overlaps two passes", async () => {
    let release: () => void = () => {};
    let passes = 0;
    const { scheduler } = make({
      runPass: () => {
        passes++;
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    const first = scheduler.tick();
    assert.equal(await scheduler.tick(), "skipped-running");
    release();
    assert.equal(await first, "ran");
    assert.equal(passes, 1);

    const second = scheduler.tick();
    release();
    assert.equal(await second, "ran");
    assert.equal(passes, 2);
  });

  it("reports a failing pass to onError and keeps going", async () => {
    const errors: unknown[] = [];
    let fail = true;
    const { scheduler } = make({
      runPass: async () => {
        if (fail) throw new Error("offline");
      },
      onError: (err) => errors.push(err),
    });
    assert.equal(await scheduler.tick(), "failed");
    assert.equal(errors.length, 1);
    assert.match(String(errors[0]), /offline/);

    fail = false;
    assert.equal(await scheduler.tick(), "ran");
  });

  it("stops for good once disposed", async () => {
    let passes = 0;
    const { timers, scheduler } = make({
      runPass: async () => {
        passes++;
      },
    });
    scheduler.configure(true, 1);
    scheduler.dispose();
    assert.equal(timers.active.size, 0);
    assert.equal(scheduler.active, false);

    scheduler.configure(true, 1);
    assert.equal(timers.active.size, 0, "configure after dispose is a no-op");
    assert.equal(await scheduler.tick(), "skipped-running");
    assert.equal(passes, 0);
  });
});

describe("runAutoFetchPass", () => {
  const target = (
    root: string,
    behaviour: {
      inProgress?: boolean;
      changed?: boolean;
      error?: Error;
    } = {},
  ): AutoFetchTarget & { fetches: number } => ({
    root,
    fetches: 0,
    async isOperationInProgress() {
      return behaviour.inProgress ?? false;
    },
    async fetchAllRemotes() {
      this.fetches++;
      if (behaviour.error) throw behaviour.error;
      return behaviour.changed ?? false;
    },
  });

  it("reports a change only when some repository received something", async () => {
    const quiet = await runAutoFetchPass([target("/a"), target("/b")], {});
    assert.deepEqual(quiet, { changed: false, skipped: [], failures: [] });

    const busy = await runAutoFetchPass(
      [target("/a"), target("/b", { changed: true })],
      {},
    );
    assert.equal(busy.changed, true);
  });

  it("skips a repository in the middle of a merge or rebase without fetching it", async () => {
    const midRebase = target("/mid", { inProgress: true, changed: true });
    const result = await runAutoFetchPass([midRebase], {});
    assert.deepEqual(result.skipped, ["/mid"]);
    assert.equal(midRebase.fetches, 0);
    assert.equal(result.changed, false);
  });

  it("isolates a failing repository", async () => {
    const boom = new Error("auth");
    const after = target("/ok", { changed: true });
    const result = await runAutoFetchPass(
      [target("/bad", { error: boom }), after],
      {},
    );
    assert.deepEqual(result.failures, [{ root: "/bad", error: boom }]);
    assert.equal(after.fetches, 1, "later repositories are still fetched");
    assert.equal(result.changed, true);
  });

  it("passes the fetch options through", async () => {
    let seen: unknown;
    await runAutoFetchPass(
      [
        {
          root: "/a",
          isOperationInProgress: async () => false,
          fetchAllRemotes: async (options) => {
            seen = options;
            return false;
          },
        },
      ],
      { prune: true, tagsMode: "noTags" },
    );
    assert.deepEqual(seen, { prune: true, tagsMode: "noTags" });
  });
});
