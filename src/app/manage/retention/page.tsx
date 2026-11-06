// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useState } from "react";
import { ArrowSync20Regular, DataUsage20Regular } from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { formatBytes, formatDate } from "@/lib/client";

interface Policy {
  maxResponsesPerOwner: number;
  ttlDays: number;
}

interface Stats {
  tenantId?: string;
  total: number;
  bytes?: number;
  quotaResponses?: number;
  quotaBytes?: number;
  owners: { ownerId: string; count: number }[];
  oldest: string | null;
  newest: string | null;
}

export default function ResponseRetentionPage() {
  const { toast } = useToast();
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [backend, setBackend] = useState<"sqlite" | "http" | null>(null);
  const [maxResponses, setMaxResponses] = useState(200);
  const [ttlDays, setTtlDays] = useState(7);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const res = await fetch("/api/responses/retention", { cache: "no-store" });
    const json = (await res.json()) as {
      policy: Policy;
      stats: Stats;
      backend?: "sqlite" | "http";
    };
    setPolicy(json.policy);
    setStats(json.stats);
    setBackend(json.backend || null);
    setMaxResponses(json.policy.maxResponsesPerOwner);
    setTtlDays(json.policy.ttlDays);
  };

  useEffect(() => {
    void load();
  }, []);

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/responses/retention", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          maxResponsesPerOwner: Number(maxResponses),
          ttlDays: Number(ttlDays),
          prune: true,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        policy?: Policy;
        stats?: Stats;
        backend?: "sqlite" | "http";
        error?: string;
      };
      if (!res.ok || !json.policy) {
        throw new Error(json.error || "Could not save the retention policy.");
      }
      setPolicy(json.policy);
      setStats(json.stats || null);
      setBackend(json.backend || backend);
      setMaxResponses(json.policy.maxResponsesPerOwner);
      setTtlDays(json.policy.ttlDays);
      toast("Response retention policy saved", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Responses retention</h1>
          <p className="page-subtitle">
            Project Responses history is stored in SQLite and scoped to the
            project key or signed-in user. This policy controls how long it is
            kept and how many responses each owner retains.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => void load()}>
            <ArrowSync20Regular /> Refresh
          </button>
        </div>
      </div>

      <div className="banner info">
        <DataUsage20Regular />
        <span>
          {stats?.total ?? "—"} stored responses
          {stats?.oldest ? ` · oldest ${formatDate(stats.oldest)}` : ""}
          {stats?.newest ? ` · newest ${formatDate(stats.newest)}` : ""}
          {backend
            ? ` · ${backend === "http" ? "shared HTTP store" : "local SQLite"}`
            : ""}
          {stats?.tenantId ? ` · tenant ${stats.tenantId}` : ""}
          {stats?.quotaResponses
            ? ` · ${stats.total}/${stats.quotaResponses} responses`
            : ""}
          {stats?.bytes != null && stats?.quotaBytes
            ? ` · ${formatBytes(stats.bytes)}/${formatBytes(stats.quotaBytes)}`
            : ""}
        </span>
      </div>

      <div className="knowledge-split mt-16">
        <div className="operate-card">
          <h3 className="mb-12">Policy</h3>
          <label className="field mb-12">
            <span className="field-label">Maximum responses per owner</span>
            <input
              className="input"
              type="number"
              min={1}
              max={10000}
              value={maxResponses}
              onChange={(event) => setMaxResponses(Number(event.target.value))}
            />
            <span className="field-hint">
              Oldest responses beyond this count are pruned when a new response is
              saved or the policy is applied.
            </span>
          </label>
          <label className="field mb-12">
            <span className="field-label">Time to live (days)</span>
            <input
              className="input"
              type="number"
              min={0}
              max={3650}
              value={ttlDays}
              onChange={(event) => setTtlDays(Number(event.target.value))}
            />
            <span className="field-hint">
              0 disables age-based pruning; the count limit still applies.
            </span>
          </label>
          <button className="btn btn-primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Spinner /> : <DataUsage20Regular />} Save and prune
          </button>
        </div>

        <div className="operate-card">
          <h3 className="mb-8">Owners</h3>
          {stats?.owners.length ? (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Owner</th>
                    <th>Responses</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.owners.map((owner) => (
                    <tr key={owner.ownerId}>
                      <td className="mono text-12">{owner.ownerId}</td>
                      <td>{owner.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="muted text-12">No response history stored.</p>
          )}
          {policy && (
            <p className="muted text-12 mt-12">
              Current policy: {policy.maxResponsesPerOwner} per owner ·{" "}
              {policy.ttlDays === 0 ? "no TTL" : `${policy.ttlDays} days`}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
