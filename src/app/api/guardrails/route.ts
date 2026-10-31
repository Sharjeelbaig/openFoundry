import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  getBlocklists,
  getDeployments,
  getGuardrails,
  newId,
  nowIso,
  saveAgents,
  saveBlocklists,
  saveGuardrails,
} from "@/lib/store";
import { Blocklist, Guardrail, GuardrailControl } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [guardrails, blocklists, agents, deployments] = await Promise.all([
    getGuardrails(),
    getBlocklists(),
    getAgents(),
    getDeployments(),
  ]);
  return NextResponse.json({ guardrails, blocklists, agents, deployments });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    streamingMode?: Guardrail["streamingMode"];
    controls?: GuardrailControl[];
    agents?: string[];
    deployments?: string[];
    blocklistId?: string;
    terms?: string[];
  };

  const guardrails = await getGuardrails();

  if (body.action === "create" || (!body.action && body.name)) {
    const name = (body.name || "guardrail").trim();
    if (guardrails.some((guardrail) => guardrail.name === name))
      return NextResponse.json(
        { error: `A guardrail named “${name}” already exists.` },
        { status: 409 }
      );
    if (!body.controls?.length)
      return NextResponse.json(
        { error: "Select at least one control for the guardrail." },
        { status: 400 }
      );
    const guardrail: Guardrail = {
      id: newId("guardrail"),
      name,
      streamingMode: body.streamingMode || "Default",
      controls: body.controls,
      agents: body.agents || [],
      deployments: body.deployments || [],
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    guardrails.push(guardrail);
    await saveGuardrails(guardrails);
    if (guardrail.agents.length) await applyToAgents(guardrail);
    return NextResponse.json({ guardrail }, { status: 201 });
  }

  const guardrail = guardrails.find((entry) => entry.id === body.id);
  if (!guardrail)
    return NextResponse.json({ error: "Guardrail not found" }, { status: 404 });

  if (body.action === "update") {
    if (body.controls) guardrail.controls = body.controls;
    if (body.streamingMode) guardrail.streamingMode = body.streamingMode;
    if (body.agents) guardrail.agents = body.agents;
    if (body.deployments) guardrail.deployments = body.deployments;
    guardrail.updatedAt = nowIso();
    await saveGuardrails(guardrails);
    await applyToAgents(guardrail);
    return NextResponse.json({ guardrail });
  }

  if (body.action === "delete") {
    if (guardrail.builtIn)
      return NextResponse.json(
        { error: "Built-in guardrails cannot be deleted." },
        { status: 400 }
      );
    await saveGuardrails(guardrails.filter((entry) => entry.id !== guardrail.id));
    return NextResponse.json({ ok: true });
  }

  if (body.action === "createBlocklist") {
    const blocklists = await getBlocklists();
    const name = (body.name || "blocklist").trim();
    const blocklist: Blocklist = {
      id: newId("blocklist"),
      name,
      terms: body.terms || [],
      createdAt: nowIso(),
    };
    blocklists.push(blocklist);
    await saveBlocklists(blocklists);
    return NextResponse.json({ blocklist }, { status: 201 });
  }

  if (body.action === "deleteBlocklist") {
    const blocklists = await getBlocklists();
    const target = blocklists.find((entry) => entry.id === body.blocklistId);
    if (target?.builtIn)
      return NextResponse.json(
        { error: "The built-in Profanity blocklist cannot be deleted." },
        { status: 400 }
      );
    await saveBlocklists(blocklists.filter((entry) => entry.id !== body.blocklistId));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

async function applyToAgents(guardrail: Guardrail) {
  const agents = await getAgents();
  let changed = false;
  const next = agents.map((agent) => {
    const shouldHave = guardrail.agents.includes(agent.id);
    if (shouldHave && agent.guardrailId !== guardrail.id) {
      changed = true;
      return { ...agent, guardrailId: guardrail.id, updatedAt: nowIso() };
    }
    if (!shouldHave && agent.guardrailId === guardrail.id) {
      changed = true;
      return { ...agent, guardrailId: undefined, updatedAt: nowIso() };
    }
    return agent;
  });
  if (changed) await saveAgents(next);
}
