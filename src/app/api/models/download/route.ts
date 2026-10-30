import { NextRequest, NextResponse } from "next/server";
import {
  listDownloadJobs,
  startModelDownload,
} from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ jobs: listDownloadJobs() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { modelKey?: string };
  if (!body.modelKey)
    return NextResponse.json({ error: "modelKey is required" }, { status: 400 });
  try {
    const result = await startModelDownload(body.modelKey);
    return NextResponse.json(result, { status: result.cached ? 200 : 202 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not start download",
      },
      { status: 400 }
    );
  }
}
