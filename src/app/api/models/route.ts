// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import { discoverModels, getProviders } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [models, providers] = await Promise.all([
      discoverModels(),
      getProviders(),
    ]);
    return NextResponse.json({ models, providers });
  } catch (error) {
    return NextResponse.json(
      {
        models: [],
        providers: [],
        error:
          error instanceof Error ? error.message : "Failed to discover models",
      },
      { status: 200 }
    );
  }
}
