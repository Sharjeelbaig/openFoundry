// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  getBaseRecord,
  listSourceRecords,
  verifyMcpToken,
} from "@/lib/knowledge/service";
import { verifyInternalMcpToken } from "@/lib/knowledge/mcp-token";
import { activityTypeFor, retrieve } from "@/lib/knowledge/retrieve";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Per-base MCP endpoint (streamable HTTP, JSON responses).
 *
 * Foundry exposes one tool, `knowledge_base_retrieve`, and the agent reaches the
 * base through an MCP connection rather than an in-process call. This mirrors
 * that contract. Authentication is a bearer token; the route is public at the
 * proxy because MCP clients do not carry a browser session.
 */

const PROTOCOL_VERSION = "2025-06-18";

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(id: RpcRequest["id"], code: number, message: string) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message } };
}

function unauthorized() {
  return NextResponse.json(
    { jsonrpc: "2.0", id: null, error: { code: -32001, message: "Unauthorized" } },
    { status: 401, headers: { "www-authenticate": 'Bearer realm="openFoundry knowledge"' } }
  );
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const base = await getBaseRecord(id);
  if (!base) {
    return NextResponse.json(
      { jsonrpc: "2.0", id: null, error: { code: -32602, message: "Knowledge base not found" } },
      { status: 404 }
    );
  }

  const header = req.headers.get("authorization") || "";
  const token = header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
  const authorised =
    (await verifyMcpToken(id, token)) ||
    (await verifyInternalMcpToken(token, id));
  if (!authorised) return unauthorized();

  const body = (await req.json().catch(() => null)) as RpcRequest | RpcRequest[] | null;
  if (!body) {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), { status: 400 });
  }

  const handle = async (message: RpcRequest) => {
    const method = message.method || "";
    if (!message.jsonrpc) {
      return rpcError(message.id, -32600, "Invalid Request");
    }

    if (method === "initialize") {
      return rpcResult(message.id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "openFoundry-knowledge", version: "1.0.0" },
      });
    }

    if (method === "notifications/initialized" || method === "notifications/cancelled") {
      return null;
    }

    if (method === "ping") return rpcResult(message.id, {});

    if (method === "tools/list") {
      const sources = await listSourceRecords(id);
      return rpcResult(message.id, {
        tools: [
          {
            name: "knowledge_base_retrieve",
            description:
              "Use knowledge_base_retrieve to search for authoritative, source-attributable information or documents. " +
              "This knowledge base is always relevant to the user and any organizations they're affiliated with. " +
              "You may call this tool with ambiguous queries to retrieve relevant context before asking the user for further clarification. " +
              (base.description
                ? `If a Knowledge Base Description is provided, use it to understand what content is included/excluded and to scope your retrieval. ${base.description}`
                : ""),
            inputSchema: {
              type: "object",
              properties: {
                query_variants: {
                  type: "array",
                  items: { type: "string", maxLength: 150 },
                  minItems: 1,
                  maxItems: 3,
                  description:
                    "1 to 3 search queries. Each query: max 150 characters; under 12 words. Cover distinct retrieval goals and alternate evidence wording. Do not add duplicates that only reorder terms.\n\n" +
                    'Always return a JSON array of strings, even when issuing a single query. Example: {"query_variants": ["contoso fiscal year 2024 revenue"]}.',
                },
              },
              required: ["query_variants"],
              additionalProperties: false,
            },
            execution: { taskSupport: "optional" },
            _meta: {
              generateCitations: true,
              KnowledgeSourceMetadata: sources.map((source) => ({
                name: source.name,
                type: activityTypeFor(source),
              })),
            },
          },
        ],
      });
    }

    if (method === "tools/call") {
      const params = message.params || {};
      if (params.name !== "knowledge_base_retrieve") {
        return rpcError(message.id, -32602, `Unknown tool "${String(params.name)}"`);
      }
      const args = (params.arguments || {}) as {
        query_variants?: unknown;
        query?: unknown;
      };
      const variants = Array.isArray(args.query_variants)
        ? args.query_variants.map((value) => String(value)).filter(Boolean)
        : typeof args.query === "string"
        ? [args.query]
        : [];
      const cleaned = variants
        .map((value) => value.trim().slice(0, 150))
        .filter(Boolean)
        .slice(0, 3);
      if (cleaned.length === 0) {
        return rpcError(
          message.id,
          -32602,
          "query_variants is required: 1 to 3 strings, each under 150 characters."
        );
      }
      try {
        const result = await retrieve(id, {
          query: cleaned[0],
          subqueries: cleaned,
          includeActivity: true,
        });
        const requestId = crypto.randomUUID();
        const reasoningTokens = Number(
          result.activity.find((entry) => entry.type === "agenticReasoning")
            ?.reasoningTokens || 0
        );
        const content: Record<string, unknown>[] = [
          {
            type: "text",
            // Same as the retrieve response: extractive JSON or answer text,
            // depending on the knowledge base output mode.
            text: result.response[0]?.content?.[0]?.text || "[]",
            _meta: { "x-request-id": requestId },
          },
        ];
        result.citations.forEach((citation, index) => {
          const reference = result.references[index];
          const relative = reference?.citationUrl || citation.uri || null;
          const uri = relative
            ? new URL(relative, req.nextUrl.origin).toString()
            : null;
          content.push({
            type: "text",
            text: JSON.stringify({
              kind: "reference",
              ref_id: Number(citation.refId),
              uri,
              mimeType: "application/json",
              sourceData: {
                uid: citation.chunkId,
                snippet: citation.excerpt,
                metadata_storage_path: citation.title,
              },
            }),
            _meta: {
              "x-request-id": requestId,
              title: citation.title,
              preserveExactValue: false,
            },
          });
        });
        return rpcResult(message.id, {
          content,
          _meta: { agenticReasoningTokens: reasoningTokens },
        });
      } catch (error) {
        const text = error instanceof Error ? error.message : String(error);
        return rpcResult(message.id, {
          content: [{ type: "text", text: JSON.stringify({ error: text }) }],
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

  // Notifications only: acknowledge without a body, per streamable HTTP.
  if (responses.length === 0) {
    return new NextResponse(null, {
      status: 202,
      headers: { "mcp-protocol-version": PROTOCOL_VERSION },
    });
  }

  return NextResponse.json(Array.isArray(body) ? responses : responses[0], {
    headers: {
      "mcp-protocol-version": PROTOCOL_VERSION,
      "cache-control": "no-store",
    },
  });
}

export async function GET() {
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
