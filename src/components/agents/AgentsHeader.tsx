// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { label: "Agents", href: "/build/agents" },
  { label: "Routines", href: "/build/agents/routines" },
  { label: "Workflows", href: "/build/agents/workflows" },
];

export default function AgentsHeader() {
  const pathname = usePathname();
  const isActive = (href: string) =>
    href === "/build/agents"
      ? pathname === href
      : pathname.startsWith(href);

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Agents</h1>
      </div>
      <p className="page-subtitle" style={{ maxWidth: 1080 }}>
        This project logs traces to help you monitor and improve your agents.
        Certain project members may be able to view user data. Learn about
        traces and data handling.
      </p>
      <div className="tabbar mt-8">
        {TABS.map((tab) => (
          <Link
            key={tab.href}
            href={tab.href}
            className={`tab${isActive(tab.href) ? " active" : ""}`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </>
  );
}
