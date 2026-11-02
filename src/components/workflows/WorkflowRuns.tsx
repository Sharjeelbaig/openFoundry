"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { Spinner } from "@/components/ui";
import type { WorkflowRun } from "@/lib/types";

function duration(ms?: number): string {
  if (ms === undefined) return "--";
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

export function WorkflowRunsPanel({ workflowId }: { workflowId: string }) {
  const { data, loading } = useApi<{ runs: WorkflowRun[] }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
    5000
  );
  const [selected, setSelected] = useState<WorkflowRun | null>(null);
  const runs = data?.runs ?? [];

  if (loading && runs.length === 0)
    return (
      <div className="routine-empty">
        <Spinner large />
        <span className="muted">Loading runs…</span>
      </div>
    );

  return (
    <>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Run</th>
              <th>Status</th>
              <th>Source</th>
              <th>Started</th>
              <th>Duration</th>
              <th>Steps</th>
              <th>Tokens</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => (
              <tr
                key={run.id}
                onClick={() => setSelected(run)}
                style={{ cursor: "pointer" }}
              >
                <td className="mono text-12">{run.id}</td>
                <td>
                  <span className={`routine-run-state ${run.status}`}>
                    {run.status}
                  </span>
                </td>
                <td>{run.source}</td>
                <td>{new Date(run.startedAt || run.queuedAt).toLocaleString()}</td>
                <td>{duration(run.durationMs)}</td>
                <td>{run.stepCount}</td>
                <td>{run.promptTokens + run.completionTokens}</td>
              </tr>
            ))}
            {runs.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 44 }}>
                  No workflow runs yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <RunDetail run={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function RunDetail({ run, onClose }: { run: WorkflowRun; onClose: () => void }) {
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog xwide" role="dialog" aria-modal="true" aria-label="Workflow run">
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">Run {run.id}</h2>
            <p className="dialog-sub">
              {run.status} · {run.stepCount} steps ·{" "}
              {duration(run.durationMs)}
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          {run.error && <div className="banner error">{run.error}</div>}
          <div>
            <div className="field-label">Node timeline</div>
            <div className="workflow-timeline">
              {run.nodeRuns.map((node, index) => (
                <div className="workflow-timeline-row" key={`${node.nodeId}-${index}`}>
                  <span className={`workflow-node-run-dot run-${node.status}`} />
                  <span className="workflow-timeline-title">{node.title}</span>
                  <span className="muted text-12">{node.nodeId}</span>
                  <span>{duration(node.durationMs)}</span>
                  <span className={`routine-run-state ${node.status}`}>
                    {node.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="field-label">Variables</div>
            <pre className="code-block routine-run-pre">
              {JSON.stringify(run.variables, null, 2)}
            </pre>
          </div>
          <div>
            <div className="field-label">Messages</div>
            <div className="workflow-preview-messages">
              {run.messages.map((message, index) => (
                <div
                  className={`workflow-message ${message.role}`}
                  key={`${message.at}-${index}`}
                >
                  <span>{message.role === "user" ? "You" : "Workflow"}</span>
                  <div>{message.content}</div>
                </div>
              ))}
            </div>
          </div>
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

export function WorkflowMonitorPanel({ workflowId }: { workflowId: string }) {
  const { data } = useApi<{ runs: WorkflowRun[] }>(
    `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
    5000
  );
  const runs = useMemo(() => data?.runs ?? [], [data?.runs]);
  const metrics = useMemo(() => {
    const completed = runs.filter((run) => run.status === "completed").length;
    const failed = runs.filter((run) => run.status === "failed").length;
    const durations = runs
      .map((run) => run.durationMs)
      .filter((value): value is number => typeof value === "number");
    const tokens = runs.reduce(
      (sum, run) => sum + run.promptTokens + run.completionTokens,
      0
    );
    return {
      total: runs.length,
      completed,
      failed,
      successRate: runs.length ? Math.round((completed / runs.length) * 100) : 0,
      average: durations.length
        ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
        : 0,
      tokens,
    };
  }, [runs]);

  return (
    <div className="workflow-monitor">
      <div className="workflow-metric">
        <span>Runs</span>
        <strong>{metrics.total}</strong>
      </div>
      <div className="workflow-metric">
        <span>Success rate</span>
        <strong>{metrics.successRate}%</strong>
      </div>
      <div className="workflow-metric">
        <span>Average duration</span>
        <strong>{duration(metrics.average)}</strong>
      </div>
      <div className="workflow-metric">
        <span>Tokens</span>
        <strong>{metrics.tokens.toLocaleString()}</strong>
      </div>
      <div className="workflow-metric">
        <span>Failed</span>
        <strong>{metrics.failed}</strong>
      </div>
    </div>
  );
}

export function WorkflowEvaluationPanel() {
  return (
    <div className="routine-empty" style={{ minHeight: 300 }}>
      <h2>Evaluate this workflow</h2>
      <p>
        Workflow runs are stored with node-level outputs, so they can be used as
        evaluation inputs. openFoundry does not invent scores when no evaluator
        has run.
      </p>
      <Link href="/build/evaluations" className="btn btn-secondary">
        Open evaluations
      </Link>
    </div>
  );
}
