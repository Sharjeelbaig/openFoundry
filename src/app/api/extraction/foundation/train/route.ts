// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { trainFoundationModel } from "@/lib/foundation-finetune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Trains a LoRA adapter on the custom model's labeled examples with MLX,
 * fuses it into the base weights, and evaluates the base and tuned models on a
 * held-out split. This is a real local fine-tune; it can take a few minutes.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    modelId?: string;
    baseModel?: string;
    iterations?: number;
    learningRate?: number;
    numLayers?: number;
    search?: boolean;
    candidates?: {
      id?: string;
      learningRate?: number;
      iterations?: number;
      numLayers?: number;
    }[];
  };
  if (!body.modelId) {
    return NextResponse.json({ error: "modelId is required." }, { status: 400 });
  }
  try {
    const result = await trainFoundationModel(body.modelId, {
      baseModel: body.baseModel,
      iterations: body.iterations,
      learningRate: body.learningRate,
      numLayers: body.numLayers,
      search: body.search === true,
      candidates: body.candidates,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
