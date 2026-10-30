"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Brain20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Info20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { Agent } from "@/lib/types";

interface MemoryEntry {
  agentId: string;
  turns: number;
  characters: number;
  savedAt?: string;
}

export default function MemoryPage() {
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<{ agents: Agent[] }>("/api/agents");
  const agents = data?.agents ?? [];

  const [query, setQuery] = useState("");
  const [entries, setEntries] = useState<Record<string, MemoryEntry>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [clearFor, setClearFor] = useState<Agent | null>(null);

  const scan = () => {
    const found: Record<string, MemoryEntry> = {};
    if (typeof window === "undefined") return;
    for (const agent of agents) {
      try {
        const raw = localStorage.getItem(`foundry-local:memory:${agent.id}`);
        if (!raw) continue;
        const turns = JSON.parse(raw) as { role: string; content: string }[];
        found[agent.id] = {
          agentId: agent.id,
          turns: Array.isArray(turns) ? turns.length : 0,
          characters: Array.isArray(turns)
            ? turns.reduce((sum, turn) => sum + (turn.content?.length || 0), 0)
            : 0,
          savedAt: localStorage.getItem(`foundry-local:memory-at:${agent.id}`) || undefined,
        };
      } catch {
        // corrupted entry — treat as empty
      }
    }
    setEntries(found);
  };

  useEffect(() => {
    scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents.length]);

  const toggle = async (agent: Agent) => {
    setBusy(agent.id);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ memoryEnabled: !agent.memoryEnabled }),
      });
      if (!res.ok) throw new Error("Could not update memory");
      toast(
        `${agent.name} memory ${agent.memoryEnabled ? "disabled" : "enabled"}`,
        "success"
      );
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const clear = (agent: Agent) => {
    try {
      localStorage.removeItem(`foundry-local:memory:${agent.id}`);
      localStorage.removeItem(`foundry-local:memory-at:${agent.id}`);
    } catch {
      // ignore
    }
    toast(`Cleared the conversation memory for ${agent.name}`, "success");
    setClearFor(null);
    scan();
  };

  const filtered = agents.filter(
    (agent) =>
      !query ||
      agent.name.toLowerCase().includes(query.toLowerCase()) ||
      agent.model.toLowerCase().includes(query.toLowerCase())
  );
  const enabled = agents.filter((agent) => agent.memoryEnabled);
  const storedTurns = Object.values(entries).reduce((sum, entry) => sum + entry.turns, 0);
  const storedCharacters = Object.values(entries).reduce(
    (sum, entry) => sum + entry.characters,
    0
  );

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Memory</h1>
          <p className="page-subtitle">
            Conversation memory for agents on this computer. Stored in the browser,
            never synchronized to a cloud service.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={scan}>
            <Brain20Regular /> Rescan
          </button>
        </div>
      </div>

      <div className="metric-grid mt-16">
        <div className="operate-card">
          <span className="metric-label">Agents with memory</span>
          <span className="metric-value">{enabled.length}</span>
          <span className="metric-note">of {agents.length} agents</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Stored turns</span>
          <span className="metric-value">{storedTurns}</span>
          <span className="metric-note">Up to 40 per agent</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Stored characters</span>
          <span className="metric-value">{storedCharacters.toLocaleString()}</span>
          <span className="metric-note">Browser localStorage</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Scope</span>
          <span className="metric-value" style={{ fontSize: 18 }}>
            Per browser
          </span>
          <span className="metric-note">Not shared between devices</span>
        </div>
      </div>

      <div className="banner info mb-16">
        <Info20Regular />
        <span>
          Memory replays the last conversation turns to the local model when a new
          message is sent. It is a convenience for iterative testing, not a durable
          vector memory. Clearing it removes the browser copy only; saved traces stay
          in <span className="mono">data/traces.json</span>.
        </span>
      </div>

      <div className="page-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search agents"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="spacer" />
        <span className="muted text-12">
          {filtered.length} agents · {storedTurns} stored turns
        </span>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th style={{ width: 160 }}>Status</th>
              <th style={{ width: 150 }}>Memory</th>
              <th style={{ width: 110 }}>Turns</th>
              <th style={{ width: 140 }}>Characters</th>
              <th style={{ width: 170 }}>Last updated</th>
              <th style={{ width: 190 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((agent) => {
              const entry = entries[agent.id];
              return (
                <tr key={agent.id}>
                  <td>
                    <Link
                      href={`/build/agents/${encodeURIComponent(agent.id)}/build`}
                      className="agent-name"
                    >
                      {agent.name}
                    </Link>
                    <div className="muted text-12 truncate" style={{ maxWidth: 320 }}>
                      {agent.model}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={agent.status} />
                  </td>
                  <td>
                    <span className={`badge ${agent.memoryEnabled ? "green" : "gray"}`}>
                      {agent.memoryEnabled ? "Enabled" : "Disabled"}
                    </span>
                  </td>
                  <td>{entry?.turns || 0}</td>
                  <td>{entry?.characters.toLocaleString() || 0}</td>
                  <td className="muted">{formatDate(agent.updatedAt)}</td>
                  <td>
                    <div className="inline-actions">
                      <button
                        className="btn btn-sm btn-outline"
                        disabled={busy === agent.id}
                        onClick={() => toggle(agent)}
                      >
                        {busy === agent.id ? (
                          <Spinner />
                        ) : agent.memoryEnabled ? (
                          "Disable"
                        ) : (
                          "Enable"
                        )}
                      </button>
                      <button
                        className="icon-button small"
                        aria-label={`Clear memory for ${agent.name}`}
                        disabled={!entry}
                        onClick={() => setClearFor(agent)}
                      >
                        <Delete20Regular />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 40 }}>
                  {loading ? "Loading agents…" : "No agents match that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span>{agents.length} agents</span>
        <span className="muted">Browser memory is cleared when site data is cleared</span>
      </div>

      {clearFor && (
        <div className="dialog-backdrop">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Clear memory">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Clear memory for {clearFor.name}?</h2>
                <p className="dialog-sub">
                  Removes the saved conversation turns from this browser. The agent
                  configuration and saved traces are not changed.
                </p>
              </div>
              <button className="icon-button" onClick={() => setClearFor(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setClearFor(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => clear(clearFor)}>
                Clear memory
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
