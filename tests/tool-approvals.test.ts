// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  DEFAULT_APPROVAL_POLICY,
  approvalRequiredReason,
  normalizeApprovalPolicy,
  requiresApproval,
} from "@/lib/approval-policy";
import { resolveApiRoute } from "@/lib/directory/routes";
import type { ToolApprovalPolicy } from "@/lib/types";

const readTool = {
  id: "mcp:files:list",
  functionName: "list_files",
  approval: {
    write: false,
    destructive: false,
    reason: "The MCP server marks this tool read-only.",
  },
};

const writeTool = {
  id: "mcp:crm:update",
  functionName: "update_customer",
  approval: {
    write: true,
    destructive: false,
    reason: "This MCP tool is not marked read-only.",
  },
};

const destructiveTool = {
  id: "http:delete-account",
  functionName: "delete_account",
  approval: {
    write: true,
    destructive: true,
    reason: "The HTTP tool uses DELETE and may change remote state.",
  },
};

const policy = (mode: ToolApprovalPolicy["mode"]): ToolApprovalPolicy => ({
  mode,
  allowlist: [],
  timeoutSeconds: 300,
});

describe("tool approval policy", () => {
  it("never pauses when the mode is off", () => {
    expect(requiresApproval(policy("off"), destructiveTool)).toBe(false);
  });

  it("pauses only destructive tools in destructive mode", () => {
    expect(requiresApproval(policy("destructive"), readTool)).toBe(false);
    expect(requiresApproval(policy("destructive"), writeTool)).toBe(false);
    expect(requiresApproval(policy("destructive"), destructiveTool)).toBe(true);
  });

  it("pauses every write-capable tool in writes mode", () => {
    expect(requiresApproval(policy("writes"), readTool)).toBe(false);
    expect(requiresApproval(policy("writes"), writeTool)).toBe(true);
    expect(requiresApproval(policy("writes"), destructiveTool)).toBe(true);
  });

  it("pauses even read-only tools in all mode", () => {
    expect(requiresApproval(policy("all"), readTool)).toBe(true);
  });

  it("honours the allowlist by tool id or function name", () => {
    const allowedById: ToolApprovalPolicy = {
      ...policy("all"),
      allowlist: ["http:delete-account"],
    };
    const allowedByName: ToolApprovalPolicy = {
      ...policy("all"),
      allowlist: ["delete_account"],
    };
    expect(requiresApproval(allowedById, destructiveTool)).toBe(false);
    expect(requiresApproval(allowedByName, destructiveTool)).toBe(false);
  });

  it("defaults to writes mode", () => {
    expect(DEFAULT_APPROVAL_POLICY.mode).toBe("writes");
    expect(normalizeApprovalPolicy(undefined)).toEqual(DEFAULT_APPROVAL_POLICY);
  });

  it("clamps the timeout and trims the allowlist", () => {
    const normalized = normalizeApprovalPolicy({
      mode: "all",
      timeoutSeconds: 2,
      allowlist: ["  list_files  ", "", 42 as unknown as string],
    });
    expect(normalized.timeoutSeconds).toBe(15);
    expect(normalized.allowlist).toEqual(["list_files"]);
    expect(
      normalizeApprovalPolicy({ mode: "all", timeoutSeconds: 99999 })
        .timeoutSeconds
    ).toBe(3600);
  });

  it("explains why a call is paused", () => {
    expect(
      approvalRequiredReason(policy("all"), destructiveTool)
    ).toMatch(/every tool call/i);
    expect(
      approvalRequiredReason(policy("writes"), destructiveTool)
    ).toMatch(/DELETE/);
  });

  it("maps approval routes to tool permissions", () => {
    expect(resolveApiRoute("GET", "/api/tool-approvals")).toEqual({
      visibility: "guarded",
      action: "tools.read",
    });
    expect(resolveApiRoute("PATCH", "/api/tool-approvals/policy")).toEqual({
      visibility: "guarded",
      action: "tools.write",
    });
    expect(resolveApiRoute("POST", "/api/tool-approvals/approval_123")).toEqual({
      visibility: "guarded",
      action: "tools.invoke",
    });
  });
});
