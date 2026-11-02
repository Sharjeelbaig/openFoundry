"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  CheckmarkCircle20Regular,
  DataBarVertical20Regular,
  Dismiss20Regular,
  Info20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { formatBytes, formatDate, formatNumber, useApi, useDeployments } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { LocalModel, LocalSettings, QuotaRequest } from "@/lib/types";

type Tab = "Quota" | "Usage";

export default function QuotaPage() {
  const { toast } = useToast();
  const { data: systemData } = useApi<{
    stats: {
      hostname: string;
      totalMem: number;
      freeMem: number;
      disk: { total: number; free: number };
      cpuCount: number;
      tokens: number;
      traces: number;
    };
  }>("/api/system", 10000);
  const { data: deploymentData } = useDeployments(8000);
  const { data: modelData } = useApi<{ models: LocalModel[] }>("/api/models", 30000);
  const { data: settingsData } = useApi<{ settings: LocalSettings }>("/api/settings");
  const { data: requestData, refresh: refreshRequests } = useApi<{
    requests: QuotaRequest[];
  }>("/api/quota-requests");
  const settings = settingsData?.settings;
  const requests = requestData?.requests ?? [];

  const stats = systemData?.stats;
  const deployments = deploymentData?.deployments ?? [];
  const models = modelData?.models ?? [];

  const [tab, setTab] = useState<Tab>("Quota");
  const [requestOpen, setRequestOpen] = useState(false);
  const [requested, setRequested] = useState(4);
  const [reason, setReason] = useState("");

  const memoryUsed = stats ? stats.totalMem - stats.freeMem : 0;
  const memoryPercent = stats?.totalMem
    ? Math.min(100, Math.round((memoryUsed / stats.totalMem) * 100))
    : 0;
  const diskUsed = stats ? stats.disk.total - stats.disk.free : 0;
  const diskPercent = stats?.disk.total
    ? Math.min(100, Math.round((diskUsed / stats.disk.total) * 100))
    : 0;
  const cached = models.filter((model) => model.cached);
  const cachedBytes = cached.reduce((sum, model) => sum + (model.sizeBytes || 0), 0);
  const capacity = deployments.reduce((sum, item) => sum + item.capacity, 0);

  const submitRequest = async () => {
    try {
      const res = await fetch("/api/quota-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedInstances: requested, reason }),
      });
      if (!res.ok) throw new Error("Could not record the request");
      toast(
        `Recorded a local request for ${requested} instances. Free memory by stopping deployments.`,
        "info"
      );
      setRequestOpen(false);
      setReason("");
      refreshRequests();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Request failed", "error");
    }
  };

  const rows = useMemo(
    () =>
      deployments.map((deployment) => ({
        deployment,
        share: stats?.totalMem
          ? Math.min(100, Math.round(((deployment.capacity * 2 * 1024 ** 3) / stats.totalMem) * 100))
          : 0,
      })),
    [deployments, stats?.totalMem]
  );

  return (
    <div className="page manage-page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <h1 className="page-title">Quota</h1>
          <span className="badge gray">Local runtime</span>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setRequestOpen(true)}>
            <Add20Regular /> Request increase
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        {(["Quota", "Usage"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="quota-toolbar">
        <Select className="select" style={{ width: 240 }} aria-label="Subscription">
          <option>Subscription: {settings?.subscriptionName || "Local subscription"}</option>
        </Select>
        <Select className="select" style={{ width: 240 }} aria-label="Project">
          <option>Project: {settings?.projectName || "local-project"}</option>
        </Select>
        <span className="grow" />
        <span className="muted text-12">
          Quota is enforced by the hardware on this computer, not by a cloud service.
        </span>
      </div>

      {tab === "Quota" && (
        <>
          <div className="metric-grid mt-16">
            <div className="operate-card">
              <span className="metric-label">Memory available</span>
              <span className="metric-value">
                {stats ? formatBytes(stats.freeMem) : "—"}
              </span>
              <div className="quota-bar mt-8">
                <span
                  style={{
                    width: `${Math.max(2, 100 - memoryPercent)}%`,
                    background: memoryPercent > 85 ? "#F1707B" : undefined,
                  }}
                />
              </div>
              <span className="metric-note">
                {stats
                  ? `${formatBytes(memoryUsed)} of ${formatBytes(stats.totalMem)} in use`
                  : "Reading memory"}
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Disk for model cache</span>
              <span className="metric-value">
                {stats ? formatBytes(stats.disk.free) : "—"}
              </span>
              <div className="quota-bar mt-8">
                <span style={{ width: `${Math.max(2, 100 - diskPercent)}%` }} />
              </div>
              <span className="metric-note">
                {stats ? `${diskPercent}% of the volume is used` : "Reading disk"}
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Local model instances</span>
              <span className="metric-value">{capacity} / {Math.max(10, capacity)}</span>
              <div className="quota-bar mt-8">
                <span style={{ width: `${Math.min(100, capacity * 10)}%` }} />
              </div>
              <span className="metric-note">
                Sum of deployment instances · logical concurrency
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Token throughput</span>
              <span className="metric-value">Unmetered</span>
              <span className="metric-note">
                {formatNumber(stats?.tokens || 0)} deployment tokens ·{" "}
                {formatNumber(stats?.traces || 0)} traces
              </span>
            </div>
          </div>

          <div className="banner info mb-16">
            <Info20Regular />
            <span>
              There is no cloud subscription here, so there is no token-per-minute
              quota to request. The only real limits are RAM, disk space and how many
              models the runtime can hold in memory at once.
            </span>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Deployment</th>
                  <th style={{ width: 220 }}>Model</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 110 }}>Instances</th>
                  <th style={{ width: 190 }}>Memory estimate</th>
                  <th style={{ width: 130 }}>Requests</th>
                  <th style={{ width: 120 }}>Tokens</th>
                  <th style={{ width: 90 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ deployment, share }) => (
                  <tr key={deployment.id}>
                    <td className="cell-strong">{deployment.name}</td>
                    <td className="truncate" style={{ maxWidth: 220 }}>
                      {deployment.modelName}
                    </td>
                    <td>
                      <StatusBadge status={deployment.status} />
                    </td>
                    <td>{deployment.capacity}</td>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <span className="quota-bar" style={{ flex: 1 }}>
                          <span style={{ width: `${Math.max(3, share)}%` }} />
                        </span>
                        <span className="text-12 muted">{share}%</span>
                      </span>
                    </td>
                    <td>{formatNumber(deployment.requests)}</td>
                    <td>{formatNumber(deployment.tokens)}</td>
                    <td>
                      <Link href="/build/models/deployments" className="btn btn-sm btn-outline">
                        Manage
                      </Link>
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 40 }}>
                      No deployments yet. Deploy a model to see its local capacity here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "Usage" && (
        <>
          <div className="manage-analysis-grid mt-16">
            <div className="operate-card">
              <div className="row between mb-12">
                <h3>Model cache</h3>
                <span className="text-12 muted">
                  {cached.length} of {models.length} models downloaded
                </span>
              </div>
              <div className="facts-list">
                <div className="fact-row">
                  <span>Cached model bytes</span>
                  <span>{formatBytes(cachedBytes)}</span>
                </div>
                <div className="fact-row">
                  <span>Free disk</span>
                  <span>{stats ? formatBytes(stats.disk.free) : "—"}</span>
                </div>
                <div className="fact-row">
                  <span>Downloadable models</span>
                  <span>{models.length - cached.length}</span>
                </div>
              </div>
              <Link href="/discover/models" className="btn btn-secondary btn-sm mt-12">
                Browse models
              </Link>
            </div>
            <div className="operate-card">
              <div className="row between mb-12">
                <h3>Runtime</h3>
                <ArrowSync20Regular className="muted" />
              </div>
              <div className="facts-list">
                <div className="fact-row">
                  <span>Host</span>
                  <span>{stats?.hostname || "—"}</span>
                </div>
                <div className="fact-row">
                  <span>CPU cores</span>
                  <span>{stats?.cpuCount || "—"}</span>
                </div>
                <div className="fact-row">
                  <span>Memory</span>
                  <span>{stats ? formatBytes(stats.totalMem) : "—"}</span>
                </div>
                <div className="fact-row">
                  <span>Disk volume</span>
                  <span>{stats ? formatBytes(stats.disk.total) : "—"}</span>
                </div>
              </div>
            </div>
            <div className="operate-card">
              <div className="row between mb-12">
                <h3>Usage policy</h3>
                {memoryPercent < 85 ? (
                  <span className="badge green">
                    <CheckmarkCircle20Regular /> Healthy
                  </span>
                ) : (
                  <span className="badge warning">
                    <Warning20Regular /> High memory
                  </span>
                )}
              </div>
              <p className="muted text-13" style={{ lineHeight: "20px" }}>
                Local usage is not billed. Deleting a deployment unloads its model from
                memory; deleting the cached weights is a separate step in the runtime.
              </p>
              <Link href="/build/models/deployments" className="btn btn-secondary btn-sm mt-12">
                Manage deployments
              </Link>
            </div>
          </div>
        </>
      )}

      <div className="manage-section-title">Capacity requests</div>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Request</th>
              <th style={{ width: 140 }}>Instances</th>
              <th style={{ width: 140 }}>Status</th>
              <th style={{ width: 190 }}>Recorded</th>
              <th>Justification</th>
            </tr>
          </thead>
          <tbody>
            {requests.map((request) => (
              <tr key={request.id}>
                <td className="mono text-12">{request.id}</td>
                <td>{request.requestedInstances}</td>
                <td>
                  <span className="badge gray">{request.status}</span>
                </td>
                <td>{formatDate(request.createdAt)}</td>
                <td className="muted truncate" style={{ maxWidth: 420 }}>
                  {request.reason || "—"}
                </td>
              </tr>
            ))}
            {requests.length === 0 && (
              <tr>
                <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 28 }}>
                  No capacity requests. This computer enforces limits directly through
                  its hardware.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {!stats && (
        <div className="row mt-16" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Reading local quota…
        </div>
      )}

      {requestOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRequestOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Request quota increase">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Request a quota increase</h2>
                <p className="dialog-sub">
                  This local build cannot raise hardware limits, but the request is
                  recorded so you can see how the workflow would behave.
                </p>
              </div>
              <button className="icon-button" onClick={() => setRequestOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Requested instances</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={64}
                  value={requested}
                  onChange={(event) => setRequested(Number(event.target.value))}
                />
                <span className="field-hint">
                  Current local capacity: {capacity} instances. Extra instances share
                  the same GPU and memory.
                </span>
              </label>
              <label className="field">
                <span className="field-label">Justification</span>
                <textarea
                  className="textarea"
                  placeholder="What workload needs more capacity?"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </label>
              <div className="banner">
                <DataBarVertical20Regular />
                <span>
                  This local build cannot request more hardware.
                  Here the only action available is freeing memory by stopping
                  deployments you are not using.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setRequestOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={submitRequest}>
                Record request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
