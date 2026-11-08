// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { readBootState } from "@/lib/boot-state";
import { isLoopback } from "@/lib/directory/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Startup readiness for the native shells.
 *
 * 200 means "serve the workspace": storage, the owner directory and the
 * machine key are in place. 503 means "the port is open, keep the splash up"
 * and carries the boot error when there is one. The endpoint is loopback-only
 * like the machine sign-in it guards.
 */
export async function GET(req: NextRequest) {
  if (!isLoopback(req)) {
    return NextResponse.json(
      { error: { message: "Not available on this address.", type: "not_found" } },
      { status: 403, headers: { "cache-control": "no-store" } }
    );
  }

  const boot = readBootState();
  return NextResponse.json(
    {
      app: "openFoundry",
      ok: boot.ready,
      boot,
      pid: process.pid,
      uptimeSeconds: Math.round(process.uptime()),
    },
    {
      status: boot.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    }
  );
}
