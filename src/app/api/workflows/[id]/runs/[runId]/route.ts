import { NextRequest, NextResponse } from "next/server";
import { getWorkflowRun } from "@/lib/workflows/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string; runId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id, runId } = await params;
  const run = await getWorkflowRun(runId);
  if (!run || run.workflowId !== id)
    return NextResponse.json({ error: "Run not found." }, { status: 404 });
  return NextResponse.json({ run });
}
