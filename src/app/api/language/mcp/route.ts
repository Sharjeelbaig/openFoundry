// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest } from "next/server";
import {
  bearerToken,
  handleLocalMcp,
  mcpGetNotAllowed,
  mcpUnauthorized,
} from "@/lib/local-mcp";
import { verifyServiceMcpToken } from "@/lib/service-mcp-token";
import { callLanguageTool, languageMcpTools } from "@/lib/language-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP server exposing the local language endpoints as tools. Authenticated by
 * the service bearer token from POST /api/language/mcp/token.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyServiceMcpToken("language", bearerToken(req)))) {
    return mcpUnauthorized("language");
  }
  return handleLocalMcp(req, {
    serverInfo: { name: "openFoundry-language", version: "1.0.0" },
    tools: languageMcpTools,
    callTool: callLanguageTool,
  });
}

export async function GET() {
  return mcpGetNotAllowed();
}
