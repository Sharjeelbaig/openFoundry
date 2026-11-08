// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import {
  clearServerPid,
  recordServerPid,
  updateBootState,
} from "./lib/boot-state";

type ShutdownHolder = {
  __openFoundryShutdownHooks?: boolean;
};

/**
 * Stop child processes when the host asks us to exit.
 *
 * The Android host sends SIGTERM before it tears the activity down. Node's
 * default SIGTERM behaviour kills this process only; the bundled
 * `llama-server` would be reparented and keep the model in memory (and port
 * 8080 busy) across launches. Installing a handler lets us stop it first.
 */
function installShutdownHooks(): void {
  const holder = globalThis as unknown as ShutdownHolder;
  if (holder.__openFoundryShutdownHooks) return;
  holder.__openFoundryShutdownHooks = true;

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    console.log(`openFoundry received ${signal}; stopping child processes.`);
    void (async () => {
      try {
        const { stopOnDeviceRuntime } = await import("./lib/llamacpp-runtime");
        await stopOnDeviceRuntime();
        await clearServerPid();
      } catch (error) {
        console.error("openFoundry could not stop the on-device runtime:", error);
      } finally {
        process.exit(0);
      }
    })();
  };

  process.once("SIGTERM", () => stop("SIGTERM"));
  process.once("SIGINT", () => stop("SIGINT"));
}

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  installShutdownHooks();
  updateBootState({ ready: false, error: null });

  const [{ getDirectory }, { ensureBootstrapToken, ensureMachineKey, hasOwner }] =
    await Promise.all([
      import("./lib/directory/store"),
      import("./lib/directory/bootstrap"),
    ]);

  try {
    await ensureMachineKey();
    updateBootState({ machineKeyReady: true });
    await recordServerPid();

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
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("openFoundry could not finish its boot sequence:", error);
    updateBootState({ ready: false, error: message });
    return;
  }

  // From here the install is usable: the health endpoint answers 200 and a
  // shell may open the workspace. Everything below is background work that
  // must not hold the splash.
  updateBootState({ ready: true });

  if (process.env.OPENFOUNDRY_DISABLE_SCHEDULER !== "1") {
    try {
      const [{ startRoutineScheduler }, workflows] = await Promise.all([
        import("./lib/routines/scheduler"),
        import("./lib/workflows/store"),
      ]);
      await workflows.recoverInterruptedWorkflowRuns();
      startRoutineScheduler();
    } catch (error) {
      console.error("openFoundry could not start the routine scheduler:", error);
    }
  }

  try {
    const { startVoiceWebSocketServer } = await import("./lib/voice-ws-server");
    startVoiceWebSocketServer();
  } catch (error) {
    console.error("openFoundry could not start the voice socket:", error);
  }

  // On a phone the bundled llama.cpp runtime is the only local model server.
  // Start it at boot when a model is already downloaded so the Models and
  // Providers screens are live without visiting settings first.
  if (process.env.OPENFOUNDRY_DISABLE_RUNTIME !== "1") {
    try {
      const { autoStartOnDeviceRuntime } = await import("./lib/llamacpp-runtime");
      void autoStartOnDeviceRuntime();
    } catch (error) {
      console.error("openFoundry could not start the on-device runtime:", error);
    }
  }
}
