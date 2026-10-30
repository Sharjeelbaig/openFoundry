import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Add20Regular,
  Delete20Regular,
  Dismiss20Regular,
  MoreHorizontal20Regular,
  PeopleTeam20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { ModelLogo } from "../components/Logos";
import { Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { deleteAgent, saveAgent } from "../lib/api";
import { formatDate } from "../lib/format";
import { useProviders } from "../lib/useProviders";
import type { Agent } from "../lib/types";

type Tab = "Agents" | "Routines" | "Workflows";

export default function Agents() {
  const { data, refresh, updateSettings } = useApp();
  const { providers } = useProviders(data.settings);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Agents");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ name: "", instructions: "", selected: "" });

  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );
  const filtered = data.agents.filter(
    (agent) =>
      !query ||
      agent.name.toLowerCase().includes(query.toLowerCase()) ||
      agent.model.toLowerCase().includes(query.toLowerCase())
  );

  const openCreate = () => {
    const wantedProvider = params.get("provider");
    const wantedModel = params.get("model");
    const match = models.find(
      (model) => model.providerId === wantedProvider && model.id === wantedModel
    );
    const fallback =
      models.find(
        (model) =>
          model.providerId === data.settings.defaultProvider &&
          model.id === data.settings.defaultModel
      ) || models[0];
    const chosen = match || fallback;
    setForm({
      name: "",
      instructions:
        "You are a helpful AI assistant running locally. Answer clearly and accurately. If you do not know something, say so.",
      selected: chosen ? `${chosen.providerId}|${chosen.id}` : "",
    });
    setCreateOpen(true);
  };

  const create = async () => {
    const [providerId, ...rest] = form.selected.split("|");
    const modelId = rest.join("|");
    const model = models.find(
      (entry) => entry.providerId === providerId && entry.id === modelId
    );
    if (!form.name.trim() || !model) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const agent: Agent = {
        id: crypto.randomUUID(),
        name: form.name.trim(),
        instructions: form.instructions.trim(),
        model: model.id,
        providerId: model.providerId,
        providerLabel: model.providerLabel,
        createdAt: now,
        updatedAt: now,
      };
      const saved = await saveAgent(agent);
      updateSettings({ ...data, agents: [...data.agents, saved] });
      setCreateOpen(false);
      navigate(`/build/agents/${encodeURIComponent(saved.id)}`);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (agent: Agent) => {
    setMenuFor(null);
    await deleteAgent(agent.id);
    await refresh();
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">Build prompt agents on models from this computer.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={openCreate} disabled={models.length === 0}>
            <Add20Regular /> New agent
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        {(["Agents", "Routines", "Workflows"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
            {item !== "Agents" && <span className="badge gray">Soon</span>}
          </button>
        ))}
      </div>

      {tab !== "Agents" ? (
        <div className="empty" style={{ paddingTop: 54 }}>
          <PeopleTeam20Regular style={{ width: 30, height: 30 }} />
          <h2>{tab} are not available yet</h2>
          <p>
            This build focuses on agents, models and local chat. {tab} will arrive after
            the agent runtime is complete.
          </p>
        </div>
      ) : (
        <>
          <div className="page-toolbar mt-12">
            <div className="search-input">
              <Search20Regular />
              <input
                className="input"
                placeholder="Search agents"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <span className="grow" />
            <span className="muted text-12">{data.agents.length} agents</span>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 70 }}>Actions</th>
                  <th style={{ width: 90 }}>Version</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 140 }}>Interaction</th>
                  <th style={{ width: 240 }}>Model</th>
                  <th style={{ width: 190 }}>Last updated</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((agent) => (
                  <tr key={agent.id}>
                    <td>
                      <Link to={`/build/agents/${agent.id}`} className="agent-name">
                        {agent.name}
                      </Link>
                    </td>
                    <td>
                      <div style={{ position: "relative" }}>
                        <button
                          className="icon-button small"
                          aria-label={`Actions for ${agent.name}`}
                          onClick={() => setMenuFor(menuFor === agent.id ? null : agent.id)}
                        >
                          <MoreHorizontal20Regular />
                        </button>
                        {menuFor === agent.id && (
                          <div className="menu-popover" style={{ top: 26, left: 0, minWidth: 170 }}>
                            <Link className="menu-item" to={`/build/agents/${agent.id}`}>
                              Open agent
                            </Link>
                            <button className="menu-item" onClick={() => void remove(agent)}>
                              <Delete20Regular /> Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td><span className="version-pill">1</span></td>
                    <td><span className="status"><span className="status-dot" />Ready</span></td>
                    <td>Text</td>
                    <td className="truncate" style={{ maxWidth: 240 }}>
                      <span className="row" style={{ gap: 8 }}>
                        <ModelLogo publisher={agent.providerLabel} name={agent.model} size={18} />
                        <span className="truncate">{agent.model}</span>
                      </span>
                    </td>
                    <td>{formatDate(agent.updatedAt)}</td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: 48 }}>
                      <PeopleTeam20Regular style={{ width: 28, height: 28 }} />
                      <div className="mt-8"><strong>No agents in this workspace</strong></div>
                      <p className="muted text-13" style={{ margin: "6px 0 0" }}>
                        Create an agent on a model discovered from your local providers.
                      </p>
                      <button
                        className="btn btn-primary mt-12"
                        onClick={openCreate}
                        disabled={models.length === 0}
                      >
                        <Add20Regular /> New agent
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>{filtered.length} agents</span>
            <span className="muted">Stored in your local workspace</span>
          </div>
        </>
      )}

      {createOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCreateOpen(false);
        }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="New agent">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New agent</h2>
                <p className="dialog-sub">Create a prompt agent on a local model.</p>
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
                  placeholder="support-agent"
                  value={form.name}
                  onChange={(event) => setForm({ ...form, name: event.target.value })}
                />
              </label>
              <label className="field">
                <span className="field-label">Model</span>
                <select
                  className="select"
                  value={form.selected}
                  onChange={(event) => setForm({ ...form, selected: event.target.value })}
                >
                  {models.map((model) => (
                    <option key={`${model.providerId}/${model.id}`} value={`${model.providerId}|${model.id}`}>
                      {model.name} · {model.providerLabel}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span className="field-label">Instructions</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 160 }}
                  value={form.instructions}
                  onChange={(event) => setForm({ ...form, instructions: event.target.value })}
                />
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !form.name.trim() || !form.selected}
                onClick={create}
              >
                {busy ? <Spinner /> : <Add20Regular />} Create agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
