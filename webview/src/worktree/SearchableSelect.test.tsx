import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  SearchableSelect,
  type SearchableSelectOption,
} from "./SearchableSelect";

/**
 * The New Worktree branch picker is the only caller, and its markers carry all
 * the meaning now that the "(current)" / "remote" / "tag" words are gone: the
 * icon says what the entry is, the dimmed suffix says which worktree already
 * holds that branch. Both were wrong once, so they are pinned here.
 */

afterEach(cleanup);

const OPTIONS: SearchableSelectOption[] = [
  {
    value: "main",
    label: "main",
    icon: <svg data-testid="icon-main" />,
    suffix: "repo-main",
  },
  {
    value: "feature-x",
    label: "feature-x",
    icon: <svg data-testid="icon-b" />,
  },
  { value: "v1.0.0", label: "v1.0.0", suffix: "tag-worktree" },
];

function open() {
  const { container } = render(
    <SearchableSelect
      options={OPTIONS}
      value="main"
      onChange={() => {}}
      selectedSuffix="repo-main"
    />,
  );
  const display = container.querySelector(".ss-select-display");
  if (!display) throw new Error("display box not found");
  fireEvent.click(display);
  return container;
}

describe("SearchableSelect", () => {
  it("shows the selected value's dimmed suffix next to its name", () => {
    const { container } = render(
      <SearchableSelect
        options={OPTIONS}
        value="main"
        onChange={() => {}}
        selectedSuffix="repo-main"
      />,
    );

    const suffix = container.querySelector(".ss-select-display-suffix");
    expect(suffix?.textContent).toBe("repo-main");
    // No parentheses: the name and the worktree are two separate things.
    expect(container.querySelector(".ss-select-display")?.textContent).toBe(
      "mainrepo-main",
    );
  });

  it("omits the suffix when the branch is not checked out anywhere", () => {
    const { container } = render(
      <SearchableSelect
        options={OPTIONS}
        value="feature-x"
        onChange={() => {}}
      />,
    );

    expect(container.querySelector(".ss-select-display-suffix")).toBeNull();
  });

  it("marks every occupied option in the list, not just the selected one", () => {
    const container = open();
    const suffixes = [...container.querySelectorAll(".ss-select-item-suffix")];

    // `main` and the tag are occupied; `feature-x` is not.
    expect(suffixes.map((s) => s.textContent)).toEqual([
      "repo-main",
      "tag-worktree",
    ]);
  });

  it("renders the icon inside each list item and in the display box", () => {
    const container = open();

    // The selected option's icon is drawn twice: display box and list row.
    expect(screen.getAllByTestId("icon-main")).toHaveLength(2);
    // An option that is not selected only appears in the list.
    expect(screen.getAllByTestId("icon-b")).toHaveLength(1);
    expect(
      container.querySelectorAll(".ss-select-item-icon").length,
    ).toBeGreaterThan(0);
    expect(container.querySelector(".ss-select-display-icon")).not.toBeNull();
  });
});
