// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  deleteStoreTenant,
  getStoreTenant,
  StoreTenantError,
  updateStoreTenant,
} from "@/lib/response-tenants";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ tenant: string }> };

export async function GET(_req: NextRequest, context: Context) {
  const { tenant } = await context.params;
  try {
    const record = await getStoreTenant(tenant);
    if (!record) {
      return NextResponse.json(
        { error: `Tenant "${tenant}" was not found.` },
        { status: 404 }
      );
    }
    return NextResponse.json({ tenant: record });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(req: NextRequest, context: Context) {
  const { tenant } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    quotaResponses?: number;
    quotaBytes?: number;
    disabled?: boolean;
    rotateToken?: boolean;
  };
  try {
    return NextResponse.json(
      await updateStoreTenant(tenant, {
        quotaResponses: body.quotaResponses,
        quotaBytes: body.quotaBytes,
        disabled:
          typeof body.disabled === "boolean" ? body.disabled : undefined,
        rotateToken: body.rotateToken === true,
      })
    );
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(req: NextRequest, context: Context) {
  const { tenant } = await context.params;
  const body = (await req.json().catch(() => ({}))) as { purge?: boolean };
  const purge =
    body.purge === true ||
    req.nextUrl.searchParams.get("purge") === "true";
  try {
    return NextResponse.json(await deleteStoreTenant(tenant, purge));
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
