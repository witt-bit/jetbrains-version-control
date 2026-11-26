import { useState } from "react";
import CodiconGear from "~icons/codicon/gear";
import { bridge, reportActionError, runMenuAction } from "../../shared/bridge";
import {
  ContextMenu,
  ContextMenuHeader,
  ContextMenuItem,
  ContextMenuSeparator,
} from "../../shared/components/ContextMenu";
import "../../shared/components/ContextMenu.css";
import { Tooltip } from "../../shared/components/Tooltip";
import "../../shared/components/Tooltip.css";

type GpgSignMode = "auto" | "always" | "never";

interface CommitOptions {
  signOff: boolean;
  runHooks: boolean;
  gpgSign: GpgSignMode;
  signing: { keyId?: string; enabled: boolean };
}

const GPG_MODES: { mode: GpgSignMode; label: (on: boolean) => string }[] = [
  {
    mode: "auto",
    label: (on) => `Follow Git config (signing ${on ? "on" : "off"})`,
  },
  { mode: "always", label: () => "Always sign" },
  { mode: "never", label: () => "Never sign" },
];

/** The commit options gear: sign-off, Git hooks and GPG signing. */
export function CommitOptionsButton() {
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    options: CommitOptions;
  } | null>(null);

  const open = async (anchor: HTMLElement) => {
    try {
      const options = (await bridge.request(
        "getCommitOptions",
      )) as CommitOptions | null;
      if (!options || typeof options.signOff !== "boolean") return;
      const rect = anchor.getBoundingClientRect();
      setMenu({ x: rect.left, y: rect.bottom + 2, options });
    } catch (err) {
      await reportActionError("Load commit options", err);
    }
  };

  const close = () => setMenu(null);
  const change = (key: string, value: boolean | GpgSignMode) =>
    runMenuAction(close, "Change commit option", () =>
      bridge.request("setCommitOption", { key, value }),
    );

  return (
    <>
      <Tooltip text="Commit options" delay={400}>
        <button
          type="button"
          className="commit-btn commit-ai-btn"
          onClick={(e) => void open(e.currentTarget)}
        >
          <CodiconGear />
        </button>
      </Tooltip>
      {menu && (
        <ContextMenu x={menu.x} y={menu.y} minWidth={220} onClose={close}>
          <ContextMenuItem
            checked={menu.options.signOff}
            onClick={() => change("signOff", !menu.options.signOff)}
          >
            Sign-off Commit
          </ContextMenuItem>
          <ContextMenuItem
            checked={menu.options.runHooks}
            onClick={() => change("runHooks", !menu.options.runHooks)}
          >
            Run Git Hooks
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuHeader>Sign with GPG</ContextMenuHeader>
          {GPG_MODES.map(({ mode, label }) => (
            <ContextMenuItem
              key={mode}
              checked={menu.options.gpgSign === mode}
              onClick={() => change("gpgSign", mode)}
            >
              {label(menu.options.signing.enabled)}
            </ContextMenuItem>
          ))}
          <ContextMenuSeparator />
          <ContextMenuItem
            checked={false}
            onClick={() =>
              runMenuAction(close, "Choose GPG key", () =>
                bridge.request("chooseGpgKey"),
              )
            }
          >
            Choose GPG Key...
          </ContextMenuItem>
        </ContextMenu>
      )}
    </>
  );
}
