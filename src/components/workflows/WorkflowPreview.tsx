"use client";

import { useMemo, useState } from "react";
import {
  ArrowClockwise20Regular,
  Dismiss20Regular,
  Play20Regular,
  Send20Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { WorkflowRun } from "@/lib/types";

function statusLabel(status: string): string {
  if (status === "waiting") return "Waiting for you";
  if (status === "running") return "Running";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  if (status === "cancelled") return "Cancelled";
  return status;
}

export default function WorkflowPreview({
  workflowId,
  version,
  onClose,
  onRun,
}: {
  workflowId: string;
  version: number;
  onClose: () => void;
  onRun: (run: WorkflowRun | null) => void;
}) {
  const { toast } = useToast();
  const [run, setRun] = useState<WorkflowRun | null>(null);
  const [input, setInput] = useState("");
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState("");

  const setCurrentRun = (next: WorkflowRun | null) => {
    setRun(next);
    onRun(next);
  };

  const start = async () => {
    if (!input.trim()) return;
    setBusy("start");
    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/runs`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ input: input.trim(), source: "preview" }),
        }
      );
      const json = (await res.json()) as { run?: WorkflowRun; error?: string };
      if (!res.ok || !json.run)
        throw new Error(json.error || "Could not start the workflow.");
      setCurrentRun(json.run);
      setInput("");
      if (json.run.status === "waiting") setAnswer("");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Preview failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const resume = async () => {
    if (!run || !answer.trim()) return;
    setBusy("resume");
    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(
          run.id
        )}/resume`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ answer: answer.trim() }),
        }
      );
      const json = (await res.json()) as { run?: WorkflowRun; error?: string };
      if (!res.ok || !json.run)
        throw new Error(json.error || "Could not resume the workflow.");
      setCurrentRun(json.run);
      setAnswer("");
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Resume failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const cancel = async () => {
    if (!run) return;
    setBusy("cancel");
    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(workflowId)}/runs/${encodeURIComponent(
          run.id
        )}/cancel`,
        { method: "POST" }
      );
      const json = (await res.json()) as { run?: WorkflowRun; error?: string };
      if (res.ok && json.run) setCurrentRun(json.run);
    } finally {
      setBusy("");
    }
  };

  const nodeSummary = useMemo(() => {
    if (!run) return [];
    return [...run.nodeRuns].reverse().slice(0, 12);
  }, [run]);

  return (
    <aside className="workflow-preview" aria-label="Workflow preview">
      <div className="workflow-preview-head">
        <div>
          <strong>Preview</strong>
          <span className="muted text-12"> · v{version || "draft"}</span>
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close preview">
          <Dismiss20Regular />
        </button>
      </div>

      <div className="workflow-preview-status">
        <span className={`routine-run-state ${run?.status || "queued"}`}>
          {run ? statusLabel(run.status) : "Not started"}
        </span>
        {run?.status === "running" && <Spinner />}
        {run && run.status !== "completed" && run.status !== "failed" && run.status !== "cancelled" && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => void cancel()}
            disabled={busy === "cancel"}
          >
            <Stop20Regular /> Cancel
          </button>
        )}
      </div>

      <div className="workflow-preview-messages">
        {!run && (
          <div className="workflow-preview-intro">
            <strong>Test the workflow</strong>
            <p>
              Enter the first user message. The preview runs real local agents
              and pauses when a question node asks for input.
            </p>
          </div>
        )}
        {run?.messages.map((message, index) => (
          <div
            key={`${message.at}-${index}`}
            className={`workflow-message ${message.role}`}
          >
            <span>{message.role === "user" ? "You" : "Workflow"}</span>
            <div>{message.content}</div>
          </div>
        ))}
        {run?.status === "failed" && run.error && (
          <div className="banner error">{run.error}</div>
        )}
        {run?.pending && (
          <div className="workflow-question">
            <strong>{run.pending.question}</strong>
            {run.pending.inputType === "choice" ? (
              <select
                className="select"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              >
                <option value="">Choose an answer</option>
                {run.pending.choices?.map((choice) => (
                  <option key={choice} value={choice}>
                    {choice}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="input"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Your answer"
                onKeyDown={(event) => {
                  if (event.key === "Enter") void resume();
                }}
              />
            )}
            <button
              className="btn btn-primary"
              onClick={() => void resume()}
              disabled={!answer.trim() || busy === "resume"}
            >
              {busy === "resume" ? <Spinner /> : <Send20Regular />} Send answer
            </button>
          </div>
        )}
      </div>

      {nodeSummary.length > 0 && (
        <details className="workflow-preview-nodes">
          <summary>Node activity ({run?.nodeRuns.length})</summary>
          <div>
            {nodeSummary.map((node, index) => (
              <div className="workflow-preview-node" key={`${node.nodeId}-${index}`}>
                <span className={`workflow-node-run-dot run-${node.status}`} />
                <span>{node.title}</span>
                <span className="muted">{node.status}</span>
              </div>
            ))}
          </div>
        </details>
      )}

      <div className="workflow-preview-input">
        <input
          className="input"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            run?.status === "waiting" ? "Answer the question above" : "Start the workflow…"
          }
          disabled={run?.status === "waiting" || busy === "start"}
          onKeyDown={(event) => {
            if (event.key === "Enter") void start();
          }}
        />
        <button
          className="btn btn-primary"
          onClick={() => void start()}
          disabled={!input.trim() || busy === "start" || run?.status === "waiting"}
        >
          {busy === "start" ? <Spinner /> : <Play20Regular />} Run
        </button>
        {run && (
          <button
            className="icon-button"
            aria-label="Start a new run"
            onClick={() => {
              setCurrentRun(null);
              setAnswer("");
            }}
          >
            <ArrowClockwise20Regular />
          </button>
        )}
      </div>
    </aside>
  );
}
