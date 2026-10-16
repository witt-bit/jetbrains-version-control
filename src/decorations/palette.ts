import * as vscode from "vscode";
import { parseHex } from "./png";

/** Git states a file can be painted with; mirror IDEA's File Status Colors. */
export type DecoState =
  | "added"
  | "modified"
  | "deleted"
  | "untracked"
  | "ignored"
  | "conflict";

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

export type GutterState = "added" | "modified" | "deleted";
