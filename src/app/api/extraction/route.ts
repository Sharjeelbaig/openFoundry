// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { removeFoundationArtifacts } from "@/lib/foundation-finetune";
import {
  addExtractionExample,
  createExtractionModel,
  deleteExtractionModel,
  listExtractionModels,
  trainExtractionModel,
  type ExtractionField,
} from "@/lib/extraction";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ models: await listExtractionModels() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    id?: string;
    name?: string;
    description?: string;
    instructions?: string;
    model?: string;
    fields?: ExtractionField[];
    text?: string;
    expected?: Record<string, unknown>;
  };
  try {
    if (body.action === "create") {
      const model = await createExtractionModel({
        name: body.name || "",
        description: body.description,
        instructions: body.instructions,
        model: body.model,
        fields: body.fields || [],
      });
      return NextResponse.json({ model }, { status: 201 });
    }
    if (!body.id) {
      return NextResponse.json({ error: "id is required." }, { status: 400 });
    }
    if (body.action === "example") {
      const model = await addExtractionExample(body.id, {
        text: body.text || "",
        expected: body.expected || {},
      });
      return NextResponse.json({ model }, { status: 201 });
    }
    if (body.action === "train") {
      const model = await trainExtractionModel(body.id);
      return NextResponse.json({ model });
    }
    if (body.action === "delete") {
      await deleteExtractionModel(body.id);
      await removeFoundationArtifacts(body.id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: 'action must be "create", "example", "train" or "delete".' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
