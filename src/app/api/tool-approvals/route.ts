// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import { currentSession } from "@/lib/directory/server";
import { getApprovalState, pendingFor } from "@/lib/tool-approvals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Policy, recent decisions and this principal's pending approvals. */
export async function GET() {
  const session = await currentSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in to read approvals." }, { status: 401 });
  }
  const state = await getApprovalState();
  return NextResponse.json({
    policy: state.policy,
    pending: pendingFor(session.principal.id),
    history: state.history
      .filter((record) => record.principalId === session.principal.id)
      .slice(-50)
      .reverse(),
  });
}
