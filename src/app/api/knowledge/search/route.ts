import { NextRequest, NextResponse } from "next/server";
import { retrieveCitations } from "@/lib/rag";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

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
  if (!ids.length || !body.query?.trim())
    return NextResponse.json(
      { error: "knowledgeBaseId and query are required" },
      { status: 400 }
    );
  const { citations, embeddingModel } = await retrieveCitations(
    ids,
    body.query,
    Math.min(Math.max(body.topK || 4, 1), 20)
  );
  return NextResponse.json({ citations, embeddingModel });
}
