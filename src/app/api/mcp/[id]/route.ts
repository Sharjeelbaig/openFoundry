import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  getMcpServers,
  nowIso,
  saveAgents,
  saveMcpServers,
} from "@/lib/store";
import { probeMcpServer } from "@/lib/mcp";
import { McpServer } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

function cleanRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string")
    .map(([key, item]) => [key.trim(), (item as string).trim()])
    .filter(([key]) => Boolean(key));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    command?: string;
    args?: string[] | string;
    env?: Record<string, string>;
    url?: string;
    headers?: Record<string, string>;
    action?: "refresh";
  };
  const servers = await getMcpServers();
  const index = servers.findIndex((item) => item.id === id);
  if (index < 0)
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  const current = servers[index];

  if (body.action === "refresh") {
    const probed = await probeMcpServer(current);
    servers[index] = probed;
    await saveMcpServers(servers);
    return NextResponse.json({ server: probed });
  }

  const name = body.name?.trim();
  if (name && servers.some((item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase()))
    return NextResponse.json(
      { error: `An MCP server named "${name}" already exists.` },
      { status: 409 }
    );

  const args = Array.isArray(body.args)
    ? body.args.map((item) => String(item)).filter(Boolean)
    : typeof body.args === "string"
    ? body.args
        .split(/\r?\n/)
        .map((item) => item.trim())
        .filter(Boolean)
    : current.args;

  const updated: McpServer = {
    ...current,
    name: name || current.name,
    command:
      body.command !== undefined ? body.command.trim() || undefined : current.command,
    args,
    env: body.env !== undefined ? cleanRecord(body.env) : current.env,
    url: body.url !== undefined ? body.url.trim() || undefined : current.url,
    headers:
      body.headers !== undefined ? cleanRecord(body.headers) : current.headers,
    updatedAt: nowIso(),
  };

  if (updated.transport === "stdio" && !updated.command)
    return NextResponse.json(
      { error: "A stdio server needs a command." },
      { status: 400 }
    );
  if (updated.transport === "http" && !updated.url)
    return NextResponse.json(
      { error: "An HTTP server needs a URL." },
      { status: 400 }
    );

  const probed = await probeMcpServer(updated);
  servers[index] = probed;
  await saveMcpServers(servers);
  return NextResponse.json({ server: probed });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const servers = await getMcpServers();
  if (!servers.some((item) => item.id === id))
    return NextResponse.json({ error: "MCP server not found" }, { status: 404 });
  await saveMcpServers(servers.filter((item) => item.id !== id));

  // Remove the server's tool ids from agents so a deleted server does not leave
  // dead references in the builder or the chat prompt.
  const prefix = `mcp:${id}:`;
  const agents = await getAgents();
  let changed = false;
  for (const agent of agents) {
    const next = agent.tools.filter((tool) => !tool.startsWith(prefix));
    if (next.length !== agent.tools.length) {
      agent.tools = next;
      agent.updatedAt = nowIso();
      changed = true;
    }
  }
  if (changed) await saveAgents(agents);
  return NextResponse.json({ ok: true, detached: changed });
}
