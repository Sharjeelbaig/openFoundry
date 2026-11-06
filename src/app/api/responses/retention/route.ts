// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { responseStoreConfig } from "@/lib/response-store-config";
import {
  getRetentionPolicy,
  pruneResponses,
  responseStoreStats,
  setRetentionPolicy,
} from "@/lib/response-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    policy: await getRetentionPolicy(),
    stats: await responseStoreStats(),
    backend: responseStoreConfig().backend,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    maxResponsesPerOwner?: number;
    ttlDays?: number;
    prune?: boolean;
  };
  try {
    const policy = await setRetentionPolicy({
      maxResponsesPerOwner: body.maxResponsesPerOwner,
      ttlDays: body.ttlDays,
    });
    if (body.prune !== false) await pruneResponses();
    return NextResponse.json({
      policy,
      stats: await responseStoreStats(),
      backend: responseStoreConfig().backend,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
