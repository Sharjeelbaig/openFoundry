// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { legacyKnowledge, syncSource } from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Runs one sync and returns the finished job. No fake "Connected" state. */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string; sid: string }> }
) {
  const { id, sid } = await context.params;
  try {
    const outcome = await syncSource(id, sid);
    const state = await legacyKnowledge();
    return NextResponse.json({
      job: outcome.job,
      errors: outcome.errors,
      documents: outcome.documents,
      chunks: outcome.chunks,
      knowledgeBase: state.knowledgeBases.find((base) => base.id === id),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
