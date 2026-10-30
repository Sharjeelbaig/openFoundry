import { NextRequest, NextResponse } from "next/server";
import { completeChat } from "@/lib/chat";
import {
  appendTrace,
  getAgent,
  newId,
  nowIso,
  readJson,
  writeJson,
} from "@/lib/store";
import { Routine } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(): Promise<Routine[]> {
  return readJson<Routine[]>("routines.json", []);
}

async function save(routines: Routine[]): Promise<void> {
  await writeJson("routines.json", routines);
}

export async function GET() {
  const routines = await load();
  // Fire due routines lazily so schedules work without a separate daemon.
  const due = routines.filter(
    (routine) => routine.enabled && new Date(routine.nextRunAt).getTime() <= Date.now()
  );
  for (const routine of due) {
    await runRoutine(routine, routines);
  }
  return NextResponse.json({ routines: await load() });
}

async function runRoutine(routine: Routine, all: Routine[]) {
  const agent = await getAgent(routine.agentId);
  const now = Date.now();
  try {
    if (!agent) throw new Error("Agent not found");
    const started = Date.now();
    const result = await completeChat({
      model: agent.model,
      provider: agent.provider,
      messages: [
        { role: "system", content: agent.instructions },
        { role: "user", content: routine.prompt },
      ],
      temperature: agent.temperature,
      topP: agent.topP,
      maxTokens: agent.maxTokens,
    });
    routine.lastResult = result.text;
    routine.lastRunAt = nowIso();
    await appendTrace({
      id: newId("trace"),
      agentId: agent.id,
      agentName: agent.name,
      prompt: routine.prompt,
      response: result.text,
      model: agent.model,
      provider: agent.provider,
      latencyMs: Date.now() - started,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      citations: [],
      at: nowIso(),
    });
  } catch (error) {
    routine.lastResult = `Run failed: ${
      error instanceof Error ? error.message : "unknown error"
    }`;
    routine.lastRunAt = nowIso();
  }
  routine.nextRunAt = new Date(
    now + routine.intervalMinutes * 60_000
  ).toISOString();
  await save(all);
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<Routine>;
  if (!body.name || !body.agentId || !body.prompt)
    return NextResponse.json(
      { error: "name, agentId and prompt are required" },
      { status: 400 }
    );
  const routines = await load();
  const routine: Routine = {
    id: newId("routine"),
    name: body.name,
    agentId: body.agentId,
    prompt: body.prompt,
    intervalMinutes: body.intervalMinutes || 60,
    enabled: true,
    createdAt: nowIso(),
    nextRunAt: new Date(
      Date.now() + (body.intervalMinutes || 60) * 60_000
    ).toISOString(),
  };
  routines.unshift(routine);
  await save(routines);
  return NextResponse.json({ routine }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "run" | "toggle" | "delete";
  };
  const routines = await load();
  const routine = routines.find((item) => item.id === body.id);
  if (!routine)
    return NextResponse.json({ error: "Routine not found" }, { status: 404 });
  if (body.action === "delete") {
    await save(routines.filter((item) => item.id !== routine.id));
    return NextResponse.json({ ok: true });
  }
  if (body.action === "toggle") {
    routine.enabled = !routine.enabled;
    routine.nextRunAt = new Date(
      Date.now() + routine.intervalMinutes * 60_000
    ).toISOString();
    await save(routines);
    return NextResponse.json({ routine });
  }
  await runRoutine(routine, routines);
  return NextResponse.json({ routine });
}
