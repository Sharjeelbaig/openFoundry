// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { issueServiceMcpToken } from "@/lib/service-mcp-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a bearer token for the local speech MCP server. Shown once; only its
 * SHA-256 hash is stored. Issuing again invalidates the previous token.
 */
export async function POST(req: NextRequest) {
  const token = await issueServiceMcpToken("speech");
  return NextResponse.json({
    token,
    url: `${req.nextUrl.origin}/api/speech/mcp`,
    note: "This token is shown once. It authenticates the local speech MCP server.",
  });
}
