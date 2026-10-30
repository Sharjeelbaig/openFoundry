"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box20Regular,
  Dismiss20Regular,
  DocumentText20Regular,
  PeopleTeam20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import type { Agent, Deployment, LocalModel } from "@/lib/types";

interface Result {
  id: string;
  label: string;
  hint: string;
  group: string;
  href: string;
}

const PAGES: Result[] = [
  { id: "home", label: "Home", hint: "Welcome and recent work", group: "Pages", href: "/" },
  { id: "discover", label: "Discover overview", hint: "Featured models and collections", group: "Pages", href: "/discover/overview" },
  { id: "models", label: "Models catalog", hint: "Browse local and cached models", group: "Pages", href: "/discover/models" },
  { id: "agents", label: "Agents", hint: "Create and manage agents", group: "Pages", href: "/build/agents" },
  { id: "deployments", label: "Deployments", hint: "Local model deployments", group: "Pages", href: "/build/models/deployments" },
  { id: "knowledge", label: "Knowledge", hint: "Foundry IQ knowledge bases", group: "Pages", href: "/build/knowledge/search" },
  { id: "evaluations", label: "Evaluations", hint: "Run local agent evaluations", group: "Pages", href: "/build/evaluations" },
  { id: "operate", label: "Operate", hint: "Local runtime overview", group: "Pages", href: "/operate" },
  { id: "manage", label: "Manage", hint: "Project and resource details", group: "Pages", href: "/manage" },
  { id: "docs", label: "Docs", hint: "How this local build works", group: "Pages", href: "/docs" },
];

export default function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<Agent[]>([]);
  const [deployments, setDeployments] = useState<Deployment[]>([]);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((value) => !value);
      }
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("foundry:search", onOpen);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("foundry:search", onOpen);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setActive(0);
      return;
    }
    setTimeout(() => inputRef.current?.focus(), 20);
    Promise.all([
      fetch("/api/agents").then((r) => r.json()).catch(() => ({ agents: [] })),
      fetch("/api/deployments").then((r) => r.json()).catch(() => ({ deployments: [] })),
      fetch("/api/models").then((r) => r.json()).catch(() => ({ models: [] })),
    ]).then(([a, d, m]) => {
      setAgents(a.agents || []);
      setDeployments(d.deployments || []);
      setModels(m.models || []);
    });
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const fromAgents: Result[] = agents.map((agent) => ({
      id: `agent-${agent.id}`,
      label: agent.name,
      hint: `Agent · v${agent.version} · ${agent.status}`,
      group: "Agents",
      href: `/build/agents/${encodeURIComponent(agent.id)}/build`,
    }));
    const fromDeployments: Result[] = deployments.map((deployment) => ({
      id: `dep-${deployment.id}`,
      label: deployment.name,
      hint: `Deployment · ${deployment.modelName} · ${deployment.status}`,
      group: "Deployments",
      href: "/build/models/deployments",
    }));
    const fromModels: Result[] = models.slice(0, 60).map((model) => ({
      id: `model-${model.key}`,
      label: model.displayName,
      hint: `${model.providerLabel} · ${model.task}${model.cached ? " · downloaded" : ""}`,
      group: "Models",
      href: `/discover/models/${encodeURIComponent(model.key)}`,
    }));
    const all = [...PAGES, ...fromAgents, ...fromDeployments, ...fromModels];
    if (!q) return all.slice(0, 12);
    return all
      .filter(
        (item) =>
          item.label.toLowerCase().includes(q) ||
          item.hint.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [agents, deployments, models, query]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  if (!open) return null;

  const go = (result: Result) => {
    setOpen(false);
    router.push(result.href);
  };

  return (
    <div
      className="dialog-backdrop"
      style={{ alignItems: "flex-start", paddingTop: "12vh" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setOpen(false);
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Search openFoundry"
        style={{ width: 620 }}
      >
        <div
          className="row"
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid var(--stroke-4)",
            gap: 10,
          }}
        >
          <Search20Regular style={{ color: "var(--fg-3)" }} />
          <input
            ref={inputRef}
            className="input"
            style={{
              border: 0,
              background: "transparent",
              padding: 0,
              height: 30,
              fontSize: 16,
            }}
            placeholder="Search pages, agents, deployments and models"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive((value) =>
                  Math.min(value + 1, Math.max(results.length - 1, 0))
                );
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive((value) => Math.max(value - 1, 0));
              } else if (event.key === "Enter" && results[active]) {
                go(results[active]);
              }
            }}
          />
          <button className="icon-button small" onClick={() => setOpen(false)} aria-label="Close search">
            <Dismiss20Regular />
          </button>
        </div>
        <div style={{ maxHeight: 420, overflowY: "auto", padding: 6 }}>
          {results.length === 0 && (
            <div className="muted" style={{ padding: 24, textAlign: "center" }}>
              No matches for “{query}”
            </div>
          )}
          {results.map((result, index) => {
            const Icon =
              result.group === "Agents"
                ? PeopleTeam20Regular
                : result.group === "Deployments"
                ? Box20Regular
                : result.group === "Models"
                ? Box20Regular
                : DocumentText20Regular;
            return (
              <button
                key={result.id}
                className="menu-item"
                style={{
                  height: 44,
                  background:
                    active === index ? "var(--bg-hover)" : "transparent",
                }}
                onMouseEnter={() => setActive(index)}
                onClick={() => go(result)}
              >
                <Icon style={{ color: "var(--fg-3)" }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    className="truncate"
                    style={{ display: "block", fontWeight: 600 }}
                  >
                    {result.label}
                  </span>
                  <span
                    className="truncate muted"
                    style={{ display: "block", fontSize: 11 }}
                  >
                    {result.hint}
                  </span>
                </span>
                <span className="badge gray">{result.group}</span>
              </button>
            );
          })}
        </div>
        <div
          className="row between muted text-12"
          style={{ borderTop: "1px solid var(--stroke-4)", padding: "8px 14px" }}
        >
          <span>↑↓ to navigate · Enter to open</span>
          <span>⌘K</span>
        </div>
      </div>
    </div>
  );
}
