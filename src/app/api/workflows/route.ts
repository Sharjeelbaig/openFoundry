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
import { Workflow, WorkflowStep } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function load(): Promise<Workflow[]> {
  return readJson<Workflow[]>("workflows.json", []);
}

async function save(workflows: Workflow[]): Promise<void> {
  await writeJson("workflows.json", workflows);
}

export async function GET() {
  return NextResponse.json({ workflows: await load() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    steps?: WorkflowStep[];
  };
  if (!body.name || !body.steps?.length)
    return NextResponse.json({ error: "name and steps are required" }, { status: 400 });
  const workflows = await load();
  const workflow: Workflow = {
    id: newId("workflow"),
    name: body.name,
    description: body.description || "",
    steps: body.steps,
    createdAt: nowIso(),
    runs: [],
  };
  workflows.unshift(workflow);
  await save(workflows);
  return NextResponse.json({ workflow }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "run" | "delete";
  };
  const workflows = await load();
  const workflow = workflows.find((item) => item.id === body.id);
  if (!workflow)
    return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
  if (body.action === "delete") {
    await save(workflows.filter((item) => item.id !== workflow.id));
    return NextResponse.json({ ok: true });
  }

  const output: string[] = [];
  let previous = "";
  for (const step of workflow.steps) {
    const agent = await getAgent(step.agentId);
    if (!agent) {
      output.push(`Missing agent: ${step.agentId}`);
      continue;
    }
    const started = Date.now();
    const prompt = previous
      ? `${step.prompt}\n\nPrevious step output:\n${previous}`
      : step.prompt;
    try {
      const result = await completeChat({
        model: agent.model,
        provider: agent.provider,
        messages: [
          { role: "system", content: agent.instructions },
          { role: "user", content: prompt },
        ],
        temperature: agent.temperature,
        topP: agent.topP,
        maxTokens: agent.maxTokens,
      });
      output.push(result.text);
      previous = result.text;
      await appendTrace({
        id: newId("trace"),
        agentId: agent.id,
        agentName: agent.name,
        prompt,
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
      output.push(
        `Step failed: ${error instanceof Error ? error.message : "unknown error"}`
      );
      break;
    }
  }
  workflow.lastRunAt = nowIso();
  workflow.runs.unshift({ at: nowIso(), output });
  workflow.runs = workflow.runs.slice(0, 10);
  await save(workflows);
  return NextResponse.json({ workflow });
}
