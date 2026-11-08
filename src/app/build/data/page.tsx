// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowDownload20Regular,
  Book20Regular,
  Database20Regular,
  Dismiss20Regular,
  DocumentText20Regular,
  Folder20Regular,
  Search20Regular,
  Table20Regular,
} from "@fluentui/react-icons";
import { formatBytes, formatDate, useApi, useKnowledge } from "@/lib/client";
import { documentsEmptyMessage } from "@/lib/data-empty-state";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type {
  Agent,
  BatchJob,
  Deployment,
  EvaluationRun,
  KnowledgeBase,
  KnowledgeDocument,
  Routine,
  Trace,
  Workflow,
} from "@/lib/types";

type Tab = "Data assets" | "Connections" | "Storage";

export default function DataPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: knowledgeData, loading } = useKnowledge();
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: traceData } = useApi<{ traces: Trace[] }>("/api/traces", 10000);
  const { data: evalData } = useApi<{ evaluations: EvaluationRun[] }>("/api/evaluations");
  const { data: deploymentData } = useApi<{ deployments: Deployment[] }>("/api/deployments");
  const { data: routineData } = useApi<{ routines: Routine[] }>("/api/routines");
  const { data: workflowData } = useApi<{ workflows: Workflow[] }>("/api/workflows");
  const { data: batchData } = useApi<{ jobs: BatchJob[] }>("/api/batch");
  const { data: quotaData } = useApi<{ requests: { id: string }[] }>(
    "/api/quota-requests"
  );

  const bases = knowledgeData?.knowledgeBases ?? [];
  const agents = agentData?.agents ?? [];
  const traces = traceData?.traces ?? [];
  const evaluations = evalData?.evaluations ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const routines = routineData?.routines ?? [];
  const workflows = workflowData?.workflows ?? [];
  const batchJobs = batchData?.jobs ?? [];
  const quotaRequests = quotaData?.requests ?? [];

  const [tab, setTab] = useState<Tab>("Data assets");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const documents = useMemo(
    () =>
      bases.flatMap((base) =>
        base.documents.map((doc: KnowledgeDocument) => ({ base, doc }))
      ),
    [bases]
  );
  const filteredDocs = documents.filter(
    ({ base, doc }) =>
      !query ||
      doc.name.toLowerCase().includes(query.toLowerCase()) ||
      base.name.toLowerCase().includes(query.toLowerCase())
  );
  const totalSize = documents.reduce((sum, item) => sum + item.doc.size, 0);
  const totalChunks = documents.reduce(
    (sum, item) => sum + item.doc.chunks.length,
    0
  );

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          description: "Created from the Data page",
        }),
      });
      const json = (await res.json()) as { knowledgeBase?: KnowledgeBase; error?: string };
      if (!res.ok || !json.knowledgeBase)
        throw new Error(json.error || "Could not create the data asset");
      setCreateOpen(false);
      setName("");
      router.push(`/build/knowledge/${encodeURIComponent(json.knowledgeBase.id)}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Data</h1>
          <p className="page-subtitle">
            Files, indexes and records stored by this project on this computer.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-secondary" href="/build/data/extract">
            <Table20Regular /> Extract structure
          </Link>
          <Link className="btn btn-secondary" href="/build/data/extraction">
            <Table20Regular /> Custom extraction
          </Link>
          <a className="btn btn-secondary" href="/api/export" download>
            <ArrowDownload20Regular /> Export project
          </a>
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Add20Regular /> New data asset
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        {(["Data assets", "Connections", "Storage"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Data assets" && (
        <>
          <div className="metric-grid mt-12">
            <div className="operate-card">
              <span className="metric-label">Knowledge bases</span>
              <span className="metric-value">{bases.length}</span>
              <span className="metric-note">Indexed locally</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Documents</span>
              <span className="metric-value">{documents.length}</span>
              <span className="metric-note">{formatBytes(totalSize)} of text</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Chunks</span>
              <span className="metric-value">{totalChunks}</span>
              <span className="metric-note">900-character windows</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Trace records</span>
              <span className="metric-value">{traces.length}</span>
              <span className="metric-note">{evaluations.length} evaluation runs</span>
            </div>
          </div>

          <div className="page-toolbar">
            <div className="search-input">
              <Search20Regular />
              <input
                className="input"
                placeholder="Search documents and knowledge bases"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="spacer" />
            <span className="muted text-12">
              {filteredDocs.length} of {documents.length} documents
            </span>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 200 }}>Knowledge base</th>
                  <th style={{ width: 150 }}>Type</th>
                  <th style={{ width: 100 }}>Size</th>
                  <th style={{ width: 90 }}>Chunks</th>
                  <th style={{ width: 170 }}>Added</th>
                  <th style={{ width: 110 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {filteredDocs.map(({ base, doc }) => (
                  <tr key={`${base.id}-${doc.id}`}>
                    <td>
                      <span className="row" style={{ gap: 8 }}>
                        <DocumentText20Regular />
                        <span className="cell-strong truncate" style={{ maxWidth: 300 }}>
                          {doc.name}
                        </span>
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                        className="agent-name"
                      >
                        {base.name}
                      </Link>
                    </td>
                    <td className="muted">{doc.type || "text/plain"}</td>
                    <td>{formatBytes(doc.size)}</td>
                    <td>{doc.chunks.length}</td>
                    <td>{formatDate(doc.addedAt)}</td>
                    <td>
                      <Link
                        href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                        className="btn btn-sm btn-outline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
                {filteredDocs.length === 0 && (
                  <tr>
                    <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 40 }}>
                      {documentsEmptyMessage(query, loading)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="manage-section-title">Knowledge bases</div>
          <div className="kb-grid">
            {bases.map((base) => (
              <div className="kb-card" key={base.id}>
                <div className="row between">
                  <span className="kb-icon">
                    <Book20Regular />
                  </span>
                  <span className="badge gray">{base.status}</span>
                </div>
                <div>
                  <Link
                    href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                    className="kb-name"
                  >
                    {base.name}
                  </Link>
                  <p className="kb-desc">{base.description || "No description."}</p>
                </div>
                <div className="kb-meta">
                  <span>{base.documents.length} documents</span>
                  <span className="truncate">{base.embeddingModel}</span>
                </div>
              </div>
            ))}
            {bases.length === 0 && (
              <div className="operate-card muted" style={{ gridColumn: "1 / -1", padding: 32 }}>
                No knowledge bases. Create one to start collecting documents.
              </div>
            )}
          </div>
        </>
      )}

      {tab === "Connections" && (
        <>
          <p className="muted text-13" style={{ maxWidth: 860, margin: "4px 0 16px" }}>
            Every connection is a file or a process on this computer. There are no
            storage accounts, search services or database servers to configure.
          </p>
          <div className="connection-grid">
            {[
              {
                name: "Local JSON store",
                type: "File system",
                detail: "Agents, deployments, settings and gateway config in ./data.",
                icon: <Folder20Regular />,
                href: "/manage/resources",
              },
              {
                name: "Knowledge store",
                type: "File system + vectors",
                detail: `${bases.length} bases, ${documents.length} documents, ${totalChunks} chunks.`,
                icon: <Database20Regular />,
                href: "/build/knowledge/search",
              },
              {
                name: "Trace store",
                type: "File system",
                detail: `${traces.length} traces with prompts, responses and token counts.`,
                icon: <Table20Regular />,
                href: "/operate",
              },
              ...agents.slice(0, 3).map((agent) => ({
                name: `${agent.name} memory`,
                type: "Browser localStorage",
                detail: agent.memoryEnabled
                  ? "Conversation memory enabled in the builder."
                  : "Conversation memory disabled.",
                icon: <Book20Regular />,
                href: `/build/agents/${encodeURIComponent(agent.id)}/build`,
              })),
            ].map((connection) => (
              <div className="operate-card" key={connection.name}>
                <div className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">{connection.icon}</span>
                  <div>
                    <strong className="text-14">{connection.name}</strong>
                    <div className="muted text-12">{connection.type}</div>
                  </div>
                </div>
                <p className="muted text-12" style={{ lineHeight: "18px" }}>
                  {connection.detail}
                </p>
                <Link href={connection.href} className="link text-12">
                  Open
                </Link>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "Storage" && (
        <>
          <div className="banner info mb-16">
            <Folder20Regular />
            <span>
              All project records live under <span className="mono">./data</span>.
              Model weights are managed by Foundry Local and Ollama and are not part of
              this export.
            </span>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>File</th>
                  <th>Contents</th>
                  <th style={{ width: 140 }}>Records</th>
                  <th style={{ width: 140 }}>Included in export</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ["agents.json", "Agent configs and versions", agents.length],
                  ["deployments.json", "Deployment records", deployments.length],
                  ["knowledge.json", "Knowledge bases, text and embeddings", bases.length],
                  ["traces.json", "Prompt and response traces", traces.length],
                  ["evaluations.json", "Quality and red team runs", evaluations.length],
                  ["routines.json", "Scheduled prompts", routines.length],
                  ["workflows.json", "Sequential agent chains", workflows.length],
                  ["batch.json", "Batch prompt jobs", batchJobs.length],
                  ["gateway.json", "Gateway routing config", 0],
                  ["quota-requests.json", "Local capacity requests", quotaRequests.length],
                  ["settings.json", "Project identity, API key and users", 1],
                ].map(([file, contents, records]) => (
                  <tr key={file as string}>
                    <td className="mono text-12">{file}</td>
                    <td>{contents}</td>
                    <td>{records}</td>
                    <td>
                      <span className="badge green">Yes</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row mt-12" style={{ gap: 8 }}>
            <a className="btn btn-primary" href="/api/export" download>
              <ArrowDownload20Regular /> Download JSON bundle
            </a>
            <span className="muted text-12" style={{ alignSelf: "center" }}>
              The bundle contains every record above in a single file.
            </span>
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
          <div className="dialog" role="dialog" aria-modal="true" aria-label="New data asset">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New data asset</h2>
                <p className="dialog-sub">
                  Creates a knowledge base that can hold uploaded files and pasted
                  text. Indexing happens on this computer.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  autoFocus
                  placeholder="product-catalog"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void create();
                  }}
                />
              </label>
              <div className="banner">
                <Database20Regular />
                <span>
                  You will be taken to the knowledge base to upload documents or paste
                  text.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={create}>
                {busy ? <Spinner /> : <Add20Regular />} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
