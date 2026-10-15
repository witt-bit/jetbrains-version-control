import * as fs from "node:fs";
import * as vscode from "vscode";
import { encodePng } from "./png";

/** Git states a file can be painted with; mirror IDEA's File Status Colors. */
export type DecoState =
  | "added"
  | "modified"
  | "deleted"
  | "untracked"
  | "ignored"
  | "conflict";

/** IDEA File Status Color each state refers to, used in color descriptions. */
export const IDEA_LABEL: Record<DecoState, string> = {
  added: "Added",
  modified: "Modified",
  deleted: "Deleted",
  untracked:
    "Unversioned files (IDEA has no dedicated color; falls back to Added)",
  ignored: "Ignored",
  conflict: "Merged with conflicts",
};

/** Fallbacks declared in `contributes.colors`, used when nothing is configured. */
const DEFAULT_COLORS: Record<DecoState, string> = {
  added: "#6bae71",
  modified: "#6da9f8",
  deleted: "#6f737a",
  untracked: "#6bae71",
  ignored: "#a17554",
  conflict: "#de6b66",
};

const FALLBACK = "#808080";

type Rgb = [number, number, number];

/** Parse `#rgb`/`#rrggbb`; returns undefined for anything else. */
export function parseHex(value: string | undefined): Rgb | undefined {
  if (!value) return undefined;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(value.trim());
  if (short) {
    return [
      parseInt(short[1] + short[1], 16),
      parseInt(short[2] + short[2], 16),
      parseInt(short[3] + short[3], 16),
    ];
  }
  const long = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (!long) return undefined;
  return [
    parseInt(long[1].slice(0, 2), 16),
    parseInt(long[1].slice(2, 4), 16),
    parseInt(long[1].slice(4, 6), 16),
  ];
}

/**
 * `workbench.colorCustomizations` as a flat map.
 *
 * Theme-scoped entries (`"[Dark+]": { ... }`) are flattened in, but a top-level
 * value always wins over a scoped one, mirroring how VS Code merges them.
 */
function readColorCustomizations(): Record<string, string> {
  const resource = vscode.window.activeTextEditor?.document.uri;
  const config = resource
    ? vscode.workspace.getConfiguration("workbench", resource)
    : vscode.workspace.getConfiguration("workbench");
  const raw = config.get<Record<string, unknown>>("colorCustomizations") ?? {};

  const flat: Record<string, string> = {};
  const nested: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      flat[key] = value;
    } else if (value && typeof value === "object") {
      for (const [innerKey, innerValue] of Object.entries(
        value as Record<string, unknown>,
      )) {
        if (typeof innerValue === "string" && !nested[innerKey]) {
          nested[innerKey] = innerValue;
        }
      }
    }
  }
  for (const key of Object.keys(nested)) {
    flat[key] ??= nested[key] as string;
  }
  return flat;
}

/**
 * The color for a state: what the user configured, else the declared default.
 *
 * Reading `colorCustomizations` is the only way for an extension to learn a
 * configured color — `ThemeColor` is a reference and VS Code exposes no API for
 * resolving one, so the Explorer color (a ThemeColor) and the gutter bars
 * (drawn pixels) both have to source it here.
 */
export function readStateColor(state: DecoState): string {
  const configured = readColorCustomizations()[`jgc.decoration.${state}`];
  return configured && parseHex(configured)
    ? configured
    : DEFAULT_COLORS[state];
}

export function readStateRgb(state: DecoState): Rgb {
  return (
    parseHex(readStateColor(state)) ?? parseHex(FALLBACK) ?? [128, 128, 128]
  );
}

/** Gutter bar geometry, in pixels. */
const BAR_WIDTH = 8;
const BAR_HEIGHT = 24;
const SHORT_RATIO = 0.4;

const GUTTER_STATES: { state: GutterState; file: string }[] = [
  { state: "added", file: "added.png" },
  { state: "modified", file: "modified.png" },
  { state: "deleted", file: "deleted.png" },
];

export type GutterState = "added" | "modified" | "deleted";

/**
 * Writes the gutter bar icons into an extension-owned folder and serves them as
 * file URIs. Callers must `load()` again after a color or theme change, which
 * rewrites the files; the owning decoration types are then rebuilt against the
 * new URIs.
 */
export class GutterIcons implements vscode.Disposable {
  private readonly uris = new Map<GutterState, vscode.Uri>();

  constructor(private readonly dir: vscode.Uri) {}

  async load(): Promise<void> {
    fs.mkdirSync(this.dir.fsPath, { recursive: true });
    this.uris.clear();
    for (const { state, file } of GUTTER_STATES) {
      const rgb = readStateRgb(state);
      const buf = state === "deleted" ? shortBarPng(rgb, "top") : barPng(rgb);
      const target = vscode.Uri.joinPath(this.dir, file);
      await vscode.workspace.fs.writeFile(target, new Uint8Array(buf));
      this.uris.set(state, target);
    }
  }

  uri(state: GutterState): vscode.Uri | undefined {
    return this.uris.get(state);
  }

  dispose(): void {
    this.uris.clear();
  }
}

function barPng([r, g, b]: Rgb): Buffer {
  return encodePng(BAR_WIDTH, BAR_HEIGHT, () => [r, g, b, 255]);
}

/**
 * A bar occupying only the first `SHORT_RATIO` of the height, which sits on the
 * boundary between two lines when attached to the line below a deletion.
 */
function shortBarPng([r, g, b]: Rgb, edge: "top" | "bottom"): Buffer {
  const cut = Math.round(BAR_HEIGHT * SHORT_RATIO);
  return encodePng(BAR_WIDTH, BAR_HEIGHT, (_x, y) =>
    edge === "top"
      ? y < cut
        ? [r, g, b, 255]
        : [0, 0, 0, 0]
      : y >= BAR_HEIGHT - cut
        ? [r, g, b, 255]
        : [0, 0, 0, 0],
  );
}
