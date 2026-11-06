// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getBaseRecord, issueMcpToken } from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a bearer token for the base's MCP endpoint. The plaintext token is
 * returned once; only its SHA-256 is stored. Rotating invalidates the old one.
 */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const base = await getBaseRecord(id);
  if (!base) {
    return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }
  const token = await issueMcpToken(id);
  const origin = req.nextUrl.origin;
  return NextResponse.json({
    token,
    url: `${origin}/api/knowledge/${encodeURIComponent(id)}/mcp`,
    note: "This token is shown once. It authenticates the MCP endpoint for this base only.",
  });
}
