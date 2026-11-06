// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  DataUsage20Regular,
  Dismiss20Regular,
  Edit20Regular,
  Key20Regular,
  PeopleTeam20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { CopyButton, Spinner } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/client";

interface TenantUsage {
  tenant: string;
  tokenPrefix: string;
  quotaResponses: number;
  quotaBytes: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  disabledAt: string | null;
  usage: {
    total: number;
    bytes: number;
    owners: number;
    oldest: string | null;
    newest: string | null;
    responsePercent: number;
    bytePercent: number;
    status: "active" | "disabled" | "near-quota" | "over-quota";
  };
}

interface TenantTotals {
  tenants: number;
  active: number;
  disabled: number;
  overQuota: number;
  responses: number;
  bytes: number;
}

interface AuditEntry {
  id: number;
  tenantId: string;
  action: string;
  responseId: string | null;
  ownerId: string | null;
  bytes: number;
  at: string;
  detail: Record<string, unknown> | null;
}

interface TenantListResponse {
  storeHost: boolean;
  backend: "sqlite" | "http";
  tenants: TenantUsage[];
  totals: TenantTotals;
}

type Tab = "tenants" | "usage";

const EMPTY_TOTALS: TenantTotals = {
  tenants: 0,
  active: 0,
  disabled: 0,
  overQuota: 0,
  responses: 0,
  bytes: 0,
};

function statusLabel(status: TenantUsage["usage"]["status"]): string {
  if (status === "near-quota") return "Near quota";
  if (status === "over-quota") return "Over quota";
  return status === "disabled" ? "Disabled" : "Active";
}

function statusClass(status: TenantUsage["usage"]["status"]): string {
  if (status === "active") return "green";
  if (status === "disabled") return "gray";
  return "warning";
}

