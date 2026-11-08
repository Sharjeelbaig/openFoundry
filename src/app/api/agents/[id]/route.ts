// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { snapshotVersion, versionChanged } from "@/lib/agent-version";
import {
  getAgents,
  nowIso,
  readJson,
  saveAgents,
  writeJson,
} from "@/lib/store";
import { Agent, Routine, Workflow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agents = await getAgents();
  const agent = agents.find((item) => item.id === id);
  if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  agent.lastViewedAt = nowIso();
  await saveAgents(agents);
  return NextResponse.json({ agent });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as Partial<Agent> & {
    action?: "save" | "publish" | "stop" | "touch";
  };
  const agents = await getAgents();
  const index = agents.findIndex((item) => item.id === id);
  if (index < 0)
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  const agent = agents[index];
  const now = nowIso();

  if (body.action === "publish") {
    // "Publish new version" promises a new version, so it always cuts one from
    // the current configuration rather than only flipping the status (OS-25).
    agent.version += 1;
    agent.history.unshift(snapshotVersion(agent, now, agent.version));
    agent.history = agent.history.slice(0, 30);
    agent.status = "Running";
    agent.publishedAt = now;
    agent.updatedAt = now;
    agent.lastViewedAt = now;
  } else if (body.action === "stop") {
    agent.status = "Stopped";
    agent.updatedAt = now;
  } else if (body.action === "touch") {
    agent.lastViewedAt = now;
  } else {
    // Snapshot the behavioural configuration before the edit so a change to
    // tools, knowledge, memory or guardrails cuts a version too, not just
    // instructions/model/temperature (OS-25).
    const before = snapshotVersion(agent, now, agent.version);

    const allowed: (keyof Agent)[] = [
      "name",
      "description",
      "model",
      "provider",
      "instructions",
      "temperature",
      "topP",
      "maxTokens",
      "voiceMode",
      "memoryEnabled",
      "memoryStoreId",
      "guardrail",
      "guardrailId",
      "tools",
      "knowledgeBaseIds",
    ];
    for (const field of allowed) {
      if (body[field] !== undefined) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (agent as any)[field] = body[field];
      }
    }
    agent.updatedAt = now;
    agent.lastViewedAt = now;
    if (versionChanged(before, agent)) {
      agent.version += 1;
      agent.history.unshift(snapshotVersion(agent, now, agent.version));
      agent.history = agent.history.slice(0, 30);
      if (agent.status === "Draft") agent.status = "Running";
    }
  }

  await saveAgents(agents);
  return NextResponse.json({ agent });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agents = await getAgents();
  const next = agents.filter((item) => item.id !== id);
  if (next.length === agents.length)
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  await saveAgents(next);

  const [routines, workflows, routineRuns] = await Promise.all([
    readJson<Routine[]>("routines.json", []),
    readJson<Workflow[]>("workflows.json", []),
    readJson<{ routineId: string }[]>("routine-runs.json", []),
  ]);
  const removedRoutineIds = new Set(
    routines.filter((routine) => routine.agentId === id).map((routine) => routine.id)
  );
  if (removedRoutineIds.size) {
    await writeJson(
      "routines.json",
      routines.filter((routine) => routine.agentId !== id)
    );
    await writeJson(
      "routine-runs.json",
      routineRuns.filter((run) => !removedRoutineIds.has(run.routineId))
    );
  }

  const hadWorkflowReference = workflows.some((workflow) =>
    workflow.nodes.some(
      (node) => node.type === "agent" && node.data?.agentId === id
    )
  );
  if (hadWorkflowReference) {
    const nextWorkflows = workflows.map((workflow) => ({
      ...workflow,
      nodes: workflow.nodes.map((node) =>
        node.type === "agent" && node.data?.agentId === id
          ? {
              ...node,
              data: {
                ...node.data,
                agentId: "",
                agentName: "",
              },
            }
          : node
      ),
      updatedAt: new Date().toISOString(),
    }));
    await writeJson("workflows.json", nextWorkflows);
  }

  return NextResponse.json({ ok: true });
}
