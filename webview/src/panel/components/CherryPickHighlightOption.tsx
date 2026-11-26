import { useCherryPickStore } from "../../shared/store/cherry-pick-store";

/** "Highlight" section of the Log's view-options menu (the eye button). */
export function CherryPickHighlightOption() {
  const enabled = useCherryPickStore((s) => s.enabled);
  const setEnabled = useCherryPickStore((s) => s.setEnabled);

  return (
    <>
      <div
        style={{
          margin: "4px 0",
          borderTop:
            "1px solid var(--vscode-menu-separatorBackground, #454545)",
        }}
      />
      <div
        style={{
          padding: "4px 12px 6px",
          fontSize: "11px",
          fontWeight: 600,
          opacity: 0.6,
        }}
      >
        Highlight
      </div>
      <div
        role="menuitemcheckbox"
        aria-checked={enabled}
        onClick={() => setEnabled(!enabled)}
        title="Dim commits of the selected branch, tag or commit that are already cherry-picked into the current branch"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "5px 12px",
          fontSize: "12px",
          cursor: "pointer",
          color: "var(--vscode-menu-foreground, #ccc)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "var(--vscode-list-hoverBackground, #2a2d2e)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        <span style={{ width: 16, textAlign: "center", flexShrink: 0 }}>
          {enabled ? "✓" : ""}
        </span>
        <span>Not Cherry-Picked Commits</span>
      </div>
    </>
  );
}
