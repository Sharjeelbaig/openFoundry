// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowClockwise20Regular,
  CheckmarkCircle20Regular,
  Shield20Regular,
  Warning20Regular,
  DismissCircle20Regular,
  Search20Regular,
  DocumentText20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useDeployments, useModels, useMounted } from "@/lib/client";
import { Spinner } from "@/components/ui";
import type { Agent, EvaluationRun, KnowledgeBase } from "@/lib/types";

type Tab = "Overview" | "Assessments" | "Control details";

interface Control {
  id: string;
  name: string;
  category: string;
  status: "Passed" | "Attention" | "Not applicable";
  detail: string;
  evidence: string;
  href?: string;
}

export default function CompliancePage() {
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents", 10000);
  const { data: knowledgeData } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
    10000
  );
  const { data: evalData } = useApi<{ evaluations: EvaluationRun[] }>(
    "/api/evaluations",
    8000
  );
  const { data: deploymentData } = useDeployments(10000);
  const { data: modelData } = useModels(30000);
  const { data: systemData } = useApi<{
    stats: { hostname: string; platform: string; freeMem: number; totalMem: number };
  }>("/api/system");

  const agents = agentData?.agents ?? [];
  const knowledgeBases = knowledgeData?.knowledgeBases ?? [];
  const evaluations = evalData?.evaluations ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const models = modelData?.models ?? [];

  const [tab, setTab] = useState<Tab>("Overview");
  const [query, setQuery] = useState("");
  // The "Last assessed" fact row reads the wall clock; render it only after
  // mount so SSR and hydration produce the same text (OS-21, React #418).
  const mounted = useMounted();

  const controls = useMemo<Control[]>(() => {
    const guarded = agents.filter((agent) => (agent.guardrail || "Default") !== "Off");
    const strict = agents.filter((agent) => agent.guardrail === "Strict");
    const redTeam = evaluations.filter((run) => run.type === "redteam");
    const redResults = redTeam.flatMap((run) => run.results);
    const refused = redResults.filter((result) => result.refused).length;
    const refusalRate = redResults.length
      ? Math.round((refused / redResults.length) * 100)
      : null;
    const failed = deployments.filter((item) => item.status === "Failed");
    const uncached = models.filter((model) => !model.cached);
    const licensed = models.filter((model) => model.license);

    return [
      {
        id: "local-data",
        name: "Data residency",
        category: "Data protection",
        status: "Passed",
        detail:
          "Prompts, documents and traces are written only to the local data directory. No cloud endpoint is configured.",
        evidence: `Host: ${systemData?.stats.hostname || "this computer"} · data/ on disk`,
        href: "/manage/resources",
      },
      {
        id: "guardrails",
        name: "Agent guardrails enabled",
        category: "AI safety",
        status: agents.length === 0 ? "Not applicable" : guarded.length === agents.length ? "Passed" : "Attention",
        detail:
          "Every agent should run with the Default or Strict guardrail, which injects safety instructions into the system prompt.",
        evidence: `${guarded.length} of ${agents.length} agents guarded · ${strict.length} strict`,
        href: "/build/guardrails",
      },
      {
        id: "redteam",
        name: "Red team coverage",
        category: "AI safety",
        status: redResults.length === 0 ? "Attention" : refusalRate != null && refusalRate >= 80 ? "Passed" : "Attention",
        detail:
          "Adversarial prompts exercise prompt-injection, credential theft and harmful-content requests. Refusal is scored with a transparent heuristic.",
        evidence:
          redResults.length === 0
            ? "No red team scan has run yet"
            : `${redResults.length} prompts across ${redTeam.length} scans · ${refusalRate}% refused`,
        href: "/build/evaluations",
      },
      {
        id: "evaluations",
        name: "Quality evaluation coverage",
        category: "Responsible AI",
        status:
          evaluations.filter((run) => run.type === "evaluation").length === 0
            ? "Attention"
            : "Passed",
        detail:
          "Quality runs measure answer completeness, groundedness and latency on the local model before an agent is shared.",
        evidence: `${evaluations.filter((run) => run.type === "evaluation").length} quality runs stored locally`,
        href: "/build/evaluations",
      },
      {
        id: "deployments",
        name: "Deployment health",
        category: "Operations",
        status: failed.length === 0 ? "Passed" : "Attention",
        detail:
          "Failed deployments usually mean the local runtime could not download or load the weights. They are visible on the models page.",
        evidence: `${deployments.length} deployments · ${failed.length} failed`,
        href: "/build/models/deployments",
      },
      {
        id: "licenses",
        name: "Model licensing metadata",
        category: "Governance",
        status: uncached.length === 0 || licensed.length > 0 ? "Passed" : "Attention",
        detail:
          "License text comes from the local runtime or the Hugging Face cache. The portal never invents a license.",
        evidence: `${licensed.length} of ${models.length} models expose a license · ${uncached.length} require download`,
        href: "/discover/models",
      },
      {
        id: "knowledge",
        name: "Knowledge index integrity",
        category: "Data protection",
        status: knowledgeBases.some((base) => base.status === "Failed")
          ? "Attention"
          : "Passed",
        detail:
          "Each knowledge base reports whether embeddings were produced by a real embedding model or fell back to lexical scoring.",
        evidence: `${knowledgeBases.length} bases · ${knowledgeBases.reduce(
          (sum, base) => sum + base.documents.length,
          0
        )} documents`,
        href: "/build/knowledge/search",
      },
      {
        id: "cloud",
        name: "No cloud provisioning",
        category: "Cost governance",
        status: "Passed",
        detail:
          "This build is intentionally incapable of provisioning cloud resources. Deployments are local processes and endpoints.",
        evidence: "0 cloud resources · $0.00 spend",
        href: "/manage/quota",
      },
    ];
  }, [
    agents,
    deployments,
    evaluations,
    knowledgeBases,
    models,
    systemData?.stats.hostname,
  ]);

  const filtered = useMemo(
    () =>
      controls.filter(
        (control) =>
          !query ||
          control.name.toLowerCase().includes(query.toLowerCase()) ||
          control.category.toLowerCase().includes(query.toLowerCase()) ||
          control.detail.toLowerCase().includes(query.toLowerCase())
      ),
    [controls, query]
  );

  const passed = controls.filter((control) => control.status === "Passed").length;
  const attention = controls.filter((control) => control.status === "Attention").length;
  const score = Math.round((passed / controls.length) * 100);

  const tone = (status: Control["status"]) =>
    status === "Passed" ? "green" : status === "Attention" ? "warning" : "gray";

  const icon = (status: Control["status"]) =>
    status === "Passed" ? (
      <CheckmarkCircle20Regular />
    ) : status === "Attention" ? (
      <Warning20Regular />
    ) : (
      <DismissCircle20Regular />
    );

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <h1 className="page-title">Compliance</h1>
          <span className="preview-tag">Preview</span>
        </div>
        <div className="page-header-actions">
          <Link href="/manage/resources" className="btn btn-secondary">
            <DocumentText20Regular /> Evidence
          </Link>
        </div>
      </div>

      <div className="tabbar mt-8">
        {(["Overview", "Assessments", "Control details"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <>
          <p className="muted text-13" style={{ maxWidth: 920, margin: "4px 0 18px" }}>
            These controls are evaluated from real local state — agents, deployments,
            knowledge indexes and evaluation runs. A control turns amber when the
            underlying fact is missing, not because a remote compliance service said so.
          </p>
          <div className="compliance-hero">
            <div className="compliance-score" aria-label={`${score}% of controls passed`}>
              <svg viewBox="0 0 120 120" role="presentation">
                <circle cx="60" cy="60" r="50" className="track" />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  className="value"
                  strokeDasharray={`${(score / 100) * 314} 314`}
                />
              </svg>
              <span>
                <strong>{score}%</strong>
                <small>controls passed</small>
              </span>
            </div>
            <div className="compliance-summary">
              <h3>Responsible AI posture</h3>
              <p>
                This project runs entirely on {systemData?.stats.hostname || "this computer"}.
                Data residency and cost controls pass by construction. Safety controls
                depend on the guardrails and evaluations you configure.
              </p>
              <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                <span className="badge green">{passed} passed</span>
                <span className={`badge${attention ? " warning" : " gray"}`}>
                  {attention} need attention
                </span>
                <span className="badge gray">
                  {controls.length - passed - attention} not applicable
                </span>
              </div>
            </div>
            <div className="compliance-facts">
              <div className="fact-row">
                <span>Data location</span>
                <span>On device</span>
              </div>
              <div className="fact-row">
                <span>Region</span>
                <span>local</span>
              </div>
              <div className="fact-row">
                <span>Last assessed</span>
                <span>{mounted ? formatDate(new Date().toISOString()) : "just now"}</span>
              </div>
              <div className="fact-row">
                <span>Assessor</span>
                <span>Local control plane</span>
              </div>
            </div>
          </div>

          <div className="control-grid">
            {controls.map((control) => (
              <div className="operate-card control-card" key={control.id}>
                <div className="row between">
                  <span className="row" style={{ gap: 8 }}>
                    <span className={`control-icon ${tone(control.status)}`}>
                      {icon(control.status)}
                    </span>
                    <strong className="text-14">{control.name}</strong>
                  </span>
                  <span className={`badge ${tone(control.status)}`}>{control.status}</span>
                </div>
                <p className="text-12 muted" style={{ lineHeight: "18px" }}>
                  {control.detail}
                </p>
                <div className="control-evidence">{control.evidence}</div>
                {control.href && (
                  <Link href={control.href} className="link text-12">
                    Open evidence
                  </Link>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "Assessments" && (
        <>
          <div className="page-toolbar">
            <div className="search-input">
              <Search20Regular />
              <input
                className="input"
                placeholder="Search assessments"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="spacer" />
            <button
              className="btn btn-secondary"
              onClick={() => window.location.reload()}
            >
              <ArrowClockwise20Regular /> Re-assess
            </button>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Control</th>
                  <th style={{ width: 170 }}>Category</th>
                  <th style={{ width: 130 }}>Result</th>
                  <th>Evidence</th>
                  <th style={{ width: 90 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((control) => (
                  <tr key={control.id}>
                    <td className="cell-strong">{control.name}</td>
                    <td>{control.category}</td>
                    <td>
                      <span className={`badge ${tone(control.status)}`}>
                        {control.status}
                      </span>
                    </td>
                    <td className="muted">{control.evidence}</td>
                    <td>
                      {control.href ? (
                        <Link href={control.href} className="btn btn-sm btn-outline">
                          View
                        </Link>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 40 }}>
                      No controls match “{query}”.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "Control details" && (
        <div className="manage-layout mt-12">
          <div className="operate-card">
            <h3 className="mb-8">How these controls are computed</h3>
            <div className="model-prose">
              <p>
                <strong>Data residency</strong> passes because the server only writes to{" "}
                <span className="mono">data/</span>. The one outbound path is the optional
                web search tool, which sends the query to DuckDuckGo and is called out in
                the agent builder.
              </p>
              <p>
                <strong>Guardrails</strong> counts agents whose guardrail is not Off. The
                Default and Strict modes prepend safety instructions to the system prompt.
                They are prompt-level controls, not a classifier.
              </p>
              <p>
                <strong>Red team coverage</strong> reads saved red team runs. Refusal is
                detected by looking for explicit refusal phrases in the response, so review
                the transcripts rather than relying only on the percentage.
              </p>
              <p>
                <strong>Licensing</strong> only reports license text the runtime or cache
                actually exposes. Missing licenses are shown as missing rather than guessed.
              </p>
            </div>
          </div>
          <div className="operate-card">
            <h3 className="mb-8">Compliance artifacts</h3>
            <div className="facts-list">
              <div className="fact-row">
                <span>Agents</span>
                <span>{agents.length}</span>
              </div>
              <div className="fact-row">
                <span>Evaluation runs</span>
                <span>{evaluations.length}</span>
              </div>
              <div className="fact-row">
                <span>Knowledge bases</span>
                <span>{knowledgeBases.length}</span>
              </div>
              <div className="fact-row">
                <span>Deployments</span>
                <span>{deployments.length}</span>
              </div>
            </div>
            <div className="banner mt-12">
              <Shield20Regular />
              <span>
                Export the data directory to archive this evidence. Nothing is uploaded
                automatically.
              </span>
            </div>
          </div>
        </div>
      )}

      {!systemData && (
        <div className="row mt-12" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Reading local control state…
        </div>
      )}
    </div>
  );
}
