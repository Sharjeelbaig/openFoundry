// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Card,
  FluentProvider,
  Image,
  Link,
  Popover,
  PopoverSurface,
  PopoverTrigger,
  Skeleton,
  SkeletonItem,
  Spinner,
  Text,
  Toast,
  Toaster,
  makeStyles,
  mergeClasses,
  shorthands,
  tokens,
  useId,
  useToastController,
} from "@fluentui/react-components";
import {
  ArrowDownload20Regular,
  Bot24Regular,
  Chat24Regular,
  Checkmark20Regular,
  Code20Regular,
  Copy20Regular,
  DesktopMac20Regular,
  DocumentSearch24Regular,
  Globe24Regular,
  LockClosed24Regular,
  Navigation20Regular,
  Rocket24Regular,
  WeatherMoon20Regular,
  WeatherSunny20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useState } from "react";
import {
  COMMANDS,
  DEPLOYMENT_MODES,
  DOWNLOAD_URL,
  FAQ,
  FEATURES,
  LINUX_ASSET,
  LINUX_DOWNLOAD_URL,
  LINUX_SHA256,
  LINUX_SIZE_MB,
  NAV,
  REPO,
  REPO_FILES,
  SHA256,
  SIZE_MB,
  SLIDES,
  VERSION,
  WINDOWS_DOWNLOAD_URL,
  WINDOWS_SHA256,
  WINDOWS_SIZE_MB,
} from "./content";
import { fluentTheme, useThemeMode } from "./theme";


const AppleIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701" />
  </svg>
);

const WindowsIcon = () => (
  <svg viewBox="0 0 4875 4875" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M0 0h2311v2310H0zm2564 0h2311v2310H2564zM0 2564h2311v2311H0zm2564 0h2311v2311H2564" />
  </svg>
);

const LinuxIcon = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" aria-hidden="true" focusable="false">
    <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.595-.63.401-1.746.712-2.457 1.57-.618.737-1.37 1.14-2.036 1.191-.664.053-1.237-.2-1.574-.898l-.005-.003c-.21-.4-.12-1.025.056-1.69.176-.668.428-1.344.463-1.897.037-.714.076-1.335.195-1.814.12-.465.308-.797.641-.984l.045-.022zm-10.814.049h.01c.053 0 .105.005.157.014.376.055.706.333 1.023.752l.91 1.664.003.003c.243.533.754 1.064 1.189 1.637.434.598.77 1.131.729 1.57v.006c-.057.744-.48 1.148-1.125 1.294-.645.135-1.52.002-2.395-.464-.968-.536-2.118-.469-2.857-.602-.369-.066-.61-.2-.723-.4-.11-.2-.113-.602.123-1.23v-.004l.002-.003c.117-.334.03-.752-.027-1.118-.055-.401-.083-.71.043-.94.16-.334.396-.4.69-.533.294-.135.64-.202.915-.47h.002v-.002c.256-.268.445-.601.668-.838.19-.201.38-.336.663-.336zm7.159-9.074c-.435.201-.945.535-1.488.535-.542 0-.97-.267-1.28-.466-.154-.134-.28-.268-.373-.335-.164-.134-.144-.333-.074-.333.109.016.129.134.199.2.096.066.215.2.36.333.292.2.68.467 1.167.467.485 0 1.053-.267 1.398-.466.195-.135.445-.334.648-.467.156-.136.149-.267.279-.267.128.016.034.134-.147.332a8.097 8.097 0 01-.69.468zm-1.082-1.583V5.64c-.006-.02.013-.042.029-.05.074-.043.18-.027.26.004.063 0 .16.067.15.135-.006.049-.085.066-.135.066-.055 0-.092-.043-.141-.068-.052-.018-.146-.008-.163-.065zm-.551 0c-.02.058-.113.049-.166.066-.047.025-.086.068-.14.068-.05 0-.13-.02-.136-.068-.01-.066.088-.133.15-.133.08-.031.184-.047.259-.005.019.009.036.03.03.05v.02h.003z" />
  </svg>
);

