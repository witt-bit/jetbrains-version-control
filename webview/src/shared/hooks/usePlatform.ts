import { useEffect, useState } from "react";

/**
 * The current platform: "macos" | "windows" | "linux" | "other".
 *
 * `navigator.platform` is deprecated but still the simplest reliable signal
 * inside a VS Code webview; `navigator.userAgentData` is not yet available
 * in every webview context.
 */
export function usePlatform(): "macos" | "windows" | "linux" | "other" {
  const [platform, setPlatform] = useState<
    "macos" | "windows" | "linux" | "other"
  >("other");

  useEffect(() => {
    const p = navigator.platform.toLowerCase();
    if (p.includes("mac")) setPlatform("macos");
    else if (p.includes("win")) setPlatform("windows");
    else if (p.includes("linux")) setPlatform("linux");
  }, []);

  return platform;
}
