// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getTraces } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const agentId = searchParams.get("agentId");
  const traces = await getTraces();
  return NextResponse.json({
    traces: agentId
      ? traces.filter((trace) => trace.agentId === agentId)
      : traces,
  });
}
