import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  getHttpTools,
  nowIso,
  saveAgents,
  saveHttpTools,
} from "@/lib/store";
import { HttpTool } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

function cleanHeaders(value: unknown): Record<string, string> | undefined {
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
    description?: string;
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
    inputSchema?: Record<string, unknown>;
  };
  const tools = await getHttpTools();
  const index = tools.findIndex((item) => item.id === id);
  if (index < 0)
    return NextResponse.json({ error: "HTTP tool not found" }, { status: 404 });
  const current = tools[index];
  const name = body.name?.trim() || current.name;
  if (
    tools.some(
      (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase()
    )
  )
    return NextResponse.json(
      { error: `An HTTP tool named "${name}" already exists.` },
      { status: 409 }
    );
  const method = (body.method || current.method).toUpperCase();
  if (!["GET", "POST", "PUT", "PATCH", "DELETE"].includes(method))
    return NextResponse.json({ error: "Unsupported HTTP method." }, { status: 400 });
  const updated: HttpTool = {
    ...current,
    name,
    description:
      body.description !== undefined
        ? body.description.trim() || current.description
        : current.description,
    method: method as HttpTool["method"],
    url: body.url !== undefined ? body.url.trim() || current.url : current.url,
    headers:
      body.headers !== undefined ? cleanHeaders(body.headers) : current.headers,
    bodyTemplate:
      body.bodyTemplate !== undefined
        ? body.bodyTemplate.trim() || undefined
        : current.bodyTemplate,
    inputSchema:
      body.inputSchema &&
      typeof body.inputSchema === "object" &&
      !Array.isArray(body.inputSchema)
        ? body.inputSchema
        : current.inputSchema,
    updatedAt: nowIso(),
  };
  tools[index] = updated;
  await saveHttpTools(tools);
  return NextResponse.json({ tool: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const tools = await getHttpTools();
  if (!tools.some((item) => item.id === id))
    return NextResponse.json({ error: "HTTP tool not found" }, { status: 404 });
  await saveHttpTools(tools.filter((item) => item.id !== id));

  const prefix = `http:${id}`;
  const agents = await getAgents();
  let changed = false;
  for (const agent of agents) {
    const next = agent.tools.filter((tool) => tool !== prefix);
    if (next.length !== agent.tools.length) {
      agent.tools = next;
      agent.updatedAt = nowIso();
      changed = true;
    }
  }
  if (changed) await saveAgents(agents);
  return NextResponse.json({ ok: true, detached: changed });
}
