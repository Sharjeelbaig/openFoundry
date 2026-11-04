// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  getAgents,
  getLocalSkills,
  getToolboxes,
  nowIso,
  saveAgents,
  saveLocalSkills,
  saveToolboxes,
} from "@/lib/store";
import { LocalSkill } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    instructions?: string;
  };
  const skills = await getLocalSkills();
  const index = skills.findIndex((skill) => skill.id === id);
  if (index < 0)
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  const current = skills[index];
  const name = body.name?.trim() || current.name;
  if (
    skills.some(
      (skill) => skill.id !== id && skill.name.toLowerCase() === name.toLowerCase()
    )
  )
    return NextResponse.json(
      { error: `A skill named "${name}" already exists.` },
      { status: 409 }
    );
  const updated: LocalSkill = {
    ...current,
    name,
    description:
      body.description !== undefined
        ? body.description.trim()
        : current.description,
    instructions:
      body.instructions !== undefined
        ? body.instructions.trim()
        : current.instructions,
    updatedAt: nowIso(),
  };
  skills[index] = updated;
  await saveLocalSkills(skills);
  return NextResponse.json({ skill: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const skills = await getLocalSkills();
  if (!skills.some((skill) => skill.id === id))
    return NextResponse.json({ error: "Skill not found" }, { status: 404 });
  await saveLocalSkills(skills.filter((skill) => skill.id !== id));

  const toolId = `skill:local:${id}`;
  const agents = await getAgents();
  let agentsChanged = false;
  for (const agent of agents) {
    const next = agent.tools.filter((tool) => tool !== toolId);
    if (next.length !== agent.tools.length) {
      agent.tools = next;
      agent.updatedAt = nowIso();
      agentsChanged = true;
    }
  }
  if (agentsChanged) await saveAgents(agents);

  const toolboxes = await getToolboxes();
  let toolboxesChanged = false;
  for (const toolbox of toolboxes) {
    const next = toolbox.toolIds.filter((tool) => tool !== toolId);
    if (next.length !== toolbox.toolIds.length) {
      toolbox.toolIds = next;
      toolbox.updatedAt = nowIso();
      toolbox.version = (toolbox.version || 1) + 1;
      toolboxesChanged = true;
    }
  }
  if (toolboxesChanged) await saveToolboxes(toolboxes);
  return NextResponse.json({
    ok: true,
    detached: agentsChanged,
    toolboxesUpdated: toolboxesChanged,
  });
}
