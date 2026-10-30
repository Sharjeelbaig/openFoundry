import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  Alert20Regular,
  Chat20Regular,
  ChevronDown20Regular,
  Dismiss20Regular,
  Info20Regular,
  Search20Regular,
  Settings20Regular,
  SignOut20Regular,
  WindowConsole20Regular,
} from "@fluentui/react-icons";
import { OpenFoundryMark } from "./Logos";
import type { Settings } from "../lib/types";

const NAV = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover/overview" },
  { label: "Build", href: "/build/agents" },
  { label: "Operate", href: "/operate" },
  { label: "Manage", href: "/manage" },
  { label: "Docs", href: "/docs" },
];

export default function Header({ settings }: { settings: Settings }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [menu, setMenu] = useState<"project" | "profile" | "notifications" | "about" | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const active = (href: string) => {
    if (href === "/") return location.pathname === "/";
    return location.pathname.startsWith(href.split("/").slice(0, 2).join("/"));
  };

  const openSearch = () => {
    navigate("/discover/models");
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigate("/discover/models");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate]);

  return (
    <header className="app-header" ref={root}>
      <div className="header-left">
        <Link to="/" className="brand" aria-label="openFoundry home">
          <OpenFoundryMark size={24} />
          <span className="brand-title-of">openFoundry</span>
        </Link>
        <span className="header-divider" />
        <div style={{ position: "relative" }}>
          <button
            className="project-switcher"
            onClick={() => setMenu(menu === "project" ? null : "project")}
            aria-expanded={menu === "project"}
          >
            {settings.workspaceName}
            <ChevronDown20Regular />
          </button>
          {menu === "project" && (
            <div className="menu-popover" style={{ left: 0, top: 30, minWidth: 270 }}>
              <div className="muted text-12" style={{ padding: "8px 10px 4px" }}>
                WORKSPACE
              </div>
              <div className="menu-item" style={{ cursor: "default", height: "auto", padding: "8px 10px" }}>
                <span className="workspace-mark">
                  {settings.initials || "OF"}
                </span>
                <span>
                  <span style={{ display: "block", fontWeight: 600 }}>{settings.workspaceName}</span>
                  <span className="muted text-12">Stored on this computer</span>
                </span>
              </div>
              <div className="divider" style={{ margin: "4px 0" }} />
              <Link className="menu-item" to="/manage" onClick={() => setMenu(null)}>
                <Settings20Regular /> Workspace settings
              </Link>
              <button
                className="menu-item"
                onClick={() => {
                  setMenu("about");
                }}
              >
                <Info20Regular /> About openFoundry
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="header-center">
        <button className="header-search" onClick={openSearch} aria-label="Search">
          <Search20Regular />
          <span>Search</span>
          <span className="kbd-hint">⌘K</span>
        </button>
      </div>

      <div className="header-right">
        <nav className="topnav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              to={item.href}
              className={`topnav-link${active(item.href) ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ position: "relative" }}>
          <button
            className="icon-button"
            aria-label="Notifications"
            onClick={() => setMenu(menu === "notifications" ? null : "notifications")}
          >
            <Alert20Regular />
          </button>
          {menu === "notifications" && (
            <div className="menu-popover" style={{ right: 0, top: 36, width: 320 }}>
              <div className="row between" style={{ padding: "6px 8px" }}>
                <strong className="text-14">Notifications</strong>
                <span className="badge gray">Local</span>
              </div>
              <div className="divider" />
              <div className="muted text-13" style={{ padding: "18px 12px", textAlign: "center" }}>
                No new notifications. Provider and model events appear here.
              </div>
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button
            className="icon-button"
            aria-label="Feedback"
            onClick={() => setMenu(menu === "about" ? null : "about")}
          >
            <Chat20Regular />
          </button>
        </div>
        <div style={{ position: "relative" }}>
          <button
            className="header-profile"
            aria-label="Profile settings"
            onClick={() => setMenu(menu === "profile" ? null : "profile")}
          >
            {settings.initials || "OF"}
          </button>
          {menu === "profile" && (
            <div className="menu-popover" style={{ right: 0, top: 36, width: 260 }}>
              <div style={{ padding: "8px 10px" }}>
                <strong>{settings.displayName || "Local user"}</strong>
                <div className="muted text-12">{settings.workspaceName}</div>
              </div>
              <div className="divider" />
              <Link className="menu-item" to="/manage" onClick={() => setMenu(null)}>
                <Settings20Regular /> Settings
              </Link>
              <Link className="menu-item" to="/terms" onClick={() => setMenu(null)}>
                <WindowConsole20Regular /> Terms of use
              </Link>
              <button
                className="menu-item"
                onClick={() => {
                  navigate("/");
                  setMenu(null);
                }}
              >
                <SignOut20Regular /> Back to workspace
              </button>
            </div>
          )}
        </div>
      </div>

      {menu === "about" && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setMenu(null);
        }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="About openFoundry">
            <div className="dialog-head">
              <div className="row" style={{ gap: 10 }}>
                <OpenFoundryMark size={30} />
                <div>
                  <h2 className="dialog-title">openFoundry</h2>
                  <p className="dialog-sub">A local AI workbench</p>
                </div>
              </div>
              <button className="icon-button" onClick={() => setMenu(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <p className="text-13 muted" style={{ lineHeight: "21px" }}>
                openFoundry is an independent, free, open-source project for running
                models, agents and knowledge bases on your own computer. It is not
                affiliated with, endorsed by, or sponsored by any model provider.
              </p>
              <div className="banner">
                <Info20Regular />
                <span>Everything stays local unless you explicitly connect a remote endpoint.</span>
              </div>
            </div>
            <div className="dialog-footer">
              <Link className="btn btn-secondary" to="/terms" onClick={() => setMenu(null)}>
                Terms
              </Link>
              <button className="btn btn-primary" onClick={() => setMenu(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
