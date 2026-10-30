import { NextResponse } from "next/server";
import { cancelDownloadJob, getDownloadJob } from "@/lib/downloads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = getDownloadJob(id);
  if (!job) return NextResponse.json({ error: "Download not found" }, { status: 404 });
  return NextResponse.json({ job });
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const job = cancelDownloadJob(id);
  if (!job) return NextResponse.json({ error: "Download not found" }, { status: 404 });
  return NextResponse.json({ job });
}
