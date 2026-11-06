// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { speechStatus, transcribeAudio, SpeechUnavailableError } from "@/lib/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Send an audio file as multipart/form-data in the `file` field." },
      { status: 400 }
    );
  }
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No audio file supplied." }, { status: 400 });
  }
  try {
    const result = await transcribeAudio({
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name || "audio.wav",
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (error instanceof SpeechUnavailableError) {
      return NextResponse.json({ error: message }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function GET() {
  return NextResponse.json(await speechStatus());
}
