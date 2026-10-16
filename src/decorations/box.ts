import * as vscode from "vscode";
import { solidColorPng } from "./png";

let pixelUri: vscode.Uri | undefined;

/**
 * A cached 1×1 fully transparent PNG.
 *
 * Used as the content of a decoration that must occupy space without showing
 * anything. An icon is a replaced element: it contributes no text nodes, so the
 * caret cannot move into it — which `contentText` (even a run of spaces) can do,
 * and which is how the gutter markers used to become reachable with the arrow
 * keys. Together with an explicit width it is a reliable invisible box.
 */
export function transparentPixelUri(): vscode.Uri {
  if (!pixelUri) {
    pixelUri = vscode.Uri.parse(
      `data:image/png;base64,${Buffer.from(solidColorPng(1, 1, "transparent")).toString("base64")}`,
    );
  }
  return pixelUri;
}

/**
 * The CSS that turns a blame attachment into the fixed-width inline block the
 * blame column is built from.
 *
 * Labels and the marker layer's pads share it so a change marker lands on the
 * same column after either of them. The width is what reserves the column; the
 * padding and margin only position the box.
 */
export function blameBoxStyle(maxWidth: number): string {
  return `none; display:inline-block; min-width:${maxWidth}ch; padding:0 0.4ch; margin-right:1ch; cursor:pointer;`;
}

/**
 * An invisible box exactly as wide as the widest blame label, i.e. the space a
 * label would have reserved.
 *
 * Used for the lines the annotation leaves bare (uncommitted lines, lines
 * without blame history) and for the pads the marker layer draws on them. The
 * metrics are the label box's, so both occupy identical horizontal space.
 */
export function blankBlameBox(
  maxWidth: number,
): vscode.ThemableDecorationAttachmentRenderOptions {
  return {
    contentIconPath: transparentPixelUri(),
    width: `${Math.max(maxWidth, 1)}ch`,
    height: "1lh",
    textDecoration: blameBoxStyle(maxWidth),
  };
}
