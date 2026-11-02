"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import YAML from "yaml";
import {
  Add20Regular,
  ArrowLeft20Regular,
  ChevronDown20Regular,
  Code20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Note20Regular,
  Play20Regular,
  Save20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type {
  Agent,
  Workflow,
  WorkflowEdge,
  WorkflowNode,
} from "@/lib/types";
import { NODE_PALETTE, defaultNodeData } from "@/lib/workflows/node-meta";
import WorkflowCanvas from "./WorkflowCanvas";
import NodeConfigPanel from "./NodeConfigPanel";
import WorkflowPreview from "./WorkflowPreview";
import {
  WorkflowEvaluationPanel,
  WorkflowMonitorPanel,
  WorkflowRunsPanel,
} from "./WorkflowRuns";

let localId = 0;

function newNodeId(): string {
  localId += 1;
  return `${localId.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

type Tab = "Build" | "Traces" | "Monitor" | "Evaluation";
type View = "Visualizer" | "YAML" | "Code";

export default function WorkflowDesigner({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, error } = useApi<{ workflow: Workflow }>(
    `/api/workflows/${encodeURIComponent(id)}`
  );
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");

  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [edges, setEdges] = useState<WorkflowEdge[]>([]);
  const [variables, setVariables] = useState<string[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("Build");
  const [view, setView] = useState<View>("Visualizer");
  const [hideNotes, setHideNotes] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [runStatuses, setRunStatuses] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [dirty, setDirty] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const hydrated = useRef(false);
  const revision = useRef(0);
  const paletteRef = useRef<HTMLDivElement | null>(null);
  const versionRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!data?.workflow || hydrated.current) return;
    hydrated.current = true;
    const loaded = data.workflow;
    setWorkflow(loaded);
    setName(loaded.name);
    setDescription(loaded.description);
    setNodes(loaded.nodes);
    setEdges(loaded.edges);
    setVariables(loaded.variables);
  }, [data]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!paletteRef.current?.contains(event.target as Node)) setPaletteOpen(false);
      if (!versionRef.current?.contains(event.target as Node)) setVersionOpen(false);
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const markDirty = () => {
    revision.current += 1;
    setDirty(true);
  };

  const selected = nodes.find((node) => node.id === selectedId) || null;
  const agents = agentData?.agents ?? [];

  const yamlText = useMemo(
    () =>
      YAML.stringify({
        name,
        description,
        variables,
        nodes,
        edges,
      }),
    [name, description, variables, nodes, edges]
  );

  const save = async (createVersion: boolean): Promise<boolean> => {
    const captured = revision.current;
    setSaving(createVersion ? "version" : "draft");
    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description,
          variables,
          nodes,
          edges,
          createVersion,
        }),
      });
      const json = (await res.json()) as { workflow?: Workflow; error?: string };
      if (!res.ok || !json.workflow)
        throw new Error(json.error || "Could not save the workflow.");
      setWorkflow(json.workflow);
      if (createVersion) {
        toast(`Saved version ${json.workflow.version}`, "success");
      }
      if (revision.current === captured) setDirty(false);
      return true;
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Save failed.", "error");
      return false;
    } finally {
      setSaving("");
    }
  };

  useEffect(() => {
    if (!dirty || !hydrated.current || !name.trim()) return;
    const timer = setTimeout(() => {
      void save(false);
    }, 1800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, description, nodes, edges, variables, dirty]);

  const addNode = (type: WorkflowNode["type"], text = "") => {
    const index = nodes.length;
    const node: WorkflowNode = {
      id: `${type}_${newNodeId()}`,
      type,
      position: {
        x: 220 + (index % 4) * 280,
        y: 160 + Math.floor(index / 4) * 170,
      },
      data: type === "note" ? { text } : defaultNodeData(type),
    };
    setNodes((current) => [...current, node]);
    setSelectedId(node.id);
    setPaletteOpen(false);
    markDirty();
  };

  const updateNode = (nodeId: string, data: Record<string, unknown>) => {
    setNodes((current) =>
      current.map((node) => (node.id === nodeId ? { ...node, data } : node))
    );
    markDirty();
  };

  const removeNodes = (ids: string[]) => {
    const safe = ids.filter((nodeId) => nodeId !== "start");
    if (!safe.length) return;
    setNodes((current) => current.filter((node) => !safe.includes(node.id)));
    setEdges((current) =>
      current.filter(
        (edge) => !safe.includes(edge.source) && !safe.includes(edge.target)
      )
    );
    if (selectedId && safe.includes(selectedId)) setSelectedId(null);
    markDirty();
  };

  const removeBranch = (handle: string) => {
    if (!selected) return;
    setEdges((current) =>
      current.filter(
        (edge) => !(edge.source === selected.id && edge.sourceHandle === handle)
      )
    );
    if (handle.startsWith("if:")) {
      const conditionId = handle.slice(3);
      updateNode(selected.id, {
        ...selected.data,
        conditions: (
          (selected.data.conditions as { id: string }[]) || []
        ).filter((condition) => condition.id !== conditionId),
      });
    } else {
      markDirty();
    }
  };

  const connect = (connection: {
    source: string | null;
    target: string | null;
    sourceHandle?: string | null;
  }) => {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) return;
    if (
      edges.some(
        (edge) =>
          edge.source === connection.source &&
          edge.target === connection.target &&
          (edge.sourceHandle || null) === (connection.sourceHandle || null)
      )
    )
      return;
    setEdges((current) => [
      ...current,
      {
        id: `e_${newNodeId()}`,
        source: connection.source as string,
        target: connection.target as string,
        sourceHandle: connection.sourceHandle ?? null,
        targetHandle: null,
      },
    ]);
    markDirty();
  };

  const restoreVersion = (version: number) => {
    if (!workflow) return;
    const snapshot = workflow.versions.find((item) => item.version === version);
    if (!snapshot) return;
    setNodes(snapshot.nodes);
    setEdges(snapshot.edges);
    setVariables(snapshot.variables);
    setSelectedId(null);
    setVersionOpen(false);
    markDirty();
    toast(`Restored version ${version} as a draft. Save to publish it.`, "info");
  };

  const downloadYaml = () => {
    const blob = new Blob([yamlText], { type: "text/yaml" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name || "workflow"}.yaml`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const applyImport = () => {
    try {
      const parsed = YAML.parse(importText) as Partial<Workflow>;
      if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges))
        throw new Error("The YAML must contain nodes and edges arrays.");
      setNodes(parsed.nodes as WorkflowNode[]);
      setEdges(parsed.edges as WorkflowEdge[]);
      setVariables(Array.isArray(parsed.variables) ? parsed.variables : []);
      if (parsed.name) setName(String(parsed.name));
      if (parsed.description) setDescription(String(parsed.description));
      setImportOpen(false);
      setImportText("");
      markDirty();
      toast("YAML imported as a draft. Save to validate and publish.", "success");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Invalid YAML.", "error");
    }
  };

  const removeWorkflow = async () => {
    const res = await fetch(`/api/workflows/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not delete the workflow.", "error");
      return;
    }
    router.push("/build/agents/workflows");
  };

  if (loading && !workflow) {
    return (
      <div className="routine-empty">
        <Spinner large />
        <span className="muted">Loading workflow…</span>
      </div>
    );
  }
  if (error || !workflow) {
    return (
      <div className="banner error">
        {error || "Workflow not found."}{" "}
        <Link href="/build/agents/workflows">Back to workflows</Link>
      </div>
    );
  }

  return (
    <div className="workflow-designer">
      <div className="workflow-designer-head">
        <div className="workflow-title-row">
          <Link
            href="/build/agents/workflows"
            className="icon-button"
            aria-label="Back to workflows"
          >
            <ArrowLeft20Regular />
          </Link>
          <input
            className="workflow-name-input"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              markDirty();
            }}
            aria-label="Workflow name"
          />
          {dirty && <span className="workflow-unsaved">Unsaved</span>}
        </div>
        <div className="workflow-head-actions">
          <div ref={versionRef} style={{ position: "relative" }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setVersionOpen((value) => !value)}
              disabled={!workflow.versions.length}
            >
              Version {workflow.version || 0} <ChevronDown20Regular />
            </button>
            {versionOpen && (
              <div className="menu-popover workflow-version-menu">
                {workflow.versions.length === 0 && (
                  <div className="menu-item muted">No saved versions yet</div>
                )}
                {workflow.versions.map((item) => (
                  <button
                    key={item.version}
                    className="menu-item"
                    onClick={() => restoreVersion(item.version)}
                  >
                    Version {item.version} ·{" "}
                    {new Date(item.savedAt).toLocaleString()}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="btn btn-primary"
            onClick={() => void save(true)}
            disabled={saving === "version"}
          >
            {saving === "version" ? <Spinner /> : <Save20Regular />} Save
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              const ok = dirty ? await save(false) : true;
              if (ok) setPreviewOpen(true);
            }}
          >
            <Play20Regular /> Preview
          </button>
          <div ref={menuRef} style={{ position: "relative" }}>
            <button
              className="icon-button"
              onClick={() => setMenuOpen((value) => !value)}
              aria-label="Workflow actions"
            >
              <Settings20Regular />
            </button>
            {menuOpen && (
              <div className="menu-popover workflow-actions-menu">
                <button
                  className="menu-item"
                  onClick={() => {
                    setImportOpen(true);
                    setMenuOpen(false);
                  }}
                >
                  <Code20Regular /> Import YAML
                </button>
                <button
                  className="menu-item"
                  onClick={() => {
                    downloadYaml();
                    setMenuOpen(false);
                  }}
                >
                  <Save20Regular /> Export YAML
                </button>
                <button
                  className="menu-item danger"
                  onClick={() => {
                    setMenuOpen(false);
                    if (window.confirm(`Delete ${name}?`)) void removeWorkflow();
                  }}
                >
                  <Delete20Regular /> Delete workflow
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tabbar workflow-tabs">
        {(["Build", "Traces", "Monitor", "Evaluation"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Build" && (
        <>
          <div className="workflow-toolbar designer-toolbar">
            <div ref={paletteRef} style={{ position: "relative" }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setPaletteOpen((value) => !value)}
              >
                <Add20Regular /> New node
              </button>
              {paletteOpen && (
                <div className="menu-popover workflow-palette">
                  {[
                    "Invoke",
                    "Data transformation",
                    "Flow",
                    "Basics",
                  ].map((group) => (
                    <div key={group} className="workflow-palette-group">
                      <div className="workflow-palette-heading">{group}</div>
                      {NODE_PALETTE.filter((item) => item.group === group).map(
                        (item) => (
                          <button
                            key={item.type}
                            className="workflow-palette-item"
                            onClick={() => addNode(item.type)}
                          >
                            <strong>{item.label}</strong>
                            <small>{item.description}</small>
                          </button>
                        )
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => addNode("note", "New note")}
            >
              <Note20Regular /> Add note
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setHideNotes((value) => !value)}
            >
              {hideNotes ? "Show notes" : "Hide notes"}
            </button>
            <span className="spacer" />
            <div className="workflow-view-toggle">
              {(["Visualizer", "YAML", "Code"] as View[]).map((item) => (
                <button
                  key={item}
                  className={view === item ? "active" : ""}
                  onClick={() => setView(item)}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {view === "Visualizer" ? (
            <div className={`workflow-stage${previewOpen ? " with-preview" : ""}`}>
              <div className="workflow-stage-canvas">
                <WorkflowCanvas
                  nodes={nodes}
                  edges={edges}
                  selectedId={selectedId}
                  runStatuses={runStatuses}
                  hideNotes={hideNotes}
                  onSelect={setSelectedId}
                  onNodesChange={(next) => {
                    setNodes(next);
                    markDirty();
                  }}
                  onEdgesChange={(next) => {
                    setEdges(next);
                    markDirty();
                  }}
                  onConnect={connect}
                  onDeleteNodes={removeNodes}
                />
              </div>
              {selected && (
                <NodeConfigPanel
                  node={selected}
                  nodes={nodes}
                  agents={agents}
                  onChange={(data) => updateNode(selected.id, data)}
                  onDelete={() => removeNodes([selected.id])}
                  onClose={() => setSelectedId(null)}
                  onRemoveBranch={removeBranch}
                />
              )}
              {previewOpen && (
                <WorkflowPreview
                  workflowId={id}
                  version={workflow.version}
                  onClose={() => {
                    setPreviewOpen(false);
                    setRunStatuses({});
                  }}
                  onRun={(run) => {
                    if (!run) return setRunStatuses({});
                    const statuses: Record<string, string> = {};
                    for (const nodeRun of run.nodeRuns)
                      statuses[nodeRun.nodeId] = nodeRun.status;
                    setRunStatuses(statuses);
                  }}
                />
              )}
            </div>
          ) : view === "YAML" ? (
            <div className="workflow-code-view">
              <div className="workflow-code-head">
                <span>YAML definition</span>
                <div className="row" style={{ gap: 8 }}>
                  <button className="btn btn-secondary btn-sm" onClick={downloadYaml}>
                    Download
                  </button>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setImportOpen(true)}
                  >
                    Import
                  </button>
                </div>
              </div>
              <pre>{yamlText}</pre>
            </div>
          ) : (
            <div className="workflow-code-view">
              <div className="workflow-code-head">
                <span>Run endpoint</span>
              </div>
              <pre>{`POST /api/workflows/${id}/runs
Content-Type: application/json

{
  "input": "Start the workflow",
  "source": "manual"
}

// Definition
${JSON.stringify({ name, variables, nodes, edges }, null, 2)}`}</pre>
            </div>
          )}
        </>
      )}

      {tab === "Traces" && (
        <div className="workflow-tab-body">
          <WorkflowRunsPanel workflowId={id} />
        </div>
      )}
      {tab === "Monitor" && (
        <div className="workflow-tab-body">
          <WorkflowMonitorPanel workflowId={id} />
        </div>
      )}
      {tab === "Evaluation" && (
        <div className="workflow-tab-body">
          <WorkflowEvaluationPanel />
        </div>
      )}

      {importOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setImportOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Import YAML">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Import workflow YAML</h2>
                <p className="dialog-sub">
                  Paste a definition. Imported nodes are stored as a draft until
                  you save.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setImportOpen(false)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <textarea
                className="textarea mono"
                rows={18}
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder="name: my-workflow&#10;nodes: []&#10;edges: []"
              />
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setImportOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={applyImport}
                disabled={!importText.trim()}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
