import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Commit } from "../types/git";
import { usePanelStore } from "./panel-store";

const mockRequest = vi.fn();
const mockReportError = vi.fn();
vi.mock("../bridge", () => ({
  bridge: {
    request: (...args: unknown[]) => mockRequest(...args),
    onEvent: () => () => {},
  },
  reportActionError: (...args: unknown[]) => mockReportError(...args),
}));

const initialState = usePanelStore.getState();
const TOTAL = 450;

function makeCommit(i: number): Commit {
  return {
    hash: `c${i}`,
    shortHash: `c${i}`,
    parents: [`c${i + 1}`],
    authorName: "Dev",
    authorEmail: "dev@example.com",
    authorDate: "2024-01-01T00:00:00Z",
    subject: `Msg ${i}`,
    body: "",
    refs: [],
  };
}

const allCommits = Array.from({ length: TOTAL }, (_, i) => makeCommit(i));

interface Params {
  search?: string;
  matchCase?: boolean;
  regex?: boolean;
  file?: string;
  branch?: string;
}

/** What the host's `git log` would list: commit i touches a file when i % 10 === 0. */
function listed(params: Params): Commit[] {
  return allCommits.filter((c, i) => {
    if (params.file && i % 10 !== 0) return false;
    if (!params.search) return true;
    const flags = params.matchCase ? "" : "i";
    const pattern = params.regex
      ? params.search
      : params.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(pattern, flags).test(c.subject);
  });
}

function page(commits: Commit[]) {
  return { graphData: { commits, lanes: {} }, snapshot: null };
}

let failGraphDataFor: string | null = null;
const deferred: Array<(commits: Commit[]) => void> = [];
let holdNextGraphData = false;

function fakeHost(command: string, params: Record<string, unknown> = {}) {
  const p = params as Params & {
    maxCount?: number;
    skip?: number;
    count?: number;
    query?: string;
    locate?: boolean;
  };
  switch (command) {
    case "getGraphData": {
      if (failGraphDataFor && p.file === failGraphDataFor) {
        return Promise.reject(
          new Error(`"${p.file}" is outside the repository`),
        );
      }
      const result = listed(p).slice(0, p.maxCount);
      if (holdNextGraphData) {
        holdNextGraphData = false;
        return new Promise((resolve) => {
          deferred.push((commits) => resolve(page(commits)));
        });
      }
      return Promise.resolve(page(result));
    }
    case "loadMoreLog": {
      const skip = p.skip ?? 0;
      return Promise.resolve(
        page(listed(p).slice(skip, skip + (p.count ?? 200))),
      );
    }
    case "resolveLogRef": {
      const hit = allCommits.find((c) => c.hash === p.query);
      if (!hit) {
        return Promise.reject(
          new Error(`"${p.query}" is not a known commit hash, branch or tag`),
        );
      }
      const index = p.locate
        ? listed(p).findIndex((c) => c.hash === hit.hash)
        : null;
      return Promise.resolve({
        hash: hit.hash,
        index: index === -1 ? null : index,
      });
    }
    case "getBranches":
      return Promise.resolve([{ name: "main", isCurrent: true }]);
    default:
      return Promise.resolve([]);
  }
}

function callsOf(command: string): Record<string, unknown>[] {
  return mockRequest.mock.calls
    .filter(([name]) => name === command)
    .map(([, params]) => (params ?? {}) as Record<string, unknown>);
}

const state = () => usePanelStore.getState();

async function settle() {
  await vi.advanceTimersByTimeAsync(1500);
}

beforeEach(async () => {
  vi.useFakeTimers();
  usePanelStore.setState(initialState, true);
  mockRequest.mockReset();
  mockRequest.mockImplementation(fakeHost);
  mockReportError.mockReset();
  failGraphDataFor = null;
  holdNextGraphData = false;
  deferred.length = 0;
  void state().fetchInitialData();
  await settle();
});

