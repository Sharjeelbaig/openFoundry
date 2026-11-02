"use client";
import Select from "@/components/Select";

import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  Checkmark20Regular,
  ClipboardTask20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Play20Regular,
  Search20Regular,
  Shield20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { formatDate, formatNumber, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { DottedObject, Spinner } from "@/components/ui";
import type { Agent, Deployment, EvaluationRun } from "@/lib/types";

type Tab = "Evaluations" | "Evaluator catalog" | "Red team";
type SubTab = "Runs" | "Recurring configs";

const DEFAULT_PROMPTS = [
  "Introduce yourself and explain what you can help with.",
  "A customer says the product arrived damaged. What do you do next?",
  "Summarize the most important information you have access to.",
].join("\n");

const REDTEAM_NOTE =
  "Red team prompts are sent to your local model and scored with a transparent refusal heuristic. No attack payloads leave this computer.";

export default function EvaluationsPage() {
  const { toast } = useToast();
  const { data, refresh } = useApi<{ evaluations: EvaluationRun[] }>(
    "/api/evaluations",
    3000
  );
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: deploymentData } = useApi<{ deployments: Deployment[] }>(
    "/api/deployments"
  );

  const runs = data?.evaluations ?? [];
  const agents = agentData?.agents ?? [];
  const deployments = deploymentData?.deployments ?? [];

  const [tab, setTab] = useState<Tab>("Evaluations");
  const [subTab, setSubTab] = useState<SubTab>("Runs");
  const [query, setQuery] = useState("");
  const [frequency, setFrequency] = useState("All");
  const [bannerOpen, setBannerOpen] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [createType, setCreateType] = useState<"evaluation" | "redteam">("evaluation");
  const [name, setName] = useState("");
  const [targetKind, setTargetKind] = useState<"agent" | "deployment">("agent");
  const [targetId, setTargetId] = useState("");
  const [prompts, setPrompts] = useState(DEFAULT_PROMPTS);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);

  const filtered = useMemo(
    () =>
      runs
        .filter((run) => (createType === "redteam" ? true : run.type === "evaluation"))
        .filter((run) => !query || run.name.toLowerCase().includes(query.toLowerCase())),
    [runs, query, createType]
  );

  const active = runs.find((run) => run.id === activeId) || null;

  const openCreate = (type: "evaluation" | "redteam") => {
    setCreateType(type);
    setTab(type === "redteam" ? "Red team" : "Evaluations");
    setSubTab("Runs");
    setName(
      type === "redteam"
        ? `red-team-${new Date().toISOString().slice(0, 10)}`
        : `evaluation-${new Date().toISOString().slice(0, 10)}`
    );
    setPrompts(type === "redteam" ? "" : DEFAULT_PROMPTS);
    setTargetKind(agents.length ? "agent" : "deployment");
    setTargetId(agents[0]?.id || deployments[0]?.id || "");
    setCreateOpen(true);
  };

  const create = async () => {
    if (!name.trim() || !targetId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/evaluations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          type: createType,
          targetKind,
          targetId,
          prompts: prompts
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as { evaluation?: EvaluationRun; error?: string };
      if (!res.ok || !json.evaluation) throw new Error(json.error || "Could not start");
      toast(
        createType === "redteam"
          ? "Red team scan started on the local model"
          : "Evaluation started on the local model",
        "success"
      );
      setCreateOpen(false);
      setActiveId(json.evaluation.id);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not start", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (run: EvaluationRun) => {
    const res = await fetch("/api/evaluations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: run.id, action: "delete" }),
    });
    if (!res.ok) {
      toast("Could not delete the run", "error");
      return;
    }
    toast("Evaluation deleted", "success");
    refresh();
  };

  const targetOptions =
    targetKind === "agent"
      ? agents.map((agent) => ({ id: agent.id, label: agent.name }))
      : deployments.map((deployment) => ({
          id: deployment.id,
          label: `${deployment.name} · ${deployment.modelName}`,
        }));

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Evaluations</h1>
        {tab === "Evaluations" && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => openCreate("evaluation")}>
              Create
            </button>
          </div>
        )}
      </div>

      <div className="tabbar mt-8">
        {(
          [
            ["Evaluations", null],
            ["Evaluator catalog", null],
            ["Red team", "Preview"],
          ] as [Tab, string | null][]
        ).map(([item, tag]) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
            {tag && <span className="preview-tag">{tag}</span>}
          </button>
        ))}
      </div>

      {tab === "Evaluations" && (
        <>
          <div className="tabbar" style={{ marginTop: -6 }}>
            <button
              className={`tab${subTab === "Runs" ? " active" : ""}`}
              onClick={() => setSubTab("Runs")}
            >
              Runs
            </button>
            <button
              className={`tab${subTab === "Recurring configs" ? " active" : ""}`}
              onClick={() => setSubTab("Recurring configs")}
            >
              Recurring configs <span className="preview-tag">Preview</span>
            </button>
          </div>

          {subTab === "Runs" ? (
            <>
              <p className="muted text-13" style={{ maxWidth: 900, margin: "4px 0 14px" }}>
                Evaluate the quality and safety of generative AI applications with
                metrics measured on this computer, so you can compare versions
                without cloud cost.
              </p>

              {bannerOpen && (
                <div className="banner info mb-16" style={{ justifyContent: "space-between" }}>
                  <span className="row" style={{ gap: 8 }}>
                    <Sparkle20Regular />
                    <span>
                      <strong>NEW:</strong> Custom rubric evaluators are here. Describe
                      what your agent should do and get scored criteria with weights
                      generated for your use case.
                    </span>
                  </span>
                  <span className="row" style={{ gap: 8 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => {
                        toast("Custom rubrics are scored locally by the evaluation runner.", "info");
                        openCreate("evaluation");
                      }}
                    >
                      Create evaluator
                    </button>
                    <button
                      className="icon-button small"
                      aria-label="Dismiss"
                      onClick={() => setBannerOpen(false)}
                    >
                      <Dismiss20Regular />
                    </button>
                  </span>
                </div>
              )}

              <div className="page-toolbar">
                <div className="search-input">
                  <Search20Regular />
                  <input
                    className="input"
                    placeholder="Search evaluations by name"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <Select
                  className="select"
                  style={{ width: 160 }}
                  value={frequency}
                  onChange={(event) => setFrequency(event.target.value)}
                  aria-label="Frequency"
                >
                  <option>All</option>
                  <option>On demand</option>
                  <option>Recurring</option>
                </Select>
                <span className="spacer" />
                <button className="btn btn-primary" onClick={() => openCreate("evaluation")}>
                  Create
                </button>
              </div>

              {filtered.length === 0 ? (
                <div className="empty" style={{ paddingTop: 40 }}>
                  <DottedObject />
                  <h2>No evaluations found</h2>
                  <p>
                    Evaluations you create will appear here. Get started by creating
                    your first evaluation.
                  </p>
                  <button
                    className="btn btn-primary mt-12"
                    onClick={() => openCreate("evaluation")}
                  >
                    <Add20Regular /> Create evaluation
                  </button>
                </div>
              ) : (
                <div className="table-card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th style={{ width: 160 }}>Target</th>
                        <th style={{ width: 110 }}>Status</th>
                        <th style={{ width: 100 }}>Pass rate</th>
                        <th style={{ width: 120 }}>Avg latency</th>
                        <th style={{ width: 100 }}>Grounded</th>
                        <th style={{ width: 170 }}>Created</th>
                        <th style={{ width: 130 }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((run) => {
                        const total = run.results.length;
                        const complete = run.type === "redteam" ? total >= 5 : total >= 3;
                        const ok = run.results.filter((result) => result.ok).length;
                        const grounded = run.results.filter(
                          (result) => result.citations > 0
                        ).length;
                        const latency = total
                          ? Math.round(
                              run.results.reduce(
                                (sum, result) => sum + result.latencyMs,
                                0
                              ) / total
                            )
                          : 0;
                        return (
                          <tr key={run.id}>
                            <td>
                              <button
                                className="agent-name link"
                                onClick={() => setActiveId(run.id)}
                              >
                                {run.name}
                              </button>
                              <span className="badge gray" style={{ marginLeft: 8 }}>
                                {run.type === "redteam" ? "Red team" : "Quality"}
                              </span>
                            </td>
                            <td className="truncate" style={{ maxWidth: 160 }}>
                              {run.targetName}
                            </td>
                            <td>
                              <span className="status">
                                <span
                                  className={`status-dot${
                                    complete ? "" : " warning"
                                  }`}
                                />
                                {complete ? "Completed" : "Running"}
                              </span>
                            </td>
                            <td>
                              {total ? `${Math.round((ok / total) * 100)}%` : "—"}
                            </td>
                            <td>{latency ? `${latency} ms` : "—"}</td>
                            <td>
                              {total
                                ? `${Math.round((grounded / total) * 100)}%`
                                : "—"}
                            </td>
                            <td>{formatDate(run.createdAt)}</td>
                            <td>
                              <div className="inline-actions">
                                <button
                                  className="btn btn-sm btn-outline"
                                  onClick={() => setActiveId(run.id)}
                                >
                                  Results
                                </button>
                                <button
                                  className="icon-button small"
                                  aria-label="Delete evaluation"
                                  onClick={() => remove(run)}
                                >
                                  <Delete20Regular />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="table-footer">
                <span>{filtered.length} evaluations</span>
                <span className="muted">Stored in data/evaluations.json</span>
              </div>
            </>
          ) : (
            <div className="operate-card mt-12">
              <h3 className="mb-8">Recurring evaluations</h3>
              <p className="muted text-13" style={{ maxWidth: 720 }}>
                Recurring evaluations run on a schedule. In this local build, schedule
                a routine on an agent, or re-run an evaluation from its results panel.
                A background daemon would keep running after you close the app, so
                this build runs scheduled work lazily when the page is opened.
              </p>
              <button className="btn btn-secondary mt-12" onClick={() => openCreate("evaluation")}>
                Run an evaluation now
              </button>
            </div>
          )}
        </>
      )}

      {tab === "Evaluator catalog" && (
        <>
          <p className="muted text-13" style={{ maxWidth: 900, margin: "4px 0 16px" }}>
            These evaluators are implemented in this build. Each description states
            exactly how the score is computed so you can audit it.
          </p>
          <div className="kb-grid">
            {[
              {
                name: "Response quality",
                icon: <ClipboardTask20Regular />,
                desc: "Passes when the response is longer than 16 characters and the runtime did not return an error. This catches empty or broken completions.",
                badge: "Deterministic",
              },
              {
                name: "Groundedness",
                icon: <Sparkle20Regular />,
                desc: "Measures the share of responses that include retrieved context. Retrieval runs through the same vector index agents use.",
                badge: "RAG",
              },
              {
                name: "Latency",
                icon: <ArrowClockwise20Regular />,
                desc: "Average wall-clock milliseconds per prompt on this computer, including retrieval and streaming into the runner.",
                badge: "Measured",
              },
              {
                name: "Token efficiency",
                icon: <Checkmark20Regular />,
                desc: "Counts prompt and completion tokens reported by the runtime so you can compare models at equal budgets.",
                badge: "Measured",
              },
              {
                name: "Safety refusal",
                icon: <Shield20Regular />,
                desc: "For red team runs, checks whether the response contains an explicit refusal phrase. It is a heuristic, not a classifier.",
                badge: "Heuristic",
              },
            ].map((evaluator) => (
              <div className="kb-card" key={evaluator.name}>
                <div className="row between">
                  <span className="kb-icon">{evaluator.icon}</span>
                  <span className="badge gray">{evaluator.badge}</span>
                </div>
                <div>
                  <div className="kb-name">{evaluator.name}</div>
                  <p className="kb-desc">{evaluator.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="banner mt-16">
            <ClipboardTask20Regular />
            <span>
              Evaluators call the local model and save every prompt, response and
              latency to disk. Use the results dialog to inspect individual runs.
            </span>
          </div>
        </>
      )}

      {tab === "Red team" && (
        <>
          <p className="muted text-13" style={{ maxWidth: 900, margin: "4px 0 14px" }}>
            Probe the model with adversarial prompts and review whether it refused.
            Prompts and responses stay in data/evaluations.json.
          </p>
          <div className="banner info mb-16">
            <Shield20Regular />
            <span>{REDTEAM_NOTE}</span>
          </div>
          <div className="page-toolbar">
            <span className="muted text-13">
              {runs.filter((run) => run.type === "redteam").length} red team scans
            </span>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => openCreate("redteam")}>
              <Shield20Regular /> Run red team scan
            </button>
          </div>
          {runs.filter((run) => run.type === "redteam").length === 0 ? (
            <div className="operate-card" style={{ textAlign: "center", padding: 48 }}>
              <Shield20Regular style={{ width: 28, height: 28, color: "var(--fg-3)" }} />
              <h3 className="mt-8">No red team scans yet</h3>
              <p className="muted text-13" style={{ maxWidth: 480, margin: "6px auto 0" }}>
                Five adversarial prompts are sent to the selected agent. The report
                shows which requests were refused and the exact responses.
              </p>
              <button className="btn btn-secondary mt-12" onClick={() => openCreate("redteam")}>
                Start a scan
              </button>
            </div>
          ) : (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Scan</th>
                    <th>Target</th>
                    <th style={{ width: 110 }}>Prompts</th>
                    <th style={{ width: 120 }}>Refused</th>
                    <th style={{ width: 120 }}>Refusal rate</th>
                    <th style={{ width: 170 }}>Created</th>
                    <th style={{ width: 100 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {runs
                    .filter((run) => run.type === "redteam")
                    .map((run) => {
                      const total = run.results.length;
                      const refused = run.results.filter((result) => result.refused).length;
                      return (
                        <tr key={run.id}>
                          <td className="cell-strong">{run.name}</td>
                          <td>{run.targetName}</td>
                          <td>{total}/5</td>
                          <td>{refused}</td>
                          <td>
                            {total ? `${Math.round((refused / total) * 100)}%` : "—"}
                          </td>
                          <td>{formatDate(run.createdAt)}</td>
                          <td>
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => setActiveId(run.id)}
                            >
                              Results
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {createOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Create evaluation">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">
                  {createType === "redteam" ? "Run red team scan" : "Create evaluation"}
                </h2>
                <p className="dialog-sub">
                  Runs sequentially on this computer. No cloud evaluator is called.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">
                  Name <span className="required">*</span>
                </span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Target type</span>
                  <Select
                    className="select"
                    value={targetKind}
                    onChange={(event) => {
                      const value = event.target.value as "agent" | "deployment";
                      setTargetKind(value);
                      setTargetId(
                        value === "agent"
                          ? agents[0]?.id || ""
                          : deployments[0]?.id || ""
                      );
                    }}
                  >
                    <option value="agent">Agent</option>
                    <option value="deployment">Deployment</option>
                  </Select>
                </label>
                <label className="field">
                  <span className="field-label">Target</span>
                  <Select
                    className="select"
                    value={targetId}
                    onChange={(event) => setTargetId(event.target.value)}
                  >
                    {targetOptions.length === 0 && <option value="">Nothing available</option>}
                    {targetOptions.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                </label>
              </div>
              <label className="field">
                <span className="field-label">Prompts (one per line)</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 170 }}
                  value={prompts}
                  placeholder={
                    createType === "redteam"
                      ? "Leave blank to use the built-in five adversarial prompts."
                      : DEFAULT_PROMPTS
                  }
                  onChange={(event) => setPrompts(event.target.value)}
                />
                <span className="field-hint">
                  {createType === "redteam"
                    ? "Blank uses the built-in adversarial set. Each response is checked for a refusal phrase."
                    : `${prompts
                        .split("\n")
                        .filter((line) => line.trim()).length} prompts · max 20`}
                </span>
              </label>
              <div className="banner">
                <ClipboardTask20Regular />
                <span>
                  Passing means a non-empty answer. Groundedness counts retrieved
                  citations. Red team scans add a refusal heuristic — review the
                  responses yourself before drawing conclusions.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !name.trim() || !targetId}
                onClick={create}
              >
                {busy ? <Spinner /> : <Play20Regular />} Start
              </button>
            </div>
          </div>
        </div>
      )}

      {active && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setActiveId(null);
          }}
        >
          <div className="dialog xwide" role="dialog" aria-modal="true" aria-label="Evaluation results">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">{active.name}</h2>
                <p className="dialog-sub">
                  {active.targetName} · {active.model} · {formatDate(active.createdAt)}
                </p>
              </div>
              <button className="icon-button" onClick={() => setActiveId(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body" style={{ maxHeight: "68vh" }}>
              <div className="metric-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
                <div className="metric-card">
                  <span className="metric-label">Prompts run</span>
                  <span className="metric-value">{active.results.length}</span>
                  <span className="metric-note">
                    {active.type === "redteam" ? "Adversarial set" : "Quality set"}
                  </span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Pass rate</span>
                  <span className="metric-value">
                    {active.results.length
                      ? `${Math.round(
                          (active.results.filter((result) => result.ok).length /
                            active.results.length) *
                            100
                        )}%`
                      : "—"}
                  </span>
                  <span className="metric-note">Non-empty answers</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Avg latency</span>
                  <span className="metric-value">
                    {active.results.length
                      ? `${Math.round(
                          active.results.reduce(
                            (sum, result) => sum + result.latencyMs,
                            0
                          ) / active.results.length
                        )} ms`
                      : "—"}
                  </span>
                  <span className="metric-note">Local wall clock</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">
                    {active.type === "redteam" ? "Refusal rate" : "Grounded"}
                  </span>
                  <span className="metric-value">
                    {active.results.length
                      ? active.type === "redteam"
                        ? `${Math.round(
                            (active.results.filter((result) => result.refused)
                              .length /
                              active.results.length) *
                              100
                          )}%`
                        : `${Math.round(
                            (active.results.filter((result) => result.citations > 0)
                              .length /
                              active.results.length) *
                            100
                          )}%`
                      : "—"}
                  </span>
                  <span className="metric-note">
                    {active.type === "redteam" ? "Heuristic refusal" : "With citations"}
                  </span>
                </div>
              </div>

              <div className="stack" style={{ gap: 10 }}>
                {active.results.map((result, index) => (
                  <div className="panel" key={index} style={{ padding: 12 }}>
                    <div className="row between mb-8">
                      <span className="field-label" style={{ margin: 0 }}>
                        Prompt {index + 1}
                      </span>
                      <div className="row" style={{ gap: 6 }}>
                        <span className={`badge${result.ok ? " green" : ""}`}>
                          {result.ok ? "Answered" : "Failed"}
                        </span>
                        {result.refused !== undefined && (
                          <span className={`badge${result.refused ? " green" : " gray"}`}>
                            {result.refused ? "Refused" : "Complied"}
                          </span>
                        )}
                        <span className="badge gray">{result.latencyMs} ms</span>
                        {result.citations > 0 && (
                          <span className="badge gray">
                            {result.citations} citations
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-13" style={{ marginBottom: 8 }}>
                      {result.prompt}
                    </div>
                    <div className="chunk-preview">{result.response}</div>
                  </div>
                ))}
                {active.results.length === 0 && (
                  <div className="row" style={{ gap: 8 }}>
                    <Spinner /> Waiting for the first result from the local model…
                  </div>
                )}
              </div>
            </div>
            <div className="dialog-footer">
              <span className="muted text-12">
                {active.results.length} results · saved locally
              </span>
              <span className="grow" />
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setActiveId(null);
                  openCreate(active.type);
                }}
              >
                Run again
              </button>
              <button className="btn btn-primary" onClick={() => setActiveId(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
