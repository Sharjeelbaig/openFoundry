// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { may } from "@/lib/directory/redact";
import { getHttpTools, newId, nowIso, saveHttpTools } from "@/lib/store";
import { HttpTool } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

function cleanHeaders(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => typeof item === "string")
    .map(([key, item]) => [key.trim(), (item as string).trim()])
    .filter(([key]) => Boolean(key));
  return entries.length ? Object.fromEntries(entries) : undefined;
}

function cleanSchema(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    const schema = value as Record<string, unknown>;
    if (schema.type === "object") return schema;
  }
  return { type: "object", properties: {} };
}

export async function GET() {
  const [tools, canInvoke] = await Promise.all([
    getHttpTools(),
    may("tools.invoke"),
  ]);
  return NextResponse.json({
    tools: canInvoke
      ? tools
      : tools.map((tool) => ({ ...tool, headers: {}, bodyTemplate: "" })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    method?: string;
    url?: string;
    headers?: Record<string, string>;
    bodyTemplate?: string;
    inputSchema?: Record<string, unknown>;
  };
  const name = body.name?.trim();
  if (!name) return NextResponse.json({ error: "name is required" }, { status: 400 });
  const method = (body.method || "GET").toUpperCase();
  if (!METHODS.includes(method as (typeof METHODS)[number]))
    return NextResponse.json({ error: "Unsupported HTTP method." }, { status: 400 });
  const url = body.url?.trim();
  if (!url) return NextResponse.json({ error: "url is required" }, { status: 400 });
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:")
      throw new Error("bad protocol");
  } catch {
    return NextResponse.json(
      { error: "Enter a valid http(s) URL." },
      { status: 400 }
    );
  }
  const tools = await getHttpTools();
  if (tools.some((item) => item.name.toLowerCase() === name.toLowerCase()))
    return NextResponse.json(
      { error: `An HTTP tool named "${name}" already exists.` },
      { status: 409 }
    );
  const tool: HttpTool = {
    id: newId("http"),
    name,
    description: body.description?.trim() || `Call ${method} ${url}`,
    method: method as HttpTool["method"],
    url,
    headers: cleanHeaders(body.headers),
    bodyTemplate: body.bodyTemplate?.trim() || undefined,
    inputSchema: cleanSchema(body.inputSchema),
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  tools.unshift(tool);
  await saveHttpTools(tools);
  return NextResponse.json({ tool }, { status: 201 });
}
