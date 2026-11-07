// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { invalidateModelCache } from "@/lib/providers";
import {
  deleteOnDeviceModel,
  downloadOnDeviceModel,
  ON_DEVICE_MODELS,
  runtimeStatus,
  startOnDeviceRuntime,
  stopOnDeviceRuntime,
} from "@/lib/llamacpp-runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The bundled on-device llama.cpp runtime: status, model downloads and control. */
export async function GET() {
  return NextResponse.json({ runtime: await runtimeStatus() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "start" | "stop" | "download" | "delete";
    file?: string;
  };
  const file = body.file?.trim();

  switch (body.action) {
    case "download": {
      if (!file || !ON_DEVICE_MODELS.some((m) => m.file === file))
        return NextResponse.json({ error: "Unknown model." }, { status: 400 });
      // Kick off the download and return immediately; progress is reported by GET.
      void downloadOnDeviceModel(file);
      return NextResponse.json({ runtime: await runtimeStatus() }, { status: 202 });
    }
    case "start": {
      const target =
        file ||
        (await runtimeStatus()).models.sort((a, b) => a.sizeBytes - b.sizeBytes)[0]?.file;
      if (!target)
        return NextResponse.json({ error: "Download a model first." }, { status: 400 });
      const result = await startOnDeviceRuntime(target);
      invalidateModelCache();
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
      return NextResponse.json({ runtime: await runtimeStatus() });
    }
    case "stop": {
      await stopOnDeviceRuntime();
      invalidateModelCache();
      return NextResponse.json({ runtime: await runtimeStatus() });
    }
    case "delete": {
      if (!file) return NextResponse.json({ error: "No model named." }, { status: 400 });
      await deleteOnDeviceModel(file);
      invalidateModelCache();
      return NextResponse.json({ runtime: await runtimeStatus() });
    }
    default:
      return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
}
