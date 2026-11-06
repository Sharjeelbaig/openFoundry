// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/images";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    prompt?: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    steps?: number;
    seed?: number;
    model?: string;
  };
  try {
    const image = await generateImage({
      prompt: body.prompt || "",
      negativePrompt: body.negativePrompt,
      width: body.width,
      height: body.height,
      steps: body.steps,
      seed: body.seed,
      model: body.model,
    });
    return NextResponse.json({
      image: `data:${image.mime};base64,${image.buffer.toString("base64")}`,
      mime: image.mime,
      model: image.model,
      seed: image.seed,
      provider: image.provider,
      bytes: image.buffer.byteLength,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
