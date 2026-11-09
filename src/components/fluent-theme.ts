// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import {
  createDarkTheme,
  createLightTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";

const brand: BrandVariants = {
  10: "#140b24",
  20: "#1c0f33",
  30: "#241344",
  40: "#2d1855",
  50: "#361d66",
  60: "#402277",
  70: "#4a2888",
  80: "#643fb2",
  90: "#7048c4",
  100: "#7d52d6",
  110: "#8a5de6",
  120: "#9869ec",
  130: "#a676f1",
  140: "#b484f5",
  150: "#c293f8",
  160: "#d1a3fb",
};

/**
 * Foundry-themed Fluent UI v9 theme.
 *
 * The token values point at the app's Foundry CSS variables so Fluent controls
 * pick up the same dark/light palette, radii and typography as the rest of the
 * product. The brand ramp above is only a fallback for tokens we do not
 * override explicitly.
 */
export function foundryFluentTheme(mode: "dark" | "light"): Theme {
  const base = mode === "dark" ? createDarkTheme(brand) : createLightTheme(brand);
  return {
    ...base,
    fontFamilyBase: "var(--font)",
    fontFamilyMonospace: "var(--mono)",
    colorNeutralForeground1: "var(--fg-1)",
    colorNeutralForeground2: "var(--fg-2)",
    colorNeutralForeground3: "var(--fg-3)",
    colorNeutralForegroundDisabled: "var(--fg-disabled)",
    colorNeutralBackground1: "var(--bg)",
    colorNeutralBackground2: "var(--bg-2)",
    colorNeutralBackground3: "var(--bg-3)",
    colorNeutralBackground4: "var(--surface-plate)",
    colorNeutralBackground5: "var(--surface-card)",
    colorNeutralBackground1Hover: "var(--bg-hover)",
    colorNeutralBackground1Pressed: "var(--bg-hover)",
    colorNeutralBackground1Selected: "var(--bg-2)",
    colorNeutralForegroundOnBrand: "var(--on-brand-fg)",
    colorNeutralCardBackground: "var(--surface-card)",
    colorNeutralCardBackgroundHover: "var(--surface-card-hover)",
    colorNeutralCardBackgroundPressed: "var(--surface-card)",
    colorNeutralCardBackgroundSelected: "var(--brand-tint)",
    colorNeutralStroke1: "var(--stroke-1)",
    colorNeutralStroke2: "var(--stroke-2)",
    colorNeutralStroke3: "var(--stroke-3)",
    colorNeutralStroke4: "var(--stroke-4)",
    colorNeutralStrokeAccessible: "var(--stroke-1)",
    colorNeutralStrokeDisabled: "var(--stroke-4)",
    colorBrandBackground: "var(--brand)",
    colorBrandBackgroundHover: "var(--brand-hover)",
    colorBrandBackgroundPressed: "var(--brand-pressed)",
    colorBrandBackgroundSelected: "var(--brand-selected)",
    colorBrandForeground1: "var(--brand-stroke)",
    colorBrandForeground2: "var(--brand-stroke)",
    colorBrandForegroundLink: "var(--link-fg)",
    colorBrandForegroundLinkHover: "var(--link-fg-hover)",
    colorBrandForegroundLinkPressed: "var(--brand-pressed)",
    colorBrandForegroundLinkSelected: "var(--brand-stroke)",
    colorBrandStroke1: "var(--brand-stroke)",
    colorBrandStroke2: "var(--brand-stroke)",
    colorBrandBackground2: "var(--brand-tint)",
    colorSubtleBackgroundHover: "var(--bg-hover)",
    colorSubtleBackgroundPressed: "var(--bg-2)",
    colorSubtleBackgroundSelected: "var(--bg-3)",
    colorTransparentBackground: "transparent",
    colorTransparentStroke: "transparent",
    colorStrokeFocus1: "var(--brand-stroke)",
    colorStrokeFocus2: "var(--brand-stroke)",
    colorStatusSuccessForeground1: "var(--success)",
    colorStatusWarningForeground1: "var(--warning)",
    colorStatusDangerForeground1: "var(--danger)",
  };
}