const YEAR = 2026;

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    backgroundColor: "var(--of-bg)",
    color: "var(--of-text)",
  },
  skip: {
    position: "absolute",
    left: "8px",
    top: "-48px",
    zIndex: 1000,
    ...shorthands.padding("8px", "12px"),
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    textDecorationLine: "none",
    color: tokens.colorNeutralForeground1,
    ":focus": { top: "8px" },
  },
  container: {
    width: "100%",
    maxWidth: "1320px",
    marginInline: "auto",
    ...shorthands.padding("0", "24px"),
  },
  header: {
    position: "sticky",
    top: 0,
    zIndex: 100,
    backgroundColor: tokens.colorNeutralBackground1,
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
  },
  headerInner: {
    display: "flex",
    alignItems: "center",
    columnGap: "24px",
    height: "64px",
  },
  brand: {
    display: "inline-flex",
    alignItems: "center",
    columnGap: "10px",
    textDecorationLine: "none",
    color: "inherit",
    flexShrink: 0,
  },
  brandIcon: { ...shorthands.borderRadius("9px") },
  brandName: { letterSpacing: "-0.015em" },
  nav: {
    display: "none",
    columnGap: "2px",
    "@media (min-width: 980px)": { display: "flex" },
  },
  navLink: {
    ...shorthands.padding("6px", "10px"),
    position: "relative",
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    textDecorationLine: "none",
    whiteSpace: "nowrap",
    ":hover": {
      color: tokens.colorNeutralForeground1,
      "::after": { transform: "scaleX(1)" },
    },
    "::after": {
      content: '""',
      position: "absolute",
      left: "10px",
      right: "10px",
      bottom: "0px",
      height: "2px",
      backgroundColor: tokens.colorNeutralForeground1,
      transform: "scaleX(0)",
      transformOrigin: "left center",
      transitionProperty: "transform",
      transitionDuration: "200ms",
      transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    },
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    columnGap: "8px",
    marginInlineStart: "auto",
  },
  mobileNav: {
    display: "inline-flex",
    "@media (min-width: 980px)": { display: "none" },
  },
  mobileMenu: {
    display: "flex",
    flexDirection: "column",
    rowGap: "4px",
    minWidth: "180px",
    ...shorthands.padding("4px"),
  },
  mobileMenuLink: {
    ...shorthands.padding("8px", "10px"),
    ...shorthands.borderRadius(tokens.borderRadiusMedium),
    color: tokens.colorNeutralForeground1,
    fontSize: tokens.fontSizeBase300,
    textDecorationLine: "none",
    ":hover": {
      backgroundColor: tokens.colorNeutralBackground1Hover,
      textDecorationLine: "none",
    },
  },
  headerDownload: {
    display: "none",
    "@media (min-width: 560px)": { display: "inline-flex" },
  },
  hero: {
    ...shorthands.padding("72px", "0", "80px"),
    backgroundColor: "var(--of-surface-alt)",
    scrollMarginTop: "64px",
  },
  heroCenter: {
    maxWidth: "980px",
    marginInline: "auto",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
  },
  heroTitle: {
    margin: 0,
    maxWidth: "800px",
    fontSize: "clamp(40px, 5.2vw, 62px)",
    fontWeight: tokens.fontWeightMedium,
    letterSpacing: "-0.025em",
    lineHeight: "1.14",
    animationName: "of-fade-in-base",
    animationDuration: "1s",
    animationTimingFunction: "cubic-bezier(0.48, 0.04, 0.16, 1)",
    animationFillMode: "both",
  },
  heroText: {
    display: "block",
    marginTop: "20px",
    maxWidth: "720px",
    color: tokens.colorNeutralForeground2,
    lineHeight: "1.6",
    animationName: "of-fade-in-base",
    animationDuration: "1s",
    animationTimingFunction: "cubic-bezier(0.48, 0.04, 0.16, 1)",
    animationFillMode: "both",
    animationDelay: "100ms",
  },
  heroActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    marginTop: "32px",
    animationName: "of-fade-in-base",
    animationDuration: "1s",
    animationTimingFunction: "cubic-bezier(0.48, 0.04, 0.16, 1)",
    animationFillMode: "both",
    animationDelay: "180ms",
  },
  heroCaption: {
    display: "block",
    marginTop: "12px",
    color: tokens.colorNeutralForeground3,
    textAlign: "center",
    animationName: "of-fade-in-base",
    animationDuration: "1s",
    animationTimingFunction: "cubic-bezier(0.48, 0.04, 0.16, 1)",
    animationFillMode: "both",
    animationDelay: "240ms",
  },
  caption: {
    display: "block",
    marginTop: "12px",
    color: tokens.colorNeutralForeground3,
  },
  heroShotCard: {
    ...shorthands.padding("0"),
    width: "100%",
    marginTop: "56px",
    overflow: "hidden",
    ...shorthands.border("1px", "solid", "var(--of-border)"),
    ...shorthands.borderRadius("8px"),
    backgroundColor: tokens.colorNeutralBackground1,
    animationName: "of-slide-in-bottom",
    animationDuration: "1s",
    animationTimingFunction: "cubic-bezier(0.48, 0.04, 0.16, 1)",
    animationFillMode: "both",
    animationDelay: "200ms",
  },
  heroShot: {
    display: "block",
    width: "100%",
    height: "auto",
  },
  section: {
    ...shorthands.padding("80px", "0"),
    scrollMarginTop: "64px",
  },
  sectionAlt: { backgroundColor: "var(--of-surface-alt)" },
  sectionHead: { maxWidth: "820px", marginBottom: "48px" },
  sectionTitle: {
    display: "block",
    margin: 0,
    letterSpacing: "-0.02em",
    lineHeight: "1.16",
  },
  sectionText: {
    display: "block",
    marginTop: "16px",
    color: tokens.colorNeutralForeground2,
    lineHeight: "1.6",
  },
  grid3: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(340px, 100%), 1fr))",
    gap: "20px",
  },
  card: {
    ...shorthands.padding("24px"),
    rowGap: "12px",
    height: "100%",
    ...shorthands.border("1px", "solid", "var(--of-border)"),
    ...shorthands.borderRadius("8px"),
    backgroundColor: "var(--of-bg)",
  },
  iconTile: {
    width: "32px",
    height: "32px",
    display: "grid",
    placeItems: "center",
    color: tokens.colorNeutralForeground1,
    backgroundColor: "transparent",
  },
  muted: { color: tokens.colorNeutralForeground3 },
  index: {
    display: "block",
    fontSize: "40px",
    fontWeight: 300,
    lineHeight: "48px",
    letterSpacing: "-0.02em",
    color: tokens.colorNeutralForeground3,
  },
  revealItem: { height: "100%" },
  slide: {
    position: "relative",
    aspectRatio: "1680 / 962",
    overflow: "hidden",
    ...shorthands.border("1px", "solid", "var(--of-border)"),
    ...shorthands.borderRadius("8px"),
    backgroundColor: tokens.colorNeutralBackground3,
  },
  slideImage: {
    display: "block",
    width: "100%",
    height: "100%",
  },
  skeletonWrap: { position: "absolute", inset: 0 },
  skeletonItem: {
    width: "100%",
    height: "100%",
    ...shorthands.borderRadius(tokens.borderRadiusNone),
  },
  carouselFooter: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
    ...shorthands.padding("24px", "0", "0"),
  },
  carouselTitle: { display: "block" },
  carouselText: {
    display: "block",
    marginTop: "4px",
    color: tokens.colorNeutralForeground2,
  },
  navRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "16px",
  },
  dots: { display: "flex", alignItems: "center" },
  counter: {
    whiteSpace: "nowrap",
    flexShrink: 0,
    color: tokens.colorNeutralForeground3,
  },
  deployShot: {
    width: "100%",
    maxWidth: "900px",
    height: "auto",
    aspectRatio: "1560 / 1880",
    display: "block",
    marginInline: "auto",
    border: "none",
    ...shorthands.borderRadius("24px"),
    boxShadow: tokens.shadow4,
  },
  gutter: { marginTop: "32px" },
  runGrid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: "40px",
    alignItems: "start",
    "@media (min-width: 900px)": {
      gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.08fr)",
      gap: "56px",
    },
  },
  codeCard: {
    ...shorthands.padding("0"),
    overflow: "hidden",
    ...shorthands.border("1px", "solid", "var(--of-border)"),
    ...shorthands.borderRadius("8px"),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  codeHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    ...shorthands.padding("10px", "16px"),
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    backgroundColor: tokens.colorNeutralBackground1,
  },
  code: {
    margin: 0,
    ...shorthands.padding("16px"),
    overflowX: "auto",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase400,
    color: tokens.colorNeutralForeground1,
    backgroundColor: tokens.colorNeutralBackground2,
  },
  steps: { display: "grid", rowGap: "20px", marginTop: "28px" },
  step: {
    display: "grid",
    gridTemplateColumns: "32px minmax(0, 1fr)",
    columnGap: "14px",
    alignItems: "start",
  },
  stepNum: {
    width: "32px",
    height: "32px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "flex-start",
    fontSize: "20px",
    fontWeight: tokens.fontWeightSemibold,
    lineHeight: "28px",
    color: tokens.colorNeutralForeground3,
  },
  factRow: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "space-between",
    columnGap: "16px",
    ...shorthands.padding("8px", "0"),
    ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
  },
  checksum: {
    display: "flex",
    flexDirection: "column",
    rowGap: "6px",
    marginTop: "16px",
    ...shorthands.padding("10px", "12px"),
    border: "none",
    ...shorthands.borderRadius(tokens.borderRadiusXLarge),
    backgroundColor: tokens.colorNeutralBackground2,
  },
  checksumHead: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    columnGap: "8px",
  },
  checksumCode: {
    width: "100%",
    fontFamily: tokens.fontFamilyMonospace,
    fontSize: "11px",
    lineHeight: "16px",
    wordBreak: "break-all",
    color: tokens.colorNeutralForeground2,
  },
  faq: { maxWidth: "820px" },
  cta: {
    ...shorthands.padding("40px"),
    display: "flex",
    flexDirection: "column",
    rowGap: "20px",
    alignItems: "flex-start",
    ...shorthands.border("1px", "solid", "var(--of-border)"),
    ...shorthands.borderRadius("8px"),
    backgroundColor: "var(--of-surface-alt)",
    "@media (min-width: 760px)": {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
    },
  },
  ctaActions: {
    display: "flex",
    flexWrap: "wrap",
    gap: "12px",
    marginTop: "0",
    flexShrink: 0,
  },
  button: {
    ...shorthands.borderRadius("4px"),
  },
  footer: {
    backgroundColor: "var(--of-surface-alt)",
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
    ...shorthands.padding("56px", "0", "32px"),
  },
  footerGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: "32px",
    "@media (min-width: 820px)": {
      gridTemplateColumns: "1.6fr repeat(3, minmax(0, 1fr))",
    },
  },
  footerBrand: {
    display: "flex",
    flexDirection: "column",
    rowGap: "12px",
    maxWidth: "340px",
  },
  footerCol: { display: "flex", flexDirection: "column", rowGap: "8px" },
  footerLink: {
    color: tokens.colorNeutralForeground2,
    fontSize: tokens.fontSizeBase300,
    textDecorationLine: "none",
    alignSelf: "flex-start",
    ":hover": {
      color: tokens.colorBrandForeground1,
      textDecorationLine: "underline",
    },
  },
  legal: {
    display: "flex",
    flexWrap: "wrap",
    columnGap: "20px",
    rowGap: "8px",
    marginTop: "40px",
    paddingTop: "24px",
    ...shorthands.borderTop("1px", "solid", tokens.colorNeutralStroke2),
  },
  legalText: { color: tokens.colorNeutralForeground3, maxWidth: "820px" },
  helper: {
    position: "absolute",
    width: "1px",
    height: "1px",
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  },
});

