// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Next calls `register` for every runtime. Keep this file free of Node
 * built-ins: the Edge compilation still parses the dynamic import, even when
 * the branch below is unreachable.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { register: registerNode } = await import("./instrumentation-node");
    await registerNode();
  }
}
