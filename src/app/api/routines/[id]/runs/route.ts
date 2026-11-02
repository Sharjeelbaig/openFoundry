import { NextRequest, NextResponse } from "next/server";
import { getRoutine, getRoutineRuns } from "@/lib/routines/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const routine = await getRoutine(id);
  if (!routine)
    return NextResponse.json({ error: "Routine not found." }, { status: 404 });

  const status = req.nextUrl.searchParams.get("status");
  const since = req.nextUrl.searchParams.get("since");
  const limit = Math.max(
    1,
    Math.min(100, Number(req.nextUrl.searchParams.get("limit") || 50))
  );

  let runs = await getRoutineRuns(id);
  if (status && status !== "all")
    runs = runs.filter((run) => run.status === status);
  if (since) {
    const after = new Date(since).getTime();
    if (Number.isFinite(after))
      runs = runs.filter((run) => new Date(run.queuedAt).getTime() >= after);
  }
  return NextResponse.json({ runs: runs.slice(0, limit) });
}
