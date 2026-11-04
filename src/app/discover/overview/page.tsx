// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  Book20Regular,
  Calculator20Regular,
  ChevronRight20Regular,
  Dismiss20Regular,
  Globe20Regular,
} from "@fluentui/react-icons";
import { useApi, useModels } from "@/lib/client";
import { ModelLogo } from "@/components/Logos";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { publisherLabel, runtimeLabel, taskLabel } from "@/lib/model-info";
import type { Agent, LocalModel, Trace } from "@/lib/types";

const COLLECTIONS = [
  {
    title: "Local and cached",
    desc: "Flagship models from leading providers, delivered with the same OpenAI-compatible surface.",
    href: "/discover/models",
    filter: "",
    image: "/images/collection-azure.svg",
  },
  {
    title: "Open models",
    desc: "Open models discovered and run on this computer.",
    href: "/discover/models?provider=foundry",
    filter: "",
    image: "/images/collection-labs.svg",
  },
  {
    title: "Local runtime",
    desc: "Run models locally to reduce costs and keep data on your device.",
    href: "/discover/models?provider=foundry",
    filter: "",
    image: "/images/collection-local.svg",
  },
];

const FEATURED_TOOLS = [
  {
    id: "web-search",
    name: "Web search",
    icon: <Globe20Regular />,
    desc: "Search DuckDuckGo at request time and inject fresh results into the agent's system prompt. No API key.",
    type: "Remote HTTP",
  },
  {
    id: "file-search",
    name: "Local file search",
    icon: <Book20Regular />,
    desc: "Retrieve grounded chunks from knowledge bases indexed on this computer, with numbered citations.",
    type: "Local retrieval",
  },
  {
    id: "calculator",
    name: "Calculator",
    icon: <Calculator20Regular />,
    desc: "Evaluate arithmetic in the user's prompt and hand the exact result to the model.",
    type: "Local function",
  },
];

