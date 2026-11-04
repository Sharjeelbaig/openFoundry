// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Alert20Regular,
  ArrowDownload20Regular,
  Chat20Regular,
  CheckmarkCircle20Regular,
  ChevronDown20Regular,
  Dismiss20Regular,
  ErrorCircle20Regular,
  Info20Regular,
  Person20Regular,
  Search20Regular,
  Settings20Regular,
  SignOut20Regular,
} from "@fluentui/react-icons";
import { FoundryLogo } from "./Logos";
import { useToast } from "./Toast";
import { useDownloads } from "./Downloads";

const NAV = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover/overview" },
  { label: "Build", href: "/build/agents" },
  { label: "Operate", href: "/operate" },
  { label: "Manage", href: "/manage" },
  { label: "Docs", href: "/docs" },
];

export default function Header({
  projectName,
  userName,
  userInitials,
  userEmail,
  roleName,
  access,
  initialTheme,
}: {
  projectName: string;
  userName: string;
  userInitials: string;
  userEmail?: string;
  roleName?: string;
  access?: string;
  initialTheme: "dark" | "light";
}) {
  const pathname = usePathname();
  const { toast } = useToast();
  const { jobs, activeJobs, setPanelOpen } = useDownloads();
  // Seeded from the same cookie the server read, so the control renders in the
  // active theme on the first paint and never fights hydration.
  const [theme, setTheme] = useState<"dark" | "light">(initialTheme);
  const [menu, setMenu] = useState<"project" | "profile" | "notifications" | "feedback" | null>(null);
  const [feedback, setFeedback] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setMenu(null);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  useEffect(() => {
    setMenu(null);
  }, [pathname]);

  const active = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href.split("/").slice(0, 2).join("/"));
  };

  const saveFeedback = () => {
    if (!feedback.trim()) return;
    try {
      const key = "foundry-local:feedback";
      const existing = JSON.parse(localStorage.getItem(key) || "[]") as unknown[];
      existing.push({ text: feedback.trim(), at: new Date().toISOString() });
      localStorage.setItem(key, JSON.stringify(existing));
    } catch {
      // ignore
    }
    setFeedback("");
    setMenu(null);
    toast("Feedback saved on this computer. Thank you!", "success");
  };

  return (
    <header className="app-header" ref={wrapRef}>
      <div className="header-left">
        <Link href="/" className="brand" aria-label="openFoundry home">
          <span className="brand-logo">
            <FoundryLogo />
          </span>
          <span className="brand-title"><span className="brand-open">open</span><strong>Foundry</strong></span>
        </Link>
        <span className="header-divider" aria-hidden="true" />
        <div style={{ position: "relative" }}>
          <button
            className="project-switcher"
            onClick={() => setMenu(menu === "project" ? null : "project")}
            aria-expanded={menu === "project"}
          >
            {projectName}
            <ChevronDown20Regular style={{ width: 14, height: 14 }} />
          </button>
          {menu === "project" && (
            <div className="menu-popover" style={{ left: 0, top: 30, minWidth: 260 }}>
              <div className="muted text-12" style={{ padding: "8px 10px 4px" }}>
                LOCAL PROJECT
              </div>
              <div
                className="menu-item"
                style={{ cursor: "default", height: "auto", padding: "8px 10px" }}
              >
                <span className="model-logo" style={{ width: 28, height: 28, background: "#643fb2", color: "#fff", fontSize: 12 }}>
                  P
                </span>
                <span>
                  <span style={{ display: "block", fontWeight: 600 }}>
                    {projectName}
                  </span>
                  <span className="muted text-12">
                    on {typeof window !== "undefined" ? window.location.hostname : "this Mac"}
                  </span>
                </span>
              </div>
              <div className="divider" style={{ margin: "4px 0" }} />
              <Link className="menu-item" href="/manage" onClick={() => setMenu(null)}>
                <Settings20Regular /> Project details
              </Link>
              <button
                className="menu-item"
                onClick={() => {
                  setMenu(null);
                  window.dispatchEvent(new CustomEvent("foundry:about"));
                }}
              >
                <Info20Regular /> About this local build
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="header-center">
        <button
          className="header-search"
          onClick={() => window.dispatchEvent(new CustomEvent("foundry:search"))}
          aria-label="Search"
        >
          <Search20Regular />
          <span>Search (⌘K)</span>
        </button>
      </div>

      <div className="header-right">
        <div className="new-foundry">
          <span className="new-foundry-label">
            {theme === "dark" ? "Light" : "Dark"}
          </span>
          <button
            className="switch"
            role="switch"
            aria-checked={theme === "dark"}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
            onClick={() => {
              const next = theme === "dark" ? "light" : "dark";
              setTheme(next);
              document.documentElement.dataset.theme = next;
              document.cookie = `openfoundry:theme=${next}; path=/; max-age=31536000; SameSite=Lax`;
              toast(
                next === "light"
                  ? "Light theme enabled."
                  : "Dark theme enabled."
              );
            }}
          />
        </div>
        <nav className="topnav" aria-label="Primary">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`topnav-link${active(item.href) ? " active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div style={{ position: "relative" }}>
          <button
            className="icon-button notification-button"
            aria-label={`Notifications${activeJobs.length ? `, ${activeJobs.length} downloads active` : ""}`}
            onClick={() => setMenu(menu === "notifications" ? null : "notifications")}
          >
            <Alert20Regular />
            {activeJobs.length > 0 && (
              <span className="notification-dot">{activeJobs.length}</span>
            )}
          </button>
          {menu === "notifications" && (
            <div className="menu-popover notification-menu" style={{ right: 0, top: 36, width: 340 }}>
              <div className="row between" style={{ padding: "6px 8px" }}>
                <strong className="text-14">Notifications</strong>
                <span className="badge gray">Local</span>
              </div>
              <div className="divider" />
              {jobs.length === 0 ? (
                <div className="muted text-13" style={{ padding: "18px 12px", textAlign: "center" }}>
                  No new notifications. Model downloads and provider events
                  appear here.
                </div>
              ) : (
                <>
                  <div className="notification-list">
                    {jobs.slice(0, 4).map((job) => (
                      <div className="notification-row" key={job.id}>
                        <span className={`notification-icon ${job.status}`}>
                          {job.status === "complete" ? (
                            <CheckmarkCircle20Regular />
                          ) : job.status === "error" ? (
                            <ErrorCircle20Regular />
                          ) : (
                            <ArrowDownload20Regular />
                          )}
                        </span>
                        <span className="truncate">
                          <strong className="truncate">{job.modelName}</strong>
                          <small className="truncate">
                            {job.status === "running"
                              ? `${Math.round(job.progress)}% · ${job.providerLabel}`
                              : job.status === "complete"
                              ? "Downloaded and ready"
                              : job.status === "error"
                              ? job.error || "Download failed"
                              : job.status === "cancelled"
                              ? "Download cancelled"
                              : "Starting…"}
                          </small>
                        </span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="btn btn-secondary btn-wide mt-8"
                    onClick={() => {
                      setMenu(null);
                      setPanelOpen(true);
                    }}
                  >
                    Open download center
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button
            className="icon-button"
            aria-label="Feedback"
            onClick={() => setMenu(menu === "feedback" ? null : "feedback")}
          >
            <Chat20Regular />
          </button>
          {menu === "feedback" && (
            <div className="menu-popover" style={{ right: 0, top: 36, width: 320, padding: 12 }}>
              <div className="row between mb-8">
                <strong className="text-14">Feedback</strong>
                <button className="icon-button small" onClick={() => setMenu(null)} aria-label="Close">
                  <Dismiss20Regular />
                </button>
              </div>
              <p className="muted text-12 mb-8">
                Comments are stored on this computer only. Nothing is sent to
                openFoundry.
              </p>
              <textarea
                className="textarea"
                style={{ minHeight: 80 }}
                placeholder="What should openFoundry do better?"
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
              />
              <button className="btn btn-primary btn-wide mt-8" onClick={saveFeedback}>
                Save feedback
              </button>
            </div>
          )}
        </div>
        <div style={{ position: "relative" }}>
          <button
            className="avatar"
            aria-label="My profile settings"
            title={userName}
            onClick={() => setMenu(menu === "profile" ? null : "profile")}
          >
            {userInitials}
          </button>
          {menu === "profile" && (
            <div className="menu-popover" style={{ right: 0, top: 34, width: 280 }}>
              <div className="row" style={{ padding: "10px 10px 8px" }}>
                <span className="user-avatar">{userInitials}</span>
                <span>
                  <span style={{ display: "block", fontWeight: 600 }}>{userName}</span>
                  <span className="muted text-12">
                    {userEmail || "Signed in"}
                    {roleName ? ` · ${roleName}` : ""}
                  </span>
                </span>
              </div>
              <div className="divider" />
              <Link className="menu-item" href="/manage" onClick={() => setMenu(null)}>
                <Person20Regular /> Project details
              </Link>
              <Link className="menu-item" href="/manage" onClick={() => setMenu(null)}>
                <Settings20Regular /> Settings
              </Link>
              <div className="divider" />
              <button
                className="menu-item"
                onClick={async () => {
                  setMenu(null);
                  await fetch("/api/auth/sign-out", { method: "POST" });
                  window.location.href = "/signin";
                }}
              >
                <SignOut20Regular /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
