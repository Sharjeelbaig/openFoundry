// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getWorkflow } from "@/lib/workflows/store";
import { getWorkflowRun } from "@/lib/workflows/store";
import { resumeWorkflowRun } from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; runId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id, runId } = await params;
  const workflow = await getWorkflow(id);
  const run = await getWorkflowRun(runId);
  if (!workflow || !run || run.workflowId !== id)
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { answer?: string };
  const answer = String(body.answer ?? "");
  if (!answer.trim())
    return NextResponse.json({ error: "Enter an answer." }, { status: 400 });
  try {
    const updated = await resumeWorkflowRun(workflow, run, answer);
    return NextResponse.json({ run: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not resume the run.",
      },
      { status: 400 }
    );
  }
}
