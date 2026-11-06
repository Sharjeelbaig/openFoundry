// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { currentSession } from "@/lib/directory/server";
import { decideApproval } from "@/lib/tool-approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Approve or reject one paused tool call. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to decide approvals." }, { status: 401 });
  }
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { decision?: string };
  const decision =
    body.decision === "approved" || body.decision === "approve"
      ? "approved"
      : body.decision === "rejected" || body.decision === "reject"
      ? "rejected"
      : null;
  if (!decision) {
    return NextResponse.json(
      { error: "decision must be approve or reject." },
      { status: 400 }
    );
  }
  const result = await decideApproval({
    id,
    principalId: session.principal.id,
    decision,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  void appendAudit({
    actorId: session.principal.id,
    action: "tool-approval.decision",
    target: `${result.record.toolName} (${result.record.id})`,
    scope: "local",
    outcome: decision === "approved" ? "allowed" : "denied",
    detail: result.record.reason,
  });
  return NextResponse.json({ approval: result.record });
}
