import { NextRequest, NextResponse } from "next/server";
import { newId, nowIso } from "@/lib/store";
import type { Workflow } from "@/lib/types";
import { buildTemplate, type WorkflowTemplate } from "@/lib/workflows/templates";
import { getWorkflows, mutateWorkflows } from "@/lib/workflows/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEMPLATES: WorkflowTemplate[] = [
  "blank",
  "sequential",
  "human-in-loop",
  "group-chat",
];

export async function GET() {
  return NextResponse.json({ workflows: await getWorkflows() });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    template?: string;
    name?: string;
    description?: string;
  };
  const template = (body.template || "blank") as WorkflowTemplate;
  if (!TEMPLATES.includes(template))
    return NextResponse.json(
      { error: "Unknown workflow template." },
      { status: 400 }
    );
  const definition = buildTemplate(template);
  const workflows = await getWorkflows();
  let name = (body.name || definition.name).trim() || definition.name;
  if (workflows.some((workflow) => workflow.name === name)) {
    let counter = 2;
    while (workflows.some((workflow) => workflow.name === `${name}-${counter}`))
      counter += 1;
    name = `${name}-${counter}`;
  }
  const workflow: Workflow = {
    id: newId("workflow"),
    name,
    description: String(body.description || definition.description),
    template,
    nodes: definition.nodes,
    edges: definition.edges,
    variables: definition.variables,
    version: 0,
    status: "draft",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    versions: [],
  };
  await mutateWorkflows((items) => {
    items.unshift(workflow);
  });
  return NextResponse.json({ workflow }, { status: 201 });
}
