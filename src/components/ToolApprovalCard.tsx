// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useState } from "react";
import {
  Checkmark20Regular,
  Dismiss20Regular,
  ShieldKeyhole20Regular,
} from "@fluentui/react-icons";
import { Spinner } from "@/components/ui";
import type { ToolApprovalRecord } from "@/lib/types";

/**
 * A paused tool call. The chat request stays open until the signed-in person
 * approves or rejects it here, or the approval times out.
 */
export function ToolApprovalCard({
  approval,
  onDecision,
}: {
  approval: ToolApprovalRecord;
  onDecision: (approvalId: string, decision: "approved" | "rejected") => void;
}) {
  const [busy, setBusy] = useState<"approved" | "rejected" | null>(null);
  const [error, setError] = useState("");
  const [expanded, setExpanded] = useState(false);

  const decide = async (decision: "approved" | "rejected") => {
    setBusy(decision);
    setError("");
    try {
      const res = await fetch(
        `/api/tool-approvals/${encodeURIComponent(approval.id)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ decision }),
        }
      );
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "The decision could not be recorded.");
      }
      onDecision(approval.id, decision);
    } catch (decisionError) {
      setError(
        decisionError instanceof Error
          ? decisionError.message
          : "The decision could not be recorded."
      );
      setBusy(null);
    }
  };

  return (
    <div className="tool-approval-card" role="alertdialog" aria-live="assertive">
      <div className="tool-approval-head">
        <ShieldKeyhole20Regular />
        <div>
          <div className="strong">Approval required</div>
          <div className="muted">
            <code>{approval.toolName}</code> wants to run on {approval.server}.
          </div>
        </div>
      </div>
      <div className="tool-approval-reason">{approval.reason}</div>
      <button
        className="tool-approval-toggle"
        onClick={() => setExpanded((value) => !value)}
      >
        {expanded ? "Hide arguments" : "Show arguments"}
      </button>
      {expanded && (
        <pre className="tool-approval-args">
          {JSON.stringify(approval.arguments, null, 2)}
        </pre>
      )}
      {error && <div className="banner error">{error}</div>}
      <div className="tool-approval-actions">
        <button
          className="btn btn-sm"
          disabled={busy !== null}
          onClick={() => void decide("rejected")}
        >
          {busy === "rejected" ? <Spinner /> : <Dismiss20Regular />} Reject
        </button>
        <button
          className="btn btn-sm btn-primary"
          disabled={busy !== null}
          onClick={() => void decide("approved")}
        >
          {busy === "approved" ? <Spinner /> : <Checkmark20Regular />} Approve
        </button>
      </div>
      <div className="tool-approval-expiry">
        Expires {new Date(approval.expiresAt).toLocaleTimeString()}. Nothing is
        executed until you approve.
      </div>
    </div>
  );
}
