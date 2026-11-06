// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getBaseRecord } from "@/lib/knowledge/service";
import { retrieve } from "@/lib/knowledge/retrieve";
import type { RetrieveRequest } from "@/lib/knowledge/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Foundry's retrieve action: messages or intents in, response/activity/references out. */
export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!(await getBaseRecord(id))) {
    return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }
  const body = (await req.json().catch(() => ({}))) as RetrieveRequest;
  try {
    const result = await retrieve(id, body);
    // Foundry returns 206 for a partial retrieval response.
    return NextResponse.json(result, { status: result.meta.partial ? 206 : 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
