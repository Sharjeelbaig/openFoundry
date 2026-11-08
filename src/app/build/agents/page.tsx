// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
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
import type { Agent, LocalModel } from "@/lib/types";
import { useOrigin } from "@/components/Origin";
import AgentsHeader from "@/components/agents/AgentsHeader";

export default function AgentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [query, setQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [interactionFilter, setInteractionFilter] = useState("All");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [codeFor, setCodeFor] = useState<Agent | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newModel, setNewModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const { data, refresh } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: modelData } = useModels(30000);
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

  const PAGE_SIZE = 20;
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [query, typeFilter, interactionFilter]);

  useEffect(() => {
    setPage((value) => Math.min(value, pages));
  }, [pages]);

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

  const origin = useOrigin();

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <AgentsHeader />
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
        <Select
          className="select toolbar-select"
          value={typeFilter}
          onChange={(event) => setTypeFilter(event.target.value)}
          aria-label="Filter by Type"
        >
          <option value="All">Type</option>
          <option value="Prompt">Prompt</option>
        </Select>
        <Select
          className="select toolbar-select"
          value={interactionFilter}
          onChange={(event) => setInteractionFilter(event.target.value)}
          aria-label="Filter by Interaction type"
        >
          <option value="All">Interaction type</option>
          <option value="Text">Text</option>
          <option value="Voice">Voice</option>
        </Select>
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
            {shown.map((agent) => (
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
          {filtered.length
            ? `${(page - 1) * PAGE_SIZE + 1}-${
                (page - 1) * PAGE_SIZE + shown.length
              } of ${filtered.length}`
            : "0 of 0"}
        </span>
        <div className="pager">
          <button
            disabled={page <= 1}
            onClick={() => setPage((value) => Math.max(1, value - 1))}
          >
            ‹ Prev
          </button>
          <button
            disabled={page >= pages}
            onClick={() => setPage((value) => Math.min(pages, value + 1))}
          >
            Next ›
          </button>
        </div>
      </div>

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
              <Select
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
              </Select>
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
