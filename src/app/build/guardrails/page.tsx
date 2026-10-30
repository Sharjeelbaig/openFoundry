"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Checkmark20Regular,
  Info20Regular,
  Search20Regular,
  Shield20Regular,
  ShieldDismiss20Regular,
  ShieldLock20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { Agent } from "@/lib/types";

type Mode = "Default" | "Strict" | "Off";

const MODES: {
  id: Mode;
  title: string;
  icon: React.ReactNode;
  summary: string;
  policy: string;
}[] = [
  {
    id: "Default",
    title: "Default",
    icon: <Shield20Regular />,
    summary:
      "Baseline safety instructions are injected into every request. Suitable for general assistants.",
    policy:
      "Safety guardrail: refuse requests that facilitate violence, self-harm, illegal activity or sexual content involving minors. Do not fabricate private personal data.",
  },
  {
    id: "Strict",
    title: "Strict",
    icon: <ShieldLock20Regular />,
    summary:
      "Adds a second instruction that forbids repeating or inferring personal identifiers.",
    policy:
      "Strict guardrail: never repeat, infer or generate personal identifiers such as full addresses, phone numbers, government ids or credentials. Ask the user to redact sensitive data instead.",
  },
  {
    id: "Off",
    title: "Off",
    icon: <ShieldDismiss20Regular />,
    summary:
      "No extra safety instruction is added. Use only for controlled experiments, never for shared agents.",
    policy: "No guardrail text is added to the system prompt.",
  },
];

export default function GuardrailsPage() {
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<{ agents: Agent[] }>("/api/agents");
  const agents = data?.agents ?? [];

  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [preview, setPreview] = useState<Mode | null>("Default");

  const counts = useMemo(() => {
    const map = new Map<Mode, number>();
    for (const agent of agents) {
      const mode = (agent.guardrail || "Default") as Mode;
      map.set(mode, (map.get(mode) || 0) + 1);
    }
    return map;
  }, [agents]);

  const setMode = async (agent: Agent, mode: Mode) => {
    setBusy(agent.id);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guardrail: mode }),
      });
      if (!res.ok) throw new Error("Could not update the guardrail");
      toast(`${agent.name} now uses the ${mode} guardrail`, "success");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const applyAll = async (mode: Mode) => {
    setBusy("all");
    try {
      await Promise.all(
        agents.map((agent) =>
          fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ guardrail: mode }),
          })
        )
      );
      toast(`Applied the ${mode} guardrail to ${agents.length} agents`, "success");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Bulk update failed", "error");
    } finally {
      setBusy(null);
    }
  };

  const filtered = agents.filter(
    (agent) =>
      !query ||
      agent.name.toLowerCase().includes(query.toLowerCase()) ||
      (agent.guardrail || "Default").toLowerCase().includes(query.toLowerCase())
  );

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Guardrails</h1>
          <p className="page-subtitle">
            Prompt-level safety controls applied to every agent request on this
            computer.
          </p>
        </div>
        <div className="page-header-actions">
          <select
            className="select"
            style={{ width: 220 }}
            defaultValue=""
            onChange={(event) => {
              if (event.target.value) void applyAll(event.target.value as Mode);
              event.target.value = "";
            }}
            disabled={agents.length === 0 || busy === "all"}
          >
            <option value="">Apply to all agents…</option>
            <option value="Default">Default</option>
            <option value="Strict">Strict</option>
            <option value="Off">Off</option>
          </select>
        </div>
      </div>

      <div className="guardrail-mode-grid mt-16">
        {MODES.map((mode) => (
          <button
            key={mode.id}
            className={`operate-card guardrail-mode${preview === mode.id ? " active" : ""}`}
            onClick={() => setPreview(mode.id)}
          >
            <div className="row between">
              <span className="row" style={{ gap: 8 }}>
                <span className="kb-icon">{mode.icon}</span>
                <strong>{mode.title}</strong>
              </span>
              <span className="badge gray">{counts.get(mode.id) || 0} agents</span>
            </div>
            <p className="text-12 muted" style={{ lineHeight: "18px", textAlign: "left" }}>
              {mode.summary}
            </p>
          </button>
        ))}
      </div>

      {preview && (
        <div className="operate-card mt-16">
          <div className="row between mb-8">
            <h3>{preview} policy text</h3>
            <span className="badge gray">Injected into the system prompt</span>
          </div>
          <div className="chunk-preview" style={{ whiteSpace: "pre-wrap" }}>
            {MODES.find((mode) => mode.id === preview)?.policy}
          </div>
          <p className="muted text-12 mt-8">
            This is the exact text in <span className="mono">src/app/api/chat/route.ts</span>.
            The model can still ignore instructions; guardrails are not a guarantee.
          </p>
        </div>
      )}

      <div className="banner info mt-16">
        <Info20Regular />
        <span>
          Guardrails here are prompt instructions, not a moderation classifier. For
          stronger evidence, run a red team scan in{" "}
          <Link href="/build/evaluations" className="link">
            Evaluations
          </Link>{" "}
          and review the transcripts.
        </span>
      </div>

      <div className="page-toolbar mt-16">
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
          {agents.length} agents · {counts.get("Off") || 0} without guardrails
        </span>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Agent</th>
              <th style={{ width: 150 }}>Status</th>
              <th style={{ width: 220 }}>Guardrail</th>
              <th style={{ width: 260 }}>Change</th>
              <th>Model</th>
              <th style={{ width: 100 }}>Open</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((agent) => {
              const current = (agent.guardrail || "Default") as Mode;
              return (
                <tr key={agent.id}>
                  <td className="cell-strong">{agent.name}</td>
                  <td>
                    <StatusBadge status={agent.status} />
                  </td>
                  <td>
                    <span className={`badge ${current === "Off" ? "gray" : "green"}`}>
                      {current === "Off" ? (
                        <ShieldDismiss20Regular />
                      ) : current === "Strict" ? (
                        <ShieldLock20Regular />
                      ) : (
                        <Shield20Regular />
                      )}
                      {current}
                    </span>
                  </td>
                  <td>
                    <div className="segmented">
                      {(["Default", "Strict", "Off"] as Mode[]).map((mode) => (
                        <button
                          key={mode}
                          className={current === mode ? "active" : ""}
                          disabled={busy === agent.id || current === mode}
                          onClick={() => setMode(agent, mode)}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                    {busy === agent.id && (
                      <span className="muted text-12">
                        <Spinner /> Saving…
                      </span>
                    )}
                  </td>
                  <td className="muted truncate" style={{ maxWidth: 280 }}>
                    {agent.model}
                  </td>
                  <td>
                    <Link
                      href={`/build/agents/${encodeURIComponent(agent.id)}/build`}
                      className="btn btn-sm btn-outline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 40 }}>
                  {loading ? "Loading agents…" : "No agents match that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span>
          <Checkmark20Regular /> {agents.length - (counts.get("Off") || 0)} guarded agents
        </span>
        <span className="muted">
          Changes are saved immediately to data/agents.json
        </span>
      </div>
    </div>
  );
}
