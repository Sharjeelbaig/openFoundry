// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { getDeployments, saveDeployments } from "./store";
import { Deployment } from "./types";

/**
 * Real local serving semantics for the Foundry deployment types.
 *
 * Foundry pairs each deployment type with concrete runtime behaviour: Standard
 * is metered per token against a tokens-per-minute limit, Provisioned reserves
 * throughput units, Batch only accepts asynchronous jobs, Developer is gated to
 * evaluation and Instant is kept resident. openFoundry reproduces those
 * behaviours against the local runtime and reports `$0` local cost.
 *
 * State lives on `globalThis` so it survives Next.js module reloads in dev.
 */

interface RateWindow {
  at: number;
  tokens: number;
}

interface SlotState {
  active: number;
  waiters: (() => void)[];
}

const store = globalThis as unknown as {
  __ofTokens?: Map<string, RateWindow[]>;
  __ofSlots?: Map<string, SlotState>;
  __ofResident?: Set<string>;
};

const tokenWindows: Map<string, RateWindow[]> = (store.__ofTokens ||= new Map<
  string,
  RateWindow[]
>());
const slotStates: Map<string, SlotState> = (store.__ofSlots ||= new Map<
  string,
  SlotState
>());
const resident: Set<string> = (store.__ofResident ||= new Set<string>());

export type ServingRejection =
  | { kind: "batch-only" }
  | { kind: "developer-only" }
  | { kind: "tpm"; limit: number; retryAfter: number }
  | { kind: "capacity"; slots: number; retryAfter: number };

/** Rough token estimate used for admission control before the model runs. */
export function estimateTokens(
  messages: { content?: string }[],
  maxTokens: number
): number {
  const chars = messages.reduce((sum, m) => sum + (m.content?.length || 0), 0);
  return Math.ceil(chars / 4) + Math.max(0, maxTokens || 0);
}

function recentTokens(id: string): number {
  const now = Date.now();
  const list = (tokenWindows.get(id) || []).filter((entry) => now - entry.at < 60_000);
  tokenWindows.set(id, list);
  return list.reduce((sum, entry) => sum + entry.tokens, 0);
}

/** Records tokens against the deployment's rolling one-minute window. */
export function recordTokens(id: string, tokens: number): void {
  const list = tokenWindows.get(id) || [];
  list.push({ at: Date.now(), tokens });
  tokenWindows.set(id, list);
}

export interface ServingStats {
  tpmLimit?: number;
  tpmUsed: number;
  slots?: number;
  slotsActive?: number;
  slotsQueued?: number;
  resident: boolean;
}

export function servingStats(deployment: Deployment): ServingStats {
  const state = slotStates.get(deployment.id);
  return {
    tpmLimit: deployment.tpm,
    tpmUsed: recentTokens(deployment.id),
    slots: deployment.reservedSlots,
    slotsActive: state?.active ?? 0,
    slotsQueued: state?.waiters.length ?? 0,
    resident: resident.has(deployment.id),
  };
}

/**
 * Admission control for a deployment. Returns a rejection when the request must
 * not run, or null when it may proceed. Does not reserve anything; call
 * `acquireSlot` for provisioned deployments after this passes.
 */
export function admit(
  deployment: Deployment,
  estimatedTokens: number,
  opts: { purpose?: string } = {}
): ServingRejection | null {
  if (deployment.servingMode === "Batch")
    return { kind: "batch-only" };

  if (deployment.servingMode === "Developer" && opts.purpose !== "evaluation")
    return { kind: "developer-only" };

  if (
    (deployment.servingMode === "Standard" || deployment.servingMode === "Developer") &&
    deployment.tpm
  ) {
    const used = recentTokens(deployment.id);
    if (used + estimatedTokens > deployment.tpm) {
      return {
        kind: "tpm",
        limit: deployment.tpm,
        retryAfter: 30,
      };
    }
  }

  return null;
}

/** Reserves a concurrency slot for provisioned/dedicated deployments. */
export async function acquireSlot(
  deployment: Deployment,
  timeoutMs = 30_000
): Promise<boolean> {
  const slots = deployment.reservedSlots;
  if (!slots) return true;
  const state =
    slotStates.get(deployment.id) || { active: 0, waiters: [] };
  slotStates.set(deployment.id, state);
  if (state.active < slots) {
    state.active += 1;
    return true;
  }
  return new Promise<boolean>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      state.waiters = state.waiters.filter((waiter) => waiter !== grant);
      resolve(false);
    }, timeoutMs);
    const grant = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      state.active += 1;
      resolve(true);
    };
    state.waiters.push(grant);
  });
}

export function releaseSlot(deployment: Deployment): void {
  if (!deployment.reservedSlots) return;
  const state = slotStates.get(deployment.id);
  if (!state) return;
  state.active = Math.max(0, state.active - 1);
  const next = state.waiters.shift();
  if (next) next();
}

export function markResident(id: string): void {
  resident.add(id);
}

export function isResident(id: string): boolean {
  return resident.has(id);
}

/** Increments the real request/token meters stored with the deployment. */
export async function meter(
  deploymentId: string,
  promptTokens: number,
  completionTokens: number
): Promise<void> {
  const deployments = await getDeployments();
  const target = deployments.find((item) => item.id === deploymentId);
  if (!target) return;
  target.requests += 1;
  target.tokens += promptTokens + completionTokens;
  target.updatedAt = new Date().toISOString();
  await saveDeployments(deployments);
  recordTokens(deploymentId, promptTokens + completionTokens);
}

/** Human-readable message for a serving rejection. */
export function rejectionMessage(rejection: ServingRejection): string {
  switch (rejection.kind) {
    case "batch-only":
      return "This is a Batch deployment. It only accepts asynchronous batch jobs; submit them from Build → Models → Batch jobs or the Batch API.";
    case "developer-only":
      return "Developer deployments are for fine-tuned model evaluation only. Use an evaluation or a Standard deployment for interactive chat.";
    case "tpm":
      return `Rate limit reached: this deployment allows ${rejection.limit.toLocaleString()} tokens per minute. Retry after ${rejection.retryAfter} seconds.`;
    case "capacity":
      return `Insufficient provisioned capacity: all ${rejection.slots} reserved slots are busy. Retry after ${rejection.retryAfter} seconds.`;
  }
}

/** OpenAI-style error body for a serving rejection. */
export function rejectionResponse(rejection: ServingRejection): Response {
  let message: string;
  let status = 429;
  let type = "rate_limit_exceeded";
  let retryAfter: number | null = null;
  switch (rejection.kind) {
    case "batch-only":
      message = rejectionMessage(rejection);
      status = 400;
      type = "invalid_request_error";
      break;
    case "developer-only":
      message = rejectionMessage(rejection);
      status = 403;
      type = "forbidden";
      break;
    case "tpm":
      message = rejectionMessage(rejection);
      retryAfter = rejection.retryAfter;
      break;
    case "capacity":
      message = rejectionMessage(rejection);
      retryAfter = rejection.retryAfter;
      break;
  }
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (retryAfter) {
    headers["Retry-After"] = String(retryAfter);
    headers["x-ratelimit-remaining-tokens"] = "0";
  }
  return new Response(
    JSON.stringify({ error: { message, type, code: rejection.kind } }),
    { status, headers }
  );
}
