// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { retrieveCitations } from "@/lib/rag";
import { searchWeb, tryCalculate } from "@/lib/websearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    tool?: string;
    input?: string;
    knowledgeBaseId?: string;
  };
  const input = (body.input || "").trim();
  if (!body.tool || !input)
    return NextResponse.json({ error: "tool and input are required" }, { status: 400 });
  const started = Date.now();

  if (body.tool === "web-search") {
    const results = await searchWeb(input, 5);
    return NextResponse.json({
      kind: "web-search",
      latencyMs: Date.now() - started,
      results,
      note:
        results.length === 0
          ? "DuckDuckGo returned no parsable results or was unreachable. The agent still answers without the tool."
          : "Queries are sent to DuckDuckGo at request time. No API key is used.",
    });
  }

  if (body.tool === "calculator") {
    const result = tryCalculate(input);
    return NextResponse.json({
      kind: "calculator",
      latencyMs: Date.now() - started,
      result,
      note: result
        ? "The expression was evaluated locally and injected into the system prompt."
        : "No arithmetic expression was detected in that input.",
    });
  }

  if (body.tool === "file-search") {
    if (!body.knowledgeBaseId)
      return NextResponse.json(
        { error: "knowledgeBaseId is required for file-search" },
        { status: 400 }
      );
    const retrieved = await retrieveCitations([body.knowledgeBaseId], input, 5);
    return NextResponse.json({
      kind: "file-search",
      latencyMs: Date.now() - started,
      embeddingModel: retrieved.embeddingModel,
      citations: retrieved.citations,
    });
  }

  return NextResponse.json({ error: "Unknown tool" }, { status: 400 });
}
