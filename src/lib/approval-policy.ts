// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { ToolApprovalMode, ToolApprovalPolicy } from "./types";

/**
 * Pure approval policy. Kept free of server-only imports so the decision table
 * can be tested directly.
 */

export const DEFAULT_APPROVAL_POLICY: ToolApprovalPolicy = {
  mode: "writes",
  allowlist: [],
  timeoutSeconds: 300,
};

export const APPROVAL_MODES: ToolApprovalMode[] = [
  "off",
  "destructive",
  "writes",
  "all",
];

export function normalizeApprovalPolicy(
  value: Partial<ToolApprovalPolicy> | undefined
): ToolApprovalPolicy {
  const mode = APPROVAL_MODES.includes(value?.mode as ToolApprovalMode)
    ? (value!.mode as ToolApprovalMode)
    : DEFAULT_APPROVAL_POLICY.mode;
  const timeout = Number(value?.timeoutSeconds);
  return {
    mode,
    allowlist: Array.isArray(value?.allowlist)
      ? value!.allowlist
          .filter((item): item is string => typeof item === "string")
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 100)
      : [],
    timeoutSeconds: Number.isFinite(timeout)
      ? Math.min(3600, Math.max(15, Math.round(timeout)))
      : DEFAULT_APPROVAL_POLICY.timeoutSeconds,
  };
}

export interface ApprovalTool {
  id: string;
  functionName: string;
  approval: {
    write: boolean;
    destructive: boolean;
    reason: string;
  };
}

/** True when this policy pauses this tool before it runs. */
export function requiresApproval(
  policy: ToolApprovalPolicy,
  tool: Pick<ApprovalTool, "id" | "functionName" | "approval">
): boolean {
  if (policy.mode === "off") return false;
  if (
    policy.allowlist.some(
      (entry) => entry === tool.id || entry === tool.functionName
    )
  ) {
    return false;
  }
  if (policy.mode === "all") return true;
  if (policy.mode === "writes") return tool.approval.write;
  return tool.approval.destructive;
}

export function approvalRequiredReason(
  policy: ToolApprovalPolicy,
  tool: Pick<ApprovalTool, "approval">
): string {
  if (policy.mode === "all") {
    return "The approval policy requires a human decision for every tool call.";
  }
  return tool.approval.reason;
}
