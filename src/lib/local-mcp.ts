// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";

/**
 * Minimal streamable-HTTP MCP server used by the local language and speech
 * wrappers. It implements the same JSON-RPC surface as the per-base knowledge
 * endpoint: initialize, ping, tools/list and tools/call, with JSON responses.
 */

export const MCP_PROTOCOL_VERSION = "2025-06-18";

export interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

export interface LocalMcpToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  execution?: { taskSupport: "optional" | "required" | "forbidden" };
  _meta?: Record<string, unknown>;
}

export interface LocalMcpToolResult {
  content: Record<string, unknown>[];
  structuredContent?: unknown;
  isError?: boolean;
  _meta?: Record<string, unknown>;
}

export interface LocalMcpOptions {
  serverInfo: { name: string; version: string };
  tools: LocalMcpToolDefinition[];
  callTool: (
    name: string,
    args: Record<string, unknown>
  ) => Promise<LocalMcpToolResult>;
}

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

export function bearerToken(req: NextRequest): string {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
}

export function mcpUnauthorized(service: string): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: { code: -32001, message: "Unauthorized" },
    },
    {
      status: 401,
      headers: {
        "www-authenticate": `Bearer realm="openFoundry ${service} MCP"`,
      },
    }
  );
}

export async function handleLocalMcp(
  req: NextRequest,
  options: LocalMcpOptions
): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as
    | RpcRequest
    | RpcRequest[]
    | null;
  if (!body) {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }

  const handle = async (message: RpcRequest) => {
    const method = message.method || "";
    if (!message.jsonrpc) {
      return rpcError(message.id, -32600, "Invalid Request");
    }

    if (method === "initialize") {
      return rpcResult(message.id, {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: options.serverInfo,
      });
    }

    if (
      method === "notifications/initialized" ||
      method === "notifications/cancelled"
    ) {
      return null;
    }

    if (method === "ping") return rpcResult(message.id, {});

    if (method === "tools/list") {
      return rpcResult(message.id, { tools: options.tools });
    }

    if (method === "tools/call") {
      const params = message.params || {};
      const name = String(params.name || "");
      if (!options.tools.some((tool) => tool.name === name)) {
        return rpcError(message.id, -32602, `Unknown tool "${name}"`);
      }
      const args =
        params.arguments && typeof params.arguments === "object"
          ? (params.arguments as Record<string, unknown>)
          : {};
      try {
        return rpcResult(message.id, await options.callTool(name, args));
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        return rpcResult(message.id, {
          content: [{ type: "text", text }],
          isError: true,
        });
      }
    }

    return rpcError(message.id, -32601, `Method not found: ${method}`);
  };

  const messages = Array.isArray(body) ? body : [body];
  const responses: unknown[] = [];
  for (const message of messages) {
    const response = await handle(message);
    if (response) responses.push(response);
  }

  if (responses.length === 0) {
    return new NextResponse(null, {
      status: 202,
      headers: { "mcp-protocol-version": MCP_PROTOCOL_VERSION },
    });
  }

  return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
    headers: {
      "mcp-protocol-version": MCP_PROTOCOL_VERSION,
      "cache-control": "no-store",
    },
  });
}

export function mcpGetNotAllowed(): NextResponse {
  return NextResponse.json(
    {
      jsonrpc: "2.0",
      id: null,
      error: {
        code: -32000,
        message:
          "This endpoint uses JSON responses. Send MCP JSON-RPC requests with POST.",
      },
    },
    { status: 405, headers: { allow: "POST" } }
  );
}
