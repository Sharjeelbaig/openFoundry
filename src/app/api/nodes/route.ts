// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { ensureNode, listNodes, stopNode, zoneForRegion } from "@/lib/nodes";
import { DataZone, ProviderId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ nodes: await listNodes(true) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    provider?: ProviderId;
    zone?: DataZone;
    region?: string;
  };
  const provider = body.provider || "ollama";
  const region = body.region || "East US";
  const zone =
    body.zone || (zoneForRegion(region) === "Device" ? "US" : (zoneForRegion(region) as DataZone));
  const node = await ensureNode(provider, { region, zone });
  if (!node)
    return NextResponse.json(
      {
        error:
          "Could not start an isolated runtime for that region. Ollama must be installed to spawn a node.",
      },
      { status: 503 }
    );
  return NextResponse.json({ node }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  await stopNode(id);
  return NextResponse.json({ ok: true });
}
