// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getConnection } from "@/lib/connections/store";
import { buildAuthUrl } from "@/lib/connections/google";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Returns the Google consent URL. The browser navigates to it. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const connection = await getConnection(id);
  if (!connection) {
    return NextResponse.json({ error: "Connection not found" }, { status: 404 });
  }
  if (connection.provider !== "google-drive") {
    return NextResponse.json(
      { error: "This connection does not use OAuth." },
      { status: 400 }
    );
  }
  try {
    const url = await buildAuthUrl(id, req.nextUrl.origin);
    return NextResponse.json({ url });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
