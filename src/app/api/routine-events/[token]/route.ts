import { NextRequest, NextResponse } from "next/server";
import { getRoutines } from "@/lib/routines/store";
import { dispatchRoutine } from "@/lib/routines/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ token: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { token } = await params;
  const routines = await getRoutines();
  const routine = routines.find(
    (item) => item.trigger.type === "webhook" && item.trigger.token === token
  );
  if (!routine)
    return NextResponse.json({ error: "Unknown webhook." }, { status: 404 });
  if (!routine.enabled)
    return NextResponse.json(
      { error: "This routine is paused." },
      { status: 409 }
    );

  const contentType = req.headers.get("content-type") || "";
  let payload: unknown;
  if (contentType.includes("application/json")) {
    payload = await req.json().catch(() => undefined);
  } else {
    const text = await req.text().catch(() => "");
    payload = text || undefined;
  }

  const run = await dispatchRoutine(routine, "webhook", payload);
  return NextResponse.json({ accepted: true, runId: run.id }, { status: 202 });
}
