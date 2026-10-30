"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  ChevronDown20Regular,
  Code20Regular,
  Copy20Regular,
  Delete20Regular,
  Dismiss20Regular,
  MoreHorizontal20Regular,
  PeopleTeam20Regular,
  Play20Regular,
  Search20Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, StatusBadge } from "@/components/ui";
import type { Agent, LocalModel, Routine, Workflow } from "@/lib/types";

type Tab = "Agents" | "Routines" | "Workflows";

export default function AgentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>("Agents");
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [interactionFilter, setInteractionFilter] = useState("All");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<Agent | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [busy, setBusy] = useState(false);

  const { data, refresh } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: modelData } = useModels(30000);
  const { data: routineData, refresh: refreshRoutines } = useApi<{
    routines: Routine[];
  }>("/api/routines", 5000);
  const { data: workflowData, refresh: refreshWorkflows } = useApi<{
    workflows: Workflow[];
  }>("/api/workflows", 5000);

  const agents = data?.agents ?? [];
  const models = modelData?.models ?? [];

  useEffect(() => {
    if (!newOpen || newModel || models.length === 0) return;
    const preferred =
      models.find((model) => model.loaded) ||
      models.find((model) => model.cached) ||
      models[0];
    if (preferred) setNewModel(preferred.key);
  }, [newOpen, newModel, models]);
  const routines = routineData?.routines ?? [];
  const workflows = workflowData?.workflows ?? [];

  const filtered = useMemo(() => {
    return agents.filter((agent) => {
      if (query && !agent.name.toLowerCase().includes(query.toLowerCase()))
        return false;
      if (typeFilter !== "All" && typeFilter !== "Prompt") return false;
      if (
        interactionFilter !== "All" &&
        interactionFilter !== (agent.voiceMode ? "Voice" : "Text")
      )
        return false;
      return true;
    });
  }, [agents, query, typeFilter, interactionFilter]);

  const createAgent = async () => {
    if (!newName.trim()) return;
    setBusy(true);
    try {
      const model = models.find((item) => item.key === newModel) || models[0];
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName,
          model: model?.id,
          provider: model?.provider,
        }),
      });
      const json = (await res.json()) as { agent?: Agent; error?: string };
      if (!res.ok || !json.agent) throw new Error(json.error || "Create failed");
      toast(`Created agent ${json.agent.name}`, "success");
      router.push(`/build/agents/${encodeURIComponent(json.agent.id)}/build`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const patch = async (agent: Agent, body: Record<string, unknown>) => {
    setMenuFor(null);
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      toast("Could not update the agent", "error");
      return;
    }
    toast(`${agent.name} updated`, "success");
    refresh();
  };

  const remove = async (agent: Agent) => {
    setMenuFor(null);
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Could not delete the agent", "error");
      return;
    }
    toast(`${agent.name} deleted`, "success");
    refresh();
  };

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Agents</h1>
      </div>

      <div className="tabbar mt-8">
        {(
          [
            ["Agents", null],
            ["Routines", null],
            ["Workflows", "Preview"],
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

      {tab === "Agents" && (
        <>
          <div className="agents-toolbar">
            <div className="search-input">
              <Search20Regular />
              <input
                className="input"
                placeholder="Search agents"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              className="select toolbar-select"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              aria-label="Filter by Type"
            >
              <option value="All">Type</option>
              <option value="Prompt">Prompt</option>
            </select>
            <select
              className="select toolbar-select"
              value={interactionFilter}
              onChange={(event) => setInteractionFilter(event.target.value)}
              aria-label="Filter by Interaction type"
            >
              <option value="All">Interaction type</option>
              <option value="Text">Text</option>
              <option value="Voice">Voice</option>
            </select>
            <span className="spacer" />
            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
              New agent <ChevronDown20Regular />
            </button>
          </div>

          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 70 }}>Actions</th>
                  <th style={{ width: 80 }}>Version</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 100 }}>Type</th>
                  <th style={{ width: 140 }}>Interaction type</th>
                  <th style={{ width: 190 }}>Endpoint and samples</th>
                  <th style={{ width: 190 }}>Last updated</th>
                  <th style={{ width: 110 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <Link
                        href={`/build/agents/${encodeURIComponent(agent.id)}/build`}
                        className="agent-name"
                      >
                        {agent.name}
                      </Link>
                    </td>
                    <td>
                      <div style={{ position: "relative" }}>
                        <button
                          className="icon-button small"
                          aria-label={`Actions for ${agent.name}`}
                          onClick={() =>
                            setMenuFor(menuFor === agent.id ? null : agent.id)
                          }
                        >
                          <MoreHorizontal20Regular />
                        </button>
                        {menuFor === agent.id && (
                          <div
                            className="menu-popover"
                            style={{ top: 26, left: 0, minWidth: 180 }}
                          >
                            <Link
                              className="menu-item"
                              href={`/build/agents/${encodeURIComponent(agent.id)}/build`}
                            >
                              <Code20Regular /> Open agent
                            </Link>
                            <button className="menu-item" onClick={() => setCodeFor(agent)}>
                              <Code20Regular /> Get code
                            </button>
                            <button
                              className="menu-item"
                              onClick={() =>
                                patch(agent, {
                                  action:
                                    agent.status === "Running" ? "stop" : "publish",
                                })
                              }
                            >
                              {agent.status === "Running" ? (
                                <>
                                  <Stop20Regular /> Stop
                                </>
                              ) : (
                                <>
                                  <Play20Regular /> Start
                                </>
                              )}
                            </button>
                            <div className="divider" style={{ margin: "4px 0" }} />
                            <button className="menu-item" onClick={() => remove(agent)}>
                              <Delete20Regular /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="version-pill">{agent.version}</span>
                    </td>
                    <td>
                      <StatusBadge status={agent.status} />
                    </td>
                    <td>Prompt</td>
                    <td>{agent.voiceMode ? "Voice" : "Text"}</td>
                    <td>
                      <button className="btn btn-sm btn-outline" onClick={() => setCodeFor(agent)}>
                        <Code20Regular /> Get code
                      </button>
                    </td>
                    <td>{formatDate(agent.updatedAt)}</td>
                    <td className="muted">{agent.description || "--"}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: 44 }}>
                      {agents.length === 0 ? (
                        <div className="stack" style={{ alignItems: "center", gap: 8 }}>
                          <PeopleTeam20Regular style={{ width: 28, height: 28 }} />
                          <strong className="text-14">No agents in this project</strong>
                          <p className="muted text-13" style={{ maxWidth: 460 }}>
                            Create an agent on a local model, or start from a template in
                            Discover. Agents only exist after you create them.
                          </p>
                          <div className="row mt-8" style={{ gap: 8 }}>
                            <button className="btn btn-primary" onClick={() => setNewOpen(true)}>
                              <Add20Regular /> New agent
                            </button>
                            <Link href="/discover/agents" className="btn btn-secondary">
                              Browse templates
                            </Link>
                          </div>
                        </div>
                      ) : (
                        <span className="muted">No agents match those filters.</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              {filtered.length ? `1-${filtered.length} of ${filtered.length}` : "0 of 0"}
            </span>
            <div className="pager">
              <button disabled>‹ Prev</button>
              <button disabled>Next ›</button>
            </div>
          </div>
        </>
      )}

      {tab === "Routines" && (
        <RoutinesPanel
          agents={agents}
          routines={routines}
          onChange={refreshRoutines}
        />
      )}

      {tab === "Workflows" && (
        <WorkflowsPanel
          agents={agents}
          workflows={workflows}
          onChange={refreshWorkflows}
        />
      )}

      {newOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setNewOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="New agent">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New agent</h2>
                <p className="dialog-sub">
                  Give the agent a name and a local model. You can refine
                  instructions, tools and knowledge in the builder.
                </p>
              </div>
              <button className="icon-button" onClick={() => setNewOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">
                  Agent name <span className="required">*</span>
                </span>
                <input
                  className="input"
                  placeholder="my-local-agent"
                  value={newName}
                  autoFocus
                  onChange={(event) => setNewName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void createAgent();
                  }}
                />
                <span className="field-hint">
                  Lowercase letters, numbers and dashes. This becomes the agent id.
                </span>
              </label>
              <label className="field">
                <span className="field-label">Model</span>
                <select
                  className="select"
                  value={newModel}
                  onChange={(event) => setNewModel(event.target.value)}
                >
                  {models.length === 0 && <option value="">No local models discovered</option>}
                  {models.slice(0, 40).map((model: LocalModel) => (
                    <option key={model.key} value={model.key}>
                      {model.displayName} · {model.providerLabel}
                      {model.cached ? " · downloaded" : ""}
                    </option>
                  ))}
                </select>
                <span className="field-hint">
                  {models.length} models discovered from Foundry Local, Ollama and
                  your Hugging Face cache.
                </span>
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setNewOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!newName.trim() || !newModel || busy}
                onClick={createAgent}
              >
                {busy ? "Creating…" : "Create and open"}
              </button>
            </div>
          </div>
        </div>
      )}

      {codeFor && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeFor(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Agent code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Get code — {codeFor.name}</h2>
                <p className="dialog-sub">
                  Version {codeFor.version} · {codeFor.model} · runs locally through{" "}
                  {codeFor.provider === "foundry"
                    ? "Foundry Local"
                    : codeFor.provider === "ollama"
                    ? "Ollama"
                    : codeFor.provider === "lmstudio"
                    ? "LM Studio"
                    : "llama.cpp"}.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeFor(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent endpoint</span>
                <span className="input-with-button">
                  <input
                    className="input mono"
                    readOnly
                    value={`${origin}/api/v1/agents/${codeFor.id}/chat/completions`}
                  />
                  <button
                    className="btn btn-secondary btn-icon-only"
                    aria-label="Copy endpoint"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${origin}/api/v1/agents/${codeFor.id}/chat/completions`
                      );
                      toast("Endpoint copied", "success");
                    }}
                  >
                    <Copy20Regular />
                  </button>
                </span>
              </label>
              <div>
                <div className="field-label mb-8">Python</div>
                <pre className="code-block">{`from openai import OpenAI

client = OpenAI(
    base_url="${origin}/api/v1/agents/${codeFor.id}",
    api_key="${codeFor.apiKey}",
)

response = client.chat.completions.create(
    model="${codeFor.model}",
    messages=[
        {"role": "user", "content": "Hello!"}
    ],
)
print(response.choices[0].message.content)`}</pre>
              </div>
              <div>
                <div className="field-label mb-8">Raw local endpoint</div>
                <pre className="code-block">{`POST ${origin}/api/v1/agents/${codeFor.id}/chat/completions
Content-Type: application/json
api-key: ${codeFor.apiKey}

{"messages":[{"role":"user","content":"Hello!"}]}`}</pre>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCodeFor(null)}>
                Close
              </button>
              <Link
                href={`/build/agents/${encodeURIComponent(codeFor.id)}/build`}
                className="btn btn-primary"
              >
                Open in builder
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function RoutinesPanel({
  agents,
  routines,
  onChange,
}: {
  agents: Agent[];
  routines: Routine[];
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState(agents[0]?.id || "");
  const [prompt, setPrompt] = useState("");
  const [minutes, setMinutes] = useState(60);
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim() || !prompt.trim() || !agentId) return;
    setBusy(true);
    try {
      const res = await fetch("/api/routines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          agentId,
          prompt,
          intervalMinutes: minutes,
        }),
      });
      if (!res.ok) throw new Error("Could not create routine");
      toast("Routine created", "success");
      setOpen(false);
      setName("");
      setPrompt("");
      onChange();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const act = async (id: string, action: "run" | "toggle" | "delete") => {
    const res = await fetch("/api/routines", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) {
      toast("Routine action failed", "error");
      return;
    }
    if (action === "run") toast("Routine ran on the local model", "success");
    onChange();
  };

  return (
    <>
      <div className="agents-toolbar">
        <p className="muted" style={{ maxWidth: 620 }}>
          Routines run an agent on a schedule using the local model runtime. Each
          run is recorded in Traces.
        </p>
        <span className="spacer" />
        <button
          className="btn btn-primary"
          onClick={() => {
            setAgentId(agents[0]?.id || "");
            setOpen(true);
          }}
          disabled={agents.length === 0}
        >
          New routine
        </button>
      </div>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Agent</th>
              <th>Schedule</th>
              <th>Enabled</th>
              <th>Last run</th>
              <th>Next run</th>
              <th style={{ width: 220 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {routines.map((routine) => (
              <tr key={routine.id}>
                <td className="cell-strong">{routine.name}</td>
                <td>{routine.agentId}</td>
                <td>Every {routine.intervalMinutes} min</td>
                <td>{routine.enabled ? "Yes" : "No"}</td>
                <td>{routine.lastRunAt ? formatDate(routine.lastRunAt) : "--"}</td>
                <td>{routine.enabled ? formatDate(routine.nextRunAt) : "--"}</td>
                <td>
                  <div className="inline-actions">
                    <button className="btn btn-sm btn-outline" onClick={() => act(routine.id, "run")}>
                      <Play20Regular /> Run now
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => act(routine.id, "toggle")}>
                      <ArrowClockwise20Regular /> {routine.enabled ? "Pause" : "Resume"}
                    </button>
                    <button className="btn btn-sm btn-ghost" onClick={() => act(routine.id, "delete")}>
                      <Delete20Regular />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {routines.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 36 }}>
                  No routines yet. Schedule an agent to run prompts automatically on
                  this computer.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {open && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="New routine">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New routine</h2>
                <p className="dialog-sub">A scheduled prompt that runs on a local agent.</p>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="daily-inventory-check" />
              </label>
              <label className="field">
                <span className="field-label">Agent</span>
                <select className="select" value={agentId} onChange={(e) => setAgentId(e.target.value)}>
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Prompt</span>
                <textarea
                  className="textarea"
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Summarize low-stock items and suggest reorder quantities."
                />
              </label>
              <label className="field">
                <span className="field-label">Interval (minutes)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                />
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || !name.trim() || !prompt.trim()} onClick={create}>
                Create routine
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function WorkflowsPanel({
  agents,
  workflows,
  onChange,
}: {
  agents: Agent[];
  workflows: Workflow[];
  onChange: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<{ agentId: string; prompt: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Workflow | null>(null);

  const start = () => {
    setName("");
    setSteps([{ agentId: agents[0]?.id || "", prompt: "" }]);
    setOpen(true);
  };

  const create = async () => {
    if (!name.trim() || steps.every((step) => !step.prompt.trim())) return;
    setBusy(true);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", name, steps }),
      });
      if (!res.ok) throw new Error("Could not create workflow");
      toast("Workflow created", "success");
      setOpen(false);
      onChange();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const run = async (id: string) => {
    const res = await fetch("/api/workflows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "run" }),
    });
    const json = (await res.json()) as { workflow?: Workflow; error?: string };
    if (!res.ok || !json.workflow) {
      toast(json.error || "Workflow run failed", "error");
      return;
    }
    setResult(json.workflow);
    toast("Workflow finished", "success");
    onChange();
  };

  const remove = async (id: string) => {
    await fetch("/api/workflows", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "delete" }),
    });
    onChange();
  };

  return (
    <>
      <div className="agents-toolbar">
        <p className="muted" style={{ maxWidth: 640 }}>
          Workflows chain prompts across agents. Each step runs sequentially on the
          local runtime with the previous step&apos;s answer as context.
        </p>
        <span className="spacer" />
        <button className="btn btn-primary" onClick={start} disabled={agents.length === 0}>
          New workflow
        </button>
      </div>
      <div className="kb-grid">
        {workflows.map((workflow) => (
          <div className="kb-card" key={workflow.id}>
            <div className="row between">
              <span className="kb-name">{workflow.name}</span>
              <span className="badge gray">{workflow.steps.length} steps</span>
            </div>
            <p className="kb-desc">{workflow.description || "Agent chain"}</p>
            <div className="stack" style={{ gap: 4 }}>
              {workflow.steps.map((step, index) => (
                <span className="text-12 muted" key={index}>
                  {index + 1}. {step.agentId} — {step.prompt.slice(0, 60)}
                </span>
              ))}
            </div>
            <div className="row between mt-8">
              <span className="text-12 muted">
                {workflow.lastRunAt ? `Ran ${formatDate(workflow.lastRunAt)}` : "Never run"}
              </span>
              <div className="inline-actions">
                <button className="btn btn-sm btn-primary" onClick={() => run(workflow.id)}>
                  <Play20Regular /> Run
                </button>
                <button className="btn btn-sm btn-ghost" onClick={() => remove(workflow.id)}>
                  <Delete20Regular />
                </button>
              </div>
            </div>
          </div>
        ))}
        {workflows.length === 0 && (
          <div className="operate-card muted" style={{ gridColumn: "1 / -1", padding: 36, textAlign: "center" }}>
            No workflows yet. Create one to chain agents together.
          </div>
        )}
      </div>

      {open && (
        <div className="dialog-backdrop">
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="New workflow">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New workflow</h2>
                <p className="dialog-sub">Chain up to five agent steps.</p>
              </div>
              <button className="icon-button" onClick={() => setOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Workflow name</span>
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="research-to-brief" />
              </label>
              {steps.map((step, index) => (
                <div className="panel" style={{ padding: 12 }} key={index}>
                  <div className="row between mb-8">
                    <strong className="text-13">Step {index + 1}</strong>
                    {steps.length > 1 && (
                      <button
                        className="icon-button small"
                        onClick={() => setSteps(steps.filter((_, i) => i !== index))}
                        aria-label="Remove step"
                      >
                        <Dismiss20Regular />
                      </button>
                    )}
                  </div>
                  <div className="form-grid">
                    <label className="field">
                      <span className="field-label">Agent</span>
                      <select
                        className="select"
                        value={step.agentId}
                        onChange={(e) =>
                          setSteps(
                            steps.map((item, i) =>
                              i === index ? { ...item, agentId: e.target.value } : item
                            )
                          )
                        }
                      >
                        {agents.map((agent) => (
                          <option key={agent.id} value={agent.id}>
                            {agent.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span className="field-label">Prompt</span>
                      <input
                        className="input"
                        value={step.prompt}
                        placeholder="Use the previous answer to…"
                        onChange={(e) =>
                          setSteps(
                            steps.map((item, i) =>
                              i === index ? { ...item, prompt: e.target.value } : item
                            )
                          )
                        }
                      />
                    </label>
                  </div>
                </div>
              ))}
              <button
                className="btn btn-secondary"
                disabled={steps.length >= 5}
                onClick={() => setSteps([...steps, { agentId: agents[0]?.id || "", prompt: "" }])}
              >
                <Add20Regular /> Add step
              </button>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={create}>
                Create workflow
              </button>
            </div>
          </div>
        </div>
      )}

      {result?.runs?.[0] && (
        <div className="dialog-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setResult(null); }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Workflow result">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">{result.name} — run output</h2>
                <p className="dialog-sub">Generated locally by Foundry Local / Ollama.</p>
              </div>
              <button className="icon-button" onClick={() => setResult(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              {result.runs[0].output.map((output, index) => (
                <div key={index}>
                  <div className="field-label mb-8">Step {index + 1}</div>
                  <pre className="code-block" style={{ whiteSpace: "pre-wrap" }}>{output}</pre>
                </div>
              ))}
            </div>
            <div className="dialog-footer">
              <CopyButton value={result.runs[0].output.join("\n\n")} label="Copy output" className="btn btn-secondary" />
              <button className="btn btn-primary" onClick={() => setResult(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
