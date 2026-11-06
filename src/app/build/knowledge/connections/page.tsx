// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  Dismiss20Regular,
  Play20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import {
  ACTIVE_CONNECTION_PROVIDERS,
  CONNECTION_PROVIDERS,
  type ConnectionAuthType,
  type ConnectionProvider,
} from "@/lib/connections/catalog";
import type { Connection } from "@/lib/types";

function statusLabel(connection: Connection): string {
  if (connection.provider === "google-drive" && !connection.oauthConnected) {
    return "Not connected";
  }
  if (connection.status === "ok") return "Verified";
  if (connection.status === "failed") return "Failed";
  return "Not tested";
}

export default function ConnectionsPage() {
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<{ connections: Connection[] }>(
    "/api/connections",
    0
  );
  const connections = useMemo(() => data?.connections ?? [], [data]);

  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<ConnectionProvider>("s3");
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [secret, setSecret] = useState<Record<string, unknown>>({});
  const [busy, setBusy] = useState(false);
  const [testingId, setTestingId] = useState("");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const params = new URLSearchParams(window.location.search);
    const connected = params.get("connected");
    const error = params.get("error");
    if (connected) toast("Google Drive connected", "success");
    if (error) toast(error, "error");
    if (connected || error) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spec = CONNECTION_PROVIDERS[provider];

  const openDialog = () => {
    setProvider("s3");
    setName("");
    setTarget("");
    setConfig({});
    setSecret({});
    setOpen(true);
  };

  const chooseProvider = (next: ConnectionProvider) => {
    setProvider(next);
    setTarget("");
    setConfig({});
    setSecret({});
  };

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          provider,
          target,
          authType: spec.authTypes[0].id as ConnectionAuthType,
          config,
          secret,
        }),
      });
      const json = (await res.json()) as { connection?: Connection; error?: string };
      if (!res.ok || !json.connection) {
        throw new Error(json.error || "Could not create the connection");
      }
      if (spec.oauth) {
        // OAuth cannot be tested until the user approves access in the browser.
        const start = await fetch(`/api/connections/${json.connection.id}/oauth/start`, {
          method: "POST",
        });
        const started = (await start.json()) as { url?: string; error?: string };
        if (!start.ok || !started.url) {
          throw new Error(started.error || "Could not start the Google consent flow");
        }
        window.location.assign(started.url);
        return;
      }
      // Prove it immediately; a connection nobody tested is not useful.
      const test = await fetch(`/api/connections/${json.connection.id}/test`, {
        method: "POST",
      });
      const tested = (await test.json()) as { result?: { ok?: boolean; detail?: string } };
      if (tested.result?.ok) toast("Connection created and verified", "success");
      else toast(`Created, but the test failed: ${tested.result?.detail || "unknown"}`, "error");
      setOpen(false);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not create the connection", "error");
    } finally {
      setBusy(false);
    }
  };

  const test = async (connection: Connection) => {
    setTestingId(connection.id);
    try {
      const res = await fetch(`/api/connections/${connection.id}/test`, {
        method: "POST",
      });
      const json = (await res.json()) as { result?: { ok?: boolean; detail?: string } };
      toast(
        json.result?.ok
          ? json.result.detail || "Verified"
          : json.result?.detail || "Test failed",
        json.result?.ok ? "success" : "error"
      );
      refresh();
    } finally {
      setTestingId("");
    }
  };

  const connect = async (connection: Connection) => {
    setTestingId(connection.id);
    try {
      const res = await fetch(`/api/connections/${connection.id}/oauth/start`, {
        method: "POST",
      });
      const json = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !json.url) {
        throw new Error(json.error || "Could not start the Google consent flow");
      }
      window.location.assign(json.url);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not connect", "error");
    } finally {
      setTestingId("");
    }
  };

  const remove = async (connection: Connection) => {
    const res = await fetch(`/api/connections?id=${encodeURIComponent(connection.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not delete the connection", "error");
      return;
    }
    toast(`${connection.name} deleted`, "success");
    refresh();
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div className="row" style={{ gap: 10 }}>
          <Link href="/build/knowledge/search" className="icon-button" aria-label="Back">
            <ArrowLeft20Regular />
          </Link>
          <div>
            <h1 className="page-title">Connections</h1>
            <p className="page-sub">
              Credentials for external products. A connection is created once and
              reused by every knowledge source that points at it.
            </p>
          </div>
        </div>
        <button className="btn btn-primary" onClick={openDialog}>
          <Add20Regular /> New connection
        </button>
      </div>

      {loading ? (
        <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Loading connections…
        </div>
      ) : connections.length === 0 ? (
        <div className="operate-card">
          <h3>No connections yet</h3>
          <p className="muted text-12">
            Add one for S3-compatible storage, Azure Blob Storage or WebDAV. The
            secret is encrypted with this machine&apos;s key and never returned by
            the API.
          </p>
        </div>
      ) : (
        <div className="operate-card">
          <div className="stack" style={{ gap: 10 }}>
            {connections.map((connection) => (
              <div className="kb-source-item" key={connection.id}>
                <span className="kb-source-body">
                  <strong>{connection.name}</strong>
                  <span className="muted text-12">
                    {connection.providerLabel || connection.provider || connection.kind} ·{" "}
                    {connection.target}
                    {connection.secretHint ? ` · ${connection.secretHint}` : ""}
                  </span>
                  {connection.lastError ? (
                    <span className="muted text-12">{connection.lastError}</span>
                  ) : null}
                </span>
                <span className="muted text-12">
                  {connection.lastCheckedAt
                    ? `Checked ${formatDate(connection.lastCheckedAt)}`
                    : "Never tested"}
                </span>
                <StatusBadge status={statusLabel(connection)} />
                {connection.provider === "google-drive" &&
                !connection.oauthConnected ? (
                  <button
                    className="btn btn-sm btn-primary"
                    disabled={testingId === connection.id}
                    onClick={() => connect(connection)}
                  >
                    {testingId === connection.id ? <Spinner /> : null} Connect
                  </button>
                ) : (
                  <button
                    className="btn btn-sm btn-secondary"
                    disabled={testingId === connection.id}
                    onClick={() => test(connection)}
                  >
                    {testingId === connection.id ? <Spinner /> : <Play20Regular />} Test
                  </button>
                )}
                <button
                  className="icon-button small"
                  aria-label={`Delete ${connection.name}`}
                  onClick={() => remove(connection)}
                >
                  <Delete20Regular />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="New connection">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New connection</h2>
                <p className="dialog-sub">{spec.description}</p>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Provider</span>
                <select
                  className="select"
                  value={provider}
                  onChange={(event) =>
                    chooseProvider(event.target.value as ConnectionProvider)
                  }
                >
                  {ACTIVE_CONNECTION_PROVIDERS.map((id) => (
                    <option key={id} value={id}>
                      {CONNECTION_PROVIDERS[id].label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={name}
                  placeholder="finance-storage"
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {!spec.targetFixed ? (
                <label className="field">
                  <span className="field-label">{spec.targetLabel}</span>
                  <input
                    className="input"
                    value={target}
                    placeholder={spec.targetPlaceholder}
                    onChange={(event) => setTarget(event.target.value)}
                  />
                </label>
              ) : null}
              {spec.fields.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field-label">
                    {field.label}
                    {field.required ? <span className="required"> *</span> : null}
                  </span>
                  <input
                    className="input"
                    type={field.type === "password" ? "password" : "text"}
                    placeholder={field.placeholder}
                    value={String(config[field.key] ?? "")}
                    onChange={(event) =>
                      setConfig((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                  {field.help ? <span className="field-hint">{field.help}</span> : null}
                </label>
              ))}
              {spec.secretFields.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field-label">
                    {field.label}
                    {field.required ? <span className="required"> *</span> : null}
                  </span>
                  <input
                    className="input"
                    type={field.type === "password" ? "password" : "text"}
                    autoComplete="off"
                    value={String(secret[field.key] ?? "")}
                    onChange={(event) =>
                      setSecret((current) => ({ ...current, [field.key]: event.target.value }))
                    }
                  />
                  {field.help ? <span className="field-hint">{field.help}</span> : null}
                </label>
              ))}
              {spec.oauth ? (
                <p className="muted text-12">
                  Register this redirect URI in your Google OAuth client:
                  <br />
                  <code className="mono">
                    {origin}/api/connections/google/callback
                  </code>
                  <br />
                  Saving opens Google&apos;s consent screen. Only read-only Drive
                  access is requested.
                </p>
              ) : (
                <p className="muted text-12">
                  Saving encrypts the secret with this machine&apos;s key, then runs
                  the provider&apos;s cheapest real call. A failure is stored as a
                  failure.
                </p>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={create}>
                {busy ? <Spinner /> : null}
                {spec.oauth ? "Create and connect" : "Create and test"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
