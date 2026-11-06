// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { foundationStatus } from "@/lib/foundation-finetune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Reports whether a real local MLX LoRA fine-tune can run on this machine. */
export async function GET(req: NextRequest) {
  const baseModel = req.nextUrl.searchParams.get("baseModel")?.trim() || undefined;
  return NextResponse.json({
    status: await foundationStatus(true, baseModel),
  });
}
