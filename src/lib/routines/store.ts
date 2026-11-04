// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { newId, nowIso, readJson, writeJson } from "@/lib/store";
import type { Routine, RoutineRun, RoutineRunStatus } from "@/lib/types";

const ROUTINES_FILE = "routines.json";
const RUNS_FILE = "routine-runs.json";
const MAX_RUNS = 2000;

const routineLock = { current: Promise.resolve() as Promise<unknown> };
const runLock = { current: Promise.resolve() as Promise<unknown> };

function serial<T>(
  lock: { current: Promise<unknown> },
  task: () => Promise<T>
): Promise<T> {
  const next = lock.current.then(task, task);
  lock.current = next.then(
    () => undefined,
    () => undefined
  );
  return next;
}

export async function getRoutines(): Promise<Routine[]> {
  return readJson<Routine[]>(ROUTINES_FILE, []);
}

export async function getRoutine(id: string): Promise<Routine | undefined> {
  return (await getRoutines()).find((routine) => routine.id === id);
}

export async function mutateRoutines<T>(
  task: (routines: Routine[]) => T | Promise<T>
): Promise<T> {
  return serial(routineLock, async () => {
    const routines = await getRoutines();
    const result = await task(routines);
    await writeJson(ROUTINES_FILE, routines);
    return result;
  });
}

export async function getRoutineRuns(routineId?: string): Promise<RoutineRun[]> {
  const runs = await readJson<RoutineRun[]>(RUNS_FILE, []);
  const filtered = routineId
    ? runs.filter((run) => run.routineId === routineId)
    : runs;
  return filtered.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}

export async function getRoutineRun(id: string): Promise<RoutineRun | undefined> {
  return (await getRoutineRuns()).find((run) => run.id === id);
}

export async function mutateRoutineRuns<T>(
  task: (runs: RoutineRun[]) => T | Promise<T>
): Promise<T> {
  return serial(runLock, async () => {
    const runs = await getRoutineRuns();
    const result = await task(runs);
    const trimmed = runs
      .sort((a, b) => b.queuedAt.localeCompare(a.queuedAt))
      .slice(0, MAX_RUNS);
    await writeJson(RUNS_FILE, trimmed);
    return result;
  });
}

export async function enqueueRoutineRun(input: {
  routine: Routine;
  source: RoutineRun["source"];
  prompt: string;
}): Promise<RoutineRun> {
  const run: RoutineRun = {
    id: newId("run"),
    routineId: input.routine.id,
    routineName: input.routine.name,
    source: input.source,
    status: "queued",
    queuedAt: nowIso(),
    input: input.prompt,
    attempts: 0,
  };
  await mutateRoutineRuns((runs) => {
    runs.unshift(run);
  });
  await mutateRoutines((routines) => {
    const routine = routines.find((item) => item.id === input.routine.id);
    if (routine) {
      routine.lastRunId = run.id;
      routine.updatedAt = nowIso();
    }
  });
  return run;
}

export async function updateRoutineRun(
  id: string,
  patch: Partial<Pick<
    RoutineRun,
    | "status"
    | "startedAt"
    | "endedAt"
    | "durationMs"
    | "output"
    | "error"
    | "responseId"
    | "traceId"
    | "attempts"
  >>
): Promise<RoutineRun | undefined> {
  return mutateRoutineRuns((runs) => {
    const run = runs.find((item) => item.id === id);
    if (!run) return undefined;
    Object.assign(run, patch);
    return run;
  });
}

export async function setRoutineLastRun(
  routineId: string,
  patch: { lastRunAt?: string; lastRunId?: string; nextRunAt?: string; enabled?: boolean }
): Promise<void> {
  await mutateRoutines((routines) => {
    const routine = routines.find((item) => item.id === routineId);
    if (!routine) return;
    Object.assign(routine, patch, { updatedAt: nowIso() });
  });
}

export function isTerminal(status: RoutineRunStatus): boolean {
  return status === "completed" || status === "failed";
}
