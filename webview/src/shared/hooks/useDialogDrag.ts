import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

/** Gap kept between a dragged dialog and the edges of the area holding it. */
const DRAG_MARGIN = 4;

function clamp(value: number, min: number, max: number): number {
  // A dialog can be bigger than the area it sits in (a tall form in a short
  // panel), and then there is no legal range at all: stay put.
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

/**
 * True for anything a pointer-down should interact with rather than drag the
 * dialog by: form controls, buttons, and the searchable select (whose dropdown
 * closes on outside pointer-down, so a drag must not start on it).
 */
function isInteractive(target: EventTarget | null): boolean {
  return (
    target instanceof Element &&
    target.closest(
      "input, button, select, textarea, a, label, .ss-select-root",
    ) !== null
  );
}

export interface DialogDrag {
  /** Attach to the dialog card itself. */
  ref: RefObject<HTMLDivElement | null>;
  /** Apply to the dialog card: offset plus the matching cursor. */
  style: CSSProperties;
  /** Spread onto the dialog card. */
  handlers: {
    onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerMove: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerUp: (e: ReactPointerEvent<HTMLDivElement>) => void;
    onPointerCancel: (e: ReactPointerEvent<HTMLDivElement>) => void;
  };
}

/**
 * Makes a dialog draggable by any blank area of the card, constrained to the
 * area that contains it. Both dialogs live inside a webview, which is an
 * iframe, so "the area" is the iframe viewport — exactly the panel. The drag is
 * therefore clamped by geometry, not by guesswork, and a resize re-clamps
 * because the panel can shrink under an open dialog.
 *
 * Pointer-downs on interactive elements are ignored, so dragging never steals a
 * click from an input or a button.
 */
export function useDialogDrag(): DialogDrag {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const gesture = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    minDx: number;
    maxDx: number;
    minDy: number;
    maxDy: number;
  } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || isInteractive(e.target)) return;
    const dialog = ref.current;
    const area = dialog?.parentElement;
    if (!dialog || !area) return;

    const box = dialog.getBoundingClientRect();
    const bounds = area.getBoundingClientRect();
    gesture.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      originX: offset.x,
      originY: offset.y,
      minDx: bounds.left - box.left + DRAG_MARGIN,
      maxDx: bounds.right - box.right - DRAG_MARGIN,
      minDy: bounds.top - box.top + DRAG_MARGIN,
      maxDy: bounds.bottom - box.bottom - DRAG_MARGIN,
    };
    dialog.setPointerCapture(e.pointerId);
    setDragging(true);
    e.preventDefault();
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    setOffset({
      x: g.originX + clamp(e.clientX - g.startX, g.minDx, g.maxDx),
      y: g.originY + clamp(e.clientY - g.startY, g.minDy, g.maxDy),
    });
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (gesture.current?.pointerId !== e.pointerId) return;
    gesture.current = null;
    setDragging(false);
    ref.current?.releasePointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    if (offset.x === 0 && offset.y === 0) return;
    const onResize = () => {
      const dialog = ref.current;
      const area = dialog?.parentElement;
      if (!dialog || !area) return;
      const box = dialog.getBoundingClientRect();
      const bounds = area.getBoundingClientRect();
      setOffset((current) => ({
        x: clamp(
          current.x,
          current.x + bounds.left - box.left + DRAG_MARGIN,
          current.x + bounds.right - box.right - DRAG_MARGIN,
        ),
        y: clamp(
          current.y,
          current.y + bounds.top - box.top + DRAG_MARGIN,
          current.y + bounds.bottom - box.bottom - DRAG_MARGIN,
        ),
      }));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [offset.x, offset.y]);

  return {
    ref,
    style: {
      transform: `translate(${offset.x}px, ${offset.y}px)`,
      cursor: dragging ? "grabbing" : "grab",
    },
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}
