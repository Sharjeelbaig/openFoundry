"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ChevronDown20Regular,
  Code20Regular,
  Delete20Regular,
  Dismiss20Regular,
  MoreHorizontal20Regular,
  Play20Regular,
  Search20Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import { formatDate, formatNumber, useApi, useDeployments } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, DottedObject, EmptyState, Spinner, StatusBadge } from "@/components/ui";
import type { BatchJob, Deployment, DeploymentKind } from "@/lib/types";

type TopTab = "Deployments" | "Models" | "Batch jobs";
type KindTab = DeploymentKind;

const KIND_LABEL: Record<KindTab, string> = {
  Serverless: "Serverless deployments",
  "Managed compute": "Managed compute deployments",
  Adapter: "Adapter deployments",
};

/** Human-readable scope/region, matching the routing the server performs. */
function whereRuns(deployment: Deployment): string {
  switch (deployment.scope) {
    case "Global":
      return "Global";
    case "Data Zone":
      return `Data Zone · ${deployment.zone || "US"}`;
    case "Region":
      return deployment.region || "Region";
    case "Device":
      return "On device";
    default:
      return deployment.region || "On device";
  }
}

export default function DeploymentsPage() {
  const { toast } = useToast();
  const [topTab, setTopTab] = useState<TopTab>("Deployments");
  const [kind, setKind] = useState<KindTab>("Serverless");
  const [query, setQuery] = useState("");
  const [deployOpen, setDeployOpen] = useState(false);
  const [ptuOpen, setPtuOpen] = useState(false);
  const [detail, setDetail] = useState<Deployment | null>(null);
  const [codeFor, setCodeFor] = useState<Deployment | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Deployment | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [nodesOpen, setNodesOpen] = useState(false);
  const [batchName, setBatchName] = useState("");
  const [batchDeployment, setBatchDeployment] = useState("");
  const [batchPrompts, setBatchPrompts] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);
  const [jobDetail, setJobDetail] = useState<BatchJob | null>(null);

  const { data, refresh, loading } = useDeployments(3500);
  const { data: batchData, refresh: refreshBatch } = useApi<{ jobs: BatchJob[] }>(
    "/api/batch",
    3000
  );
  const deployments = data?.deployments ?? [];
  const nodes = data?.nodes ?? [];
  const jobs = batchData?.jobs ?? [];
  const nodeLabel = (id?: string) => {
    if (!id) return "Default runtime";
    const node = nodes.find((item) => item.id === id);
    return node ? `${node.name} · ${node.status}` : "Isolated runtime";
  };

  const filtered = useMemo(
    () =>
      deployments
        .filter((deployment) => deployment.kind === kind)
        .filter(
          (deployment) =>
            !query ||
            deployment.name.toLowerCase().includes(query.toLowerCase()) ||
            deployment.modelName.toLowerCase().includes(query.toLowerCase())
        ),
    [deployments, kind, query]
  );

  const deployedModels = useMemo(() => {
    const map = new Map<
      string,
      { modelId: string; modelName: string; providerLabel: string; count: number; status: string }
    >();
    for (const deployment of deployments) {
      const existing = map.get(deployment.modelId);
      if (existing) {
        existing.count += 1;
      } else {
        map.set(deployment.modelId, {
          modelId: deployment.modelId,
          modelName: deployment.modelName,
          providerLabel: deployment.providerLabel,
          count: 1,
          status: deployment.status,
        });
      }
    }
    return [...map.values()];
  }, [deployments]);

  const remove = async (deployment: Deployment) => {
    setConfirmDelete(null);
    setDetail(null);
    const res = await fetch(`/api/deployments?id=${encodeURIComponent(deployment.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not delete the deployment", "error");
      return;
    }
    toast(`Deleted ${deployment.name}`, "success");
    refresh();
  };

  const toggleDeployment = async (deployment: Deployment) => {
    const action = deployment.status === "Stopped" ? "start" : "stop";
    try {
      const res = await fetch("/api/deployments", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: deployment.id, action }),
      });
      if (!res.ok) throw new Error("Could not update the deployment");
      toast(
        action === "stop"
          ? `${deployment.name} stopped and unloaded from the local runtime`
          : `${deployment.name} started locally`,
        "success"
      );
      setDetail(null);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Update failed", "error");
    }
  };

  const createBatch = async () => {
    if (!batchName.trim() || !batchDeployment || !batchPrompts.trim()) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: batchName,
          deploymentId: batchDeployment,
          prompts: batchPrompts
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Batch failed");
      toast("Batch job started on the local model", "success");
      setBatchOpen(false);
      setBatchName("");
      setBatchPrompts("");
      refreshBatch();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Batch failed", "error");
    } finally {
      setBatchBusy(false);
    }
  };

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="page models-page" style={{ paddingTop: 18, paddingBottom: 0 }}>
      <h1 className="page-title">Models</h1>

      <div className="tabbar mt-8">
        {(
          [
            ["Deployments", null],
            ["Models", "Preview"],
            ["Batch jobs", null],
          ] as [TopTab, string | null][]
        ).map(([item, tag]) => (
          <button
            key={item}
            className={`tab${topTab === item ? " active" : ""}`}
            onClick={() => setTopTab(item)}
          >
            {item}
            {tag && <span className="preview-tag">{tag}</span>}
          </button>
        ))}
      </div>

      {topTab === "Deployments" && (
        <>
          <div className="tabbar" style={{ marginTop: -8 }}>
            {(Object.keys(KIND_LABEL) as KindTab[]).map((item) => (
              <button
                key={item}
                className={`tab${kind === item ? " active" : ""}`}
                onClick={() => setKind(item)}
              >
                {KIND_LABEL[item]}
              </button>
            ))}
          </div>

          <div className="row" style={{ gap: 8, marginBottom: 16 }}>
            <div className="search-input" style={{ width: 320 }}>
              <Search20Regular />
              <input
                className="input"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="grow" />
            <button className="btn btn-secondary" onClick={() => setNodesOpen(true)}>
              Runtime nodes{nodes.length ? ` (${nodes.length})` : ""}
            </button>
            <button className="btn btn-secondary" onClick={() => setPtuOpen(true)}>
              PTU Calculator
            </button>
            <div className="deploy-split">
              <button className="btn btn-primary" onClick={() => setDeployOpen(!deployOpen)}>
                Deploy
              </button>
              <button
                className="btn btn-primary deploy-caret"
                aria-label="Deploy options"
                onClick={() => setDeployOpen(!deployOpen)}
              >
                <ChevronDown20Regular />
              </button>
              {deployOpen && (
                <div className="menu-popover" style={{ top: 36, minWidth: 280 }}>
                  <Link className="menu-item" href="/discover/models" onClick={() => setDeployOpen(false)}>
                    <Add20Regular /> Deploy a base model
                  </Link>
                  <Link
                    className="menu-item"
                    href="/discover/models?provider=huggingface"
                    onClick={() => setDeployOpen(false)}
                  >
                    <Add20Regular /> Deploy from local files
                  </Link>
                  <button className="menu-item" onClick={() => setPtuOpen(true)}>
                    <Play20Regular /> Estimate capacity
                  </button>
                </div>
              )}
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="models-empty">
              <DottedObject />
              <h2>{loading ? "Loading deployments…" : "Deploy your first model"}</h2>
              <p>
                After you deploy a model, you can try it out in the{" "}
                <Link href="/playground" className="link">
                  playground
                </Link>
                .
              </p>
              <Link href="/discover/models" className="btn btn-primary mt-16">
                Browse the model catalog
              </Link>
            </div>
          ) : (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Model</th>
                    <th style={{ width: 150 }}>Deployment type</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th style={{ width: 260 }}>Endpoint</th>
                    <th style={{ width: 170 }}>Created</th>
                    <th style={{ width: 60 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((deployment) => (
                    <tr key={deployment.id}>
                      <td>
                        <button className="agent-name link" onClick={() => setDetail(deployment)}>
                          {deployment.name}
                        </button>
                      </td>
                      <td>
                        <span style={{ display: "block" }}>{deployment.modelName}</span>
                        <span className="text-12 muted">{deployment.providerLabel}</span>
                      </td>
                      <td>
                        <span style={{ display: "block" }}>{deployment.sku}</span>
                        <span className="text-12 muted">{whereRuns(deployment)}</span>
                      </td>
                      <td>
                        <StatusBadge status={deployment.status} />
                      </td>
                      <td className="mono text-12 truncate" style={{ maxWidth: 260 }}>
                        {deployment.endpoint}
                      </td>
                      <td>{formatDate(deployment.createdAt)}</td>
                      <td style={{ position: "relative" }}>
                        <button
                          className="icon-button small"
                          aria-label={`Actions for ${deployment.name}`}
                          onClick={() => setDetail(deployment)}
                        >
                          <MoreHorizontal20Regular />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {topTab === "Models" && (
        <>
          <div className="row between mb-12">
            <p className="muted">
              Models currently available through deployments in this local project.
            </p>
            <Link href="/discover/models" className="btn btn-secondary">
              Browse model catalog
            </Link>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th>Provider</th>
                  <th style={{ width: 160 }}>Deployments</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {deployedModels.map((model) => (
                  <tr key={model.modelId}>
                    <td className="cell-strong">{model.modelName}</td>
                    <td>{model.providerLabel}</td>
                    <td>{model.count}</td>
                    <td>
                      <StatusBadge status={model.status} />
                    </td>
                    <td>
                      <Link
                        href={`/playground?model=${encodeURIComponent(model.modelId)}`}
                        className="btn btn-sm btn-outline"
                      >
                        <Play20Regular /> Test
                      </Link>
                    </td>
                  </tr>
                ))}
                {deployedModels.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      No models are deployed yet. Deploy one from the catalog to make
                      it available here.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {topTab === "Batch jobs" && (
        <>
          <div className="row between mb-12">
            <p className="muted">
              Run many prompts against one deployment. Jobs execute sequentially on
              this computer and store every response.
            </p>
            <button
              className="btn btn-primary"
              disabled={deployments.length === 0}
              onClick={() => {
                setBatchDeployment(deployments[0]?.id || "");
                setBatchOpen(true);
              }}
            >
              New batch job
            </button>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Deployment</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 130 }}>Progress</th>
                  <th style={{ width: 180 }}>Created</th>
                  <th style={{ width: 140 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id}>
                    <td className="cell-strong">{job.name}</td>
                    <td>{job.deploymentName}</td>
                    <td>
                      <StatusBadge status={job.status} />
                    </td>
                    <td>
                      {job.results.length}/{job.prompts.length}
                    </td>
                    <td>{formatDate(job.createdAt)}</td>
                    <td>
                      <div className="inline-actions">
                        <button className="btn btn-sm btn-outline" onClick={() => setJobDetail(job)}>
                          View results
                        </button>
                        <button
                          className="icon-button small"
                          aria-label="Delete batch job"
                          onClick={async () => {
                            await fetch("/api/batch", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ id: job.id, action: "delete" }),
                            });
                            refreshBatch();
                          }}
                        >
                          <Delete20Regular />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {jobs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      No batch jobs yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {detail && (
        <>
          <div className="drawer-backdrop" onClick={() => setDetail(null)} />
          <aside className="drawer" aria-label="Deployment details">
            <div className="drawer-head">
              <div>
                <h2 className="drawer-title">{detail.name}</h2>
                <p className="dialog-sub">
                  {detail.modelName} · {detail.providerLabel}
                </p>
              </div>
              <button className="icon-button" onClick={() => setDetail(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="drawer-body">
              <div className="row" style={{ gap: 8 }}>
                <StatusBadge status={detail.status} />
                <span className="badge gray">{detail.sku}</span>
                {detail.servingMode && <span className="badge gray">{detail.servingMode}</span>}
              </div>
              <p className="muted text-12">
                {whereRuns(detail)}
                {detail.nodeId ? ` · ${nodeLabel(detail.nodeId)}` : " · Default runtime"}
              </p>
              {detail.status === "Creating" && (
                <div className="banner info">
                  <Spinner />
                  <span>
                    Local runtime is downloading this model into the cache. The
                    deployment becomes usable automatically when the download
                    finishes.
                  </span>
                </div>
              )}
              <label className="field">
                <span className="field-label">Endpoint</span>
                <span className="input-with-button">
                  <input className="input mono" readOnly value={detail.endpoint} />
                  <CopyButton value={detail.endpoint} label="Copy endpoint" className="btn btn-secondary btn-icon-only" />
                </span>
              </label>
              <label className="field">
                <span className="field-label">Key</span>
                <span className="input-with-button">
                  <input className="input mono" readOnly value={detail.apiKey} type="password" />
                  <CopyButton value={detail.apiKey} label="Copy key" className="btn btn-secondary btn-icon-only" />
                </span>
              </label>
              <div className="form-grid">
                <div>
                  <div className="manage-field-label">Model id</div>
                  <div className="manage-field-value mono">{detail.modelId}</div>
                </div>
                <div>
                  <div className="manage-field-label">Serving mode</div>
                  <div className="manage-field-value">{detail.servingMode || "—"}</div>
                </div>
                <div>
                  <div className="manage-field-label">Routing scope</div>
                  <div className="manage-field-value">{whereRuns(detail)}</div>
                </div>
                <div>
                  <div className="manage-field-label">Runtime node</div>
                  <div className="manage-field-value">{nodeLabel(detail.nodeId)}</div>
                </div>
                {detail.servingMode === "Provisioned" || detail.servingMode === "Dedicated" ? (
                  <div>
                    <div className="manage-field-label">Reserved slots</div>
                    <div className="manage-field-value">{detail.reservedSlots ?? detail.capacity}</div>
                  </div>
                ) : (
                  <div>
                    <div className="manage-field-label">Rate limit</div>
                    <div className="manage-field-value">
                      {detail.tpm ? `${formatNumber(detail.tpm)} tokens/min` : "—"}
                    </div>
                  </div>
                )}
                <div>
                  <div className="manage-field-label">Model version</div>
                  <div className="manage-field-value">{detail.modelVersion || "latest"}</div>
                </div>
                <div>
                  <div className="manage-field-label">Requests served</div>
                  <div className="manage-field-value">{formatNumber(detail.requests)}</div>
                </div>
                <div>
                  <div className="manage-field-label">Tokens served</div>
                  <div className="manage-field-value">{formatNumber(detail.tokens)}</div>
                </div>
                <div>
                  <div className="manage-field-label">Created</div>
                  <div className="manage-field-value">{formatDate(detail.createdAt)}</div>
                </div>
                <div>
                  <div className="manage-field-label">Updated</div>
                  <div className="manage-field-value">{formatDate(detail.updatedAt)}</div>
                </div>
              </div>
              <div className="banner">
                <Code20Regular />
                <span>
                  OpenAI-compatible: POST <span className="mono">{detail.endpoint}/chat/completions</span>{" "}
                  with the key above. Streaming and non-streaming are supported.
                </span>
              </div>
            </div>
            <div className="drawer-footer">
              <button
                className="btn btn-danger"
                onClick={() => setConfirmDelete(detail)}
                style={{ marginRight: "auto" }}
              >
                <Delete20Regular /> Delete
              </button>
              <button className="btn btn-secondary" onClick={() => toggleDeployment(detail)}>
                {detail.status === "Stopped" ? <Play20Regular /> : <Stop20Regular />}
                {detail.status === "Stopped" ? "Start" : "Stop"}
              </button>
              <Link href={`/playground?deployment=${encodeURIComponent(detail.name)}`} className="btn btn-secondary">
                <Play20Regular /> Test
              </Link>
              <button className="btn btn-primary" onClick={() => setCodeFor(detail)}>
                <Code20Regular /> Get code
              </button>
            </div>
          </aside>
        </>
      )}

      {codeFor && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setCodeFor(null); }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Deployment code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Use {codeFor.name}</h2>
                <p className="dialog-sub">
                  This endpoint is served by the local Foundry-compatible server.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeFor(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <pre className="code-block">{`from openai import OpenAI

client = OpenAI(
    base_url="${origin}/api/v1/deployments/${codeFor.name}",
    api_key="${codeFor.apiKey}",
)

response = client.chat.completions.create(
    model="${codeFor.modelId}",
    messages=[{"role": "user", "content": "Explain local inference in one sentence."}],
)
print(response.choices[0].message.content)`}</pre>
              <pre className="code-block">{`curl ${codeFor.endpoint}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "api-key: ${codeFor.apiKey}" \\
  -d '{"messages":[{"role":"user","content":"Hello"}],"stream":false}'`}</pre>
            </div>
            <div className="dialog-footer">
              <CopyButton
                value={`curl ${codeFor.endpoint}/chat/completions -H "Content-Type: application/json" -H "api-key: ${codeFor.apiKey}" -d '{"messages":[{"role":"user","content":"Hello"}],"stream":false}'`}
                label="Copy curl"
                className="btn btn-secondary"
              />
              <button className="btn btn-primary" onClick={() => setCodeFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDelete && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Delete deployment">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Delete {confirmDelete.name}?</h2>
                <p className="dialog-sub">
                  The deployment record is removed and the model is unloaded from
                  the local runtime. Files in the model cache stay on disk.
                </p>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => remove(confirmDelete)}>
                Delete deployment
              </button>
            </div>
          </div>
        </div>
      )}

      {nodesOpen && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setNodesOpen(false); }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Runtime nodes">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Runtime nodes</h2>
                <p className="dialog-sub">
                  Each node is a separate runtime endpoint. Regional and Data Zone
                  deployments are pinned to their own node so their traffic stays
                  isolated.
                </p>
              </div>
              <button className="icon-button" onClick={() => setNodesOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Node</th>
                      <th style={{ width: 90 }}>Provider</th>
                      <th style={{ width: 180 }}>Scope</th>
                      <th style={{ width: 110 }}>Status</th>
                      <th>Endpoint</th>
                      <th style={{ width: 80 }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {nodes.map((node) => (
                      <tr key={node.id}>
                        <td className="cell-strong">{node.name}</td>
                        <td>{node.provider}</td>
                        <td>
                          {node.zone === "Device"
                            ? "On device"
                            : `${node.region} · ${node.zone}`}
                        </td>
                        <td>
                          <StatusBadge status={node.status === "Online" ? "Running" : "Stopped"} />
                        </td>
                        <td className="mono text-12 truncate" style={{ maxWidth: 220 }}>
                          {node.baseUrl}
                        </td>
                        <td>
                          {node.managed && (
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={async () => {
                                await fetch(`/api/nodes?id=${encodeURIComponent(node.id)}`, {
                                  method: "DELETE",
                                });
                                toast(`Stopped ${node.name}`, "success");
                                refresh();
                              }}
                            >
                              Stop
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {nodes.length === 0 && (
                      <tr>
                        <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 36 }}>
                          No runtime nodes detected.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setNodesOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {ptuOpen && <PtuCalculator close={() => setPtuOpen(false)} />}

      {batchOpen && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setBatchOpen(false); }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="New batch job">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New batch job</h2>
                <p className="dialog-sub">One prompt per line, up to 100 lines.</p>
              </div>
              <button className="icon-button" onClick={() => setBatchOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Job name</span>
                <input className="input" value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="faq-sweep" />
              </label>
              <label className="field">
                <span className="field-label">Deployment</span>
                <select className="select" value={batchDeployment} onChange={(e) => setBatchDeployment(e.target.value)}>
                  {deployments.map((deployment) => (
                    <option key={deployment.id} value={deployment.id}>
                      {deployment.name} · {deployment.modelName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Prompts</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  value={batchPrompts}
                  onChange={(e) => setBatchPrompts(e.target.value)}
                  placeholder={"Summarize our return policy.\nWrite a welcome message.\nList the top three camping essentials."}
                />
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setBatchOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={batchBusy || !batchName.trim() || !batchPrompts.trim()} onClick={createBatch}>
                {batchBusy ? <Spinner /> : <Play20Regular />} Start job
              </button>
            </div>
          </div>
        </div>
      )}

      {jobDetail && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setJobDetail(null); }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Batch results">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">{jobDetail.name}</h2>
                <p className="dialog-sub">
                  {jobDetail.results.length} of {jobDetail.prompts.length} prompts ·{" "}
                  {jobDetail.deploymentName}
                </p>
              </div>
              <button className="icon-button" onClick={() => setJobDetail(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              {jobDetail.results.map((result, index) => (
                <div className="panel" style={{ padding: 12 }} key={index}>
                  <div className="field-label">Prompt</div>
                  <div className="text-13 mb-8">{result.prompt}</div>
                  <div className="field-label">Response</div>
                  <div className="chunk-preview">{result.response}</div>
                  <div className="muted text-12 mt-4">
                    {result.promptTokens + result.completionTokens} tokens
                  </div>
                </div>
              ))}
              {jobDetail.results.length === 0 && (
                <div className="row" style={{ gap: 8 }}>
                  <Spinner /> Waiting for the first result…
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setJobDetail(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PtuCalculator({ close }: { close: () => void }) {
  const [requestsPerDay, setRequestsPerDay] = useState(1000);
  const [tokensPerRequest, setTokensPerRequest] = useState(600);
  const [tokensPerSecond, setTokensPerSecond] = useState(30);

  const totalTokens = requestsPerDay * tokensPerRequest;
  const peakLoad = tokensPerSecond * 3600;
  const localMinutes = totalTokens / Math.max(tokensPerSecond * 60, 1);
  const ptu = Math.max(1, Math.ceil(totalTokens / 180000));

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label="PTU calculator">
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">Capacity calculator</h2>
            <p className="dialog-sub">
              Estimate local throughput. No cloud quota is provisioned.
            </p>
          </div>
          <button className="icon-button" onClick={close} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          <label className="field">
            <span className="field-label">Requests per day</span>
            <input className="input" type="number" value={requestsPerDay} onChange={(e) => setRequestsPerDay(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">Tokens per request</span>
            <input className="input" type="number" value={tokensPerRequest} onChange={(e) => setTokensPerRequest(Number(e.target.value))} />
          </label>
          <label className="field">
            <span className="field-label">Measured local tokens/sec</span>
            <input className="input" type="number" value={tokensPerSecond} onChange={(e) => setTokensPerSecond(Number(e.target.value))} />
          </label>
          <div className="metric-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="metric-card">
              <span className="metric-label">Tokens / day</span>
              <span className="metric-value">{formatNumber(totalTokens)}</span>
              <span className="metric-note">{formatNumber(peakLoad)} tokens in one hour at peak speed</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Local compute time</span>
              <span className="metric-value">{Math.ceil(localMinutes)} min</span>
              <span className="metric-note">Sequential generation on this Mac</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Equivalent PTU</span>
              <span className="metric-value">{ptu}</span>
              <span className="metric-note">Rough cloud comparison only — nothing is billed</span>
            </div>
            <div className="metric-card">
              <span className="metric-label">Cloud cost here</span>
              <span className="metric-value">$0</span>
              <span className="metric-note">Electricity and your hardware only</span>
            </div>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-primary" onClick={close}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
