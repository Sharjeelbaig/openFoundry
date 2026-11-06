// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  createDataset,
  deleteDataset,
  listDatasets,
} from "@/lib/fine-tune";
import type { FineTuneDataset } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ datasets: await listDatasets() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    source?: FineTuneDataset["source"];
    rows?: unknown;
  };
  try {
    const dataset = await createDataset({
      name: body.name || "",
      source: (body.source || "custom") as FineTuneDataset["source"],
      rows: body.rows,
    });
    return NextResponse.json({ dataset }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  await deleteDataset(id);
  return NextResponse.json({ ok: true });
}
