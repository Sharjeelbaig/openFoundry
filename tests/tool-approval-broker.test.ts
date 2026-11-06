// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type * as ApprovalModule from "@/lib/tool-approvals";

const dataDir = mkdtempSync(path.join(tmpdir(), "openfoundry-approvals-"));
let approvals: typeof ApprovalModule;

const tool = {
  id: "http:http_test",
  functionName: "delete_record",
  approval: {
    write: true,
    destructive: true,
    reason: "The HTTP tool uses DELETE and may change remote state.",
  },
};

beforeAll(async () => {
  process.env.OPENFOUNDRY_DATA_DIR = dataDir;
  vi.resetModules();
  approvals = await import("@/lib/tool-approvals");
});

afterAll(() => {
  delete process.env.OPENFOUNDRY_DATA_DIR;
  rmSync(dataDir, { recursive: true, force: true });
});

describe("tool approval broker", () => {
  it("only lets the requesting principal decide, then records the decision", async () => {
    const record = await approvals.openApproval({
      principalId: "usr_owner",
      tool,
      args: { id: "cust-1", password: "hunter2" },
      reason: tool.approval.reason,
      timeoutSeconds: 15,
    });
    const waiting = approvals.waitForApproval(record.id);

    const wrong = await approvals.decideApproval({
      id: record.id,
      principalId: "usr_other",
      decision: "approved",
    });
    expect(wrong).toMatchObject({ ok: false, status: 403 });

    const decision = await approvals.decideApproval({
      id: record.id,
      principalId: "usr_owner",
      decision: "approved",
    });
    expect(decision.ok).toBe(true);
    expect(await waiting).toBe("approved");

    const state = await approvals.getApprovalState();
    const saved = state.history.find((item) => item.id === record.id);
    expect(saved?.status).toBe("approved");
    expect(saved?.arguments.password).toBe("[REDACTED]");
  });

  it("remembers a decision made before the wait begins", async () => {
    const record = await approvals.openApproval({
      principalId: "usr_owner",
      tool,
      args: { id: "cust-2" },
      reason: tool.approval.reason,
      timeoutSeconds: 15,
    });
    const decision = await approvals.decideApproval({
      id: record.id,
      principalId: "usr_owner",
      decision: "approved",
    });
    expect(decision.ok).toBe(true);
    expect(await approvals.waitForApproval(record.id)).toBe("approved");
  });

  it("resolves a rejection and removes the pending record", async () => {
    const record = await approvals.openApproval({
      principalId: "usr_owner",
      tool,
      args: { id: "cust-3" },
      reason: tool.approval.reason,
      timeoutSeconds: 15,
    });
    expect(
      approvals.pendingFor("usr_owner").some((item) => item.id === record.id)
    ).toBe(true);
    const waiting = approvals.waitForApproval(record.id);
    const decision = await approvals.decideApproval({
      id: record.id,
      principalId: "usr_owner",
      decision: "rejected",
    });
    expect(decision.ok).toBe(true);
    expect(await waiting).toBe("rejected");
    expect(
      approvals.pendingFor("usr_owner").some((item) => item.id === record.id)
    ).toBe(false);
  });
});
