// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const [{ getDirectory }, { ensureBootstrapToken, ensureMachineKey, hasOwner }] =
    await Promise.all([
      import("./lib/directory/store"),
      import("./lib/directory/bootstrap"),
    ]);
  await ensureMachineKey();

  const directory = await getDirectory();
  if (!hasOwner(directory)) {
    const token = await ensureBootstrapToken();
    if (token) {
      const port = process.env.PORT || "3000";
      console.log(
        [
          "",
          "openFoundry has no owner yet.",
          `Open http://localhost:${port}/setup and enter this one-time token:`,
          "",
          `  ${token}`,
          "",
          "The desktop app signs itself in and never shows this line.",
          "",
        ].join("\n")
      );
    }
  }

  if (process.env.OPENFOUNDRY_DISABLE_SCHEDULER === "1") return;
  const [{ startRoutineScheduler }, workflows] = await Promise.all([
    import("./lib/routines/scheduler"),
    import("./lib/workflows/store"),
  ]);
  await workflows.recoverInterruptedWorkflowRuns();
  startRoutineScheduler();
}
