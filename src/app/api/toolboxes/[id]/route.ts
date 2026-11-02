import { NextRequest, NextResponse } from "next/server";
import { getToolboxes, nowIso, saveToolboxes } from "@/lib/store";
import { Toolbox } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    toolIds?: string[];
    toolSearch?: boolean;
    guardrailId?: string;
  };
  const toolboxes = await getToolboxes();
  const index = toolboxes.findIndex((item) => item.id === id);
  if (index < 0)
    return NextResponse.json({ error: "Toolbox not found" }, { status: 404 });
  const current = toolboxes[index];
  const name = body.name?.trim() || current.name;
  if (
    toolboxes.some(
      (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase()
    )
  )
    return NextResponse.json(
      { error: `A toolbox named "${name}" already exists.` },
      { status: 409 }
    );
  const updated: Toolbox = {
    ...current,
    name,
    description:
      body.description !== undefined
        ? body.description.trim()
        : current.description,
    toolIds: Array.isArray(body.toolIds)
      ? body.toolIds.map((item) => String(item)).filter(Boolean)
      : current.toolIds,
    toolSearch:
      body.toolSearch !== undefined ? Boolean(body.toolSearch) : current.toolSearch,
    guardrailId:
      body.guardrailId !== undefined ? body.guardrailId || undefined : current.guardrailId,
    version: (current.version || 1) + 1,
    updatedAt: nowIso(),
  };
  toolboxes[index] = updated;
  await saveToolboxes(toolboxes);
  return NextResponse.json({ toolbox: updated });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const toolboxes = await getToolboxes();
  if (!toolboxes.some((item) => item.id === id))
    return NextResponse.json({ error: "Toolbox not found" }, { status: 404 });
  await saveToolboxes(toolboxes.filter((item) => item.id !== id));
  return NextResponse.json({ ok: true });
}
