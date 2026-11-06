// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { may } from "@/lib/directory/redact";
import {
  getMcpServers,
  newId,
  nowIso,
  saveMcpServers,
} from "@/lib/store";
import { probeMcpServer } from "@/lib/mcp";
import { McpServer, McpTransport } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function cleanRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string")
    .map(([key, item]) => [key.trim(), (item as string).trim()])
    .filter(([key]) => Boolean(key));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export async function GET() {
  const [servers, canInvoke] = await Promise.all([
    getMcpServers(),
    may("tools.invoke"),
  ]);
  return NextResponse.json({
    servers: canInvoke
      ? servers
      : servers.map((server) => ({ ...server, env: {}, headers: {} })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    transport?: McpTransport;
    command?: string;
    args?: string[] | string;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
  };
  const name = body.name?.trim();
  const transport = body.transport;
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  if (transport !== "stdio" && transport !== "http" && transport !== "sse")
    return NextResponse.json(
      { error: 'transport must be "stdio", "http" or "sse"' },
      { status: 400 }
    );
  if (transport === "stdio" && !body.command?.trim())
    return NextResponse.json(
      { error: "A stdio server needs a command." },
      { status: 400 }
    );
  if (transport !== "stdio" && !body.url?.trim())
    return NextResponse.json(
      { error: "An HTTP or SSE server needs a URL." },
      { status: 400 }
    );

  const servers = await getMcpServers();
  if (servers.some((item) => item.name.toLowerCase() === name.toLowerCase()))
    return NextResponse.json(
      { error: `An MCP server named "${name}" already exists.` },
      { status: 409 }
    );

  const args = Array.isArray(body.args)
    ? body.args.map((item) => String(item)).filter((item) => item.length > 0)
    : typeof body.args === "string"
    ? body.args
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : undefined;

  const created: McpServer = {
    id: newId("mcp"),
    name,
    transport,
    command: transport === "stdio" ? body.command?.trim() : undefined,
    args: transport === "stdio" ? args : undefined,
    env: transport === "stdio" ? cleanRecord(body.env) : undefined,
    url: transport === "stdio" ? undefined : body.url?.trim(),
    headers: transport === "stdio" ? undefined : cleanRecord(body.headers),
    status: "Unknown",
    tools: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  // Save first so a slow server never loses the user's configuration, then
  // connect and persist the result. A failed first connection stays visible.
  servers.unshift(created);
  await saveMcpServers(servers);
  const probed = await probeMcpServer(created);
  const latest = await getMcpServers();
  const index = latest.findIndex((item) => item.id === probed.id);
  if (index >= 0) latest[index] = probed;
  await saveMcpServers(latest);
  return NextResponse.json({ server: probed }, { status: 201 });
}
