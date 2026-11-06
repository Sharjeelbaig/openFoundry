// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { newId, readJson, writeJson } from "./store";
import type {
  ToolApprovalPolicy,
  ToolApprovalRecord,
  ToolApprovalState,
} from "./types";
import {
  normalizeApprovalPolicy,
  type ApprovalTool,
} from "./approval-policy";

/**
 * Human-in-the-loop approval for tool calls.
 *
 * A destructive (or, depending on policy, any write-capable) tool call is
 * paused before execution. The chat stream stays open and emits an
 * `approval_required` event. Only a decision from the same signed-in principal
 * resumes the run; a rejection, a timeout or a closed request ends it safely.
 *
 * This is a real pause in the execution path, not a prompt instruction and not
 * a UI-only confirmation.
 */

export type ToolApprovalDecision =
  | "approved"
  | "rejected"
  | "expired"
  | "cancelled";

const FILE = "tool-approvals.json";
const MAX_HISTORY = 200;
const MIN_TIMEOUT_SECONDS = 15;
const MAX_TIMEOUT_SECONDS = 3600;

function auditArguments(
  args: Record<string, unknown>
): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(args)) {
    if (/token|secret|password|authorization|api[-_]?key/i.test(key)) {
      safe[key] = "[REDACTED]";
    } else if (typeof value === "string") {
      safe[key] = value.slice(0, 500);
    } else {
      safe[key] = value;
    }
  }
  return safe;
}

async function loadState(): Promise<ToolApprovalState> {
  const stored = await readJson<Partial<ToolApprovalState>>(FILE, {});
  const now = Date.now();
  return {
    policy: normalizeApprovalPolicy(stored.policy),
    history: Array.isArray(stored.history)
      ? stored.history
          .filter(
            (item): item is ToolApprovalRecord =>
              Boolean(item) && typeof item.id === "string"
          )
          .map((record) =>
            record.status === "pending" &&
            Date.parse(record.expiresAt) <= now
              ? {
                  ...record,
                  status: "expired" as const,
                  decidedAt: record.expiresAt,
                  decidedBy: record.principalId,
                  arguments: auditArguments(record.arguments || {}),
                }
              : record
          )
      : [],
  };
}

let writeChain: Promise<unknown> = Promise.resolve();

function serialize<T>(work: () => Promise<T>): Promise<T> {
  const next = writeChain.then(work, work);
  writeChain = next.catch(() => undefined);
  return next;
}

async function saveState(state: ToolApprovalState): Promise<void> {
  await serialize(() =>
    writeJson(FILE, {
      policy: state.policy,
      history: state.history.slice(-MAX_HISTORY).map((record) => ({
        ...record,
        arguments: auditArguments(record.arguments || {}),
      })),
    })
  );
}

export async function getApprovalState(): Promise<ToolApprovalState> {
  return loadState();
}

export async function setApprovalPolicy(
  patch: Partial<ToolApprovalPolicy>
): Promise<ToolApprovalPolicy> {
  const state = await loadState();
  const policy = normalizeApprovalPolicy({
    ...state.policy,
    ...patch,
    allowlist: patch.allowlist ?? state.policy.allowlist,
    timeoutSeconds: patch.timeoutSeconds ?? state.policy.timeoutSeconds,
  });
  await saveState({ ...state, policy });
  return policy;
}

interface PendingApproval {
  record: ToolApprovalRecord;
  promise: Promise<ToolApprovalDecision>;
  resolve: (decision: ToolApprovalDecision) => void;
  timer: ReturnType<typeof setTimeout>;
  settled: boolean;
}

const PENDING_KEY = Symbol.for("openfoundry.toolApprovals.pending");
const SETTLED_KEY = Symbol.for("openfoundry.toolApprovals.settled");

function pendingApprovals(): Map<string, PendingApproval> {
  const globalScope = globalThis as typeof globalThis & {
    [PENDING_KEY]?: Map<string, PendingApproval>;
  };
  globalScope[PENDING_KEY] ??= new Map();
  return globalScope[PENDING_KEY];
}

/**
 * A very fast client can decide before the chat route reaches
 * waitForApproval(). Keep the result briefly so that race cannot turn an
 * approval into a timeout.
 */
function settledDecisions(): Map<string, ToolApprovalDecision> {
  const globalScope = globalThis as typeof globalThis & {
    [SETTLED_KEY]?: Map<string, ToolApprovalDecision>;
  };
  globalScope[SETTLED_KEY] ??= new Map();
  return globalScope[SETTLED_KEY];
}

