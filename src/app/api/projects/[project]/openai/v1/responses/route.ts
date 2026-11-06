// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { currentSession } from "@/lib/directory/server";
import {
  ResponsesRequest,
  runResponse,
  runResponseStream,
} from "@/lib/foundry-responses";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const hasProjectKey = await isProjectKey(req);
  const session = hasProjectKey ? null : await currentSession();
  if (!hasProjectKey && !session) return unauthorized();
  // Project-key clients are their own tenant; browser sessions are scoped to
  // the signed-in principal so one user cannot read another user's responses.
  const ownerId = session?.principal.id || "project";
  const body = (await req.json().catch(() => ({}))) as ResponsesRequest;
  if (body.stream === true) {
    return runResponseStream(body, ownerId);
  }
  const result = await runResponse(body, ownerId);
  return NextResponse.json(result.body, { status: result.status });
}