const FEATURE_ICONS: Record<string, React.ReactNode> = {
  models: <Globe24Regular />,
  playground: <Chat24Regular />,
  agents: <Bot24Regular />,
  knowledge: <DocumentSearch24Regular />,
  deployments: <Rocket24Regular />,
  local: <LockClosed24Regular />,
};

function GithubMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M12 .5C5.73.5.9 5.33.9 11.6c0 4.9 3.17 9.05 7.57 10.52.55.1.75-.24.75-.53 0-.26-.01-1.13-.02-2.05-3.08.67-3.73-1.31-3.73-1.31-.5-1.28-1.23-1.62-1.23-1.62-1.01-.69.08-.68.08-.68 1.12.08 1.71 1.15 1.71 1.15.99 1.7 2.6 1.21 3.23.93.1-.72.39-1.21.71-1.49-2.46-.28-5.05-1.23-5.05-5.48 0-1.21.43-2.2 1.14-2.98-.11-.28-.5-1.41.11-2.94 0 0 .93-.3 3.05 1.14a10.6 10.6 0 0 1 5.56 0c2.12-1.44 3.05-1.14 3.05-1.14.61 1.53.22 2.66.11 2.94.71.78 1.14 1.77 1.14 2.98 0 4.26-2.59 5.2-5.06 5.47.4.35.76 1.03.76 2.08 0 1.5-.01 2.71-.01 3.08 0 .29.2.64.76.53 4.4-1.47 7.56-5.62 7.56-10.52C23.1 5.33 18.27.5 12 .5Z" />
    </svg>
  );
}