async function settle(
  id: string,
  decision: ToolApprovalDecision,
  decidedBy?: string
): Promise<ToolApprovalRecord | undefined> {
  const pending = pendingApprovals().get(id);
  if (!pending || pending.settled) return undefined;
  pending.settled = true;
  clearTimeout(pending.timer);
  pendingApprovals().delete(id);

  const status =
    decision === "approved"
      ? "approved"
      : decision === "rejected"
      ? "rejected"
      : decision === "expired"
      ? "expired"
      : "cancelled";
  const record: ToolApprovalRecord = {
    ...pending.record,
    status,
    decidedAt: new Date().toISOString(),
    decidedBy: decidedBy ?? pending.record.principalId,
  };
  pending.resolve(decision);
  const settled = settledDecisions();
  settled.set(id, decision);
  const cleanup = setTimeout(() => settled.delete(id), 60_000);
  cleanup.unref?.();

  const state = await loadState();
  state.history = [
    ...state.history.filter((item) => item.id !== id),
    record,
  ].slice(-MAX_HISTORY);
  await saveState(state);
  return record;
}

/**
 * Create a pending approval and start its timeout. The caller sends the record
 * to the client, then awaits `waitForApproval`.
 */
export async function openApproval(input: {
  principalId: string;
  agentId?: string;
  tool: ApprovalTool & { server?: string };
  args: Record<string, unknown>;
  reason: string;
  timeoutSeconds?: number;
}): Promise<ToolApprovalRecord> {
  const state = await loadState();
  const timeoutSeconds = Math.min(
    MAX_TIMEOUT_SECONDS,
    Math.max(
      MIN_TIMEOUT_SECONDS,
      Math.round(input.timeoutSeconds ?? state.policy.timeoutSeconds)
    )
  );
  const createdAt = new Date();
  const record: ToolApprovalRecord = {
    id: newId("approval"),
    principalId: input.principalId,
    agentId: input.agentId,
    toolId: input.tool.id,
    toolName: input.tool.functionName,
    server: input.tool.server || "Tool",
    arguments: input.args,
    reason: input.reason,
    status: "pending",
    createdAt: createdAt.toISOString(),
    expiresAt: new Date(
      createdAt.getTime() + timeoutSeconds * 1000
    ).toISOString(),
  };

  let resolve!: (decision: ToolApprovalDecision) => void;
  const promise = new Promise<ToolApprovalDecision>((done) => {
    resolve = done;
  });
  const timer = setTimeout(() => {
    void settle(record.id, "expired");
  }, timeoutSeconds * 1000);
  // Do not hold the Node process open only for a pending approval.
  timer.unref?.();

  pendingApprovals().set(record.id, {
    record,
    promise,
    resolve,
    timer,
    settled: false,
  });
  state.history = [...state.history, record].slice(-MAX_HISTORY);
  await saveState(state);
  return record;
}

/** Await the decision. An aborted chat request cancels the approval. */
export function waitForApproval(
  id: string,
  signal?: AbortSignal
): Promise<ToolApprovalDecision> {
  const pending = pendingApprovals().get(id);
  if (!pending) {
    return Promise.resolve(settledDecisions().get(id) ?? "expired");
  }
  if (signal?.aborted) {
    void settle(id, "cancelled");
    return Promise.resolve("cancelled");
  }
  const aborted = () => {
    void settle(id, "cancelled");
  };
  signal?.addEventListener("abort", aborted, { once: true });
  return pending.promise.finally(() => {
    signal?.removeEventListener("abort", aborted);
  });
}

/** Record a human decision. Only the requesting principal may decide. */
export async function decideApproval(input: {
  id: string;
  principalId: string;
  decision: "approved" | "rejected";
}): Promise<
  | { ok: true; record: ToolApprovalRecord }
  | { ok: false; status: number; error: string }
> {
  const pending = pendingApprovals().get(input.id);
  if (!pending) {
    return { ok: false, status: 404, error: "This approval is no longer pending." };
  }
  if (pending.settled) {
    return { ok: false, status: 409, error: "This approval was already decided." };
  }
  if (pending.record.principalId !== input.principalId) {
    return {
      ok: false,
      status: 403,
      error: "Only the person who started this run can decide it.",
    };
  }
  const record = await settle(
    input.id,
    input.decision,
    input.principalId
  );
  if (!record) {
    return { ok: false, status: 409, error: "This approval was already decided." };
  }
  return { ok: true, record };
}

/** Pending records for one principal, for a page reload during a run. */
export function pendingFor(principalId: string): ToolApprovalRecord[] {
  return [...pendingApprovals().values()]
    .filter((entry) => entry.record.principalId === principalId)
    .map((entry) => entry.record);
}
