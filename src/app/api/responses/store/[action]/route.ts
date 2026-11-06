// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  getRetentionPolicyLocal,
  loadResponseHistoryLocal,
  pruneResponsesLocal,
  responseStoreAuditLocal,
  responseStoreStatsLocal,
  ResponseStoreQuotaError,
  saveResponseHistoryLocal,
  setRetentionPolicyLocal,
} from "@/lib/response-store";
import {
  type StoreTenantIdentity,
} from "@/lib/response-store-config";
import {
  hasStoreTenantRegistry,
  resolveStoreTenantAsync,
} from "@/lib/response-tenants";
import type { ConversationItem } from "@/lib/conversations";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Shared Responses store used when another machine is configured with
 * OPENFOUNDRY_RESPONSE_STORE=http. Every call is bearer-token authenticated.
 * The token resolves to one tenant; rows, policy, quotas and audit entries are
 * scoped to that tenant, so one tenant's token cannot read another's data.
 */

type Authorized = { ok: true; tenant: StoreTenantIdentity } | { ok: false; response: NextResponse };

function bearerToken(req: NextRequest): string {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ")
    ? header.slice(7).trim()
    : "";
}

async function authorize(req: NextRequest): Promise<Authorized> {
  try {
    if (!hasStoreTenantRegistry()) {
      return {
        ok: false,
        response: NextResponse.json(
          {
            error:
              "This server is not configured as a shared response store. Set OPENFOUNDRY_RESPONSE_STORE_TOKENS or create a tenant in Manage → Tenants.",
          },
          { status: 503 }
        ),
      };
    }
    const tenant = await resolveStoreTenantAsync(bearerToken(req));
    if (!tenant) {
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Unauthorized", code: "unauthorized" },
          { status: 401 }
        ),
      };
    }
    return { ok: true, tenant };
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            error instanceof Error
              ? error.message
              : "The shared store tenant configuration is invalid.",
        },
        { status: 500 }
      ),
    };
  }
}

function failure(error: unknown): NextResponse {
  if (error instanceof ResponseStoreQuotaError) {
    return NextResponse.json(
      { error: error.message, code: "quota_exceeded" },
      { status: error.statusCode }
    );
  }
  return NextResponse.json(
    { error: error instanceof Error ? error.message : String(error) },
    { status: 500 }
  );
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  const { action } = await context.params;
  const tenant = auth.tenant;
  try {
    if (action === "load") {
      const id = req.nextUrl.searchParams.get("id") || "";
      const ownerId = req.nextUrl.searchParams.get("ownerId") || "project";
      if (!id) {
        return NextResponse.json({ error: "id is required" }, { status: 400 });
      }
      return NextResponse.json({
        response: await loadResponseHistoryLocal(id, ownerId, tenant.tenant),
      });
    }
    if (action === "stats") {
      return NextResponse.json(
        await responseStoreStatsLocal(tenant.tenant, tenant)
      );
    }
    if (action === "policy") {
      return NextResponse.json(
        await getRetentionPolicyLocal(tenant.tenant)
      );
    }
    if (action === "audit") {
      const limit = Number(req.nextUrl.searchParams.get("limit") || 50);
      return NextResponse.json({
        entries: await responseStoreAuditLocal(tenant.tenant, limit),
      });
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  const auth = await authorize(req);
  if (!auth.ok) return auth.response;
  const { action } = await context.params;
  const tenant = auth.tenant;
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    items?: ConversationItem[];
    ownerId?: string | null;
    maxResponsesPerOwner?: number;
    ttlDays?: number;
  };
  try {
    if (action === "save") {
      if (!body.id || !Array.isArray(body.items)) {
        return NextResponse.json(
          { error: "id and items are required" },
          { status: 400 }
        );
      }
      await saveResponseHistoryLocal(
        body.id,
        body.items,
        body.ownerId || "project",
        tenant.tenant,
        tenant
      );
      return NextResponse.json({ ok: true, tenant: tenant.tenant });
    }
    if (action === "prune") {
      await pruneResponsesLocal(body.ownerId || undefined, tenant.tenant);
      return NextResponse.json({ ok: true, tenant: tenant.tenant });
    }
    if (action === "policy") {
      const policy = await setRetentionPolicyLocal(
        {
          maxResponsesPerOwner: body.maxResponsesPerOwner,
          ttlDays: body.ttlDays,
        },
        tenant.tenant
      );
      return NextResponse.json(policy);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 404 });
  } catch (error) {
    return failure(error);
  }
}
