// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  Pause20Regular,
  Play20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent, Routine, RoutineRun } from "@/lib/types";
import { formatTrigger, nextRunForSchedule } from "@/lib/routines/schedule";
import RoutineDialog from "./RoutineDialog";

type Range = "day" | "7d" | "1m" | "custom";

function duration(ms?: number): string {
  if (ms === undefined) return "--";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function timeToStart(run: RoutineRun): string {
  if (!run.startedAt) return "--";
  const ms = new Date(run.startedAt).getTime() - new Date(run.queuedAt).getTime();
  return duration(Math.max(0, ms));
}

function stateClass(status: string): string {
  if (status === "completed") return "done";
  if (status === "failed") return "failed";
  if (status === "running") return "running";
  return "queued";
}

export default function RoutineDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<{
    routine: Routine;
    runs: RoutineRun[];
  }>(`/api/routines/${encodeURIComponent(id)}`, 3000);
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");

  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteName, setDeleteName] = useState("");
  const [busy, setBusy] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [range, setRange] = useState<Range>("day");
  const [since, setSince] = useState("");
  const [until, setUntil] = useState("");
  const [selectedRun, setSelectedRun] = useState<RoutineRun | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const routine = data?.routine;
  const runs = useMemo(() => data?.runs ?? [], [data?.runs]);
  const agent = agentData?.agents.find((item) => item.id === routine?.agentId);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const filteredRuns = useMemo(() => {
    const from =
      range === "day"
        ? now - 24 * 60 * 60 * 1000
        : range === "7d"
        ? now - 7 * 24 * 60 * 60 * 1000
        : range === "1m"
        ? now - 30 * 24 * 60 * 60 * 1000
        : since
        ? new Date(`${since}T00:00:00`).getTime()
        : 0;
    const to =
      range === "custom" && until
        ? new Date(`${until}T23:59:59`).getTime()
        : now;
    return runs.filter((run) => {
      if (statusFilter !== "all" && run.status !== statusFilter) return false;
      const at = new Date(run.queuedAt).getTime();
      return at >= from && at <= to;
    });
  }, [runs, range, since, until, statusFilter, now]);

  const togglePause = async () => {
    if (!routine) return;
    setBusy("toggle");
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(routine.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !routine.enabled }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not update the routine.");
      toast(routine.enabled ? "Routine paused" : "Routine resumed", "success");
      refresh();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Update failed.", "error");
    } finally {
      setBusy("");
      setMenuOpen(false);
    }
  };

  const testRun = async () => {
    if (!routine) return;
    setBusy("run");
    try {
      const res = await fetch(
        `/api/routines/${encodeURIComponent(routine.id)}/dispatch`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const json = (await res.json()) as { run?: RoutineRun; error?: string };
      if (!res.ok || !json.run)
        throw new Error(json.error || "Could not queue the run.");
      toast("Test run queued", "success");
      refresh();
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Run failed.", "error");
    } finally {
      setBusy("");
      setMenuOpen(false);
    }
  };

  const remove = async () => {
    if (!routine || deleteName !== routine.name) return;
    setBusy("delete");
    try {
      const res = await fetch(`/api/routines/${encodeURIComponent(routine.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not delete the routine.");
      toast(`${routine.name} deleted`, "success");
      router.push("/build/agents/routines");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Delete failed.", "error");
      setBusy("");
    }
  };

  if (loading && !routine) {
    return (
      <div className="routine-empty">
        <Spinner large />
        <span className="muted">Loading routine…</span>
      </div>
    );
  }

  if (error || !routine) {
    return (
      <div className="banner error">
        {error || "Routine not found."}{" "}
        <Link href="/build/agents/routines">Back to routines</Link>
      </div>
    );
  }

  const next =
    routine.enabled && routine.trigger.type === "schedule"
      ? nextRunForSchedule(routine.trigger.cron, routine.trigger.timeZone)
      : routine.enabled && routine.nextRunAt
      ? new Date(routine.nextRunAt)
      : null;

  return (
    <>
      <div className="routine-detail-head">
        <div className="row" style={{ gap: 12, minWidth: 0 }}>
          <Link
            href="/build/agents/routines"
            className="icon-button"
            aria-label="Back to routines"
          >
            <ArrowLeft20Regular />
          </Link>
          <h2 className="routine-detail-title">{routine.name}</h2>
          <span className={`routine-status ${routine.enabled ? "active" : "paused"}`}>
            {routine.enabled ? "Active" : "Paused"}
          </span>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button
            className="btn btn-secondary"
            onClick={() => void togglePause()}
            disabled={busy === "toggle"}
          >
            {busy === "toggle" ? <Spinner /> : <Pause20Regular />}
            {routine.enabled ? "Pause" : "Resume"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => void testRun()}
            disabled={busy === "run"}
          >
            {busy === "run" ? <Spinner /> : <Play20Regular />}
            Test run
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="icon-button"
              aria-label="More actions"
              onClick={() => setMenuOpen((value) => !value)}
            >
              <MoreHorizontal20Regular />
            </button>
            {menuOpen && (
              <div className="menu-popover" style={{ right: 0, left: "auto", top: 34 }}>
                <button className="menu-item" onClick={() => setEditOpen(true)}>
                  <Edit20Regular /> Edit
                </button>
                <button className="menu-item" onClick={() => setDeleteOpen(true)}>
                  <Delete20Regular /> Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="routine-summary-card">
        <div>
          <span>Agent</span>
          <strong>{agent?.name ?? routine.agentId}</strong>
        </div>
        <div>
          <span>Trigger</span>
          <strong>{formatTrigger(routine.trigger)}</strong>
          {routine.trigger.type === "schedule" && (
            <small>{routine.trigger.timeZone}</small>
          )}
          {routine.trigger.type === "github_issue" &&
            routine.trigger.lastPollError && (
              <small className="danger-text">{routine.trigger.lastPollError}</small>
            )}
        </div>
        <div className="routine-summary-prompt">
          <span>Prompt</span>
          <strong>{routine.prompt}</strong>
        </div>
        <button
          className="icon-button routine-summary-edit"
          aria-label="Edit routine"
          onClick={() => setEditOpen(true)}
        >
          <Edit20Regular />
        </button>
      </div>

      {next && (
        <p className="routine-next-run">
          Next run: {next.toLocaleString()}
        </p>
      )}

      <div className="routine-run-filters">
        <Select
          className="select toolbar-select"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value)}
          aria-label="Filter runs by state"
        >
          <option value="all">State: All states</option>
          <option value="queued">Queued</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </Select>
        <span className="spacer" />
        <div className="routine-range">
          {range === "custom" && (
            <>
              <input
                className="input"
                type="date"
                value={since}
                onChange={(event) => setSince(event.target.value)}
                aria-label="From date"
              />
              <input
                className="input"
                type="date"
                value={until}
                onChange={(event) => setUntil(event.target.value)}
                aria-label="To date"
              />
            </>
          )}
          {(
            [
              ["day", "Last day"],
              ["7d", "7D"],
              ["1m", "1M"],
              ["custom", "Custom"],
            ] as [Range, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              className={`routine-range-button${range === value ? " active" : ""}`}
              onClick={() => setRange(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="table-card">
        <table className="data-table routine-run-table">
          <thead>
            <tr>
              <th>Response</th>
              <th>Triggered</th>
              <th>Time to start</th>
              <th style={{ width: 140 }}>State</th>
            </tr>
          </thead>
          <tbody>
            {filteredRuns.map((run) => (
              <tr key={run.id} onClick={() => setSelectedRun(run)} tabIndex={0}>
                <td className="mono text-12">
                  {run.responseId?.slice(0, 22) || "--"}
                </td>
                <td>
                  {new Date(run.startedAt || run.queuedAt).toLocaleString()}
                </td>
                <td>{timeToStart(run)}</td>
                <td>
                  <span className={`routine-run-state ${stateClass(run.status)}`}>
                    {run.status[0].toUpperCase() + run.status.slice(1)}
                  </span>
                </td>
              </tr>
            ))}
            {filteredRuns.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 42 }}>
                  {runs.length === 0
                    ? "No runs yet. Use Test run to invoke this routine now."
                    : "No runs match those filters."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <RoutineDialog
        open={editOpen}
        agents={agentData?.agents ?? []}
        routine={routine}
        onClose={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          refresh();
        }}
      />

      {deleteOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Delete routine">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Delete {routine.name}?</h2>
                <p className="dialog-sub">
                  This permanently deletes the routine and its run history. Type
                  the routine name to confirm.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setDeleteOpen(false)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">
                  Enter the routine name to confirm <span className="required">*</span>
                </span>
                <input
                  className="input"
                  value={deleteName}
                  onChange={(event) => setDeleteName(event.target.value)}
                  autoFocus
                />
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                disabled={deleteName !== routine.name || busy === "delete"}
                onClick={() => void remove()}
              >
                {busy === "delete" ? <Spinner /> : <Delete20Regular />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedRun && (
        <RunDetail run={selectedRun} onClose={() => setSelectedRun(null)} />
      )}
    </>
  );
}

function RunDetail({ run, onClose }: { run: RoutineRun; onClose: () => void }) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog wide"
        role="dialog"
        aria-modal="true"
        aria-label="Routine run"
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">Run {run.id}</h2>
            <p className="dialog-sub">
              {run.source} · {new Date(run.queuedAt).toLocaleString()}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          <div className="routine-run-facts">
            <div>
              <span>State</span>
              <span className={`routine-run-state ${stateClass(run.status)}`}>
                {run.status}
              </span>
            </div>
            <div>
              <span>Duration</span>
              <span>{duration(run.durationMs)}</span>
            </div>
            <div>
              <span>Time to start</span>
              <span>{timeToStart(run)}</span>
            </div>
            <div>
              <span>Response ID</span>
              <span className="mono text-12">{run.responseId || "--"}</span>
            </div>
          </div>
          <div>
            <div className="field-label">Input</div>
            <pre className="code-block routine-run-pre">{run.input}</pre>
          </div>
          {run.output && (
            <div>
              <div className="field-label">Output</div>
              <pre className="code-block routine-run-pre">{run.output}</pre>
            </div>
          )}
          {run.error && <div className="banner error">{run.error}</div>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
