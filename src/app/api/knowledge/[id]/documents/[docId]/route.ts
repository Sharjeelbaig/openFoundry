// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getBaseRecord, listDocumentsWithChunks } from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Citation lookup for indexed references. Foundry returns a read-only
 * citationUrl on each indexed reference that resolves to the document in the
 * backing index; this is the local equivalent.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<{ id: string; docId: string }> }
) {
  const { id, docId } = await context.params;
  if (!(await getBaseRecord(id))) {
    return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }
  const documents = await listDocumentsWithChunks(id);
  const document = documents.find((item) => item.id === docId);
  if (!document) {
    return NextResponse.json({ error: "Document not found" }, { status: 404 });
  }
  const content = document.chunks.map((chunk) => chunk.text).join("\n\n");
  return NextResponse.json(
    {
      uid: document.id,
      title: document.title,
      snippet: content,
      content,
      metadata_storage_path: document.uri || document.title,
      original_uri: document.uri || null,
    },
    { headers: { "cache-control": "no-store" } }
  );
}
