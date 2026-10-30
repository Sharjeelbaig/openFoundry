"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  Alert20Regular,
  ChevronDown20Regular,
  Dismiss20Regular,
  Info20Regular,
  Play20Regular,
  Shield20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { formatDate, formatNumber, useApi, useDeployments, useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent, Deployment, KnowledgeBase, LocalSettings, Trace } from "@/lib/types";

type Range = "1D" | "7D" | "1M";

export default function OperatePage() {
  const { toast } = useToast();
  const [range, setRange] = useState<Range>("7D");
  const [alertsOpen, setAlertsOpen] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerId, setRegisterId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: agentData, refresh: refreshAgents } = useApi<{ agents: Agent[] }>(
    "/api/agents"
  );
  const { data: deploymentData } = useDeployments(5000);
  const { data: knowledgeData } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
    10000
  );
  const { data: traceData } = useApi<{ traces: Trace[] }>("/api/traces", 5000);
  const { data: modelData } = useModels(30000);
  const { data: evalData } = useApi<{ evaluations: { results: { ok: boolean }[]; type: string }[] }>(
    "/api/evaluations",
    10000
  );
  const { data: settingsData } = useApi<{ settings: LocalSettings }>("/api/settings");
  const { data: systemData } = useApi<{
    stats: {
      now: string;
      hostname: string;
      platform: string;
      cpuModel: string;
      tokens: number;
    };
  }>("/api/system");

  const agents = agentData?.agents ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const knowledgeBases = knowledgeData?.knowledgeBases ?? [];
  const traces = traceData?.traces ?? [];
  const providers = modelData?.providers ?? [];
  const evaluations = evalData?.evaluations ?? [];
  const settings = settingsData?.settings;
  const running = agents.filter((agent) => agent.status === "Running").length;

  const nowMs = systemData ? new Date(systemData.stats.now).getTime() : 0;
  const windowMs = range === "1D" ? 86400000 : range === "7D" ? 604800000 : 2592000000;
  const current = traces.filter(
    (trace) => nowMs - new Date(trace.at).getTime() <= windowMs
  );
  const previous = traces.filter((trace) => {
    const age = nowMs - new Date(trace.at).getTime();
    return age > windowMs && age <= windowMs * 2;
  });

  const tokens = current.reduce(
    (sum, trace) => sum + trace.promptTokens + trace.completionTokens,
    0
  );
  const successes = current.filter((trace) => !trace.error).length;
  const successRate = current.length
    ? Math.round((successes / current.length) * 100)
    : null;

  const evalResults = evaluations.flatMap((run) => run.results || []);
  const evalPassRate = evalResults.length
    ? Math.round(
        (evalResults.filter((result) => result.ok).length / evalResults.length) * 100
      )
    : null;

  const alerts = useMemo(() => {
    const list: {
      id: string;
      severity: "error" | "warning" | "info";
      title: string;
      detail: string;
      href: string;
    }[] = [];
    for (const deployment of deployments) {
      if (deployment.status === "Failed")
        list.push({
          id: `dep-${deployment.id}`,
          severity: "error",
          title: `${deployment.name} failed to deploy`,
          detail: "The local runtime could not download or load this model.",
          href: "/build/models/deployments",
        });
      if (deployment.status === "Creating")
        list.push({
          id: `creating-${deployment.id}`,
          severity: "info",
          title: `${deployment.name} is downloading`,
          detail: "Local runtime is fetching weights in the background.",
          href: "/build/models/deployments",
        });
    }
    for (const base of knowledgeBases) {
      if (base.status === "Failed")
        list.push({
          id: `kb-${base.id}`,
          severity: "error",
          title: `${base.name} failed to index`,
          detail: "Check the embedding runtime and reindex.",
          href: `/build/knowledge/${encodeURIComponent(base.id)}`,
        });
    }
    for (const provider of providers) {
      if (!provider.online && provider.id !== "huggingface")
        list.push({
          id: `provider-${provider.id}`,
          severity: "warning",
          title: `${provider.label} is offline`,
          detail: provider.detail,
          href: "/manage/resources",
        });
    }
    return list;
  }, [deployments, knowledgeBases, providers]);

  const daily = useMemo(() => {
    const days = range === "1D" ? 24 : range === "7D" ? 7 : 30;
    const buckets = Array.from({ length: days }, () => 0);
    const now = new Date(nowMs);
    for (const trace of traces) {
      const date = new Date(trace.at);
      const diff =
        range === "1D"
          ? Math.floor((nowMs - date.getTime()) / 3600000)
          : Math.floor(
              (new Date(now.toDateString()).getTime() -
                new Date(date.toDateString()).getTime()) /
                86400000
            );
      if (diff >= 0 && diff < days) buckets[days - 1 - diff] += 1;
    }
    const max = Math.max(...buckets, 1);
    return buckets.map((count, index) => {
      const label =
        range === "1D"
          ? `${(new Date().getHours() - (days - 1 - index) + 24) % 24}:00`
          : new Date(
              nowMs - (days - 1 - index) * 86400000
            ).toLocaleDateString(undefined, { month: "numeric", day: "numeric" });
      return { count, label, height: (count / max) * 100 };
    });
  }, [traces, range, nowMs]);

  const byAgent = useMemo(() => {
    const count = new Map<string, number>();
    for (const trace of current) {
      count.set(trace.agentName || trace.agentId, (count.get(trace.agentName || trace.agentId) || 0) + 1);
    }
    const prevCount = new Map<string, number>();
    for (const trace of previous) {
      prevCount.set(
        trace.agentName || trace.agentId,
        (prevCount.get(trace.agentName || trace.agentId) || 0) + 1
      );
    }
    return [...count.entries()]
      .map(([name, value]) => ({
        name,
        value,
        delta: value - (prevCount.get(name) || 0),
      }))
      .sort((a, b) => b.value - a.value);
  }, [current, previous]);

  const register = async () => {
    if (!registerId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(registerId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      if (!res.ok) throw new Error("Could not register the agent");
      toast("Agent registered in the local project", "success");
      setRegisterOpen(false);
      refreshAgents();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Register failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 10 }}>
          <h1 className="page-title">Overview</h1>
          <span className="preview-tag">Preview</span>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            onClick={() => {
              setRegisterId(agents[0]?.id || "");
              setRegisterOpen(true);
            }}
            disabled={agents.length === 0}
          >
            Register asset
          </button>
        </div>
      </div>

      <div className="operate-toolbar">
        <select className="select" style={{ width: 260 }} aria-label="Subscription">
          <option>Subscription: {settings?.subscriptionName || "Local subscription"}</option>
        </select>
        <select className="select" style={{ width: 300 }} aria-label="Project">
          <option>Project: {settings?.projectName || "local-project"}</option>
        </select>
        <span className="grow" />
        <span className="text-12 muted">
          {new Date(nowMs - windowMs).toLocaleDateString()} –{" "}
          {new Date(nowMs).toLocaleDateString()}
        </span>
        <div className="segmented">
          <button className={range === "1D" ? "active" : ""} onClick={() => setRange("1D")}>
            Last day
          </button>
          <button className={range === "7D" ? "active" : ""} onClick={() => setRange("7D")}>
            7D
          </button>
          <button className={range === "1M" ? "active" : ""} onClick={() => setRange("1M")}>
            1M
          </button>
        </div>
      </div>
      <p className="muted text-12" style={{ marginBottom: 16 }}>
        Local runtime data is always displayed. No project sync is required —{" "}
        {systemData?.stats.hostname || "this computer"} is the only host.
      </p>

      <div className="operate-grid">
        <div className="operate-card" style={{ minHeight: 280 }}>
          <div className="row between mb-12">
            <h3>{alerts.filter((alert) => alert.severity !== "info").length} Active alerts</h3>
            <button
              className="btn btn-sm btn-secondary"
              onClick={() => setAlertsOpen((value) => !value)}
            >
              View all alerts
            </button>
          </div>
          {alertsOpen ? (
            <div className="stack">
              {alerts.map((alert) => (
                <div className="alert-row" key={alert.id}>
                  <span
                    className={`status-dot${
                      alert.severity === "warning" ? " warning" : alert.severity === "error" ? " danger" : ""
                    }`}
                  />
                  <span className="grow">
                    <span className="text-13 strong" style={{ display: "block" }}>
                      {alert.title}
                    </span>
                    <span className="text-12 muted">{alert.detail}</span>
                  </span>
                  <Link href={alert.href} className="btn btn-sm btn-secondary">
                    Open
                  </Link>
                </div>
              ))}
              {alerts.length === 0 && (
                <div className="alert-empty">
                  <span className="status-dot" />
                  <span>No alerts. Every local asset is healthy.</span>
                </div>
              )}
            </div>
          ) : alerts.length === 0 ? (
            <div className="alert-empty">
              <span className="status-dot" />
              <strong>No alerts</strong>
              <span className="text-13 muted">
                Deployments, knowledge indexes and providers look healthy.
              </span>
            </div>
          ) : (
            <div className="stack">
              {alerts.slice(0, 3).map((alert) => (
                <div className="alert-row" key={alert.id}>
                  <span
                    className={`status-dot${
                      alert.severity === "warning" ? " warning" : alert.severity === "error" ? " danger" : ""
                    }`}
                  />
                  <span className="grow text-13">{alert.title}</span>
                  <Alert20Regular style={{ color: "var(--fg-3)" }} />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="stat-grid">
          <div className="operate-card">
            <div className="row between">
              <span className="metric-label">Running agents</span>
              <Info20Regular className="muted" />
            </div>
            <div className="metric-value">{running}</div>
            <div className="metric-note">{agents.length} agents in the project</div>
            <Link href="/build/agents" className="link text-12">
              View all agents
            </Link>
          </div>
          <div className="operate-card">
            <div className="row between">
              <span className="metric-label">Estimated cost</span>
              <Info20Regular className="muted" />
            </div>
            <div className="metric-value">$0.00</div>
            <div className="metric-note">Local compute only</div>
            <span className="text-12 muted">No cloud resources</span>
          </div>
          <div className="operate-card">
            <div className="row between">
              <span className="metric-label">Agent success rate</span>
              <Info20Regular className="muted" />
            </div>
            <div className="metric-value">
              {evalPassRate != null ? `${evalPassRate}%` : successRate != null ? `${successRate}%` : "—"}
            </div>
            <div className="metric-note">
              {evalPassRate != null
                ? "Evaluation passes"
                : `${current.length} runs in range`}
            </div>
            <Link href="/build/evaluations" className="link text-12">
              View evaluations
            </Link>
          </div>
          <div className="operate-card">
            <div className="row between">
              <span className="metric-label">Token usage</span>
              <Info20Regular className="muted" />
            </div>
            <div className="metric-value">{formatNumber(tokens)}</div>
            <div className="metric-note">Prompt + completion tokens</div>
            <span className="text-12 muted">{current.length} runs in range</span>
          </div>
        </div>
      </div>

      <div className="operate-grid mt-16">
        <div className="operate-card">
          <div className="row between mb-12">
            <h3>Agent run volume</h3>
            <span className="text-12 muted">{current.length} runs</span>
          </div>
          {current.length === 0 ? (
            <div className="chart-empty">
              <Play20Regular />
              <span>No runs in this range yet.</span>
              <Link href="/playground" className="btn btn-sm btn-secondary">
                Open playground
              </Link>
            </div>
          ) : (
            <>
              <div className="volume-chart" role="img" aria-label="Runs per day">
                {daily.map((day, index) => (
                  <div className="volume-col" key={index} title={`${day.label}: ${day.count} runs`}>
                    <span className="volume-bar" style={{ height: `${Math.max(2, day.height)}%` }} />
                    <span className="volume-label">{range === "1M" ? (index % 5 === 0 ? day.label : "") : day.label}</span>
                  </div>
                ))}
              </div>
              <div className="facts-list mt-12">
                <div className="fact-row">
                  <span>Successful runs</span>
                  <span>{successes}</span>
                </div>
                <div className="fact-row">
                  <span>Failed runs</span>
                  <span>{current.length - successes}</span>
                </div>
                <div className="fact-row">
                  <span>Average latency</span>
                  <span>
                    {Math.round(
                      current.reduce((sum, trace) => sum + trace.latencyMs, 0) /
                        current.length
                    )}{" "}
                    ms
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="operate-card">
            <h3 className="mb-8">Top increases</h3>
            <div className="stack">
              {byAgent.slice(0, 4).map((agent) => (
                <div className="fact-row" key={agent.name}>
                  <span className="truncate" style={{ maxWidth: 200 }}>
                    {agent.name}
                  </span>
                  <span className="badge green">+{Math.max(1, agent.delta || agent.value)}</span>
                </div>
              ))}
              {byAgent.length === 0 && <p className="muted text-12">No agent activity yet.</p>}
            </div>
          </div>
          <div className="operate-card">
            <h3 className="mb-8">Top decreases</h3>
            <div className="stack">
              {byAgent
                .filter((agent) => agent.delta < 0)
                .slice(0, 4)
                .map((agent) => (
                  <div className="fact-row" key={agent.name}>
                    <span className="truncate" style={{ maxWidth: 200 }}>
                      {agent.name}
                    </span>
                    <span className="badge gray">{agent.delta}</span>
                  </div>
                ))}
              {byAgent.filter((agent) => agent.delta < 0).length === 0 && (
                <p className="muted text-12">No decreases compared with the previous period.</p>
              )}
            </div>
          </div>
          <div className="operate-card">
            <h3 className="mb-8">Local project</h3>
            <div className="facts-list">
              <div className="fact-row">
                <span>Deployments</span>
                <span>{deployments.length}</span>
              </div>
              <div className="fact-row">
                <span>Knowledge bases</span>
                <span>{knowledgeBases.length}</span>
              </div>
              <div className="fact-row">
                <span>Traces stored</span>
                <span>{traces.length}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {registerOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRegisterOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Register asset">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Register asset</h2>
                <p className="dialog-sub">
                  Publish an existing agent so operate metrics treat it as a
                  monitored asset.
                </p>
              </div>
              <button className="icon-button" onClick={() => setRegisterOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent</span>
                <select
                  className="select"
                  value={registerId}
                  onChange={(event) => setRegisterId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.status}
                    </option>
                  ))}
                </select>
              </label>
              <div className="banner">
                <Shield20Regular />
                <span>
                  Registering publishes the current version locally. It does not
                  create an cloud resource or send data off this computer.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setRegisterOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || !registerId} onClick={register}>
                {busy ? <Spinner /> : null} Register
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
