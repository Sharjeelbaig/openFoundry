import {
  createLightTheme,
  type BrandVariants,
  type Theme,
} from "@fluentui/react-components";

/**
 * Copper is the accent already used by the app icon. Everything else comes from
 * Fluent's alias tokens, so contrast and dark-mode-safe values stay stock.
 * The 80 stop is the one Fluent uses for `colorBrandBackground` in the light
 * theme. #B25121 gives white text a contrast ratio of 5.13:1.
 */
const copper: BrandVariants = {
  10: "#2A1206",
  20: "#3D1A09",
  30: "#52230C",
  40: "#662C10",
  50: "#7B3614",
  60: "#8F4018",
  70: "#A04A1C",
  80: "#B25121",
  90: "#BE6133",
  100: "#C97248",
  110: "#D4845F",
  120: "#DE9778",
  130: "#E7AA92",
  140: "#EFBDAD",
  150: "#F6D1C6",
  160: "#FCE6DE",
};

export const theme: Theme = createLightTheme(copper);
