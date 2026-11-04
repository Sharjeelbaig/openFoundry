// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, getWorkflowRuns } from "@/lib/workflows/store";
import { startWorkflowRun } from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const workflow = await getWorkflow(id);
  if (!workflow)
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const limit = Math.max(
    1,
    Math.min(100, Number(req.nextUrl.searchParams.get("limit") || 50))
  );
  return NextResponse.json({ runs: (await getWorkflowRuns(id)).slice(0, limit) });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const workflow = await getWorkflow(id);
  if (!workflow)
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as {
    input?: string;
    source?: "manual" | "preview";
  };
  const input = String(body.input || "").trim();
  if (!input)
    return NextResponse.json(
      { error: "Enter a message to start the workflow." },
      { status: 400 }
    );
  try {
    const run = await startWorkflowRun(
      workflow,
      input,
      body.source === "preview" ? "preview" : "manual"
    );
    return NextResponse.json({ run }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start the workflow.",
      },
      { status: 400 }
    );
  }
}
