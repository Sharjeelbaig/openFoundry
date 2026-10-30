import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  newId,
  nowIso,
  saveAgents,
} from "@/lib/store";
import { Agent } from "@/lib/types";
import { findModel } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const agents = await getAgents();
  return NextResponse.json({ agents });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Agent>;
  const agents = await getAgents();
  const name =
    (body.name || "new-agent")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "new-agent";
  let unique = name;
  let counter = 2;
  while (agents.some((agent) => agent.id === unique)) {
    unique = `${name}-${counter++}`;
  }
  if (!body.model || !body.provider)
    return NextResponse.json(
      { error: "Choose a discovered model before creating an agent." },
      { status: 400 }
    );
  const selected = await findModel(body.model);
  if (!selected || selected.provider !== body.provider)
    return NextResponse.json(
      {
        error:
          "That model is not present in the local catalog. Refresh Discover → Models and choose again.",
      },
      { status: 400 }
    );
  const now = nowIso();
  const model = selected.id;
  const agent: Agent = {
    id: unique,
    name: unique,
    description: body.description || "",
    model,
    provider: body.provider || "foundry",
    instructions:
      body.instructions ||
      "You are a helpful AI assistant. Answer the user's questions clearly and accurately.",
    temperature: body.temperature ?? 0.7,
    topP: body.topP ?? 0.95,
    maxTokens: body.maxTokens ?? 1024,
    voiceMode: false,
    tools: body.tools || [],
    knowledgeBaseIds: body.knowledgeBaseIds || [],
    status: "Draft",
    version: 1,
    createdAt: now,
    updatedAt: now,
    lastViewedAt: now,
    endpoint: `${req.nextUrl.origin}/api/v1/agents/${unique}`,
    apiKey: `local-${newId("key").slice(-12)}`,
    history: [
      {
        version: 1,
        savedAt: now,
        model,
        instructions:
          body.instructions ||
          "You are a helpful AI assistant. Answer the user's questions clearly and accurately.",
      },
    ],
  };
  agents.push(agent);
  await saveAgents(agents);
  return NextResponse.json({ agent }, { status: 201 });
}
