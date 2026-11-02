import { NextRequest, NextResponse } from "next/server";
import { getRoutine } from "@/lib/routines/store";
import { dispatchRoutine } from "@/lib/routines/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const routine = await getRoutine(id);
  if (!routine)
    return NextResponse.json({ error: "Routine not found." }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as { payload?: unknown };
  const run = await dispatchRoutine(routine, "manual", body.payload);
  return NextResponse.json({ run }, { status: 202 });
}
