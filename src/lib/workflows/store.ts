// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { readJson, writeJson } from "@/lib/store";
import type { Workflow, WorkflowRun } from "@/lib/types";

const WORKFLOWS_FILE = "workflows.json";
const RUNS_FILE = "workflow-runs.json";

const workflowLock = { current: Promise.resolve() as Promise<unknown> };
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

export async function getWorkflows(): Promise<Workflow[]> {
  return readJson<Workflow[]>(WORKFLOWS_FILE, []);
}

export async function getWorkflow(id: string): Promise<Workflow | undefined> {
  return (await getWorkflows()).find((workflow) => workflow.id === id);
}

export async function mutateWorkflows<T>(
  task: (workflows: Workflow[]) => T | Promise<T>
): Promise<T> {
  return serial(workflowLock, async () => {
    const workflows = await getWorkflows();
    const result = await task(workflows);
    await writeJson(WORKFLOWS_FILE, workflows);
    return result;
  });
}

export async function getWorkflowRuns(workflowId?: string): Promise<WorkflowRun[]> {
  const runs = await readJson<WorkflowRun[]>(RUNS_FILE, []);
  const filtered = workflowId
    ? runs.filter((run) => run.workflowId === workflowId)
    : runs;
  return filtered.sort((a, b) => b.queuedAt.localeCompare(a.queuedAt));
}

export async function getWorkflowRun(id: string): Promise<WorkflowRun | undefined> {
  return (await getWorkflowRuns()).find((run) => run.id === id);
}

export async function saveWorkflowRun(run: WorkflowRun): Promise<void> {
  await serial(runLock, async () => {
    const runs = await getWorkflowRuns();
    const index = runs.findIndex((item) => item.id === run.id);
    if (index >= 0) runs[index] = run;
    else runs.unshift(run);
    await writeJson(RUNS_FILE, runs.slice(0, 1000));
  });
}

/** A process restart cannot have a live in-memory execution for these runs. */
export async function recoverInterruptedWorkflowRuns(): Promise<void> {
  const runs = await getWorkflowRuns();
  let changed = false;
  for (const run of runs) {
    if (run.status !== "running") continue;
    run.status = "failed";
    run.error = "openFoundry stopped before this run finished.";
    run.endedAt = new Date().toISOString();
    run.durationMs = new Date(run.endedAt).getTime() - new Date(run.startedAt || run.queuedAt).getTime();
    changed = true;
  }
  if (changed) {
    await serial(runLock, async () => {
      await writeJson(RUNS_FILE, runs.slice(0, 1000));
    });
  }
}
