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
import { callSpeechTool, speechMcpTools } from "@/lib/speech-mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * MCP server exposing the local speech endpoints as tools. Authenticated by the
 * service bearer token from POST /api/speech/mcp/token.
 */
export async function POST(req: NextRequest) {
  if (!(await verifyServiceMcpToken("speech", bearerToken(req)))) {
    return mcpUnauthorized("speech");
  }
  return handleLocalMcp(req, {
    serverInfo: { name: "openFoundry-speech", version: "1.0.0" },
    tools: speechMcpTools,
    callTool: callSpeechTool,
  });
}

export async function GET() {
  return mcpGetNotAllowed();
}
