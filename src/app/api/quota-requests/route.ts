import { NextRequest, NextResponse } from "next/server";
import { newId, nowIso, readJson, writeJson } from "@/lib/store";
import { QuotaRequest } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(): Promise<QuotaRequest[]> {
  return readJson<QuotaRequest[]>("quota-requests.json", []);
}

export async function GET() {
  return NextResponse.json({ requests: await load() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    requestedInstances?: number;
    reason?: string;
  };
  const requestedInstances = Math.min(
    64,
    Math.max(1, Number(body.requestedInstances) || 1)
  );
  const request: QuotaRequest = {
    id: newId("quota"),
    requestedInstances,
    reason: body.reason?.trim() || "",
    status: "Recorded",
    createdAt: nowIso(),
  };
  const requests = await load();
  requests.unshift(request);
  await writeJson("quota-requests.json", requests.slice(0, 100));
  return NextResponse.json({ request }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    status?: QuotaRequest["status"];
  };
  if (!body.id || !body.status)
    return NextResponse.json({ error: "id and status are required" }, { status: 400 });
  if (!["Recorded", "Fulfilled", "Declined"].includes(body.status))
    return NextResponse.json({ error: "Unknown status" }, { status: 400 });
  const requests = await load();
  const target = requests.find((item) => item.id === body.id);
  if (!target) return NextResponse.json({ error: "Request not found" }, { status: 404 });
  target.status = body.status;
  await writeJson("quota-requests.json", requests);
  return NextResponse.json({ request: target });
}
