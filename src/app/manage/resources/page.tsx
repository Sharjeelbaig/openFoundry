"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowSync20Regular,
  Cloud20Regular,
  Copy20Regular,
  DeveloperBoard20Regular,
  HardDrive20Regular,
  Info20Regular,
  Server20Regular,
} from "@fluentui/react-icons";
import { formatBytes, formatDate, formatNumber, useApi } from "@/lib/client";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import type {
  EvaluationRun,
  KnowledgeBase,
  LocalModel,
  LocalSettings,
  ProviderStatus,
} from "@/lib/types";

export default function ResourcesPage() {
  const { data, refresh } = useApi<{
    stats: {
      hostname: string;
      platform: string;
      release: string;
      cpuModel: string;
      cpuCount: number;
      totalMem: number;
      freeMem: number;
      loadAvg: number[];
      uptime: number;
      disk: { total: number; free: number };
      node: string;
      agents: number;
      deployments: number;
      knowledgeBases: number;
      traces: number;
      tokens: number;
    };
    providers: ProviderStatus[];
    error?: string;
  }>("/api/system", 15000);
  const { data: modelData } = useApi<{ models: LocalModel[] }>("/api/models", 30000);
  const { data: settingsData } = useApi<{ settings: LocalSettings }>("/api/settings");
  const { data: knowledgeData } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
    15000
  );
  const { data: evaluationData } = useApi<{ evaluations: EvaluationRun[] }>(
    "/api/evaluations",
    15000
  );
  const { data: gatewayData } = useApi<{ gateway?: unknown }>("/api/gateway", 15000);
  const settings = settingsData?.settings;
  const evaluations = evaluationData?.evaluations ?? [];
  const knowledgeBases = knowledgeData?.knowledgeBases ?? [];
  const knowledgeBytes = knowledgeBases.reduce(
    (sum, base) =>
      sum + base.documents.reduce((docSum, doc) => docSum + doc.size, 0),
    0
  );

  const stats = data?.stats;
  const providers = data?.providers ?? [];
  const models = modelData?.models ?? [];
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const cached = models.filter((model) => model.cached);
  const cacheBytes = cached.reduce((sum, model) => sum + (model.sizeBytes || 0), 0);
  const diskUsed = stats ? stats.disk.total - stats.disk.free : 0;

  const connections = useMemo(
    () =>
      providers.map((provider) => ({
        ...provider,
        status: provider.online ? "Running" : "Stopped",
        models: models.filter((model) => model.provider === provider.id),
      })),
    [providers, models]
  );

  return (
    <div className="page manage-page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="page-title">Resource details</h1>
            <span className="badge gray">Local</span>
          </div>
          <p className="page-subtitle">
            The computer acting as the Foundry resource for this project.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={refresh}>
            <ArrowSync20Regular /> Refresh
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        <button className="tab active">Overview</button>
        <button className="tab" onClick={() => window.scrollTo({ top: 600, behavior: "smooth" })}>
          Connections
        </button>
      </div>

      <div className="resource-hero">
        <span className="resource-icon">
          <Server20Regular />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2>{settings?.resourceName || stats?.hostname || "This computer"}</h2>
          <p className="muted text-13">
            {stats?.cpuModel || "Apple Silicon"} · {stats?.cpuCount || "—"} cores ·{" "}
            {stats ? formatBytes(stats.totalMem) : "—"} memory · {stats?.platform || "—"}
          </p>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <span className="badge green">Operational</span>
            <span className="badge gray">Location: {settings?.location || "On device"}</span>
            <span className="badge gray">
              Subscription: {settings?.subscriptionName || "Local subscription"}
            </span>
            <span className="badge gray">
              Resource group: {settings?.resourceGroup || "local-rg"}
            </span>
          </div>
        </div>
      </div>

      <div className="manage-analysis-grid mt-16">
        <div className="operate-card">
          <h3 className="mb-12">Compute</h3>
          <div className="facts-list">
            <div className="fact-row">
              <span>CPU</span>
              <span className="truncate" style={{ maxWidth: 220 }}>
                {stats?.cpuModel || "—"}
              </span>
            </div>
            <div className="fact-row">
              <span>Cores</span>
              <span>{stats?.cpuCount || "—"}</span>
            </div>
            <div className="fact-row">
              <span>Load average</span>
              <span>{stats ? stats.loadAvg.map((value) => value.toFixed(2)).join(" / ") : "—"}</span>
            </div>
            <div className="fact-row">
              <span>Node runtime</span>
              <span>{stats?.node || "—"}</span>
            </div>
            <div className="fact-row">
              <span>Uptime</span>
              <span>
                {stats
                  ? `${Math.floor(stats.uptime / 86400)}d ${Math.floor(
                      (stats.uptime % 86400) / 3600
                    )}h`
                  : "—"}
              </span>
            </div>
          </div>
        </div>

        <div className="operate-card">
          <h3 className="mb-12">Memory</h3>
          <div className="metric-row">
            <span className="metric-value" style={{ fontSize: 26 }}>
              {stats ? formatBytes(stats.freeMem) : "—"}
            </span>
            <span className="muted text-12">free of {stats ? formatBytes(stats.totalMem) : "—"}</span>
          </div>
          <div className="quota-bar mt-8">
            <span
              style={{
                width: stats
                  ? `${Math.max(1, ((stats.totalMem - stats.freeMem) / stats.totalMem) * 100)}%`
                  : "0%",
                background:
                  stats && stats.freeMem / stats.totalMem < 0.15 ? "#F1707B" : undefined,
              }}
            />
          </div>
          <div className="facts-list mt-12">
            <div className="fact-row">
              <span>Used</span>
              <span>{stats ? formatBytes(stats.totalMem - stats.freeMem) : "—"}</span>
            </div>
            <div className="fact-row">
              <span>Deployments holding memory</span>
              <span>{stats?.deployments || 0}</span>
            </div>
          </div>
        </div>

        <div className="operate-card">
          <h3 className="mb-12">Storage</h3>
          <div className="metric-row">
            <span className="metric-value" style={{ fontSize: 26 }}>
              {stats ? formatBytes(diskUsed) : "—"}
            </span>
            <span className="muted text-12">used of {stats ? formatBytes(stats.disk.total) : "—"}</span>
          </div>
          <div className="quota-bar mt-8">
            <span
              style={{
                width: stats && stats.disk.total
                  ? `${Math.max(1, (diskUsed / stats.disk.total) * 100)}%`
                  : "0%",
              }}
            />
          </div>
          <div className="facts-list mt-12">
            <div className="fact-row">
              <span>Model cache</span>
              <span>{formatBytes(cacheBytes)}</span>
            </div>
            <div className="fact-row">
              <span>Free</span>
              <span>{stats ? formatBytes(stats.disk.free) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="operate-card mt-16">
        <div className="row between mb-12">
          <h3>Resource identifiers</h3>
          <Link href="/manage" className="btn btn-sm btn-secondary">
            Edit project
          </Link>
        </div>
        <div className="manage-section">
          <div>
            <div className="manage-field-label">Resource name</div>
            <div className="manage-field-value">
              <span className="truncate">{settings?.resourceName || "local-resource"}</span>
            </div>
          </div>
          <div>
            <div className="manage-field-label">Resource type</div>
            <div className="manage-field-value">openFoundry</div>
          </div>
          <div>
            <div className="manage-field-label">Location</div>
            <div className="manage-field-value">{settings?.location || "On device"}</div>
          </div>
          <div>
            <div className="manage-field-label">Created</div>
            <div className="manage-field-value">
              {settings ? formatDate(settings.resourceCreatedAt).split(",")[0] : "—"}
            </div>
          </div>
          <div>
            <div className="manage-field-label">Project endpoint</div>
            <div className="manage-field-value mono">
              <span className="truncate">{origin ? `${origin}/api/v1` : "/api/v1"}</span>
              <CopyButton
                value={`${origin || "http://localhost:3000"}/api/v1`}
                label="Copy endpoint"
                className="icon-button small"
              />
            </div>
          </div>
          <div>
            <div className="manage-field-label">Storage root</div>
            <div className="manage-field-value mono">./data</div>
          </div>
          <div>
            <div className="manage-field-label">Traces stored</div>
            <div className="manage-field-value">{formatNumber(stats?.traces || 0)}</div>
          </div>
          <div>
            <div className="manage-field-label">Deployment tokens</div>
            <div className="manage-field-value">{formatNumber(stats?.tokens || 0)}</div>
          </div>
          <div>
            <div className="manage-field-label">Tenant ID</div>
            <div className="manage-field-value mono">
              <span className="truncate">{settings?.tenantId || "—"}</span>
            </div>
          </div>
          <div>
            <div className="manage-field-label">Subscription ID</div>
            <div className="manage-field-value mono">
              <span className="truncate">{settings?.subscriptionId || "—"}</span>
            </div>
          </div>
          <div>
            <div className="manage-field-label">Project ID</div>
            <div className="manage-field-value mono">
              <span className="truncate">{settings?.projectId || "—"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="manage-section-title">Connections</div>
      <div className="connection-grid">
        {connections.map((connection) => (
          <div className="operate-card" key={connection.id}>
            <div className="row between">
              <span className="row" style={{ gap: 8 }}>
                <span className="kb-icon">
                  {connection.id === "foundry" ? <DeveloperBoard20Regular /> : <Cloud20Regular />}
                </span>
                <strong>{connection.label}</strong>
              </span>
              <StatusBadge status={connection.status} />
            </div>
            <p className="muted text-12" style={{ margin: "8px 0", lineHeight: "18px" }}>
              {connection.detail}
            </p>
            <div className="facts-list">
              <div className="fact-row">
                <span>Endpoint</span>
                <span className="mono text-12 truncate" style={{ maxWidth: 200 }}>
                  {connection.url || "On device"}
                </span>
              </div>
              <div className="fact-row">
                <span>Models</span>
                <span>
                  {connection.cachedCount} downloaded / {connection.modelCount} known
                </span>
              </div>
              <div className="fact-row">
                <span>Latency</span>
                <span>{connection.latencyMs != null ? `${connection.latencyMs} ms` : "—"}</span>
              </div>
            </div>
          </div>
        ))}
        {connections.length === 0 && (
          <div className="operate-card muted">No local runtimes detected.</div>
        )}
      </div>

      <div className="manage-section-title">Local storage</div>
      <div className="operate-card">
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>File</th>
                <th>Contents</th>
                <th style={{ width: 140 }}>Records</th>
                <th style={{ width: 160 }}>Approx. size</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["agents.json", "Agents and version history", stats?.agents || 0, 2_048],
                ["deployments.json", "Deployments and endpoints", stats?.deployments || 0, 1_024],
                ["knowledge.json", "Knowledge bases, documents, embeddings", stats?.knowledgeBases || 0, knowledgeBytes],
                ["traces.json", "Prompts, responses, token usage", stats?.traces || 0, (stats?.traces || 0) * 900],
                ["evaluations.json", "Quality and red team runs", evaluations.length, evaluations.length * 2048],
                ["gateway.json", "Gateway routing and cache settings", gatewayData?.gateway ? 1 : 0, 512],
                ["settings.json", "Project name, user, disclaimer state", 1, 256],
              ].map(([file, contents, records, size]) => (
                <tr key={file as string}>
                  <td className="mono text-12">{file}</td>
                  <td>{contents}</td>
                  <td>{records}</td>
                  <td>{formatBytes(Number(size))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="banner mt-12">
          <HardDrive20Regular />
          <span>
            Delete the <span className="mono">data/</span> directory to reset the
            project. Model weights live in the Foundry Local and Ollama caches, not
            here, and are managed by those runtimes.
          </span>
        </div>
      </div>

      {!stats && (
        <div className="row mt-16" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Reading resource details…
        </div>
      )}
    </div>
  );
}
