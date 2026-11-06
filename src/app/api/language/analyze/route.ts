// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { analyzeText, type LanguageTask } from "@/lib/language";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TASKS = new Set(["sentiment", "entities", "keyphrases", "pii"]);

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    text?: string;
    task?: string;
    model?: string;
  };
  if (!body.task || !TASKS.has(body.task)) {
    return NextResponse.json(
      { error: "task must be sentiment, entities, keyphrases or pii." },
      { status: 400 }
    );
  }
  try {
    const result = await analyzeText({
      text: body.text || "",
      task: body.task as LanguageTask,
      model: body.model,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
