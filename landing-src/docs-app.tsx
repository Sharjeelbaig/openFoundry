"use client";

import {
  ArrowDownload20Regular,
  ChevronRight20Regular,
  Search20Regular,
  WeatherMoon20Regular,
  WeatherSunny20Regular,
} from "@fluentui/react-icons";
import {
  Button,
  FluentProvider,
  makeStyles,
  mergeClasses,
} from "@fluentui/react-components";
import { useEffect, useMemo, useRef, useState } from "react";
import { DOWNLOAD_URL, REPO } from "./content";
import { buildLessons, type DocsLesson } from "./docs-content";
import { fluentTheme, useThemeMode } from "./theme";

/* Measured on learn.microsoft.com/en-us/dynamics365/get-started/intro-crossapp-index
   in dark mode: body #1f1f1f, bars and sidebar #292929, rules #404040,
   active row #333333, link #75b6e7, article column 688 inside a 736 wrapper,
   sidebar 320, rail 320, H1 40/52, body 16/28. */
const useStyles = makeStyles({
  root: {
    minHeight: "100vh",
    backgroundColor: "var(--of-bg)",
    color: "var(--of-text)",
    fontFamily:
      "'Segoe UI', 'Segoe UI Variable Text', -apple-system, system-ui, 'Helvetica Neue', Helvetica, Arial, sans-serif",
    fontSize: "16px",
  },
  topbar: {
    height: "54px",
    backgroundColor: "var(--of-bar)",
    borderBottom: "1px solid var(--of-border)",
  },
  topbarInner: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    gap: "24px",
    padding: "0 24px",
  },
  brand: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    color: "var(--of-text)",
    textDecoration: "none",
    flexShrink: 0,
  },
  brandMark: {
    width: "28px",
    height: "28px",
    display: "block",
  },
  brandDivider: {
    width: "1px",
    height: "24px",
    backgroundColor: "var(--of-border)",
  },
  brandText: {
    fontSize: "20px",
    lineHeight: "35px",
    fontWeight: 600,
  },
  topNav: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
    "@media (max-width: 1000px)": { display: "none" },
  },
  topNavLink: {
    color: "var(--of-text)",
    fontSize: "16px",
    lineHeight: "28px",
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: "4px",
    ":hover": { backgroundColor: "var(--of-active)" },
  },
  topActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  iconButton: {
    width: "32px",
    height: "32px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    border: 0,
    borderRadius: "4px",
    backgroundColor: "transparent",
    color: "var(--of-text)",
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--of-active)" },
  },
  topLink: {
    color: "var(--of-link)",
    fontSize: "14px",
    lineHeight: "20px",
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: "4px",
    ":hover": { backgroundColor: "var(--of-active)" },
  },
  productbar: {
    height: "54px",
    backgroundColor: "var(--of-bar)",
    borderBottom: "1px solid var(--of-border)",
  },
  productInner: {
    height: "100%",
    display: "flex",
    alignItems: "center",
    gap: "24px",
    padding: "0 24px",
  },
  productName: {
    fontSize: "18px",
    lineHeight: "31.5px",
    fontWeight: 600,
    flexShrink: 0,
  },
  productNav: {
    display: "flex",
    alignItems: "center",
    gap: "2px",
    "@media (max-width: 1100px)": { display: "none" },
  },
  productLink: {
    color: "var(--of-text)",
    fontSize: "14px",
    lineHeight: "20px",
    textDecoration: "none",
    padding: "6px 10px",
    borderRadius: "4px",
    ":hover": { backgroundColor: "var(--of-active)" },
  },
  productLinkActive: {
    fontWeight: 600,
  },
  productActions: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },
  barButton: {
    height: "32px",
    minWidth: "auto",
    fontSize: "14px",
  },
  shell: {
    display: "grid",
    gridTemplateColumns: "320px minmax(0, 1fr) 320px",
    alignItems: "start",
    "@media (max-width: 1200px)": {
      gridTemplateColumns: "300px minmax(0, 1fr)",
    },
    "@media (max-width: 860px)": {
      gridTemplateColumns: "minmax(0, 1fr)",
    },
  },
  sidebar: {
    backgroundColor: "var(--of-bar)",
    borderRight: "1px solid var(--of-border)",
    position: "sticky",
    top: 0,
    height: "100vh",
    display: "flex",
    overflow: "hidden",
    "@media (max-width: 860px)": {
      position: "static",
      height: "auto",
      display: "block",
      overflow: "visible",
      borderRight: 0,
      borderBottom: "1px solid var(--of-border)",
    },
  },
  sidebarInner: {
    padding: "24px",
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
    width: "100%",
  },
  search: {
    width: "100%",
    height: "32px",
    backgroundColor: "var(--of-bg)",
    border: "1px solid var(--of-input-border)",
    borderRadius: "4px",
    color: "var(--of-text)",
    fontSize: "14px",
    lineHeight: "20px",
    padding: "0 12px 0 34px",
    outline: "none",
    ":focus": { borderColor: "var(--of-link)" },
  },
  searchWrap: {
    position: "relative",
  },
  searchIcon: {
    position: "absolute",
    left: "10px",
    top: "50%",
    transform: "translateY(-50%)",
    color: "var(--of-text-2)",
    pointerEvents: "none",
  },
  tree: {
    marginTop: "14px",
    flex: 1,
    minHeight: 0,
    overflowY: "auto",
    "@media (max-width: 860px)": {
      flex: "none",
      overflow: "visible",
    },
  },
  treeRoot: {
    fontSize: "14px",
    lineHeight: "24.5px",
    fontWeight: 400,
    padding: "4px 8px",
    color: "var(--of-text)",
  },
  treeGroup: {
    display: "flex",
    alignItems: "center",
    gap: "6px",
    width: "100%",
    padding: "4px 8px",
    border: 0,
    borderRadius: "4px",
    backgroundColor: "transparent",
    color: "var(--of-text)",
    fontSize: "14px",
    lineHeight: "24.5px",
    fontFamily: "inherit",
    textAlign: "left",
    cursor: "pointer",
    ":hover": { backgroundColor: "var(--of-active)" },
  },
  chevron: {
    width: "14px",
    height: "14px",
    flexShrink: 0,
    transitionProperty: "transform",
    transitionDuration: "120ms",
  },
  treeChild: {
    display: "block",
    marginLeft: "16px",
    width: "calc(100% - 16px)",
    padding: "4px 0 4px 16px",
    borderRadius: "4px",
    color: "var(--of-text-2)",
    fontSize: "14px",
    lineHeight: "24.5px",
    textDecoration: "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    ":hover": { backgroundColor: "var(--of-active)", color: "var(--of-text)" },
  },
  treeChildActive: {
    backgroundColor: "var(--of-active)",
    color: "var(--of-text)",
    fontWeight: 600,
  },
  pdf: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    width: "100%",
    padding: "12px 0 0",
    marginTop: "auto",
    borderTop: "1px solid var(--of-border)",
    border: 0,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: "var(--of-border)",
    backgroundColor: "transparent",
    color: "var(--of-text)",
    fontFamily: "inherit",
    fontSize: "14px",
    lineHeight: "20px",
    cursor: "pointer",
    textAlign: "left",
  },
  main: {
    minWidth: 0,
    padding: "24px 0 64px",
  },
  reading: {
    maxWidth: "736px",
    marginInline: "auto",
    padding: "0 24px",
    "@media (max-width: 860px)": { padding: "0 20px" },
  },
  crumbs: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: "6px",
    fontSize: "14px",
    lineHeight: "24.5px",
    color: "var(--of-text-2)",
    marginBottom: "4px",
  },
  crumbLink: {
    color: "var(--of-link)",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
  h1: {
    fontSize: "40px",
    lineHeight: "52px",
    fontWeight: 600,
    margin: "0 0 12px",
    "@media (max-width: 860px)": { fontSize: "32px", lineHeight: "42px" },
  },
  lead: {
    fontSize: "16px",
    lineHeight: "28px",
    color: "var(--of-text)",
    margin: "0 0 16px",
  },
  h2: {
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 600,
    margin: "32px 0 12px",
    scrollMarginTop: "130px",
  },
  p: {
    fontSize: "16px",
    lineHeight: "28px",
    margin: "0 0 14px",
  },
  list: {
    fontSize: "16px",
    lineHeight: "28px",
    margin: "0 0 16px",
    paddingLeft: "22px",
  },
  link: {
    color: "var(--of-link)",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
  code: {
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
    fontSize: "14px",
    backgroundColor: "var(--of-code-bg)",
    border: "1px solid var(--of-border)",
    borderRadius: "3px",
    padding: "1px 5px",
  },
  pre: {
    backgroundColor: "var(--of-code-bg)",
    border: "1px solid var(--of-border)",
    borderRadius: "4px",
    padding: "12px 14px",
    overflowX: "auto",
    fontSize: "13px",
    lineHeight: "21px",
    margin: "0 0 16px",
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace",
  },
  figure: {
    margin: "16px 0 20px",
  },
  shot: {
    display: "block",
    width: "100%",
    height: "auto",
    border: "1px solid var(--of-border)",
    borderRadius: "4px",
  },
  figcaption: {
    display: "block",
    marginTop: "6px",
    fontSize: "14px",
    lineHeight: "20px",
    color: "var(--of-text-2)",
  },
  note: {
    borderLeft: "4px solid var(--of-link)",
    backgroundColor: "var(--of-note-bg)",
    padding: "12px 14px",
    margin: "16px 0",
    fontSize: "14px",
    lineHeight: "22px",
    color: "var(--of-text)",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: "14px",
    lineHeight: "21px",
    margin: "8px 0 18px",
  },
  th: {
    textAlign: "left",
    fontWeight: 600,
    backgroundColor: "var(--of-bar)",
    border: "1px solid var(--of-border)",
    padding: "8px 10px",
    verticalAlign: "top",
  },
  td: {
    border: "1px solid var(--of-border)",
    padding: "8px 10px",
    verticalAlign: "top",
  },
  rail: {
    position: "sticky",
    top: 0,
    alignSelf: "start",
    padding: "24px 24px 24px 40px",
    maxHeight: "100vh",
    overflowY: "auto",
    "@media (max-width: 1200px)": { display: "none" },
  },
  railTitle: {
    fontSize: "18px",
    lineHeight: "24px",
    fontWeight: 600,
    marginBottom: "12px",
  },
  railNav: {
    display: "flex",
    flexDirection: "column",
    gap: "8px",
  },
  railLink: {
    display: "block",
    paddingLeft: "10px",
    borderLeft: "2px solid transparent",
    color: "var(--of-link)",
    fontSize: "14px",
    lineHeight: "18.2px",
    textDecoration: "none",
    ":hover": { textDecoration: "underline" },
  },
  railLinkActive: {
    color: "var(--of-text)",
    borderLeftColor: "var(--of-link)",
  },
  railDivider: {
    height: "1px",
    backgroundColor: "var(--of-border)",
    marginTop: "24px",
  },
});

