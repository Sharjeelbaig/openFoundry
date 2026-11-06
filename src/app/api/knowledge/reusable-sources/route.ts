// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import { listReusableSources } from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sanitized source records from every knowledge base, used by the create flow's
 * "Use existing sources" picker. Credentials never appear here; connection ids
 * are opaque references to the encrypted vault.
 */
export async function GET() {
  return NextResponse.json({ sources: await listReusableSources() });
}
