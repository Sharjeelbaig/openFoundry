// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  getConnection,
  getConnectionSecret,
  recordTest,
} from "@/lib/connections/store";
import { testConnection } from "@/lib/connections/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Makes the cheapest real call the provider offers. A 401 is stored as a
 * failure; there is no path that marks a connection healthy without a response.
 */
export async function POST(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const record = await getConnection(id);
  if (!record) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }
  try {
    const secret = await getConnectionSecret(id);
    const result = await testConnection(
      id,
      record.provider,
      record.target,
      record.config,
      secret
    );
    const connection = await recordTest(id, result);
    return NextResponse.json({ connection, result });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const connection = await recordTest(id, {
      ok: false,
      detail: message,
      latencyMs: 0,
    });
    return NextResponse.json({ connection, result: { ok: false, detail: message } });
  }
}
