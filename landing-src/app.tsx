"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Button,
  Card,
  Carousel,
  CarouselCard,
  CarouselNav,
  CarouselNavButton,
  CarouselNavContainer,
  CarouselSlider,
  CarouselViewport,
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
  Window20Regular,
} from "@fluentui/react-icons";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  COMMANDS,
  DEPLOYMENT_MODES,
  DOWNLOAD_URL,
  FAQ,
  FEATURES,
  NAV,
  REPO,
  REPO_FILES,
  SHA256,
  SIZE_MB,
  SLIDES,
  VERSION,
} from "./content";
import { theme } from "./theme";
import DocsSection from "./docs";

const YEAR = 2026;

const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    backgroundColor: tokens.colorNeutralBackground1,
    color: tokens.colorNeutralForeground1,
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
    backgroundColor: "#FFF9F5",
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
    border: "none",
    ...shorthands.borderRadius("24px"),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow16,
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
  sectionAlt: { backgroundColor: "#FFF9F5" },
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
    ...shorthands.padding("28px"),
    rowGap: "14px",
    height: "100%",
    border: "none",
    ...shorthands.borderRadius("24px"),
    backgroundColor: tokens.colorNeutralBackground1,
    boxShadow: tokens.shadow4,
    transitionProperty: "transform, box-shadow",
    transitionDuration: "300ms",
    transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
    ":hover": {
      transform: "translateY(-4px)",
      boxShadow: tokens.shadow8,
    },
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
    ...shorthands.borderRadius("24px"),
    backgroundColor: tokens.colorNeutralBackground3,
    boxShadow: tokens.shadow16,
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
    border: "none",
    ...shorthands.borderRadius("24px"),
    boxShadow: tokens.shadow4,
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
    border: "none",
    ...shorthands.borderRadius("24px"),
    backgroundColor: "#FFF9F5",
    boxShadow: tokens.shadow4,
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
    ...shorthands.borderRadius(tokens.borderRadiusXLarge),
  },
  disabledCta: {
    color: tokens.colorNeutralForeground2,
    backgroundColor: "transparent",
    ...shorthands.border("1px", "solid", tokens.colorNeutralStroke1),
    opacity: 1,
  },
  footer: {
    backgroundColor: "#FFF9F5",
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

function Reveal({
  children,
  delay = 0,
  kind = "fade",
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  kind?: "fade" | "slide";
  className?: string;
}) {
  const styles = useStyles();
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            observer.disconnect();
            return;
          }
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -48px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={mergeClasses(styles.revealItem, className)}
      data-reveal={shown ? "shown" : "pending"}
      data-reveal-kind={kind}
      style={{ "--of-delay": `${delay}ms` } as React.CSSProperties}
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
  const toasterId = useId("toaster");
  const { dispatchToast } = useToastController(toasterId);
  const [starting, setStarting] = useState(false);
  const [slide, setSlide] = useState(0);
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
    <FluentProvider theme={theme}>
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
              icon={<ArrowDownload20Regular />}
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
                      <ArrowDownload20Regular />
                    )
                  }
                  onClick={startDownload}
                >
                  {starting ? "Starting download\u00A0…" : "Download for macOS"}
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
                <Button
                  appearance="secondary"
                  size="large"
                  className={mergeClasses(styles.button, styles.disabledCta)}
                  icon={<Window20Regular />}
                  disabledFocusable
                >
                  Windows (not yet)
                </Button>
              </div>

              <Text size={200} block className={styles.heroCaption}>
                Free and open source · Apple silicon · macOS 13.5+ ·{" "}
                {SIZE_MB} MB · v{VERSION}
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
                <Reveal key={feature.key} kind="slide" delay={index * 70}>
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
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        <section className={styles.section} id="screenshots">
          <div className={styles.container}>
            <div className={styles.sectionHead}>
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
                Five screens from a real workspace. Use the arrows or the dots to
                move through them.
              </Text>
            </div>

            <Reveal kind="slide">
              <Carousel
                circular
                defaultActiveIndex={0}
                onActiveIndexChange={(_event, data) => setSlide(data.index)}
              >
                <CarouselViewport>
                  <CarouselSlider>
                    {SLIDES.map((image, index) => (
                      <CarouselCard key={image.src}>
                        <SlideImage
                          src={image.src}
                          alt={image.alt}
                          active={index === slide}
                        />
                      </CarouselCard>
                    ))}
                  </CarouselSlider>
                </CarouselViewport>

                <div className={styles.carouselFooter}>
                  <div>
                    <Text
                      as="h3"
                      size={600}
                      weight="semibold"
                      block
                      className={styles.carouselTitle}
                    >
                      {SLIDES[slide].title}
                    </Text>
                    <Text size={300} block className={styles.carouselText}>
                      {SLIDES[slide].caption}
                    </Text>
                  </div>

                  <div className={styles.navRow}>
                    <Text size={200} className={styles.counter}>
                      {slide + 1} of {SLIDES.length}
                    </Text>
                    <CarouselNavContainer
                      next={{
                        "aria-label": "Next screenshot",
                        appearance: "secondary",
                        shape: "circular",
                        size: "large",
                      }}
                      prev={{
                        "aria-label": "Previous screenshot",
                        appearance: "secondary",
                        shape: "circular",
                        size: "large",
                      }}
                    >
                      <CarouselNav>
                        {(index) => (
                          <CarouselNavButton
                            key={index}
                            aria-label={`Go to screenshot ${index + 1}: ${
                              SLIDES[index].title
                            }`}
                          />
                        )}
                      </CarouselNav>
                    </CarouselNavContainer>
                  </div>
                </div>
              </Carousel>
            </Reveal>

            <div aria-live="polite" className={styles.helper}>
              {`Screenshot ${slide + 1} of ${SLIDES.length}: ${
                SLIDES[slide].title
              }`}
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
              {DEPLOYMENT_MODES.map((mode, index) => (
                <Reveal key={mode.title} kind="slide" delay={index * 70}>
                  <Card appearance="filled" className={styles.card}>
                    <Text aria-hidden="true" className={styles.index}>
                      {`0${index + 1}`}
                    </Text>
                    <Text as="h3" size={600} weight="semibold">
                      {mode.title}
                    </Text>
                    <Text size={400} className={styles.muted}>
                      {mode.body}
                    </Text>
                  </Card>
                </Reveal>
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

        <DocsSection />

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
                Nothing else to install.
              </Text>
            </div>

            <div className={styles.runGrid}>
              <div className={styles.steps}>
                <div className={styles.step}>
                  <div className={styles.stepNum}>1</div>
                  <div>
                    <Text size={300} weight="semibold" block>
                      Download the DMG
                    </Text>
                    <Text size={300} className={styles.muted}>
                      The file is {SIZE_MB} MB. Apple silicon only.
                    </Text>
                    <div className={styles.heroActions}>
                      <Button
                        as="a"
                        href={DOWNLOAD_URL}
                        appearance="primary"
                        className={styles.button}
                        icon={<ArrowDownload20Regular />}
                        onClick={startDownload}
                      >
                        Download for macOS
                      </Button>
                    </div>
                  </div>
                </div>

                <div className={styles.step}>
                  <div className={styles.stepNum}>2</div>
                  <div>
                    <Text size={300} weight="semibold" block>
                      Move it to Applications
                    </Text>
                    <Text size={300} className={styles.muted}>
                      Open the DMG, then drag openFoundry to the Applications
                      folder.
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
                      The build is ad-hoc signed and not notarized, so macOS asks
                      for confirmation. Right-click the app, choose Open, then
                      confirm. On macOS 15 and later, use System Settings,
                      Privacy & Security, Open Anyway.
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
                    macOS, Apple silicon
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Minimum
                  </Text>
                  <Text size={300} weight="semibold">
                    macOS 13.5
                  </Text>
                </div>
                <div className={styles.factRow}>
                  <Text size={300} className={styles.muted}>
                    Size
                  </Text>
                  <Text size={300} weight="semibold">
                    {SIZE_MB} MB
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
                      SHA-256
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
                      aria-label="Copy SHA-256 checksum"
                    />
                  </div>
                  <code className={styles.checksumCode}>{SHA256}</code>
                </div>

                <Text size={200} className={styles.muted}>
                  The source is on GitHub. Builds for other platforms can be
                  produced from the same code.
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
                  icon={<ArrowDownload20Regular />}
                  onClick={startDownload}
                >
                  Download for macOS
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
                { label: "Docs", href: "#docs" },
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
                { label: "Documentation", href: "#docs" },
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
              © {YEAR} openFoundry.
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
