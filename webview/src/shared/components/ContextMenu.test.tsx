import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import {
  CONTEXT_MENU_Z_INDEX,
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

/**
 * Regression: the menu used to carry no z-index at all. Portalling a
 * `position: fixed` node to `document.body` does not beat a plain
 * `z-index: auto` sibling, so the CommitList header (`position: relative;
 * z-index: 3`) painted over an open menu — the row bled through it and its
 * column-resize handles still took the cursor.
 */
describe("ContextMenu stacking", () => {
  it("sets a z-index on the portal root", () => {
    renderMenu(<ContextMenuItem onClick={() => {}}>Only item</ContextMenuItem>);

    const menu = document.querySelector<HTMLElement>(".jgc-context-menu");
    expect(menu?.style.zIndex).toBe(String(CONTEXT_MENU_Z_INDEX));
  });

  it("out-ranks panel chrome and stays below dialogs", () => {
    // Panel chrome tops out at 10000 (the panel progress bar) and the commit
    // list header uses 3. Dialogs sit at 99999 and above; they only ever open
    // once the menu has already closed.
    expect(CONTEXT_MENU_Z_INDEX).toBeGreaterThan(10000);
    expect(CONTEXT_MENU_Z_INDEX).toBeLessThan(99999);
  });
});
