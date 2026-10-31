import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { ResponsesRequest, runResponse } from "@/lib/foundry-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as ResponsesRequest;
  const result = await runResponse(body);
  return NextResponse.json(result.body, { status: result.status });
}
