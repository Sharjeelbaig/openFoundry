// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { promises as fs } from "fs";
import path from "path";
import "server-only";
import { dataDir } from "./store";

/**
 * The server's boot state, shared between instrumentation and routes.
 *
 * A native shell has to know when it is safe to show the workspace. Answering
 * on the port is not enough: the machine key, the owner directory and the
 * storage layout all have to exist first. Instrumentation publishes each step
 * here and `/api/health` reports it.
 *
 * The state lives on `globalThis` because Next.js can instantiate the
 * instrumentation module and a route module in separate module graphs. A
 * module-local variable would leave the health route looking at a copy that
 * never changes.
 */

export interface OpenFoundryBootState {
  startedAt: string;
  ready: boolean;
  machineKeyReady: boolean;
  error: string | null;
}

const holder = globalThis as unknown as {
  __openFoundryBootState?: OpenFoundryBootState;
};

function initialState(): OpenFoundryBootState {
  return {
    startedAt: new Date(
      Date.now() - Math.round(process.uptime() * 1000)
    ).toISOString(),
    ready: false,
    machineKeyReady: false,
    error: null,
  };
}

export function readBootState(): OpenFoundryBootState {
  return holder.__openFoundryBootState ?? initialState();
}

export function updateBootState(
  patch: Partial<OpenFoundryBootState>
): OpenFoundryBootState {
  const next = { ...readBootState(), ...patch };
  holder.__openFoundryBootState = next;
  return next;
}

export function serverPidPath(): string {
  return path.join(dataDir(), "server.pid");
}

/**
 * Publish our PID so the native shell can find us again.
 *
 * The shell cannot ask `java.lang.Process` for a child's PID on Android, and
 * a Node process that outlives its app process keeps the loopback port bound
 * until something reaps it. This file is what the shell checks on the next
 * launch. The shell only ever acts on it after `/proc` proves the PID still
 * runs this install's `server.js`.
 */
export async function recordServerPid(): Promise<void> {
  try {
    await fs.writeFile(serverPidPath(), String(process.pid), { mode: 0o600 });
  } catch (error) {
    console.warn("openFoundry: could not record the server PID:", error);
  }
}

/** Drop the file when we stop ourselves, so a later launch finds no stale PID. */
export async function clearServerPid(): Promise<void> {
  try {
    const current = Number((await fs.readFile(serverPidPath(), "utf8")).trim());
    if (current !== process.pid) return;
    await fs.rm(serverPidPath(), { force: true });
  } catch {
    // Nothing to clear.
  }
}
