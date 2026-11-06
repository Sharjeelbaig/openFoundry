// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  cancelJob,
  getBaseRecord,
  jobEvents,
  listJobs,
} from "@/lib/knowledge/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  if (!(await getBaseRecord(id))) {
    return NextResponse.json({ error: "Knowledge base not found" }, { status: 404 });
  }
  const jobId = req.nextUrl.searchParams.get("jobId");
  const jobs = await listJobs(id);
  const events = jobId ? await jobEvents(jobId) : [];
  return NextResponse.json({ jobs, events });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const body = (await req.json().catch(() => ({}))) as {
    action?: string;
    jobId?: string;
  };
  if (body.action !== "cancel" || !body.jobId) {
    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  }
  await cancelJob(id, body.jobId);
  return NextResponse.json({ ok: true });
}
