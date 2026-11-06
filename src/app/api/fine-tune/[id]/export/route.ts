// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getDataset, toJsonl } from "@/lib/fine-tune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Serves the stored dataset as JSONL, ready for an external trainer. */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const dataset = await getDataset(id);
  if (!dataset) {
    return NextResponse.json({ error: "Dataset not found" }, { status: 404 });
  }
  const safe = dataset.name.replace(/[^A-Za-z0-9._-]+/g, "-") || "dataset";
  return new NextResponse(toJsonl(dataset), {
    headers: {
      "content-type": "application/jsonl; charset=utf-8",
      "content-disposition": `attachment; filename="${safe}.jsonl"`,
      "cache-control": "no-store",
    },
  });
}
