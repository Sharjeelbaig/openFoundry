// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getMcpServers, nowIso, saveMcpServers } from "@/lib/store";
import { callMcpTool } from "@/lib/mcp";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    tool?: string;
    arguments?: unknown;
  };
  const tool = body.tool?.trim();
  if (!tool)
    return NextResponse.json({ error: "tool is required" }, { status: 400 });
  let args: Record<string, unknown> = {};
  if (typeof body.arguments === "string") {
    try {
      const parsed = JSON.parse(body.arguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("arguments must be a JSON object");
      args = parsed as Record<string, unknown>;
    } catch (error) {
      return NextResponse.json(
        {
          error: `Invalid JSON arguments: ${
            error instanceof Error ? error.message : "parse failed"
          }`,
        },
        { status: 400 }
      );
    }
  } else if (body.arguments && typeof body.arguments === "object") {
    if (Array.isArray(body.arguments))
      return NextResponse.json(
        { error: "arguments must be a JSON object" },
        { status: 400 }
      );
    args = body.arguments as Record<string, unknown>;
  }

  const servers = await getMcpServers();
  const index = servers.findIndex((item) => item.id === id);
  if (index < 0)
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  const server = servers[index];

  const started = Date.now();
  try {
    const result = await callMcpTool(server, tool, args);
    if (server.status !== "Connected") {
      servers[index] = {
        ...server,
        status: "Connected",
        error: undefined,
        updatedAt: nowIso(),
      };
      await saveMcpServers(servers);
    }
    return NextResponse.json({
      ...result,
      latencyMs: Date.now() - started,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MCP call failed.";
    servers[index] = {
      ...server,
      status: "Error",
      error: message,
      updatedAt: nowIso(),
    };
    await saveMcpServers(servers);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
