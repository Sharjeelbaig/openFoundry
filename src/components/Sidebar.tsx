// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Beaker20Regular,
  Book20Regular,
  Box20Regular,
  Brain20Regular,
  ClipboardTask20Regular,
  Cloud20Regular,
  DataBarVertical20Regular,
  Database20Regular,
  DataUsage20Regular,
  Grid20Regular,
  Image20Regular,
  Mic20Regular,
  PanelLeftContract20Regular,
  PanelLeftExpand20Regular,
  PeopleTeam20Regular,
  Server20Regular,
  Settings20Regular,
  Shield20Regular,
  SlideText20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";

interface NavItem {
  href: string;
  label: string;
  icon: React.ReactNode;
  tag?: string;
}
interface NavGroup {
  title: string;
  items: NavItem[];
}

const CREATE: NavGroup = {
  title: "Create",
  items: [
    { href: "/build/agents", label: "Agents", icon: <PeopleTeam20Regular /> },
    { href: "/build/models/deployments", label: "Models", icon: <Box20Regular /> },
    { href: "/build/images", label: "Images", icon: <Image20Regular /> },
    { href: "/build/speech", label: "Speech", icon: <Mic20Regular /> },
    { href: "/build/voice", label: "Voice Live", icon: <Mic20Regular /> },
    { href: "/build/services", label: "Services", icon: <Cloud20Regular /> },
    { href: "/build/tools", label: "Tools", icon: <Wrench20Regular /> },
    { href: "/build/knowledge/search", label: "Knowledge", icon: <Book20Regular /> },
    { href: "/build/memory", label: "Memory", icon: <Brain20Regular /> },
    { href: "/build/guardrails", label: "Guardrails", icon: <Shield20Regular /> },
    { href: "/build/data", label: "Data", icon: <Database20Regular /> },
  ],
};

const OPTIMIZE: NavGroup = {
  title: "Optimize",
  items: [
    { href: "/build/evaluations", label: "Evaluations", icon: <ClipboardTask20Regular /> },
    { href: "/build/fine-tune", label: "Fine-tune", icon: <Beaker20Regular /> },
  ],
};

const DISCOVER: NavGroup = {
  title: "Discover",
  items: [
    { href: "/discover/overview", label: "Overview", icon: <Grid20Regular /> },
    { href: "/discover/models", label: "Models", icon: <Box20Regular /> },
    { href: "/discover/agents", label: "Agents", icon: <PeopleTeam20Regular /> },
    { href: "/discover/tools", label: "Tools", icon: <Wrench20Regular /> },
    { href: "/discover/knowledge", label: "Knowledge", icon: <Book20Regular /> },
    { href: "/discover/services", label: "Services", icon: <Cloud20Regular /> },
    {
      href: "/discover/solutiontemplates",
      label: "Solution templates",
      icon: <SlideText20Regular />,
    },
  ],
};

const OPERATE: NavGroup = {
  title: "Operate",
  items: [
    { href: "/operate", label: "Overview", icon: <DataUsage20Regular /> },
    { href: "/operate/assets", label: "Assets", icon: <Box20Regular /> },
    { href: "/operate/compliance", label: "Compliance", icon: <Shield20Regular /> },
  ],
};

const MANAGE: NavGroup = {
  title: "Manage",
  items: [
    { href: "/manage/quota", label: "Quota", icon: <DataBarVertical20Regular /> },
    { href: "/manage/gateway", label: "AI Gateway", icon: <Cloud20Regular /> },
    { href: "/manage/resources", label: "Resource details", icon: <Server20Regular /> },
    { href: "/manage/retention", label: "Responses", icon: <DataUsage20Regular /> },
    { href: "/manage/tenants", label: "Tenants", icon: <PeopleTeam20Regular /> },
    { href: "/manage", label: "Project details", icon: <Settings20Regular /> },
  ],
};

function groupsFor(pathname: string): NavGroup[] {
  if (pathname.startsWith("/discover")) return [DISCOVER];
  if (pathname.startsWith("/build")) return [CREATE, OPTIMIZE];
  if (pathname.startsWith("/operate")) return [OPERATE];
  if (pathname.startsWith("/manage")) return [MANAGE];
  if (pathname.startsWith("/playground")) return [CREATE];
  return [];
}

const MOBILE_NAV = [
  { label: "Home", href: "/" },
  { label: "Discover", href: "/discover/overview" },
  { label: "Build", href: "/build/agents" },
  { label: "Operate", href: "/operate" },
  { label: "Manage", href: "/manage" },
  { label: "Docs", href: "/docs" },
];

export default function Sidebar({
  mobileOpen = false,
  onNavigate,
}: {
  mobileOpen?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const groups = groupsFor(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [mobile, setMobile] = useState(false);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem("foundry-local:sidebar-collapsed") === "1");
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    const query = window.matchMedia("(max-width: 900px)");
    const update = () => setMobile(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  if (groups.length === 0 && !mobileOpen) return null;

  const onDiscover = pathname.startsWith("/discover");
  const isCollapsed = collapsed && !mobile;

  return (
    <aside
      id="app-sidebar"
      aria-hidden={mobile && !mobileOpen ? true : undefined}
      className={`sidebar${isCollapsed ? " collapsed" : ""}${
        onDiscover ? " base" : ""
      }${mobileOpen ? " mobile-open" : ""}`}
    >
      <div className="sidebar-scroll">
        <nav className="mobile-primary-nav" aria-label="Primary mobile">
          {MOBILE_NAV.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href.split("/").slice(0, 2).join("/"));
            return (
              <Link
                key={item.href}
                className={`sidebar-link${active ? " active" : ""}`}
                href={item.href}
                onClick={onNavigate}
              >
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>
        {groups.map((group) => (
          <div className="sidebar-section" key={group.title}>
            <h2 className="sidebar-heading">{isCollapsed ? "" : group.title}</h2>
            <div className="stack" style={{ gap: 2 }}>
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href.includes("?") && pathname.startsWith(item.href.split("?")[0])) ||
                  (item.href === "/build/agents" &&
                    pathname.startsWith("/build/agents")) ||
                  (item.href === "/build/models/deployments" &&
                    pathname.startsWith("/build/models")) ||
                  (item.href === "/build/knowledge/search" &&
                    pathname.startsWith("/build/knowledge")) ||
                  (item.href === "/build/data" &&
                    pathname.startsWith("/build/data")) ||
                  (item.href === "/discover/tools" &&
                    pathname.startsWith("/discover/tools")) ||
                  (item.href === "/operate" && pathname === "/operate") ||
                  pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`sidebar-link${active ? " active" : ""}`}
                    title={isCollapsed ? item.label : undefined}
                    onClick={onNavigate}
                  >
                    {item.icon}
                    {!isCollapsed && <span className="truncate">{item.label}</span>}
                    {!isCollapsed && item.tag && (
                      <span className="badge gray">{item.tag}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="sidebar-bottom">
        <button
          className="icon-button"
          aria-label={isCollapsed ? "Expand left navigation" : "Collapse left navigation"}
          title={isCollapsed ? "Expand left navigation" : "Collapse left navigation"}
          onClick={() => {
            setCollapsed((value) => {
              const next = !value;
              try {
                localStorage.setItem(
                  "foundry-local:sidebar-collapsed",
                  next ? "1" : "0"
                );
              } catch {
                // ignore
              }
              return next;
            });
          }}
        >
          {isCollapsed ? <PanelLeftExpand20Regular /> : <PanelLeftContract20Regular />}
        </button>
      </div>
    </aside>
  );
}
