export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.OPENFOUNDRY_DISABLE_SCHEDULER === "1") return;
  const [{ startRoutineScheduler }, workflows] = await Promise.all([
    import("./lib/routines/scheduler"),
    import("./lib/workflows/store"),
  ]);
  await workflows.recoverInterruptedWorkflowRuns();
  startRoutineScheduler();
}
