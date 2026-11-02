import { NextRequest, NextResponse } from "next/server";
import { getWorkflow, getWorkflowRun } from "@/lib/workflows/store";
import { cancelWorkflowRun } from "@/lib/workflows/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; runId: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { id, runId } = await params;
  const workflow = await getWorkflow(id);
  const run = await getWorkflowRun(runId);
  if (!workflow || !run || run.workflowId !== id)
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ run: await cancelWorkflowRun(run) });
}
