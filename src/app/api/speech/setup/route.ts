// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  downloadWhisperModel,
  installWhisperCpp,
  whisperSetupStatus,
} from "@/lib/whisper";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Explicit Whisper onboarding. Installing Homebrew's whisper.cpp and
 * downloading a model are operator actions from the Speech page; this route
 * never claims success without checking the resulting binary and model.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    model?: string;
  };
  try {
    if (body.action === "install") {
      const result = await installWhisperCpp();
      return NextResponse.json({
        ...result,
        status: await whisperSetupStatus(),
      });
    }
    if (body.action === "download") {
      const result = await downloadWhisperModel(body.model || "base.en");
      return NextResponse.json({
        ...result,
        status: await whisperSetupStatus(),
      });
    }
    if (body.action === "status" || !body.action) {
      return NextResponse.json({ status: await whisperSetupStatus() });
    }
    return NextResponse.json(
      { error: 'action must be "install", "download" or "status".' },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : String(error),
        status: await whisperSetupStatus(),
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  return NextResponse.json(await whisperSetupStatus());
}