function useDelayedFlag(active: boolean, delay: number) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) {
      setShow(false);
      return;
    }
    const timer = window.setTimeout(() => setShow(true), delay);
    return () => window.clearTimeout(timer);
  }, [active, delay]);
  return show;
}

function ScrollReveal({
  children,
  kind = "scale",
  className,
}: {
  children: React.ReactNode;
  kind?: "scale" | "left";
  className?: string;
}) {
  const styles = useStyles();
  return (
    <div
      className={mergeClasses(styles.revealItem, className)}
      data-scroll-reveal={kind}
    >
      {children}
    </div>
  );
}

function SlideImage({
  src,
  alt,
  active,
}: {
  src: string;
  alt: string;
  active: boolean;
}) {
  const styles = useStyles();
  const [loaded, setLoaded] = useState(false);
  const showSkeleton = useDelayedFlag(active && !loaded, 300);
  const imageRef = useCallback((node: HTMLImageElement | null) => {
    if (node?.complete) setLoaded(true);
  }, []);

  return (
    <div className={styles.slide}>
      {showSkeleton && (
        <Skeleton className={styles.skeletonWrap} aria-label="Loading screenshot">
          <SkeletonItem
            shape="rectangle"
            animation="wave"
            className={styles.skeletonItem}
          />
        </Skeleton>
      )}
      <Image
        ref={imageRef}
        src={src}
        alt={alt}
        loading="lazy"
        className={styles.slideImage}
        onLoad={() => setLoaded(true)}
      />
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  const styles = useStyles();
  return (
    <div className={styles.footerCol}>
      <Text size={200} weight="semibold">
        {title}
      </Text>
      {links.map((link) => (
        <Link key={link.href} href={link.href} className={styles.footerLink}>
          {link.label}
        </Link>
      ))}
    </div>
  );
}

export function App() {
  const styles = useStyles();
  const { mode, toggle } = useThemeMode();
  const toasterId = useId("toaster");
  const { dispatchToast } = useToastController(toasterId);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);

  const copy = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      dispatchToast(<Toast>Copied to the clipboard</Toast>, {
        intent: "success",
        timeout: 2000,
      });
      window.setTimeout(() => {
        setCopied((current) => (current === key ? null : current));
      }, 2000);
    } catch {
      dispatchToast(
        <Toast>Could not copy. Select the text and copy it manually.</Toast>,
        { intent: "error", timeout: 4000 }
      );
    }
  };

  const startDownload = () => {
    setStarting(true);
    window.setTimeout(() => setStarting(false), 5000);
  };

  return (
    <FluentProvider theme={fluentTheme(mode)}>
      <div className={styles.root}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>

      <header className={styles.header} id="top">
        <div className={mergeClasses(styles.container, styles.headerInner)}>
          <Link href="#top" className={styles.brand} aria-label="openFoundry home">
            <Image
              src="./assets/openfoundry-icon.svg"
              width={30}
              height={30}
              alt=""
              className={styles.brandIcon}
            />
            <Text size={500} weight="semibold" className={styles.brandName}>
              openFoundry
            </Text>
          </Link>

          <nav className={styles.nav} aria-label="Primary">
            {NAV.map((item) => (
              <Link key={item.href} href={item.href} className={styles.navLink}>
                {item.label}
              </Link>
            ))}
          </nav>

          <div className={styles.headerActions}>
            <Button
              appearance="subtle"
              icon={
                mode === "dark" ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />
              }
              aria-label={
                mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
              }
              title={
                mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
              }
              onClick={toggle}
            />
            <Button
              as="a"
              href={REPO}
              appearance="subtle"
              icon={<GithubMark />}
              aria-label="openFoundry on GitHub"
            />

            <Popover
              open={navOpen}
              onOpenChange={(_event, data) => setNavOpen(data.open)}
            >
              <PopoverTrigger disableButtonEnhancement>
                <Button
                  appearance="subtle"
                  className={styles.mobileNav}
                  icon={<Navigation20Regular />}
                  aria-label="Open navigation"
                />
              </PopoverTrigger>
              <PopoverSurface>
                <div className={styles.mobileMenu}>
                  {NAV.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={styles.mobileMenuLink}
                      onClick={() => setNavOpen(false)}
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              </PopoverSurface>
            </Popover>

            <Button
              as="a"
              href={DOWNLOAD_URL}
              appearance="primary"
              className={mergeClasses(styles.headerDownload, styles.button)}
              icon={<AppleIcon />}
              onClick={startDownload}
            >
              Download
            </Button>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1}>
        <section className={styles.hero}>
          <div className={styles.container}>
            <div className={styles.heroCenter}>
              <Text
                as="h1"
                size={900}
                weight="medium"
                block
                className={styles.heroTitle}
              >
                Your own AI workbench, on your own computer.
              </Text>

              <Text size={400} block className={styles.heroText}>
                Run models, build prompt agents and search your own documents.
                openFoundry works with the runtimes you already have, and your
                data stays on your machine.
              </Text>

              <div className={styles.heroActions}>
                <Button
                  as="a"
                  href={DOWNLOAD_URL}
                  appearance="primary"
                  size="large"
                  className={styles.button}
                  icon={
                    starting ? (
                      <Spinner size="tiny" />
                    ) : (
                      <AppleIcon />
                    )
                  }
                  onClick={startDownload}
                >
                  {starting ? "Starting download\u00A0…" : "Download for macOS"}
                </Button>
                <Button
                  as="a"
                  href={WINDOWS_DOWNLOAD_URL}
                  appearance="secondary"
                  size="large"
                  className={styles.button}
                  icon={<WindowsIcon />}
                >
                  Download for Windows
                </Button>
                <Button
                  as="a"
                  href={LINUX_DOWNLOAD_URL}
                  appearance="secondary"
                  size="large"
                  className={styles.button}
                  icon={<LinuxIcon />}
                >
                  Download for Linux
                </Button>
                <Button
                  as="a"
                  href="#run"
                  appearance="secondary"
                  size="large"
                  className={styles.button}
                  icon={<Code20Regular />}
                >
                  Run the web version
                </Button>
              </div>

              <Text size={200} block className={styles.heroCaption}>
                Free and open source · macOS Apple silicon, Windows x64 and Linux
                x64 · v{VERSION} beta
              </Text>
              <Text size={200} block className={styles.heroCaption}>
                No account. No telemetry. No cloud bill.
              </Text>
            </div>

            <Card appearance="filled" className={styles.heroShotCard}>
              <video
                src="./assets/gemma-tour-compressed.mp4"
                autoPlay
                muted
                loop
                playsInline
                controls
                className={styles.heroShot}
              />
            </Card>
          </div>
        </section>

        <section className={mergeClasses(styles.section, styles.sectionAlt)} id="features">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <Text
                as="h2"
                size={900}
                weight="medium"
                block
                className={styles.sectionTitle}
              >
                Everything you need, on one machine
              </Text>
              <Text size={400} block className={styles.sectionText}>
                Discover a model, run it, test it and put it behind an API. The
                workspace keeps the pieces together.
              </Text>
            </div>

            <div className={styles.grid3}>
              {FEATURES.map((feature, index) => (
                <ScrollReveal key={feature.key} kind={index % 2 === 0 ? "left" : "scale"}>
                  <Card appearance="filled" className={styles.card}>
                    <div className={styles.iconTile}>
                      {FEATURE_ICONS[feature.key]}
                    </div>
                    <Text as="h3" size={600} weight="semibold">
                      {feature.title}
                    </Text>
                    <Text size={400} className={styles.muted}>
                      {feature.body}
                    </Text>
                  </Card>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>

        <section className={"horizontalSection"} id="screenshots">
          <div className={"horizontalOuter"} data-horizontal="outer">
            <div className={"horizontalPin"} data-horizontal="pin">
              <div className={"horizontalHead"}>
                <Text
                  as="h2"
                  size={900}
                  weight="medium"
                  block
                  className={styles.sectionTitle}
                >
                  A look around
                </Text>
                <Text size={400} block className={styles.sectionText}>
                  Five screens from a real workspace. Keep scrolling and the
                  strip moves sideways; when it ends, the page carries on.
                </Text>
              </div>
              <div className={"horizontalTrack"} data-horizontal="track">
                {SLIDES.map((image, index) => (
                  <figure className={"horizontalCard"} key={image.src}>
                    <SlideImage
                      src={image.src}
                      alt={image.alt}
                      active={index === 0}
                    />
                    <figcaption className={"horizontalCaption"}>
                      <Text as="h3" size={600} weight="semibold" block>
                        {image.title}
                      </Text>
                      <Text size={300} block className={styles.muted}>
                        {image.caption}
                      </Text>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className={mergeClasses(styles.section, styles.sectionAlt)} id="deployments">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <Text
                as="h2"
                size={900}
                weight="medium"
                block
                className={styles.sectionTitle}
              >
                Deployments that behave like deployments
              </Text>
              <Text size={400} block className={styles.sectionText}>
                Foundry puts three ideas into one label. openFoundry keeps them
                apart, so the parts that can work on one computer really work.
              </Text>
            </div>

            <div className={styles.grid3}>
              {DEPLOYMENT_MODES.map((mode) => (
                <ScrollReveal key={mode.title} kind="left">
                  <Card appearance="filled" className={styles.card}>
                    <Text as="h3" size={600} weight="semibold">
                      {mode.title}
                    </Text>
                    <Text size={400} className={styles.muted}>
                      {mode.body}
                    </Text>
                  </Card>
                </ScrollReveal>
              ))}
            </div>

            <div className={styles.gutter}>
              <Image
                src="./assets/screens/deployment-types.webp"
                alt="The deployment types table with serving mode, scope, section and the local behaviour of each type."
                className={styles.deployShot}
                loading="lazy"
              />
              <Text size={200} block className={styles.caption}>
                The same table is in the repository, with all 17 labels and what
                each one does on one computer.
              </Text>
            </div>

            <div className={styles.gutter}>
              <Link href={REPO_FILES.deploymentTable} inline>
                See all 17 deployment types
              </Link>
            </div>
          </div>
        </section>

        <section className={styles.section} id="run">
          <div className={styles.container}>
            <div className={styles.runGrid}>
              <div>
                <Text
                  as="h2"
                  size={900}
                  weight="medium"
                  block
                  className={styles.sectionTitle}
                >
                  Run the web version
                </Text>
                <Text size={400} block className={styles.sectionText}>
                  The same workspace, in your browser, on localhost. You need
                  Node.js 20.9 or later.
                </Text>

                <div className={styles.steps}>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>1</div>
                    <div>
                      <Text size={300} weight="semibold" block>
                        Get the source
                      </Text>
                      <Text size={300} className={styles.muted}>
                        Clone the repository or download the ZIP.
                      </Text>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>2</div>
                    <div>
                      <Text size={300} weight="semibold" block>
                        Install
                      </Text>
                      <Text size={300} className={styles.muted}>
                        Run npm install in the project folder.
                      </Text>
                    </div>
                  </div>
                  <div className={styles.step}>
                    <div className={styles.stepNum}>3</div>
                    <div>
                      <Text size={300} weight="semibold" block>
                        Start
                      </Text>
                      <Text size={300} className={styles.muted}>
                        Run npm run dev and open http://localhost:3000.
                      </Text>
                    </div>
                  </div>
                </div>

                <div className={styles.heroActions}>
                  <Button
                    as="a"
                    href={REPO_FILES.sourceZip}
                    appearance="secondary"
                    className={styles.button}
                    icon={<ArrowDownload20Regular />}
                  >
                    Download the source
                  </Button>
                  <Button as="a" href="#install" appearance="subtle">
                    Install the desktop app
                  </Button>
                </div>

                <Text size={200} block className={styles.caption}>
                  The web version runs on macOS, Windows and Linux. The desktop
                  build adds a native window and a bundled Node runtime.
                </Text>
              </div>

              <Card appearance="filled" className={styles.codeCard}>
                <div className={styles.codeHead}>
                  <Text size={300} weight="semibold">
                    Terminal
                  </Text>
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={
                      copied === "commands" ? (
                        <Checkmark20Regular />
                      ) : (
                        <Copy20Regular />
                      )
                    }
                    onClick={() => copy(COMMANDS, "commands")}
                    aria-label="Copy commands"
                  />
                </div>
                <pre className={styles.code}>
                  <code>{COMMANDS}</code>
                </pre>
              </Card>
            </div>
          </div>
        </section>

        <section className={mergeClasses(styles.section, styles.sectionAlt)} id="install">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <Text
                as="h2"
                size={900}
                weight="medium"
                block
                className={styles.sectionTitle}
              >
                Install the desktop app
              </Text>
              <Text size={400} block className={styles.sectionText}>
                A native window, a bundled Node runtime and the same workspace.
                macOS, Windows and Linux betas come from the same source.
              </Text>
            </div>

            <div className={styles.runGrid}>
              <div className={styles.steps}>
                <div className={styles.step}>
                  <div className={styles.stepNum}>1</div>
                  <div>
                    <Text size={300} weight="semibold" block>
                      Download the installer
                    </Text>
                    <Text size={300} className={styles.muted}>
                      The macOS DMG is {SIZE_MB} MB for Apple silicon, the Windows
                      installer is {WINDOWS_SIZE_MB} MB for x64, and the Debian
                      package is {LINUX_SIZE_MB} MB for x64.
                    </Text>
                    <div className={styles.heroActions}>
                      <Button
                        as="a"
                        href={DOWNLOAD_URL}
                        appearance="primary"
                        className={styles.button}
                        icon={<AppleIcon />}
                        onClick={startDownload}
                      >
                        Download for macOS
                      </Button>
                      <Button
                        as="a"
                        href={WINDOWS_DOWNLOAD_URL}
                        appearance="secondary"
                        className={styles.button}
                        icon={<WindowsIcon />}
                      >
                        Download for Windows
                      </Button>
                      <Button
                        as="a"
                        href={LINUX_DOWNLOAD_URL}
                        appearance="secondary"
                        className={styles.button}
                        icon={<LinuxIcon />}
                      >
                        Download for Linux
                      </Button>
                    </div>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>2</div>
                  <div>
                    <Text size={300} weight="semibold" block>
                      Install it
                    </Text>
                    <Text size={300} className={styles.muted}>
                      On macOS, open the DMG and drag openFoundry to Applications.
                      On Windows, run the setup file and finish the installer. It
                      adds a Start menu shortcut and the openFoundry command line.
                      On Debian or Ubuntu, install the package with{" "}
                      <code>sudo apt install ./{LINUX_ASSET}</code>.
                    </Text>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>3</div>
                  <div>
                    <Text size={300} weight="semibold" block>
                      Open it the first time
                    </Text>
                    <Text size={300} className={styles.muted}>
                      None of the builds is code signed yet. macOS asks for
                      confirmation: right-click the app, choose Open, then confirm,
                      or use System Settings, Privacy & Security, Open Anyway. On
                      Windows, SmartScreen shows a warning: choose More info, then
                      Run anyway. On Linux, install the .deb with apt or your
                      package manager.
                    </Text>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>4</div>
                  <div>
                    <Text size={300} weight="semibold" block>
                      Check the download
                    </Text>
                    <Text size={300} className={styles.muted}>
                      Compare the SHA-256 in the card with the file you
                      downloaded.
                    </Text>
                  </div>
                </div>
              </div>

              <Card appearance="filled" className={styles.card}>
                <div className={styles.iconTile}>
                  <DesktopMac20Regular />
                </div>
                <Text as="h3" size={600} weight="semibold">
                  Download details
                </Text>

                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Version
                  </Text>
                  <Text size={300} weight="semibold">
                    {VERSION}
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Platform
                  </Text>
                  <Text size={300} weight="semibold">
                    macOS Apple silicon
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Also
                  </Text>
                  <Text size={300} weight="semibold">
                    Windows 10 / 11 x64 and Linux x64
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Minimum
                  </Text>
                  <Text size={300} weight="semibold">
                    macOS 13.5, Windows 10, Ubuntu 22.04 / Debian 12
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Size
                  </Text>
                  <Text size={300} weight="semibold">
                    {SIZE_MB} MB macOS · {WINDOWS_SIZE_MB} MB Windows ·{" "}
                    {LINUX_SIZE_MB} MB Linux
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    License
                  </Text>
                  <Text size={300} weight="semibold">
                    Apache-2.0
                  </Text>
                </div>

                <div className={styles.checksum}>
                  <div className={styles.checksumHead}>
                    <Text size={200} weight="semibold">
                      SHA-256, macOS
                    </Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={
                        copied === "sha" ? (
                          <Checkmark20Regular />
                        ) : (
                          <Copy20Regular />
                        )
                      }
                      onClick={() => copy(SHA256, "sha")}
                      aria-label="Copy macOS SHA-256 checksum"
                    />
                  </div>
                  <code className={styles.checksumCode}>{SHA256}</code>
                </div>

                <div className={styles.checksum}>
                  <div className={styles.checksumHead}>
                    <Text size={200} weight="semibold">
                      SHA-256, Windows
                    </Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={
                        copied === "sha-win" ? (
                          <Checkmark20Regular />
                        ) : (
                          <Copy20Regular />
                        )
                      }
                      onClick={() => copy(WINDOWS_SHA256, "sha-win")}
                      aria-label="Copy Windows SHA-256 checksum"
                    />
                  </div>
                  <code className={styles.checksumCode}>{WINDOWS_SHA256}</code>
                </div>

                <div className={styles.checksum}>
                  <div className={styles.checksumHead}>
                    <Text size={200} weight="semibold">
                      SHA-256, Linux
                    </Text>
                    <Button
                      appearance="subtle"
                      size="small"
                      icon={
                        copied === "sha-linux" ? (
                          <Checkmark20Regular />
                        ) : (
                          <Copy20Regular />
                        )
                      }
                      onClick={() => copy(LINUX_SHA256, "sha-linux")}
                      aria-label="Copy Linux SHA-256 checksum"
                    />
                  </div>
                  <code className={styles.checksumCode}>{LINUX_SHA256}</code>
                </div>

                <Text size={200} className={styles.muted}>
                  The source is on GitHub. All three desktop builds are betas and
                  can be produced from the same code.
                </Text>
              </Card>
            </div>
          </div>
        </section>

        <section className={styles.section} id="faq">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <Text
                as="h2"
                size={900}
                weight="medium"
                block
                className={styles.sectionTitle}
              >
                Questions
              </Text>
              <Text size={400} block className={styles.sectionText}>
                Short answers about the download, privacy and the runtimes.
              </Text>
            </div>

            <Accordion
              className={styles.faq}
              multiple
              collapsible
              defaultOpenItems={["0"]}
            >
              {FAQ.map((item, index) => (
                <AccordionItem key={item.q} value={String(index)}>
                  <AccordionHeader>{item.q}</AccordionHeader>
                  <AccordionPanel>
                    <Text size={300}>{item.a}</Text>
                  </AccordionPanel>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <Card appearance="filled" className={styles.cta}>
              <div>
                <Text as="h2" size={900} weight="medium" block>
                  Try it on your machine
                </Text>
                <Text size={300} block className={styles.muted}>
                  Free, open source and ready in a few minutes.
                </Text>
              </div>
              <div className={styles.ctaActions}>
                <Button
                  as="a"
                  href={DOWNLOAD_URL}
                  appearance="primary"
                  size="large"
                  className={styles.button}
                  icon={<AppleIcon />}
                  onClick={startDownload}
                >
                  Download for macOS
                </Button>
                <Button
                  as="a"
                  href={WINDOWS_DOWNLOAD_URL}
                  appearance="secondary"
                  size="large"
                  className={styles.button}
                  icon={<WindowsIcon />}
                >
                  Download for Windows
                </Button>
                <Button
                  as="a"
                  href={LINUX_DOWNLOAD_URL}
                  appearance="secondary"
                  size="large"
                  className={styles.button}
                  icon={<LinuxIcon />}
                >
                  Download for Linux
                </Button>
                <Button
                  as="a"
                  href={REPO}
                  appearance="secondary"
                  size="large"
                  className={styles.button}
                  icon={<GithubMark />}
                >
                  View on GitHub
                </Button>
              </div>
            </Card>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div className={styles.footerBrand}>
              <Link href="#top" className={styles.brand}>
                <Image
                  src="./assets/openfoundry-icon.svg"
                  width={28}
                  height={28}
                  alt=""
                  className={styles.brandIcon}
                />
                <Text size={400} weight="semibold">
                  openFoundry
                </Text>
              </Link>
              <Text size={300} className={styles.muted}>
                A local AI workbench for your own computer.
              </Text>
              <Text size={200} className={styles.muted}>
                Apache-2.0. Built with Fluent UI components.
              </Text>
            </div>

            <FooterColumn
              title="Product"
              links={[
                { label: "Features", href: "#features" },
                { label: "Screenshots", href: "#screenshots" },
                { label: "Docs", href: "./docs/" },
                { label: "Run locally", href: "#run" },
                { label: "Install", href: "#install" },
              ]}
            />
            <FooterColumn
              title="Resources"
              links={[
                { label: "GitHub", href: REPO },
                { label: "Releases", href: REPO_FILES.releases },
                { label: "Issues", href: REPO_FILES.issues },
                { label: "Documentation", href: "./docs/" },
                { label: "Contact", href: "mailto:eng.sharjeel.baig@gmail.com" },
              ]}
            />
            <FooterColumn
              title="Legal"
              links={[
                { label: "Terms", href: REPO_FILES.terms },
                { label: "Privacy", href: REPO_FILES.privacy },
                { label: "Trademarks", href: REPO_FILES.trademarks },
                { label: "Notices", href: REPO_FILES.notices },
                { label: "License", href: REPO_FILES.license },
              ]}
            />
          </div>

          <div className={styles.legal}>
            <Text size={200} className={styles.legalText}>
              © {YEAR} openFoundry. Created by{" "}
              <Link href={REPO} inline>
                Sharjeel Baig
              </Link>
              .
            </Text>
            <Text size={200} className={styles.legalText}>
              openFoundry is an independent project. It is not affiliated with,
              endorsed by, or sponsored by any model provider or platform
              vendor.
            </Text>
          </div>
        </div>
      </footer>

      <Toaster toasterId={toasterId} position="bottom-end" />
      </div>
    </FluentProvider>
  );
}
