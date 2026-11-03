import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  ContextMenu,
  ContextMenuItem,
  ContextMenuSeparator,
} from "./ContextMenu";

function renderMenu(children: React.ReactNode) {
  return render(
    <ContextMenu x={10} y={10} onClose={() => {}}>
      {children}
    </ContextMenu>,
  );
}

afterEach(cleanup);

describe("ContextMenu icon column", () => {
  it("omits the icon column when no item has an icon", () => {
    renderMenu(
      <>
        <ContextMenuItem onClick={() => {}}>Edit Remote</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={() => {}}>Remove Remote</ContextMenuItem>
      </>,
    );

    expect(document.querySelectorAll(".jgc-context-menu-icon")).toHaveLength(0);
    expect(document.querySelectorAll(".jgc-context-menu-item")).toHaveLength(2);
  });

  it("reserves the icon column for every row when at least one has an icon", () => {
    renderMenu(
      <>
        <ContextMenuItem onClick={() => {}} icon={<svg />}>
          With icon
        </ContextMenuItem>
        <ContextMenuItem onClick={() => {}}>Without icon</ContextMenuItem>
      </>,
    );

    // Both rows keep the span so labels stay left-aligned with each other.
    expect(document.querySelectorAll(".jgc-context-menu-icon")).toHaveLength(2);
  });

  it("detects icons nested in fragments and conditionals", () => {
    const showExtra = true;
    renderMenu(
      <>
        <ContextMenuItem onClick={() => {}}>Plain</ContextMenuItem>
        {showExtra && (
          <ContextMenuItem onClick={() => {}} icon={<svg />}>
            Nested
          </ContextMenuItem>
        )}
      </>,
    );

    expect(document.querySelectorAll(".jgc-context-menu-icon")).toHaveLength(2);
  });

  it("honours an explicit reserveIconColumn={false} override", () => {
    render(
      <ContextMenu x={10} y={10} onClose={() => {}} reserveIconColumn={false}>
        <ContextMenuItem onClick={() => {}} icon={<svg />}>
          Has icon anyway
        </ContextMenuItem>
      </ContextMenu>,
    );

    expect(document.querySelectorAll(".jgc-context-menu-icon")).toHaveLength(0);
  });
});