export function DocsApp() {
  const s = useStyles();
  const { mode, toggle } = useThemeMode();
  const lessons = useMemo(() => buildLessons(s), [s]);
  const [lessonId, setLessonId] = useState(lessons[0].id);
  const [sectionId, setSectionId] = useState(lessons[0].sections[0].id);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ setup: true });
  const [target, setTarget] = useState<{ lesson: string; section?: string } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const lesson = lessons.find((item) => item.id === lessonId) ?? lessons[0];

  const navigate = (nextLesson: string, nextSection?: string) => {
    setLessonId(nextLesson);
    if (nextSection) setSectionId(nextSection);
    setOpen((current) => ({ ...current, [nextLesson]: true }));
    setTarget({ lesson: nextLesson, section: nextSection });
  };

  useEffect(() => {
    if (!target) return;
    window.requestAnimationFrame(() => {
      if (target.section) {
        const element = document.getElementById(`section-${target.section}`);
        element?.scrollIntoView({ behavior: "smooth", block: "start" });
      } else {
        document.getElementById("article-top")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
      setTarget(null);
    });
  }, [target]);

  useEffect(() => {
    const onScroll = () => {
      let current = lesson.sections[0]?.id ?? "";
      for (const section of lesson.sections) {
        const element = document.getElementById(`section-${section.id}`);
        if (element && element.getBoundingClientRect().top <= 140) current = section.id;
      }
      setSectionId(current);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [lesson]);

  const needle = query.trim().toLowerCase();
  const visible = (item: DocsLesson) =>
    !needle ||
    item.nav.toLowerCase().includes(needle) ||
    item.sections.some((section) => section.title.toLowerCase().includes(needle));

  return (
    <FluentProvider theme={fluentTheme(mode)}>
      <div className={s.root}>
        <header className={s.topbar}>
          <div className={s.topbarInner}>
            <a className={s.brand} href="../">
              <img
                className={s.brandMark}
                src="../assets/openfoundry-icon.svg"
                alt=""
                width={26}
                height={26}
              />
              <span className={s.brandDivider} />
              <span className={s.brandText}>Docs</span>
            </a>
            <nav className={s.topNav} aria-label="Learn">
              <a className={mergeClasses(s.topNavLink)} href="./">
                Documentation
              </a>
              <a className={s.topNavLink} href="../#install">
                Download
              </a>
              <a className={s.topNavLink} href={REPO}>
                GitHub
              </a>
            </nav>
            <div className={s.topActions}>
              <button
                type="button"
                className={s.iconButton}
                aria-label={
                  mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
                }
                title={
                  mode === "dark" ? "Switch to light theme" : "Switch to dark theme"
                }
                onClick={toggle}
              >
                {mode === "dark" ? <WeatherSunny20Regular /> : <WeatherMoon20Regular />}
              </button>
              <button
                type="button"
                className={s.iconButton}
                aria-label="Search the docs"
                onClick={() => searchRef.current?.focus()}
              >
                <Search20Regular />
              </button>
              <a className={s.topLink} href="../">
                Back to site
              </a>
            </div>
          </div>
        </header>

        <div className={s.productbar}>
          <div className={s.productInner}>
            <span className={s.productName}>openFoundry</span>
            <nav className={s.productNav} aria-label="Lessons">
              {lessons.map((item) => (
                <a
                  key={item.id}
                  className={mergeClasses(
                    s.productLink,
                    item.id === lesson.id && s.productLinkActive
                  )}
                  href={`#${item.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(item.id);
                  }}
                >
                  {item.nav}
                </a>
              ))}
            </nav>
            <div className={s.productActions}>
              <Button
                as="a"
                href="../#run"
                appearance="outline"
                size="small"
                className={s.barButton}
              >
                Run locally
              </Button>
              <Button
                as="a"
                href={DOWNLOAD_URL}
                appearance="primary"
                size="small"
                className={s.barButton}
              >
                Download
              </Button>
            </div>
          </div>
        </div>

        <div className={s.shell}>
          <aside className={s.sidebar}>
            <div className={s.sidebarInner}>
              <div className={s.searchWrap}>
                <Search20Regular className={s.searchIcon} />
                <input
                  ref={searchRef}
                  className={s.search}
                  placeholder="Find by title"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  aria-label="Find by title"
                />
              </div>

              <nav className={s.tree} aria-label="Documentation">
                <div className={s.treeRoot}>openFoundry documentation</div>
                {lessons.filter(visible).map((item) => {
                  const expanded = needle ? true : Boolean(open[item.id]);
                  const sections = needle
                    ? item.sections.filter(
                        (section) =>
                          section.title.toLowerCase().includes(needle) ||
                          item.nav.toLowerCase().includes(needle)
                      )
                    : item.sections;
                  return (
                    <div key={item.id}>
                      <button
                        type="button"
                        className={s.treeGroup}
                        aria-expanded={expanded}
                        onClick={() =>
                          setOpen((current) => ({ ...current, [item.id]: !expanded }))
                        }
                      >
                        <ChevronRight20Regular
                          className={s.chevron}
                          style={{ transform: expanded ? "rotate(90deg)" : undefined }}
                        />
                        {item.nav}
                      </button>
                      {expanded &&
                        sections.map((section) => (
                          <a
                            key={section.id}
                            className={mergeClasses(
                              s.treeChild,
                              item.id === lesson.id &&
                                section.id === sectionId &&
                                s.treeChildActive
                            )}
                            href={`#${item.id}-${section.id}`}
                            onClick={(event) => {
                              event.preventDefault();
                              navigate(item.id, section.id);
                            }}
                          >
                            {section.title}
                          </a>
                        ))}
                    </div>
                  );
                })}
              </nav>

              <button type="button" className={s.pdf} onClick={() => window.print()}>
                <ArrowDownload20Regular /> Download PDF
              </button>
            </div>
          </aside>

          <main className={s.main}>
            <div className={s.reading} id="article-top">
              <nav className={s.crumbs} aria-label="Breadcrumb">
                <a className={s.crumbLink} href="../">
                  Learn
                </a>
                <span>&gt;</span>
                <a className={s.crumbLink} href="./">
                  openFoundry
                </a>
                <span>&gt;</span>
                <span>{lesson.nav}</span>
              </nav>

              <h1 className={s.h1}>{lesson.title}</h1>
              {lesson.intro}

              {lesson.sections.map((section) => (
                <section key={section.id}>
                  <h2 className={s.h2} id={`section-${section.id}`}>
                    {section.title}
                  </h2>
                  {section.body}
                </section>
              ))}
            </div>
          </main>

          <aside className={s.rail} aria-label="In this article">
            <div className={s.railTitle}>In this article</div>
            <nav className={s.railNav}>
              {lesson.sections.map((section) => (
                <a
                  key={section.id}
                  className={mergeClasses(
                    s.railLink,
                    section.id === sectionId && s.railLinkActive
                  )}
                  href={`#${lesson.id}-${section.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    navigate(lesson.id, section.id);
                  }}
                >
                  {section.title}
                </a>
              ))}
            </nav>
            <div className={s.railDivider} />
          </aside>
        </div>
      </div>
    </FluentProvider>
  );
}