describe("host-side log filters", () => {
  it("loads the first page without filter params", () => {
    expect(callsOf("getGraphData")[0]).toEqual({ maxCount: 200 });
    expect(state().commits).toHaveLength(200);
    expect(state().hasMore).toBe(true);
    expect(state().loadedOnce).toBe(true);
  });

  it("re-fetches from the host when the text changes, without the 1 s delay", async () => {
    state().setFilter({ searchQuery: "  msg 4 " });
    await vi.advanceTimersByTimeAsync(10);

    expect(callsOf("getGraphData").at(-1)).toEqual({
      maxCount: 200,
      search: "msg 4",
    });
    expect(state().loading).toBe(false);
    expect(state().commits.map((c) => c.hash)).toEqual(
      listed({ search: "msg 4" })
        .map((c) => c.hash)
        .slice(0, 200),
    );
  });

  it("sends Match Case and Regex only with text", async () => {
    state().setFilter({ matchCase: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(callsOf("getGraphData")).toHaveLength(1);

    state().setFilter({ searchQuery: "msg 1", regex: true });
    await vi.advanceTimersByTimeAsync(10);
    expect(callsOf("getGraphData").at(-1)).toEqual({
      maxCount: 200,
      search: "msg 1",
      matchCase: true,
      regex: true,
    });
  });

  it("keeps text, path and toggles through load-more and refresh", async () => {
    state().setFilter({
      searchQuery: "Msg",
      matchCase: true,
      file: "src/a.ts",
    });
    await settle();
    const params = {
      search: "Msg",
      matchCase: true,
      file: "src/a.ts",
    };
    expect(state().commits).toHaveLength(listed(params).length);

    state().setFilter({ file: "" });
    await settle();
    expect(state().commits).toHaveLength(200);
    await state().loadMore();
    expect(callsOf("loadMoreLog").at(-1)).toMatchObject({
      skip: 200,
      search: "Msg",
      matchCase: true,
    });
    expect(callsOf("loadMoreLog").at(-1)).not.toHaveProperty("file");
    expect(state().commits).toHaveLength(400);

    state().setFilter({ file: "src/a.ts" });
    await settle();
    const refreshed = state().refresh();
    await settle();
    await refreshed;
    expect(callsOf("getGraphData").at(-1)).toEqual({
      maxCount: 200,
      ...params,
    });
  });

  it("marks the end of a short filtered list", async () => {
    state().setFilter({ file: "src/a.ts" });
    await settle();
    expect(state().commits).toHaveLength(45);
    expect(state().hasMore).toBe(false);
  });

  it("drops the response of a filter that was replaced while in flight", async () => {
    holdNextGraphData = true;
    state().setFilter({ searchQuery: "msg 1" });
    await vi.advanceTimersByTimeAsync(10);

    state().setFilter({ searchQuery: "msg 2" });
    await vi.advanceTimersByTimeAsync(10);
    const fresh = state().commits.map((c) => c.hash);

    deferred[0]?.(listed({ search: "msg 1" }));
    await vi.advanceTimersByTimeAsync(10);

    expect(state().commits.map((c) => c.hash)).toEqual(fresh);
    expect(state().commits.every((c) => c.subject.includes("Msg 2"))).toBe(
      true,
    );
  });

  it("does not hit the host for a regex that does not compile", async () => {
    state().setFilter({ searchQuery: "msg 1", regex: true });
    await vi.advanceTimersByTimeAsync(10);
    const before = callsOf("getGraphData").length;
    const shown = state().commits;

    state().setFilter({ searchQuery: "msg (1" });
    await vi.advanceTimersByTimeAsync(10);

    expect(callsOf("getGraphData")).toHaveLength(before);
    expect(state().filter.searchQuery).toBe("msg (1");
    expect(state().commits).toBe(shown);
    expect(state().logParams.search).toBe("msg 1");
  });

  it("reverts the path chip and reports when the host refuses the filter", async () => {
    failGraphDataFor = "../outside";
    state().setFilter({ file: "../outside" });
    await settle();

    expect(mockReportError).toHaveBeenCalledWith(
      "Load Git Log",
      expect.any(Error),
    );
    expect(state().filter.file).toBe("");
    expect(state().logParams).toEqual({});
    expect(state().commits).toHaveLength(200);
    expect(state().loading).toBe(false);
  });

  it("keeps the header mounted when a filter matches nothing", async () => {
    state().setFilter({ searchQuery: "no such message" });
    await settle();
    expect(state().commits).toEqual([]);
    expect(state().loadedOnce).toBe(true);
    expect(state().loading).toBe(false);
  });
});

describe("focusCommit", () => {
  it("pages to a commit deeper than the loaded page in few requests", async () => {
    await state().focusCommit("c350");

    expect(state().selectedCommitHash).toBe("c350");
    expect(state().pendingScrollToHash).toBe("c350");
    expect(callsOf("resolveLogRef")[0]).toEqual({
      query: "c350",
      locate: true,
    });
    expect(callsOf("loadMoreLog")).toHaveLength(1);
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("does not ask the host for a commit that is already loaded", async () => {
    await state().focusCommit("c5");
    expect(state().selectedCommitHash).toBe("c5");
    expect(callsOf("resolveLogRef")).toHaveLength(0);
  });

  it("locates the commit inside the active filters first", async () => {
    state().setFilter({ searchQuery: "Msg", matchCase: true });
    await settle();

    await state().focusCommit("c350");

    expect(callsOf("resolveLogRef")[0]).toEqual({
      query: "c350",
      locate: true,
      search: "Msg",
      matchCase: true,
    });
    expect(state().filter.searchQuery).toBe("Msg");
    expect(state().selectedCommitHash).toBe("c350");
  });

  it("lifts text and path filters that hide the target", async () => {
    state().setFilter({ searchQuery: "msg 1" });
    await settle();
    expect(state().commits.some((c) => c.hash === "c5")).toBe(false);

    await state().focusCommit("c5");

    expect(state().filter.searchQuery).toBe("");
    expect(state().logParams).toEqual({});
    expect(state().selectedCommitHash).toBe("c5");
    expect(mockReportError).not.toHaveBeenCalled();
  });

  it("clears author and date filters that would hide the target", async () => {
    usePanelStore.setState({
      filter: { ...state().filter, author: "Nobody" },
    });
    await state().focusCommit("c5");
    expect(state().filter.author).toBe("");
    expect(state().visibleCommits.some((c) => c.hash === "c5")).toBe(true);
  });

  it("reports a commit the log cannot reach", async () => {
    mockRequest.mockImplementation((command, params) =>
      command === "resolveLogRef"
        ? Promise.resolve({ hash: "x", index: null })
        : fakeHost(command, params),
    );

    await state().focusCommit("deadbeef");

    expect(mockReportError).toHaveBeenCalledWith(
      "Go to commit",
      expect.any(Error),
    );
    expect(state().selectedCommitHash).toBeNull();
  });
});

describe("goToRef", () => {
  it("resolves the ref and selects its commit", async () => {
    await expect(state().goToRef(" c300 ")).resolves.toBe(true);

    expect(callsOf("resolveLogRef")[0]).toEqual({ query: "c300" });
    expect(state().selectedCommitHash).toBe("c300");
  });

  it("reports an unknown ref and leaves the selection alone", async () => {
    await state().selectCommit("c1");
    await expect(state().goToRef("nope")).resolves.toBe(false);

    expect(mockReportError).toHaveBeenCalledWith(
      "Go to Hash/Branch/Tag",
      expect.any(Error),
    );
    expect(state().selectedCommitHash).toBe("c1");
  });

  it("ignores blank input", async () => {
    mockRequest.mockClear();
    await expect(state().goToRef("   ")).resolves.toBe(false);
    expect(mockRequest).not.toHaveBeenCalled();
  });
});
