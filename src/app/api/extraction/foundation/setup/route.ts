// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import { installFoundationRuntime } from "@/lib/foundation-finetune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Explicit setup for the local MLX fine-tune runtime. Creates a venv under
 * data/foundation/venv and installs mlx-lm. Nothing is reported ready until a
 * Python interpreter actually imports mlx_lm.
 */
export async function POST() {
  try {
    return NextResponse.json(await installFoundationRuntime());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
