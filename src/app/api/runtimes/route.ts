// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  cancelRuntimeJob,
  listRuntimeJobs,
  runtimeStatuses,
  STARTER_MODEL,
  startLlamaInstall,
  startLlamaServer,
  stopLlamaServer,
  uninstallLlama,
} from "@/lib/runtimes";
import { invalidateModelCache } from "@/lib/providers";
import type { RuntimeId } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Local runtimes: what is installed, and the managed llama.cpp install job. */
export async function GET() {
  return NextResponse.json({
    runtimes: await runtimeStatuses(),
    jobs: listRuntimeJobs(),
    starter: {
      name: STARTER_MODEL.name,
      file: STARTER_MODEL.file,
      sizeBytes: STARTER_MODEL.sizeBytes,
      license: STARTER_MODEL.license,
    },
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "install" | "start" | "stop" | "uninstall" | "cancel";
    provider?: RuntimeId;
    jobId?: string;
  };

  try {
    switch (body.action) {
      case "install": {
        if (body.provider !== "llamacpp") {
          return NextResponse.json(
            {
              error:
                "Only llama.cpp can be installed from here. The other runtimes have their own installers.",
            },
            { status: 400 }
          );
        }
        const job = await startLlamaInstall();
        return NextResponse.json({ job }, { status: 202 });
      }
      case "start": {
        const result = await startLlamaServer();
        invalidateModelCache();
        return NextResponse.json(result);
      }
      case "stop": {
        const result = await stopLlamaServer();
        invalidateModelCache();
        return NextResponse.json(result);
      }
      case "uninstall": {
        await uninstallLlama();
        return NextResponse.json({
          detail: "llama.cpp and its starter model were removed.",
        });
      }
      case "cancel": {
        if (!body.jobId) {
          return NextResponse.json({ error: "jobId is required" }, { status: 400 });
        }
        const job = cancelRuntimeJob(body.jobId);
        if (!job) {
          return NextResponse.json({ error: "Job not found" }, { status: 404 });
        }
        return NextResponse.json({ job });
      }
      default:
        return NextResponse.json(
          { error: "Unknown action." },
          { status: 400 }
        );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Runtime action failed." },
      { status: 400 }
    );
  }
}
