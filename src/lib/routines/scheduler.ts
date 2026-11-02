import "server-only";
import type { Routine } from "@/lib/types";
import { dispatchRoutine, processRoutineQueue, recoverInterruptedRuns } from "./engine";
import { pollGitHubRoutine } from "./github";
import { nextRunForSchedule } from "./schedule";
import { getRoutines, mutateRoutines } from "./store";

const TICK_MS = 20_000;
const GITHUB_POLL_MS = 60_000;

type SchedulerGlobal = typeof globalThis & {
  __openfoundryRoutineTimer?: ReturnType<typeof setInterval>;
  __openfoundryRoutineTicking?: boolean;
  __openfoundryRoutineRecovered?: boolean;
};

const globalState = globalThis as SchedulerGlobal;

async function markNextRun(routine: Routine, from: Date): Promise<void> {
  if (routine.trigger.type === "schedule") {
    const next = nextRunForSchedule(
      routine.trigger.cron,
      routine.trigger.timeZone,
      from
    );
    await mutateRoutines((routines) => {
      const current = routines.find((item) => item.id === routine.id);
      if (!current) return;
      current.nextRunAt = next?.toISOString();
      current.updatedAt = new Date().toISOString();
    });
  }
}

async function disableTimer(routine: Routine): Promise<void> {
  await mutateRoutines((routines) => {
    const current = routines.find((item) => item.id === routine.id);
    if (!current) return;
    current.enabled = false;
    current.nextRunAt = undefined;
    current.updatedAt = new Date().toISOString();
  });
}

async function tick(): Promise<void> {
  if (globalState.__openfoundryRoutineTicking) return;
  globalState.__openfoundryRoutineTicking = true;
  try {
    if (!globalState.__openfoundryRoutineRecovered) {
      await recoverInterruptedRuns();
      globalState.__openfoundryRoutineRecovered = true;
    }

    const routines = await getRoutines();
    const now = new Date();

    for (const routine of routines) {
      if (!routine.enabled) continue;

      if (routine.trigger.type === "github_issue") {
        const last = routine.trigger.lastPolledAt
          ? new Date(routine.trigger.lastPolledAt).getTime()
          : 0;
        if (now.getTime() - last >= GITHUB_POLL_MS) {
          try {
            await pollGitHubRoutine(routine);
          } catch (error) {
            await mutateRoutines((items) => {
              const current = items.find((item) => item.id === routine.id);
              if (current && current.trigger.type === "github_issue") {
                current.trigger.lastPollError =
                  error instanceof Error ? error.message : "GitHub poll failed.";
                current.trigger.lastPolledAt = new Date().toISOString();
                current.updatedAt = new Date().toISOString();
              }
            });
          }
        }
        continue;
      }

      if (routine.trigger.type === "webhook" || routine.trigger.type === "teams")
        continue;

      const next = routine.nextRunAt ? new Date(routine.nextRunAt) : null;
      if (!next) {
        await markNextRun(routine, now);
        continue;
      }
      if (next.getTime() > now.getTime()) continue;

      await dispatchRoutine(routine, routine.trigger.type);
      if (routine.trigger.type === "timer") {
        await disableTimer(routine);
      } else {
        await markNextRun(routine, now);
      }
    }

    await processRoutineQueue();
  } catch (error) {
    console.error("[routines] scheduler tick failed", error);
  } finally {
    globalState.__openfoundryRoutineTicking = false;
  }
}

export function startRoutineScheduler(): void {
  if (globalState.__openfoundryRoutineTimer) return;
  globalState.__openfoundryRoutineTimer = setInterval(() => {
    void tick();
  }, TICK_MS);
  // Do not keep a short-lived test process alive just for the scheduler.
  if (typeof globalState.__openfoundryRoutineTimer.unref === "function") {
    globalState.__openfoundryRoutineTimer.unref();
  }
  void tick();
}

export function stopRoutineScheduler(): void {
  if (globalState.__openfoundryRoutineTimer) {
    clearInterval(globalState.__openfoundryRoutineTimer);
    globalState.__openfoundryRoutineTimer = undefined;
  }
}

/** Exposed for tests and for an explicit refresh endpoint. */
export async function runSchedulerTick(): Promise<void> {
  await tick();
}
