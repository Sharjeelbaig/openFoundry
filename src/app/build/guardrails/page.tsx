// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Delete20Regular,
  Info20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Field, Spinner } from "@/components/ui";
import type { Agent, Blocklist, Deployment, Guardrail } from "@/lib/types";

type Tab = "Guardrails" | "Blocklists" | "Test" | "Integrations";
type TestPoint = "input" | "output" | "tool";

interface TestFinding {
  controlId: string;
  riskType: string;
  category: string;
  count: number;
  detail: string;
}

interface TestResult {
  blocked: boolean;
  reason: string | null;
  text: string;
  findings: TestFinding[];
  control: { id: string; riskType: string; action: string } | null;
}

interface GuardrailsResponse {
  guardrails: Guardrail[];
  blocklists: Blocklist[];
  agents: Agent[];
  deployments: Deployment[];
}

export default function GuardrailsPage() {
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<GuardrailsResponse>("/api/guardrails");
  const guardrails = useMemo(() => data?.guardrails ?? [], [data?.guardrails]);
  const blocklists = data?.blocklists ?? [];
  const agents = data?.agents ?? [];
  const deployments = data?.deployments ?? [];

  const [tab, setTab] = useState<Tab>("Guardrails");
  const [query, setQuery] = useState("");
  const [blocklistOpen, setBlocklistOpen] = useState(false);
  const [blocklistName, setBlocklistName] = useState("");
  const [blocklistTerms, setBlocklistTerms] = useState("");
  const [busy, setBusy] = useState(false);
  const [testGuardrailId, setTestGuardrailId] = useState("");
  const [testText, setTestText] = useState("");
  const [testPoint, setTestPoint] = useState<TestPoint>("input");
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);

  const filtered = useMemo(
    () =>
      guardrails.filter(
        (guardrail) =>
          !query || guardrail.name.toLowerCase().includes(query.toLowerCase())
      ),
    [guardrails, query]
  );

  const appliedTo = (guardrail: Guardrail) => {
    const agentNames = guardrail.agents
      .map((id) => agents.find((agent) => agent.id === id)?.name || id)
      .filter(Boolean);
    const deploymentNames = guardrail.deployments
      .map((id) => deployments.find((deployment) => deployment.id === id)?.name || id)
      .filter(Boolean);
    const all = [...agentNames, ...deploymentNames];
    return all.length ? all : null;
  };

  const type = (guardrail: Guardrail) =>
    guardrail.deployments.length ? "Model" : "--";

  const remove = async (guardrail: Guardrail) => {
    const res = await fetch("/api/guardrails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: guardrail.id }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast(json.error || "Could not delete the guardrail", "error");
      return;
    }
    toast(`${guardrail.name} deleted`, "success");
    refresh();
  };

  const createBlocklist = async () => {
    if (!blocklistName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/guardrails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createBlocklist",
          name: blocklistName.trim(),
          terms: blocklistTerms
            .split(/[\n,]+/)
            .map((term) => term.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not create the blocklist");
      toast("Blocklist created", "success");
      setBlocklistOpen(false);
      setBlocklistName("");
      setBlocklistTerms("");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const deleteBlocklist = async (blocklist: Blocklist) => {
    const res = await fetch("/api/guardrails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteBlocklist", blocklistId: blocklist.id }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast(json.error || "Could not delete the blocklist", "error");
      return;
    }
    toast(`${blocklist.name} deleted`, "success");
    refresh();
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Guardrails</h1>
      </div>

      <div className="tabbar mt-8">
        {(
          [
            { id: "Guardrails", label: "Guardrails" },
            { id: "Blocklists", label: "Blocklists" },
            { id: "Test", label: "Test" },
            { id: "Integrations", label: "Integrations", preview: true },
          ] as { id: Tab; label: string; preview?: boolean }[]
        ).map((item) => (
          <button
            key={item.id}
            className={`tab${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.label}
            {item.preview && <span className="preview-badge">Preview</span>}
          </button>
        ))}
      </div>

      {tab === "Guardrails" && (
        <>
          <p className="page-note">
            Add guardrails to reduce safety and security risks, so users can engage
            with your AI apps and agents confidently. Create, manage and apply them
            across models or agents for a safer user experience.{" "}
            <span className="link">Learn more</span>
          </p>
          <div className="page-toolbar">
            <div className="search-input">
              <Search20Regular />
              <input
                className="input"
                placeholder="Search filters"
                aria-label="Search filters"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="spacer" />
            <Link className="btn btn-primary" href="/build/guardrails/create">
              Create
            </Link>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 140 }}>Type</th>
                  <th style={{ width: 340 }}>Applied to</th>
                  <th style={{ width: 200 }}>Last modified</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((guardrail) => (
                  <tr key={guardrail.id}>
                    <td className="cell-strong">
                      <Link href={`/build/guardrails/${encodeURIComponent(guardrail.id)}`}>
                        {guardrail.name}
                      </Link>
                    </td>
                    <td>{type(guardrail)}</td>
                    <td className="truncate" style={{ maxWidth: 340 }}>
                      {appliedTo(guardrail)?.join(", ") || "--"}
                    </td>
                    <td>{formatDate(guardrail.updatedAt)}</td>
                    <td>
                      {!guardrail.builtIn && (
                        <button
                          className="icon-button small"
                          aria-label={`Delete ${guardrail.name}`}
                          onClick={() => remove(guardrail)}
                        >
                          <Delete20Regular />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {loading && guardrails.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      <Spinner /> Loading guardrails...
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {filtered.length > 0 && (
              <div className="table-footer">
                <span>
                  1-{filtered.length} of {filtered.length}
                </span>
                <span className="row" style={{ gap: 12 }}>
                  <button className="btn btn-sm btn-ghost" disabled>
                    Prev
                  </button>
                  <button className="btn btn-sm btn-ghost" disabled>
                    Next
                  </button>
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "Blocklists" && (
        <>
          <p className="page-note">
            Block specific terms with custom blocklists.{" "}
            <span className="link">Learn more</span>
          </p>
          <div className="page-toolbar">
            <span className="spacer" />
            <button
              className="btn btn-primary"
              onClick={() => setBlocklistOpen(true)}
            >
              Create blocklist
            </button>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 200 }}>Created by</th>
                  <th style={{ width: 200 }}>Created at</th>
                  <th style={{ width: 60 }} />
                </tr>
              </thead>
              <tbody>
                {blocklists.map((blocklist) => (
                  <tr key={blocklist.id}>
                    <td className="cell-strong">
                      {blocklist.name}
                      <div className="muted text-12" style={{ fontWeight: 400 }}>
                        {blocklist.terms.length} terms
                      </div>
                    </td>
                    <td>--</td>
                    <td>{formatDate(blocklist.createdAt)}</td>
                    <td>
                      {!blocklist.builtIn && (
                        <button
                          className="icon-button small"
                          aria-label={`Delete ${blocklist.name}`}
                          onClick={() => deleteBlocklist(blocklist)}
                        >
                          <Delete20Regular />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {blocklists.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      No blocklists yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            {blocklists.length > 0 && (
              <div className="table-footer">
                <span>
                  1-{blocklists.length} of {blocklists.length}
                </span>
              </div>
            )}
          </div>
        </>
      )}

      {tab === "Test" && (
        <>
          <p className="page-note">
            Run a guardrail against text before it reaches a model. PII and
            credentials are detected locally; redact, mask, hash and block
            strategies are enforced by the same engine the chat route uses.
          </p>
          <div className="operate-card">
            <div className="form-grid">
              <label className="field">
                <span className="field-label">Guardrail</span>
                <select
                  className="select"
                  value={testGuardrailId || guardrails[0]?.id || ""}
                  onChange={(event) => {
                    setTestGuardrailId(event.target.value);
                    setTestResult(null);
                  }}
                >
                  {guardrails.map((guardrail) => (
                    <option key={guardrail.id} value={guardrail.id}>
                      {guardrail.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Intervention point</span>
                <select
                  className="select"
                  value={testPoint}
                  onChange={(event) =>
                    setTestPoint(event.target.value as TestPoint)
                  }
                >
                  <option value="input">User input</option>
                  <option value="output">Model output</option>
                  <option value="tool">Tool call</option>
                </select>
              </label>
            </div>
            <label className="field mt-8">
              <span className="field-label">Text to check</span>
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                placeholder="Paste a prompt, a model answer or tool arguments"
                value={testText}
                onChange={(event) => setTestText(event.target.value)}
              />
            </label>
            <button
              className="btn btn-primary mt-8"
              disabled={
                testing || !testText.trim() || !(testGuardrailId || guardrails[0]?.id)
              }
              onClick={async () => {
                setTesting(true);
                setTestResult(null);
                try {
                  const res = await fetch("/api/guardrails/test", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      guardrailId: testGuardrailId || guardrails[0]?.id,
                      text: testText,
                      point: testPoint,
                    }),
                  });
                  const json = (await res.json().catch(() => ({}))) as
                    | TestResult
                    | { error?: string };
                  if (!res.ok || !("blocked" in json)) {
                    throw new Error(
                      (json as { error?: string }).error ||
                        "Could not check the guardrail."
                    );
                  }
                  setTestResult(json);
                } catch (error) {
                  toast(
                    error instanceof Error
                      ? error.message
                      : "Guardrail check failed.",
                    "error"
                  );
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? <Spinner /> : null} Run check
            </button>
          </div>

          {testResult && (
            <>
              <div
                className={`banner ${testResult.blocked ? "error" : "info"} mt-12`}
              >
                <Info20Regular />
                <span>
                  {testResult.blocked
                    ? `Blocked by ${testResult.control?.riskType || "the guardrail"}: ${testResult.reason}`
                    : `Allowed. ${testResult.findings.length} finding(s); the text below is what would be sent.`}
                </span>
              </div>
              {testResult.findings.length > 0 && (
                <div className="table-card mt-12">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Control</th>
                        <th>Category</th>
                        <th>Count</th>
                        <th>Detail</th>
                      </tr>
                    </thead>
                    <tbody>
                      {testResult.findings.map((finding, index) => (
                        <tr key={`${finding.controlId}-${index}`}>
                          <td className="strong">{finding.riskType}</td>
                          <td>{finding.category}</td>
                          <td>{finding.count}</td>
                          <td className="muted">{finding.detail}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="operate-card mt-12">
                <h3 className="mb-8">Transformed text</h3>
                <pre
                  style={{
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    margin: 0,
                    color: "var(--fg-2)",
                  }}
                >
                  {testResult.text}
                </pre>
              </div>
            </>
          )}
        </>
      )}

      {tab === "Integrations" && (
        <div className="empty">
          <Info20Regular style={{ width: 44, height: 44, color: "var(--fg-3)" }} />
          <h2>No integrations yet</h2>
          <p>
            Connect external safety and security tooling to extend your guardrails.
          </p>
        </div>
      )}

      {blocklistOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setBlocklistOpen(false);
          }}
        >
          <div className="dialog memory-dialog" role="dialog" aria-modal="true" aria-label="Create blocklist">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Create blocklist</h2>
                <p className="dialog-sub">
                  Block specific terms in user input and model output.
                </p>
              </div>
            </div>
            <div className="dialog-body">
              <Field label="Name" required>
                <input
                  className="input"
                  autoFocus
                  placeholder="e.g., Contoso-specific terms"
                  value={blocklistName}
                  onChange={(event) => setBlocklistName(event.target.value)}
                />
              </Field>
              <Field label="Terms" hint="One term per line, or separate them with commas.">
                <textarea
                  className="textarea"
                  placeholder={"term one\nterm two"}
                  value={blocklistTerms}
                  onChange={(event) => setBlocklistTerms(event.target.value)}
                />
              </Field>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-primary"
                disabled={!blocklistName.trim() || busy}
                onClick={createBlocklist}
              >
                {busy && <Spinner />} Create
              </button>
              <button className="btn btn-secondary" onClick={() => setBlocklistOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
