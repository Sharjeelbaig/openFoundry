// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import {
  getToolboxes,
  newId,
  nowIso,
  saveToolboxes,
} from "@/lib/store";
import { Toolbox } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const toolboxes = (await getToolboxes()).map((item) => ({
    ...item,
    version: item.version || 1,
  }));
  return NextResponse.json({ toolboxes });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    toolIds?: string[];
    toolSearch?: boolean;
    guardrailId?: string;
  };
  const name = body.name?.trim();
  if (!name)
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  const toolboxes = await getToolboxes();
  if (
    toolboxes.some((item) => item.name.toLowerCase() === name.toLowerCase())
  )
    return NextResponse.json(
      { error: `A toolbox named "${name}" already exists.` },
      { status: 409 }
    );
  const toolbox: Toolbox = {
    id: newId("tbx"),
    name,
    description: body.description?.trim() || "",
    toolIds: Array.isArray(body.toolIds)
      ? body.toolIds.map((item) => String(item)).filter(Boolean)
      : [],
    toolSearch: Boolean(body.toolSearch),
    guardrailId: body.guardrailId || undefined,
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  toolboxes.unshift(toolbox);
  await saveToolboxes(toolboxes);
  return NextResponse.json({ toolbox }, { status: 201 });
}