export default function ResponseTenantsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<TenantListResponse | null>(null);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [tab, setTab] = useState<Tab>("tenants");
  const [busy, setBusy] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [auditTenant, setAuditTenant] = useState("");

  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createResponses, setCreateResponses] = useState(10_000);
  const [createMb, setCreateMb] = useState(100);

  const [editing, setEditing] = useState<TenantUsage | null>(null);
  const [editResponses, setEditResponses] = useState(10_000);
  const [editMb, setEditMb] = useState(100);
  const [editDisabled, setEditDisabled] = useState(false);

  const [revealed, setRevealed] = useState<{
    tenant: string;
    token: string;
  } | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ limit: "150" });
    if (auditTenant) params.set("tenant", auditTenant);
    const [listRes, auditRes, permissionRes] = await Promise.all([
      fetch("/api/responses/tenants", { cache: "no-store" }),
      fetch(`/api/responses/tenants/audit?${params.toString()}`, {
        cache: "no-store",
      }),
      fetch("/api/directory/assignments", { cache: "no-store" }),
    ]);
    const listJson = (await listRes.json().catch(() => ({}))) as TenantListResponse;
    setData(listJson);
    const auditJson = (await auditRes.json().catch(() => ({}))) as {
      entries?: AuditEntry[];
    };
    setAudit(auditJson.entries || []);
    const permissionJson = (await permissionRes.json().catch(() => ({}))) as {
      me?: { canEditSettings?: boolean };
    };
    setCanEdit(permissionJson.me?.canEditSettings === true);
  }, [auditTenant]);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/responses/tenants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant: createName,
          quotaResponses: Number(createResponses),
          quotaBytes: Math.round(Number(createMb) * 1024 * 1024),
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        tenant?: TenantUsage;
        token?: string;
        error?: string;
      };
      if (!res.ok || !json.tenant || !json.token) {
        throw new Error(json.error || "Could not create the tenant.");
      }
      setRevealed({ tenant: json.tenant.tenant, token: json.token });
      setCreateOpen(false);
      setCreateName("");
      setCreateResponses(10_000);
      setCreateMb(100);
      toast(`Tenant "${json.tenant.tenant}" created`, "success");
      await load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Create tenant failed.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (tenant: TenantUsage) => {
    setEditing(tenant);
    setEditResponses(tenant.quotaResponses);
    setEditMb(Math.max(1, Math.round(tenant.quotaBytes / (1024 * 1024))));
    setEditDisabled(Boolean(tenant.disabledAt));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/responses/tenants/${encodeURIComponent(editing.tenant)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quotaResponses: Number(editResponses),
            quotaBytes: Math.round(Number(editMb) * 1024 * 1024),
            disabled: editDisabled,
          }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update the tenant.");
      setEditing(null);
      toast("Tenant quotas updated", "success");
      await load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Update tenant failed.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const rotate = async (tenant: TenantUsage) => {
    if (
      !window.confirm(
        `Rotate the token for "${tenant.tenant}"? The current token stops working immediately.`
      )
    ) {
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/responses/tenants/${encodeURIComponent(tenant.tenant)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rotateToken: true }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        token?: string;
        error?: string;
      };
      if (!res.ok || !json.token) {
        throw new Error(json.error || "Could not rotate the token.");
      }
      setRevealed({ tenant: tenant.tenant, token: json.token });
      setEditing(null);
      toast("Tenant token rotated", "success");
      await load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Rotate token failed.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const remove = async (tenant: TenantUsage) => {
    const usage = tenant.usage;
    const message =
      usage.total > 0
        ? `Delete tenant "${tenant.tenant}" and purge ${usage.total} stored responses (${formatBytes(
            usage.bytes
          )})? This cannot be undone.`
        : `Delete tenant "${tenant.tenant}"? This cannot be undone.`;
    if (!window.confirm(message)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/responses/tenants/${encodeURIComponent(
          tenant.tenant
        )}?purge=true`,
        { method: "DELETE" }
      );
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete the tenant.");
      setEditing(null);
      toast(`Tenant "${tenant.tenant}" deleted`, "success");
      await load();
    } catch (error) {
      toast(
        error instanceof Error ? error.message : "Delete tenant failed.",
        "error"
      );
    } finally {
      setBusy(false);
    }
  };

  const tenants = data?.tenants ?? [];
  const totals = data?.totals ?? EMPTY_TOTALS;
  const storeHost = data?.storeHost === true;

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <div className="row" style={{ gap: 10 }}>
            <h1 className="page-title">Shared response tenants</h1>
            <span className="badge gray">Usage accounting</span>
          </div>
          <p className="page-subtitle">
            Tenant tokens, quotas, usage and audit for the shared Responses
            store. Tokens are stored as hashes and shown only once when created
            or rotated.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => void load()}>
            <ArrowSync20Regular /> Refresh
          </button>
          {canEdit && storeHost && (
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Add20Regular /> Create tenant
            </button>
          )}
        </div>
      </div>

      <div className="tabbar mt-8">
        {(["tenants", "usage"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item === "tenants" ? "Tenants" : "Usage & audit"}
          </button>
        ))}
      </div>

      {data && !storeHost && (
        <div className="banner info mt-12">
          <PeopleTeam20Regular />
          <span>
            This process is a client of a remote shared store. Tenant
            administration runs on the store host; this page is read-only here.
          </span>
        </div>
      )}

      {revealed && (
        <div className="banner info mt-12" style={{ alignItems: "flex-start" }}>
          <Key20Regular />
          <div style={{ flex: 1 }}>
            <strong>Token for {revealed.tenant} — copy it now.</strong>
            <div className="row mt-4" style={{ gap: 8, alignItems: "center" }}>
              <code className="mono text-12" style={{ wordBreak: "break-all" }}>
                {revealed.token}
              </code>
              <CopyButton value={revealed.token} label="Copy tenant token" />
            </div>
            <span className="muted text-12">
              This token is not shown again. Store it in the client&apos;s
              OPENFOUNDRY_RESPONSE_STORE_TOKEN.
            </span>
          </div>
          <button
            className="icon-button"
            aria-label="Dismiss token"
            onClick={() => setRevealed(null)}
          >
            <Dismiss20Regular />
          </button>
        </div>
      )}

      {tab === "tenants" ? (
        <>
          <div className="metric-grid mt-16">
            <div className="operate-card">
              <span className="metric-label">Tenants</span>
              <span className="metric-value">{totals.tenants}</span>
              <span className="metric-note">
                {totals.active} active · {totals.disabled} disabled
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Stored responses</span>
              <span className="metric-value">{totals.responses}</span>
              <span className="metric-note">Across every tenant</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Stored payload</span>
              <span className="metric-value">{formatBytes(totals.bytes)}</span>
              <span className="metric-note">JSON history, not model tokens</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Over quota</span>
              <span className="metric-value">{totals.overQuota}</span>
              <span className="metric-note">
                New writes return 429 or 413 until raised
              </span>
            </div>
          </div>

          <div className="operate-card mt-16">
            <h3 className="mb-8">Tenant registry</h3>
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Token</th>
                    <th>Status</th>
                    <th>Responses</th>
                    <th>Storage</th>
                    <th>Owners</th>
                    <th>Last used</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.tenant}>
                      <td className="strong">{tenant.tenant}</td>
                      <td className="mono text-12">{tenant.tokenPrefix}…</td>
                      <td>
                        <span className={`badge ${statusClass(tenant.usage.status)}`}>
                          {statusLabel(tenant.usage.status)}
                        </span>
                      </td>
                      <td>
                        {tenant.usage.total}/{tenant.quotaResponses}
                        <div className="quota-bar mt-4">
                          <span
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(2, tenant.usage.responsePercent)
                              )}%`,
                              background:
                                tenant.usage.responsePercent > 100
                                  ? "#F1707B"
                                  : undefined,
                            }}
                          />
                        </div>
                      </td>
                      <td>
                        {formatBytes(tenant.usage.bytes)} /{" "}
                        {formatBytes(tenant.quotaBytes)}
                        <div className="quota-bar mt-4">
                          <span
                            style={{
                              width: `${Math.min(
                                100,
                                Math.max(2, tenant.usage.bytePercent)
                              )}%`,
                              background:
                                tenant.usage.bytePercent > 100
                                  ? "#F1707B"
                                  : undefined,
                            }}
                          />
                        </div>
                      </td>
                      <td>{tenant.usage.owners}</td>
                      <td className="muted text-12">
                        {tenant.lastUsedAt ? formatDate(tenant.lastUsedAt) : "Never"}
                      </td>
                      <td>
                        {canEdit && storeHost && (
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => openEdit(tenant)}
                          >
                            <Edit20Regular /> Manage
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!tenants.length && (
                    <tr>
                      <td colSpan={8} className="muted">
                        No tenants yet. Create one to issue a shared-store token.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="metric-grid mt-16">
            <div className="operate-card">
              <span className="metric-label">Billing model</span>
              <span className="metric-value">Local</span>
              <span className="metric-note">
                Usage accounting only; no payment processor or invoices.
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Response quota</span>
              <span className="metric-value">
                {tenants.reduce((sum, tenant) => sum + tenant.quotaResponses, 0)}
              </span>
              <span className="metric-note">
                Sum of every tenant&apos;s response limit
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Storage quota</span>
              <span className="metric-value">
                {formatBytes(
                  tenants.reduce((sum, tenant) => sum + tenant.quotaBytes, 0)
                )}
              </span>
              <span className="metric-note">
                Sum of every tenant&apos;s payload limit
              </span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Near quota</span>
              <span className="metric-value">
                {
                  tenants.filter((tenant) => tenant.usage.status === "near-quota")
                    .length
                }
              </span>
              <span className="metric-note">
                80–100% of a limit; over-quota is counted separately
              </span>
            </div>
          </div>

          <div className="operate-card mt-16">
            <h3 className="mb-8">Per-tenant usage</h3>
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Tenant</th>
                    <th>Responses</th>
                    <th>Storage</th>
                    <th>Owners</th>
                    <th>Oldest</th>
                    <th>Newest</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.tenant}>
                      <td className="strong">{tenant.tenant}</td>
                      <td>
                        {tenant.usage.total} ({tenant.usage.responsePercent}%)
                      </td>
                      <td>
                        {formatBytes(tenant.usage.bytes)} ({tenant.usage.bytePercent}%)
                      </td>
                      <td>{tenant.usage.owners}</td>
                      <td className="muted text-12">
                        {tenant.usage.oldest ? formatDate(tenant.usage.oldest) : "—"}
                      </td>
                      <td className="muted text-12">
                        {tenant.usage.newest ? formatDate(tenant.usage.newest) : "—"}
                      </td>
                    </tr>
                  ))}
                  {!tenants.length && (
                    <tr>
                      <td colSpan={6} className="muted">
                        No usage yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="operate-card mt-16">
            <div className="row between mb-8">
              <h3>Audit</h3>
              <label className="field" style={{ margin: 0, width: 220 }}>
                <select
                  className="select"
                  value={auditTenant}
                  onChange={(event) => setAuditTenant(event.target.value)}
                >
                  <option value="">All tenants</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.tenant} value={tenant.tenant}>
                      {tenant.tenant}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Tenant</th>
                    <th>Action</th>
                    <th>Response</th>
                    <th>Owner</th>
                    <th>Bytes</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((entry) => (
                    <tr key={entry.id}>
                      <td className="muted text-12">{formatDate(entry.at)}</td>
                      <td className="mono text-12">{entry.tenantId}</td>
                      <td>{entry.action}</td>
                      <td className="mono text-12">{entry.responseId || "—"}</td>
                      <td className="mono text-12">{entry.ownerId || "—"}</td>
                      <td>{entry.bytes || "—"}</td>
                    </tr>
                  ))}
                  {!audit.length && (
                    <tr>
                      <td colSpan={6} className="muted">
                        No audit entries yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {createOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Create tenant"
          >
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Create tenant</h2>
                <p className="dialog-sub">
                  The token is generated once and stored as a hash. Give it to
                  the client that will use this shared Responses store.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Tenant name</span>
                <input
                  className="input"
                  value={createName}
                  placeholder="acme"
                  onChange={(event) => setCreateName(event.target.value)}
                />
                <span className="field-hint">
                  Lowercase letters, numbers, underscores or hyphens.
                </span>
              </label>
              <label className="field mt-8">
                <span className="field-label">Response quota</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={createResponses}
                  onChange={(event) =>
                    setCreateResponses(Number(event.target.value))
                  }
                />
                <span className="field-hint">
                  Maximum stored responses for this tenant.
                </span>
              </label>
              <label className="field mt-8">
                <span className="field-label">Storage quota (MB)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={createMb}
                  onChange={(event) => setCreateMb(Number(event.target.value))}
                />
                <span className="field-hint">
                  Maximum JSON payload bytes for this tenant.
                </span>
              </label>
              <div className="banner info mt-12">
                <Warning20Regular />
                <span>
                  This is local usage accounting. No payment provider is
                  contacted and no invoice is generated.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void create()}
                disabled={busy || !createName.trim()}
              >
                {busy ? <Spinner /> : <Add20Regular />} Create tenant
              </button>
            </div>
          </div>
        </div>
      )}

      {editing && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditing(null);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Manage ${editing.tenant}`}
          >
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">{editing.tenant}</h2>
                <p className="dialog-sub">
                  Token prefix {editing.tokenPrefix}… · created{" "}
                  {formatDate(editing.createdAt)}
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setEditing(null)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Response quota</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={1_000_000}
                  value={editResponses}
                  onChange={(event) =>
                    setEditResponses(Number(event.target.value))
                  }
                />
              </label>
              <label className="field mt-8">
                <span className="field-label">Storage quota (MB)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={editMb}
                  onChange={(event) => setEditMb(Number(event.target.value))}
                />
              </label>
              <label
                className="row mt-12"
                style={{ gap: 8, alignItems: "center" }}
              >
                <input
                  type="checkbox"
                  checked={editDisabled}
                  onChange={(event) => setEditDisabled(event.target.checked)}
                />
                <span className="text-12">
                  Disabled (the current token returns 401 immediately)
                </span>
              </label>
              <div className="row mt-12" style={{ gap: 8 }}>
                <button
                  className="btn btn-secondary"
                  onClick={() => void rotate(editing)}
                  disabled={busy}
                >
                  <Key20Regular /> Rotate token
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => void remove(editing)}
                  disabled={busy}
                >
                  Delete tenant
                </button>
              </div>
              <p className="muted text-12 mt-8">
                Current usage: {editing.usage.total} responses ·{" "}
                {formatBytes(editing.usage.bytes)} across{" "}
                {editing.usage.owners} owner(s).
              </p>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setEditing(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void saveEdit()}
                disabled={busy}
              >
                {busy ? <Spinner /> : <DataUsage20Regular />} Save quotas
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
