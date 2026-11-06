// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { handleA2aRequest } from "@/lib/a2a";
import { bearerToken } from "@/lib/local-mcp";
import { verifyServiceMcpToken } from "@/lib/service-mcp-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization,content-type,a2a-version",
  "access-control-allow-methods": "POST,OPTIONS",
};

function withHeaders(response: NextResponse): NextResponse {
  for (const [key, value] of Object.entries(CORS)) {
    response.headers.set(key, value);
  }
  response.headers.set("a2a-version", "0.3.0");
  response.headers.set("cache-control", "no-store");
  return response;
}

/** A2A JSON-RPC endpoint. Authenticated by the token from /api/a2a/token. */
export async function POST(req: NextRequest) {
  if (!(await verifyServiceMcpToken("a2a", bearerToken(req)))) {
    return withHeaders(
      NextResponse.json(
        {
          jsonrpc: "2.0",
          id: null,
          error: { code: -32001, message: "Unauthorized" },
        },
        {
          status: 401,
          headers: {
            "www-authenticate": 'Bearer realm="openFoundry A2A"',
          },
        }
      )
    );
  }
  return withHeaders(await handleA2aRequest(req));
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export function GET() {
  return withHeaders(
    NextResponse.json(
      {
        error:
          "This is the A2A JSON-RPC endpoint. POST JSON-RPC requests; discovery is GET /.well-known/agent-card.json.",
      },
      { status: 405, headers: { allow: "POST" } }
    )
  );
}
