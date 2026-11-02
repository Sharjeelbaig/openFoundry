import "server-only";
import { completeChat } from "@/lib/chat";
import { appendTrace, getAgent, newId, nowIso } from "@/lib/store";
import type { Routine, RoutineRun } from "@/lib/types";
import {
  enqueueRoutineRun,
  getRoutine,
  getRoutineRuns,
  setRoutineLastRun,
  updateRoutineRun,
} from "./store";

let processing = false;

function eventSuffix(payload: unknown): string {
  if (payload === undefined) return "";
  let body: string;
  try {
    body = JSON.stringify(payload, null, 2);
  } catch {
    body = String(payload);
  }
  return `\n\nEvent payload:\n${body}`;
}

export async function dispatchRoutine(
  routine: Routine,
  source: RoutineRun["source"],
  payload?: unknown
): Promise<RoutineRun> {
  const prompt = `${routine.prompt}${eventSuffix(payload)}`;
  const run = await enqueueRoutineRun({ routine, source, prompt });
  void processRoutineQueue();
  return run;
}

async function executeRun(run: RoutineRun): Promise<void> {
  const started = Date.now();
  await updateRoutineRun(run.id, {
    status: "running",
    startedAt: nowIso(),
    attempts: run.attempts + 1,
  });

  const routine = await getRoutine(run.routineId);
  if (!routine) {
    const endedAt = nowIso();
    await updateRoutineRun(run.id, {
      status: "failed",
      endedAt,
      durationMs: Date.now() - started,
      error: "The routine no longer exists.",
    });
    return;
  }

  const agent = await getAgent(routine.agentId);
  if (!agent) {
    const endedAt = nowIso();
    await updateRoutineRun(run.id, {
      status: "failed",
      endedAt,
      durationMs: Date.now() - started,
      error: "The selected agent no longer exists.",
    });
    return;
  }

  const traceId = newId("trace");
  try {
    const result = await completeChat({
      model: agent.model,
      provider: agent.provider,
      messages: [
        { role: "system", content: agent.instructions },
        { role: "user", content: run.input },
      ],
      temperature: agent.temperature,
      topP: agent.topP,
      maxTokens: agent.maxTokens,
    });
    const endedAt = nowIso();
    const durationMs = Date.now() - started;
    await updateRoutineRun(run.id, {
      status: "completed",
      endedAt,
      durationMs,
      output: result.text,
      responseId: traceId,
      traceId,
    });
    await appendTrace({
      id: traceId,
      agentId: agent.id,
      agentName: agent.name,
      prompt: run.input,
      response: result.text,
      model: agent.model,
      provider: agent.provider,
      latencyMs: durationMs,
      promptTokens: result.promptTokens,
      completionTokens: result.completionTokens,
      citations: [],
      at: endedAt,
    });
    await setRoutineLastRun(routine.id, {
      lastRunAt: endedAt,
      lastRunId: run.id,
    });
  } catch (error) {
    const endedAt = nowIso();
    const message =
      error instanceof Error ? error.message : "The local model call failed.";
    await updateRoutineRun(run.id, {
      status: "failed",
      endedAt,
      durationMs: Date.now() - started,
      error: message,
    });
    await appendTrace({
      id: traceId,
      agentId: agent.id,
      agentName: agent.name,
      prompt: run.input,
      response: "",
      model: agent.model,
      provider: agent.provider,
      latencyMs: Date.now() - started,
      promptTokens: 0,
      completionTokens: 0,
      citations: [],
      at: endedAt,
      error: message,
    });
  }
}

/**
 * Runs queued routines one at a time. Local model runtimes generally serve one
 * generation well; serialising here keeps two due routines from competing for
 * the same GPU.
 */
export async function processRoutineQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    for (;;) {
      const runs = await getRoutineRuns();
      const next = [...runs]
        .reverse()
        .find((run) => run.status === "queued");
      if (!next) break;
      await executeRun(next);
    }
  } finally {
    processing = false;
  }
}

export async function recoverInterruptedRuns(): Promise<void> {
  const runs = await getRoutineRuns();
  for (const run of runs) {
    if (run.status === "running") {
      await updateRoutineRun(run.id, {
        status: "failed",
        endedAt: nowIso(),
        error: "openFoundry stopped before this run finished.",
      });
    }
  }
}
