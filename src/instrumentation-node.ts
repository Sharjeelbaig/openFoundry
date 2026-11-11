// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  // A desktop launch (Finder, Explorer, a desktop entry) inherits a minimal
  // PATH, so Homebrew and per-user installs are invisible to every child
  // process. Normalize it once before anything shells out. The user's own PATH
  // stays first, so explicit overrides still win.
  const { augmentedPath } = await import("./lib/runtime-discovery");
  process.env.PATH = augmentedPath();

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

  if (process.env.OPENFOUNDRY_DISABLE_SCHEDULER !== "1") {
    const [{ startRoutineScheduler }, workflows] = await Promise.all([
      import("./lib/routines/scheduler"),
      import("./lib/workflows/store"),
    ]);
    await workflows.recoverInterruptedWorkflowRuns();
    startRoutineScheduler();
  }

  const { startVoiceWebSocketServer } = await import("./lib/voice-ws-server");
  startVoiceWebSocketServer();
}
