// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { responseStoreConfig } from "@/lib/response-store-config";
import { responseStoreAuditAll } from "@/lib/response-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Admin audit stream: every tenant, or one tenant when `tenant` is supplied. */
export async function GET(req: NextRequest) {
  if (responseStoreConfig().backend !== "sqlite") {
    return NextResponse.json({ entries: [], storeHost: false });
  }
  const limit = Number(req.nextUrl.searchParams.get("limit") || 100);
  const tenant = req.nextUrl.searchParams.get("tenant") || undefined;
  return NextResponse.json({
    storeHost: true,
    entries: await responseStoreAuditAll(limit, tenant),
  });
}
