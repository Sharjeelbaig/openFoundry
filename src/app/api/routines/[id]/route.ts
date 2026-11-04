// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getAgent, nowIso } from "@/lib/store";
import type { Routine } from "@/lib/types";
import {
  getRoutine,
  getRoutineRuns,
  mutateRoutineRuns,
  mutateRoutines,
} from "@/lib/routines/store";
import { normalizeName, validateTrigger } from "@/lib/routines/validate";
import { initialNextRun } from "@/lib/routines/validate";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const routine = await getRoutine(id);
  if (!routine)
    return NextResponse.json({ error: "Routine not found." }, { status: 404 });
  return NextResponse.json({
    routine,
    runs: await getRoutineRuns(routine.id),
  });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    agentId?: string;
    prompt?: string;
    trigger?: unknown;
    enabled?: boolean;
  };

  const current = await getRoutine(id);
  if (!current)
    return NextResponse.json({ error: "Routine not found." }, { status: 404 });

  let trigger = current.trigger;
  let nextRunAt = current.nextRunAt;
  if (body.trigger !== undefined) {
    const validation = validateTrigger(body.trigger);
    if (!validation.trigger)
      return NextResponse.json(
        { error: validation.error || "Invalid trigger." },
        { status: 400 }
      );
    trigger = validation.trigger;
    nextRunAt = validation.nextRunAt;
  }

  if (body.agentId !== undefined) {
    const agent = await getAgent(body.agentId);
    if (!agent)
      return NextResponse.json({ error: "Agent not found." }, { status: 400 });
  }

  const requestedName = body.name !== undefined ? normalizeName(body.name) : null;
  if (requestedName !== null && !requestedName)
    return NextResponse.json({ error: "Enter a routine name." }, { status: 400 });

  try {
    let updated: Routine | undefined;
    await mutateRoutines((routines) => {
      const routine = routines.find((item) => item.id === id);
      if (!routine) return;
      if (requestedName !== null) {
        if (
          routines.some(
            (item) =>
              item.id !== id &&
              item.name.toLowerCase() === requestedName.toLowerCase()
          )
        ) {
          throw new Error(`A routine named "${requestedName}" already exists.`);
        }
        routine.name = requestedName;
      }
      if (body.description !== undefined)
        routine.description = String(body.description).trim() || undefined;
      if (body.agentId !== undefined) routine.agentId = body.agentId;
      if (body.prompt !== undefined) {
        const prompt = String(body.prompt).trim();
        if (!prompt) throw new Error("Enter a prompt.");
        routine.prompt = prompt;
      }
      routine.trigger = trigger;
      routine.nextRunAt = nextRunAt;
      if (body.enabled !== undefined) {
        routine.enabled = Boolean(body.enabled);
        if (routine.enabled && !routine.nextRunAt) {
          const next = initialNextRun(routine.trigger);
          routine.nextRunAt = next;
          if (!next && routine.trigger.type === "timer") {
            throw new Error("This one-time schedule is in the past.");
          }
        }
      }
      routine.updatedAt = nowIso();
      updated = routine;
    });
    if (!updated)
      return NextResponse.json({ error: "Routine not found." }, { status: 404 });
    return NextResponse.json({ routine: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not update routine.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  let existed = false;
  await mutateRoutines((routines) => {
    const next = routines.filter((routine) => routine.id !== id);
    existed = next.length !== routines.length;
    routines.splice(0, routines.length, ...next);
  });
  if (!existed)
    return NextResponse.json({ error: "Routine not found." }, { status: 404 });
  await mutateRoutineRuns((runs) => {
    const next = runs.filter((run) => run.routineId !== id);
    runs.splice(0, runs.length, ...next);
  });
  return NextResponse.json({ ok: true });
}
