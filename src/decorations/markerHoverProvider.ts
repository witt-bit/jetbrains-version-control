import * as vscode from "vscode";
import type { GutterMarkers } from "./gutterMarkers";
import { blockAtLine, buildCard } from "./markerCard";
import { hoverFor } from "./markerHover";

/**
 * Serves the change-marker hover cards: hovering anywhere on a changed line
 * returns the card for the block that line belongs to.
 *
 * A hover provider instead of decoration `hoverMessage` — the decoration one
 * proved unreliable next to the blame annotations, and providers are the
 * standard dynamic mechanism. The card itself is cheap: the diff underneath
 * the gutter already ran, and `HEAD` content is cached.
 */
export function registerMarkerHoverProvider(
  markers: () => GutterMarkers | undefined,
  log?: (message: string) => void,
): vscode.Disposable {
  return vscode.languages.registerHoverProvider(
    { scheme: "file" },
    {
      async provideHover(document, position) {
        const controller = markers();
        if (!controller) return undefined;

        const peek = await controller.peekDoc(document);
        if (!peek || peek.blocks.length === 0) return undefined;

        const block = blockAtLine(peek.blocks, position.line);
        if (!block) return undefined;

        log?.(
          `marker hover: ${document.uri.fsPath} line ${position.line + 1} -> block ` +
            `${block.curStart + 1}-${block.curStart + Math.max(block.curCount, 1)}`,
        );

        const endLine =
          block.curCount > 0
            ? block.curStart + block.curCount - 1
            : block.curStart;
        const range = new vscode.Range(
          block.curStart,
          0,
          Math.min(endLine, document.lineCount - 1),
          0,
        );
        return new vscode.Hover(
          hoverFor(buildCard(block, peek.base ?? [], peek.now), document.uri),
          range,
        );
      },
    },
  );
}
