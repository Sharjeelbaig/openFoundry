// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { retrieve } from "@/lib/knowledge/retrieve";
import { getBaseRecord } from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Compatibility alias for the old search endpoint. It now runs the same
 * agentic retrieval pipeline, in extractive mode, and flattens citations.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    knowledgeBaseId?: string;
    ids?: string[];
    query?: string;
    topK?: number;
  };
  const ids = body.ids?.length
    ? body.ids
    : body.knowledgeBaseId
    ? [body.knowledgeBaseId]
    : [];
  if (!ids.length || !body.query?.trim()) {
    return NextResponse.json(
      { error: "knowledgeBaseId and query are required" },
      { status: 400 }
    );
  }
  const base = await getBaseRecord(ids[0]);
  if (!base) {
    return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }
  try {
    const result = await retrieve(ids[0], {
      query: body.query,
      outputMode: "extractiveData",
      maxOutputDocuments: Math.min(Math.max(body.topK || 4, 1), 50),
    });
    return NextResponse.json({
      citations: result.citations.map((citation) => ({
        documentId: citation.documentId,
        documentName: citation.title,
        chunk: citation.excerpt,
        score: citation.rerankerScore ?? citation.score,
        page: citation.page,
        section: citation.section,
        uri: citation.uri,
      })),
      embeddingModel: result.meta.embeddingModel || "lexical",
      activity: result.activity,
      references: result.references,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
