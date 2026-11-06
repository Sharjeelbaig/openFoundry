// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { responseStoreConfig } from "@/lib/response-store-config";
import {
  createStoreTenant,
  listStoreTenants,
  storeTenantTotals,
  StoreTenantError,
} from "@/lib/response-tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Cross-tenant administration for the shared Responses store. */
export async function GET() {
  const config = responseStoreConfig();
  if (config.backend !== "sqlite") {
    return NextResponse.json({
      storeHost: false,
      backend: config.backend,
      tenants: [],
      totals: {
        tenants: 0,
        active: 0,
        disabled: 0,
        overQuota: 0,
        responses: 0,
        bytes: 0,
      },
    });
  }
  try {
    const tenants = await listStoreTenants();
    return NextResponse.json({
      storeHost: true,
      backend: config.backend,
      tenants,
      totals: storeTenantTotals(tenants),
    });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    tenant?: string;
    quotaResponses?: number;
    quotaBytes?: number;
    token?: string;
  };
  try {
    const result = await createStoreTenant({
      tenant: String(body.tenant || ""),
      quotaResponses: body.quotaResponses,
      quotaBytes: body.quotaBytes,
      token: body.token,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown): NextResponse {
  if (error instanceof StoreTenantError) {
    return NextResponse.json(
      { error: error.message },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: 500 }
  );
}
