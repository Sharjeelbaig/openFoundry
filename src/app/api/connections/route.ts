// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import { getConnections } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const connections = await getConnections();
  return NextResponse.json({ connections });
}
