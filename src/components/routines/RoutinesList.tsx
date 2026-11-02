"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { Spinner } from "@/components/ui";
import type { Agent, Routine } from "@/lib/types";
import { formatTrigger } from "@/lib/routines/schedule";
import RoutineDialog from "./RoutineDialog";

const PAGE_SIZE = 25;

export default function RoutinesList() {
  const router = useRouter();
  const { data, loading, error, refresh } = useApi<{ routines: Routine[] }>(
    "/api/routines",
    5000
  );
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [agentId, setAgentId] = useState("all");
  const [page, setPage] = useState(1);
  const [dialogOpen, setDialogOpen] = useState(false);

  const agents = agentData?.agents ?? [];
  const routines = useMemo(() => data?.routines ?? [], [data?.routines]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return routines.filter((routine) => {
      if (needle && !routine.name.toLowerCase().includes(needle)) return false;
      if (status === "active" && !routine.enabled) return false;
      if (status === "paused" && routine.enabled) return false;
      if (agentId !== "all" && routine.agentId !== agentId) return false;
      return true;
    });
  }, [routines, query, status, agentId]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pages);
  const shown = filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  const createButton = (
    <button className="btn btn-primary" onClick={() => setDialogOpen(true)}>
      <Add20Regular /> Create routine
    </button>
  );

  return (
    <>
      <div className="routine-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search routines"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <select
          className="select toolbar-select"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by status"
        >
          <option value="all">Status</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
        </select>
        <select
          className="select toolbar-select"
          value={agentId}
          onChange={(event) => {
            setAgentId(event.target.value);
            setPage(1);
          }}
          aria-label="Filter by agent"
        >
          <option value="all">Agent</option>
          {agents.map((agent) => (
            <option key={agent.id} value={agent.id}>
              {agent.name}
            </option>
          ))}
        </select>
        <span className="spacer" />
        {createButton}
      </div>

      {loading && routines.length === 0 ? (
        <div className="routine-empty">
          <Spinner large />
          <span className="muted">Loading routines…</span>
        </div>
      ) : error ? (
        <div className="banner error">{error}</div>
      ) : routines.length === 0 ? (
        <div className="routine-empty">
          <span className="routine-empty-icon">
            <ArrowClockwise20Regular />
          </span>
          <h2>Run your agents automatically</h2>
          <p>
            Routines run your agents on a schedule or when an event happens.
            Create one to get started.
          </p>
          {createButton}
        </div>
      ) : (
        <>
          <div className="table-card">
            <table className="data-table routine-table">
              <thead>
                <tr>
                  <th>Routine</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th>Agent</th>
                  <th>Trigger</th>
                  <th style={{ width: 190 }}>Last run</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((routine) => {
                  const agent = agents.find((item) => item.id === routine.agentId);
                  return (
                    <tr key={routine.id}>
                      <td>
                        <Link
                          className="agent-name"
                          href={`/build/agents/routines/${encodeURIComponent(
                            routine.id
                          )}`}
                        >
                          {routine.name}
                        </Link>
                      </td>
                      <td>
                        <span
                          className={`routine-status ${
                            routine.enabled ? "active" : "paused"
                          }`}
                        >
                          {routine.enabled ? "Active" : "Paused"}
                        </span>
                      </td>
                      <td>{agent?.name ?? routine.agentId}</td>
                      <td className="routine-trigger-cell">
                        {formatTrigger(routine.trigger)}
                      </td>
                      <td>
                        {routine.lastRunAt
                          ? new Date(routine.lastRunAt).toLocaleString()
                          : "--"}
                      </td>
                    </tr>
                  );
                })}
                {shown.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 40 }}>
                      No routines match those filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>
              {filtered.length
                ? `${(current - 1) * PAGE_SIZE + 1}-${
                    (current - 1) * PAGE_SIZE + shown.length
                  } of ${filtered.length}`
                : "0 of 0"}
            </span>
            <div className="pager">
              <button
                disabled={current <= 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                ‹ Prev
              </button>
              <button
                disabled={current >= pages}
                onClick={() => setPage((value) => Math.min(pages, value + 1))}
              >
                Next ›
              </button>
            </div>
          </div>
        </>
      )}

      <RoutineDialog
        open={dialogOpen}
        agents={agents}
        onClose={() => setDialogOpen(false)}
        onSaved={(routine) => {
          setDialogOpen(false);
          refresh();
          router.push(`/build/agents/routines/${encodeURIComponent(routine.id)}`);
        }}
      />
    </>
  );
}