export default function DiscoverOverview() {
  const { toast } = useToast();
  const { data: modelData, loading } = useModels(30000);
  const { data: traceData } = useApi<{ traces: Trace[] }>("/api/traces", 15000);
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");

  const models = modelData?.models ?? [];
  const traces = traceData?.traces ?? [];
  const agents = agentData?.agents ?? [];

  const [toolFor, setToolFor] = useState<(typeof FEATURED_TOOLS)[number] | null>(null);
  const [agentId, setAgentId] = useState("");
  const [saving, setSaving] = useState(false);

  const featured = useMemo(() => {
    const sorted = [...models].sort((a, b) => {
      if (a.loaded !== b.loaded) return Number(b.loaded) - Number(a.loaded);
      if (a.cached !== b.cached) return Number(b.cached) - Number(a.cached);
      return a.displayName.localeCompare(b.displayName);
    });
    const seen = new Set<string>();
    const picks: LocalModel[] = [];
    for (const model of sorted) {
      const key = model.displayName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(model);
      if (picks.length >= 10) break;
    }
    return picks;
  }, [models]);

  const publishers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models) {
      counts.set(model.publisher, (counts.get(model.publisher) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([name]) => name);
  }, [models]);

  const leaderboard = useMemo(() => {
    return models
      .map((model) => {
        const runs = traces.filter(
          (trace) =>
            trace.model === model.id ||
            trace.model === model.name ||
            model.id.includes(trace.model)
        );
        const latency = runs.length
          ? runs.reduce((sum, trace) => sum + trace.latencyMs, 0) / runs.length
          : null;
        const tokens = runs.reduce((sum, trace) => sum + trace.completionTokens, 0);
        const wall = runs.reduce((sum, trace) => sum + trace.latencyMs, 0) / 1000;
        return {
          model,
          runs: runs.length,
          latency,
          throughput: wall > 0 ? tokens / wall : 0,
          tokens,
        };
      })
      .filter((row) => row.runs > 0)
      .sort((a, b) => (a.latency || 0) - (b.latency || 0))
      .slice(0, 7);
  }, [models, traces]);

  const addTool = async () => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent || !toolFor) return;
    setSaving(true);
    try {
      const tools = agent.tools.includes(toolFor.id)
        ? agent.tools
        : [...agent.tools, toolFor.id];
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools }),
      });
      if (!res.ok) throw new Error("Could not update the agent");
      toast(`${toolFor.name} enabled on ${agent.name}`, "success");
      setToolFor(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="discover-wrap" style={{ paddingTop: 0 }}>
        <div className="row between">
          <div>
            <h1 className="discover-title" style={{ marginBottom: 6 }}>
              Discover what&apos;s possible
            </h1>
            <p className="muted text-13" style={{ marginBottom: 28 }}>
              Models, tools and collections discovered from the runtimes on this
              computer.
            </p>
          </div>
        </div>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Featured models</h2>
            <Link href="/discover/models" className="btn btn-sm btn-secondary">
              View all models
            </Link>
          </div>
          {loading && featured.length === 0 ? (
            <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
              <Spinner /> Discovering models…
            </div>
          ) : (
            <div
              className="featured-grid"
              style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}
            >
              {featured.map((model) => (
                <Link
                  className="featured-item"
                  key={model.key}
                  href={`/discover/models/${encodeURIComponent(model.key)}`}
                >
                  <ModelLogo publisher={publisherLabel(model)} name={model.displayName} size={32} />
                  <span className="min-w-0">
                    <span className="featured-name">{model.displayName}</span>
                    <span className="featured-task">
                      {taskLabel(model.task)}
                    </span>
                    <span className="featured-task" style={{ display: "block" }}>
                      {publisherLabel(model)}
                    </span>
                  </span>
                </Link>
              ))}
              {featured.length === 0 && (
                <p className="muted text-13">
                  No models discovered. Start Local runtime or Ollama and reload.
                </p>
              )}
            </div>
          )}
        </section>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Explore models from popular publishers</h2>
          </div>
          <div className="publisher-grid">
            {publishers.map((publisher) => (
              <Link
                className="publisher-card"
                key={publisher}
                href={`/discover/models?publisher=${encodeURIComponent(publisher)}`}
              >
                <ModelLogo publisher={publisher} name={publisher} size={22} />
                <span className="truncate">{publisher}</span>
              </Link>
            ))}
            {publishers.length === 0 && (
              <span className="muted text-13">Publishers appear when models are discovered.</span>
            )}
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Browse our model collections</h2>
          </div>
          <div className="collection-grid">
            {COLLECTIONS.map((collection) => (
              <Link
                className="collection-card"
                key={collection.title}
                href={collection.href}
                style={{ backgroundImage: `url(${collection.image})` }}
              >
                <span className="collection-title">{collection.title}</span>
                <span className="collection-desc">{collection.desc}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Model leaderboard</h2>
            <Link href="/discover/models?view=leaderboard" className="btn btn-sm btn-secondary">
              Go to leaderboard
            </Link>
          </div>
          <p className="muted text-12" style={{ marginTop: -6, marginBottom: 10 }}>
            Measured on this computer from saved traces. Models appear after their
            first run.
          </p>
          <div className="leaderboard">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Models</th>
                  <th style={{ width: 150 }}>Task</th>
                  <th style={{ width: 90 }}>Runs</th>
                  <th style={{ width: 130 }}>
                    Average latency
                    <small>Lower is better</small>
                  </th>
                  <th style={{ width: 150 }}>
                    Throughput
                    <small>Tokens / second</small>
                  </th>
                  <th style={{ width: 130 }}>Completion tokens</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((row) => (
                  <tr key={row.model.key}>
                    <td>
                      <Link
                        className="agent-name"
                        href={`/discover/models/${encodeURIComponent(row.model.key)}`}
                      >
                        {row.model.displayName}
                      </Link>
                    </td>
                    <td>{taskLabel(row.model.task)}</td>
                    <td>{row.runs}</td>
                    <td>{row.latency ? `${Math.round(row.latency)} ms` : "—"}</td>
                    <td>{row.throughput ? `${row.throughput.toFixed(1)} tok/s` : "—"}</td>
                    <td>{row.tokens || "—"}</td>
                  </tr>
                ))}
                {leaderboard.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 32 }}>
                      No measurements yet.{" "}
                      <Link href="/playground" className="link">
                        Open the playground
                      </Link>{" "}
                      and send a prompt to populate the leaderboard.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="discover-section" style={{ marginBottom: 24 }}>
          <div className="discover-section-head">
            <h2 className="discover-section-title">Featured tools</h2>
            <Link href="/discover/tools" className="btn btn-sm btn-secondary">
              View all tools
            </Link>
          </div>
          <div className="tool-cards">
            {FEATURED_TOOLS.map((tool) => (
              <div className="tool-card" key={tool.id}>
                <span className="kb-icon">{tool.icon}</span>
                <div className="min-w-0" style={{ flex: 1 }}>
                  <div className="row between">
                    <strong className="text-14">{tool.name}</strong>
                    <span className="badge gray">{tool.type}</span>
                  </div>
                  <p className="text-12 muted" style={{ marginTop: 4, lineHeight: "18px" }}>
                    {tool.desc}
                  </p>
                  <div className="row mt-8" style={{ gap: 8 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={agents.length === 0}
                      onClick={() => {
                        setAgentId(agents[0]?.id || "");
                        setToolFor(tool);
                      }}
                    >
                      <Add20Regular /> Add to agent
                    </button>
                    <Link href="/discover/tools" className="btn btn-sm btn-ghost">
                      Details <ChevronRight20Regular />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {toolFor && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setToolFor(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label={`Add ${toolFor.name}`}>
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add {toolFor.name}</h2>
                <p className="dialog-sub">
                  The tool runs from this computer when the selected agent is used.
                </p>
              </div>
              <button className="icon-button" onClick={() => setToolFor(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent</span>
                <Select
                  className="select"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.tools.includes(toolFor.id) ? " · already enabled" : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <p className="muted text-12">
                You can remove the tool later in the agent builder&apos;s Tools
                section. Tools are saved in the agent configuration.
              </p>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setToolFor(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={saving || !agentId} onClick={addTool}>
                {saving ? <Spinner /> : <Add20Regular />} Add tool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
