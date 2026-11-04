// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getGateway, saveGateway } from "@/lib/gateway";
import { GatewayConfig } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ gateway: await getGateway() });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Partial<GatewayConfig>;
  const current = await getGateway();
  const next: GatewayConfig = {
    ...current,
    ...body,
    rateLimitPerMinute: Math.min(
      6000,
      Math.max(1, Number(body.rateLimitPerMinute ?? current.rateLimitPerMinute) || 1)
    ),
    cacheTtlSeconds: Math.min(
      86400,
      Math.max(0, Number(body.cacheTtlSeconds ?? current.cacheTtlSeconds) || 0)
    ),
    routes: Array.isArray(body.routes) ? body.routes : current.routes,
  };
  return NextResponse.json({ gateway: await saveGateway(next) });
}
