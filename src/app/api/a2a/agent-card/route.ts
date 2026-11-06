// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { buildAgentCard, selectA2aAgent } from "@/lib/a2a";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A2A agent-card discovery. The standard path is rewired to this route by
 * next.config.ts:
 *   GET /.well-known/agent-card.json[?agent=<id>]
 *   GET /api/a2a/agent-card[?agent=<id>]
 */
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("agent");
  const agent = await selectA2aAgent(requested);
  if (requested && !agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }
  return NextResponse.json(buildAgentCard(agent || undefined, req.nextUrl.origin), {
    headers: {
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
