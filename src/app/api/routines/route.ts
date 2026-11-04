// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getAgent, newId, nowIso } from "@/lib/store";
import type { Routine } from "@/lib/types";
import { getRoutines, mutateRoutines } from "@/lib/routines/store";
import { normalizeName, validateTrigger } from "@/lib/routines/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ routines: await getRoutines() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    agentId?: string;
    prompt?: string;
    trigger?: unknown;
    identity?: "agent" | "creator";
    enabled?: boolean;
  };

  const name = normalizeName(body.name);
  if (!name)
    return NextResponse.json({ error: "Enter a routine name." }, { status: 400 });
  if (!body.agentId)
    return NextResponse.json({ error: "Choose an agent." }, { status: 400 });
  const agent = await getAgent(body.agentId);
  if (!agent)
    return NextResponse.json(
      { error: "That agent is not present in this workspace." },
      { status: 400 }
    );
  const prompt = String(body.prompt || "").trim();
  if (!prompt)
    return NextResponse.json({ error: "Enter a prompt." }, { status: 400 });

  const validation = validateTrigger(body.trigger);
  if (!validation.trigger)
    return NextResponse.json(
      { error: validation.error || "Choose a trigger." },
      { status: 400 }
    );

  const routines = await getRoutines();
  if (
    routines.some((routine) => routine.name.toLowerCase() === name.toLowerCase())
  )
    return NextResponse.json(
      { error: `A routine named "${name}" already exists.` },
      { status: 409 }
    );

  const routine: Routine = {
    id: newId("routine"),
    name,
    description: String(body.description || "").trim() || undefined,
    agentId: agent.id,
    prompt,
    trigger: validation.trigger,
    identity: body.identity === "creator" ? "creator" : "agent",
    enabled: body.enabled !== false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    nextRunAt: validation.nextRunAt,
  };

  await mutateRoutines((items) => {
    items.unshift(routine);
  });

  return NextResponse.json({ routine }, { status: 201 });
}
