// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { extractBuffer } from "@/lib/knowledge/extract";
import { extractStructured } from "@/lib/structured";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BYTES = 50 * 1024 * 1024;
const MAX_TEXT = 200_000;

/**
 * Structured extraction over an uploaded document or pasted text. PDFs and
 * images go through the same local extractor as knowledge ingestion, including
 * OCR fallback; the parser then reports tables and key/value pairs with line
 * and page provenance.
 */
export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json(
          { error: "Upload a file in the `file` field." },
          { status: 400 }
        );
      }
      if (file.size > MAX_BYTES) {
        return NextResponse.json(
          { error: "Files are limited to 50 MB." },
          { status: 400 }
        );
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const extracted = await extractBuffer(file.name || "document", buffer);
      const structured = extractStructured(extracted.text, extracted.kind);
      return NextResponse.json({
        name: file.name,
        ...structured,
      });
    }

    const body = (await req.json().catch(() => ({}))) as { text?: string };
    const text = body.text || "";
    if (!text.trim()) {
      return NextResponse.json(
        { error: "Provide `text` or upload a file." },
        { status: 400 }
      );
    }
    if (text.length > MAX_TEXT) {
      return NextResponse.json(
        { error: `Text is limited to ${MAX_TEXT} characters.` },
        { status: 400 }
      );
    }
    const structured = extractStructured(text, "text");
    return NextResponse.json(structured);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 }
    );
  }
}
