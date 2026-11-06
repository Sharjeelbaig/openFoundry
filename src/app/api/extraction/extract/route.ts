// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { extractBuffer } from "@/lib/knowledge/extract";
import { extractWithCustomModel } from "@/lib/extraction";
import { extractWithFoundationModel } from "@/lib/foundation-finetune";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;
type Engine = "hybrid" | "neural" | "foundation";

function engineFor(value: unknown, neuralOnly: unknown): Engine {
  const raw = String(value || "").trim();
  if (raw === "foundation" || raw === "neural" || raw === "hybrid") {
    return raw;
  }
  return String(neuralOnly || "") === "true" ? "neural" : "hybrid";
}

async function extract(
  modelId: string,
  text: string,
  engine: Engine
) {
  if (engine === "foundation") {
    return extractWithFoundationModel(modelId, text);
  }
  return extractWithCustomModel(modelId, text, {
    neuralOnly: engine === "neural",
  });
}

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const modelId = String(form.get("modelId") || "");
      const file = form.get("file");
      if (!modelId || !(file instanceof File)) {
        return NextResponse.json(
          { error: "modelId and a file are required." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Files are limited to 50 MB." },
          { status: 400 }
        );
      }
      const extracted = await extractBuffer(
        file.name || "document",
        Buffer.from(await file.arrayBuffer())
      );
      const result = await extract(
        modelId,
        extracted.text,
        engineFor(form.get("engine"), form.get("neuralOnly"))
      );
      return NextResponse.json({
        name: file.name,
        kind: extracted.kind,
        ...result,
      });
    }

    const body = (await req.json().catch(() => ({}))) as {
      modelId?: string;
      text?: string;
      engine?: Engine;
      neuralOnly?: boolean;
    };
    if (!body.modelId || !body.text?.trim()) {
      return NextResponse.json(
        { error: "modelId and text are required." },
        { status: 400 }
      );
    }
    const result = await extract(
      body.modelId,
      body.text,
      engineFor(body.engine, body.neuralOnly)
    );
    return NextResponse.json({ kind: "text", ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
