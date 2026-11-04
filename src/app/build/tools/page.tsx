// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useState } from "react";
import Toolboxes from "@/components/Toolboxes";
import ConnectedTools from "@/components/ConnectedTools";
import SkillsPanel from "@/components/SkillsPanel";

type Tab = "Toolboxes" | "Tools" | "Skills";
const TABS: Tab[] = ["Toolboxes", "Tools", "Skills"];

const TAB_PARAM: Record<Tab, string> = {
  Toolboxes: "toolboxes",
  Tools: "tools",
  Skills: "skills",
};

export default function ToolsPage() {
  const [tab, setTab] = useState<Tab>("Toolboxes");

  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("tab");
    if (requested === "tools") setTab("Tools");
    else if (requested === "skills") setTab("Skills");
    else if (requested === "toolboxes") setTab("Toolboxes");
  }, []);

  const switchTab = (next: Tab) => {
    setTab(next);
    window.history.replaceState(
      null,
      "",
      `/build/tools?tab=${TAB_PARAM[next]}`
    );
  };

  return (
    <div className="page build-tools-page">
      <h1 className="page-title">Tools</h1>
      <div className="tabbar build-tools-tabs" role="tablist">
        {TABS.map((item) => (
          <button
            key={item}
            role="tab"
            aria-selected={tab === item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => switchTab(item)}
          >
            {item}
            {item === "Skills" && (
              <span className="badge gray preview-tag">Preview</span>
            )}
          </button>
        ))}
      </div>

      {tab === "Toolboxes" && <Toolboxes />}
      {tab === "Tools" && <ConnectedTools />}
      {tab === "Skills" && <SkillsPanel />}
    </div>
  );
}
