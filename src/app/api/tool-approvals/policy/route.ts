// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { currentSession } from "@/lib/directory/server";
import { setApprovalPolicy } from "@/lib/tool-approvals";
import type { ToolApprovalMode, ToolApprovalPolicy } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODES: ToolApprovalMode[] = ["off", "destructive", "writes", "all"];

export async function PATCH(req: NextRequest) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to change approvals." }, { status: 401 });
  }
  const body = (await req.json().catch(() => ({}))) as Partial<ToolApprovalPolicy>;
  if (body.mode && !MODES.includes(body.mode)) {
    return NextResponse.json(
      { error: `mode must be one of ${MODES.join(", ")}.` },
      { status: 400 }
    );
  }
  if (
    body.allowlist !== undefined &&
    (!Array.isArray(body.allowlist) ||
      body.allowlist.some((entry) => typeof entry !== "string"))
  ) {
    return NextResponse.json(
      { error: "allowlist must be an array of tool ids or names." },
      { status: 400 }
    );
  }
  if (
    body.timeoutSeconds !== undefined &&
    (!Number.isFinite(body.timeoutSeconds) || body.timeoutSeconds <= 0)
  ) {
    return NextResponse.json(
      { error: "timeoutSeconds must be a positive number." },
      { status: 400 }
    );
  }
  const policy = await setApprovalPolicy(body);
  void appendAudit({
    actorId: session.principal.id,
    action: "tool-approval.policy",
    target: "tool-approvals",
    scope: "local",
    outcome: "allowed",
    detail: `mode=${policy.mode}; timeout=${policy.timeoutSeconds}s; allowlist=${policy.allowlist.length}`,
  });
  return NextResponse.json({ policy });
}
