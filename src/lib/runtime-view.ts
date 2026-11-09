// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { RuntimeState, RuntimeStatus } from "./types";

/**
 * The setup screen's llama.cpp controls.
 *
 * A runtime can be installed by openFoundry (`managed`) or detected from the
 * user's own installation. Only the managed install can be started, stopped or
 * removed by openFoundry; a system install is shown but left alone. Keeping the
 * decision here makes that distinction testable without rendering the wizard.
 */
export interface LlamaRuntimeControls {
  /** openFoundry installed this copy. */
  managed: boolean;
  /** The server currently answers on its configured URL. */
  running: boolean;
  /** A binary or managed install exists, whether running or not. */
  detected: boolean;
  /** A system install that openFoundry did not create. */
  external: boolean;
  canInstall: boolean;
  canStart: boolean;
  canStop: boolean;
  canUninstall: boolean;
  canScan: boolean;
}

type LlamaRuntimeLike = Pick<RuntimeStatus, "managed" | "state"> & {
  installable?: boolean;
};

export function llamaRuntimeControls(
  runtime: LlamaRuntimeLike | undefined
): LlamaRuntimeControls {
  const state: RuntimeState | undefined = runtime?.state;
  const managed = runtime?.managed === true;
  const running = state === "running";
  const detected = managed || running || state === "stopped";

  return {
    managed,
    running,
    detected,
    external: detected && !managed,
    canInstall: state === "missing" && runtime?.installable !== false,
    canStart: managed && state === "stopped",
    canStop: managed && running,
    canUninstall: managed && !running,
    canScan: running,
  };
}
