// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import catalog from "@/data/tool-catalog.json";
import setups from "@/data/tool-setup.json";
import { ToolCatalogEntry, ToolSetup } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const entries = catalog as ToolCatalogEntry[];
const setupMap = setups as Record<string, ToolSetup>;

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const entry = entries.find((item) => item.id === id);
  if (!entry)
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  const setup = setupMap[id] || {
    authMethods: [],
    operations: [],
    runtimeUrls: [],
    docs: entry.docs || [],
    note: "",
  };
  return NextResponse.json({ entry, setup });
}
