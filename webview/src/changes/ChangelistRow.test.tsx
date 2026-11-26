import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ChangelistRow } from "./ChangelistRow";

afterEach(cleanup);

describe("ChangelistRow", () => {
  const row = (props: Partial<Parameters<typeof ChangelistRow>[0]> = {}) =>
    render(
      <ChangelistRow
        depth={0}
        label="Feature"
        count={3}
        active={false}
        collapsed={false}
        onToggle={() => {}}
        {...props}
      />,
    );

  it("shows the name and the file count", () => {
    const { container } = row();

    expect(container.querySelector(".changes-dir-name")?.textContent).toBe(
      "Feature",
    );
    expect(container.querySelector(".changes-count")?.textContent).toBe("3");
    expect(container.querySelector(".changes-badge")).toBeNull();
  });

  it("shows a count of 0 for an empty list", () => {
    const { container } = row({ count: 0 });

    expect(container.querySelector(".changes-count")?.textContent).toBe("0");
  });

  it("marks the active list", () => {
    const { container } = row({ active: true });

    expect(container.querySelector(".changes-badge")?.textContent).toBe(
      "Active",
    );
  });
});
