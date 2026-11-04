// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { webDarkTheme, webLightTheme } from "@fluentui/react-components";
import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

/**
 * The chosen mode lives on <html data-theme> so the CSS variables are correct
 * before React hydrates. This hook only mirrors it into React state and writes
 * it back when the user toggles.
 */
export function useThemeMode(): { mode: ThemeMode; toggle: () => void } {
  const [mode, setMode] = useState<ThemeMode>("light");

  useEffect(() => {
    setMode(document.documentElement.dataset.theme === "dark" ? "dark" : "light");
  }, []);

  const toggle = () => {
    const next: ThemeMode = mode === "dark" ? "light" : "dark";
    setMode(next);
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("openfoundry-theme", next);
    } catch {
      // Private mode. The switch still works for this page.
    }
  };

  return { mode, toggle };
}

export function fluentTheme(mode: ThemeMode) {
  return mode === "dark" ? webDarkTheme : webLightTheme;
}
