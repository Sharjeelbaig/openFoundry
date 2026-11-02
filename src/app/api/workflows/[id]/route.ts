import { NextRequest, NextResponse } from "next/server";
import { readJson, writeJson } from "@/lib/store";
import type {
  Workflow,
  WorkflowEdge,
  WorkflowNode,
  WorkflowNodeType,
} from "@/lib/types";
import { getWorkflow, mutateWorkflows } from "@/lib/workflows/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const NODE_TYPES: WorkflowNodeType[] = [
  "start",
  "agent",
  "setVariable",
  "resetVariable",
  "parseValue",
  "ifElse",
  "forEach",
  "goTo",
  "sendMessage",
  "askQuestion",
  "end",
  "note",
];

function cleanNodes(value: unknown): WorkflowNode[] | string {
  if (!Array.isArray(value)) return "nodes must be an array.";
  const seen = new Set<string>();
  const nodes: WorkflowNode[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return "Every node must be an object.";
    const node = item as Partial<WorkflowNode>;
    if (!node.id || typeof node.id !== "string") return "Every node needs an id.";
    if (seen.has(node.id)) return `Duplicate node id "${node.id}".`;
    seen.add(node.id);
    if (!node.type || !NODE_TYPES.includes(node.type))
      return `Node "${node.id}" has an invalid type.`;
    const position = node.position;
    if (
      !position ||
      typeof position.x !== "number" ||
      typeof position.y !== "number"
    )
      return `Node "${node.id}" has an invalid position.`;
    if (!node.data || typeof node.data !== "object")
      return `Node "${node.id}" has no data.`;
    nodes.push({
      id: node.id,
      type: node.type,
      position: { x: position.x, y: position.y },
      data: node.data as Record<string, unknown>,
    });
  }
  if (!nodes.some((node) => node.type === "start"))
    return "A workflow needs a Start node.";
  return nodes;
}

function cleanEdges(value: unknown, nodes: WorkflowNode[]): WorkflowEdge[] | string {
  if (!Array.isArray(value)) return "edges must be an array.";
  const ids = new Set(nodes.map((node) => node.id));
  const seen = new Set<string>();
  const edges: WorkflowEdge[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return "Every edge must be an object.";
    const edge = item as Partial<WorkflowEdge>;
    if (!edge.id || typeof edge.id !== "string") return "Every edge needs an id.";
    if (seen.has(edge.id)) return `Duplicate edge id "${edge.id}".`;
    seen.add(edge.id);
    if (!edge.source || !ids.has(edge.source))
      return `Edge "${edge.id}" has an unknown source.`;
    if (!edge.target || !ids.has(edge.target))
      return `Edge "${edge.id}" has an unknown target.`;
    edges.push({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      sourceHandle: edge.sourceHandle ?? null,
      targetHandle: edge.targetHandle ?? null,
      label: edge.label,
    });
  }
  return edges;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const workflow = await getWorkflow(id);
  if (!workflow)
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  return NextResponse.json({ workflow });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    description?: string;
    nodes?: unknown;
    edges?: unknown;
    variables?: unknown;
    createVersion?: boolean;
  };

  const current = await getWorkflow(id);
  if (!current)
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });

  let nodes = current.nodes;
  let edges = current.edges;
  if (body.nodes !== undefined) {
    const cleaned = cleanNodes(body.nodes);
    if (typeof cleaned === "string")
      return NextResponse.json({ error: cleaned }, { status: 400 });
    nodes = cleaned;
  }
  if (body.edges !== undefined) {
    const cleaned = cleanEdges(body.edges, nodes);
    if (typeof cleaned === "string")
      return NextResponse.json({ error: cleaned }, { status: 400 });
    edges = cleaned;
  }

  try {
    let updated: Workflow | undefined;
    await mutateWorkflows((workflows) => {
      const workflow = workflows.find((item) => item.id === id);
      if (!workflow) return;
      if (body.name !== undefined) {
        const name = String(body.name).trim().slice(0, 120);
        if (!name) throw new Error("Enter a workflow name.");
        if (
          workflows.some(
            (item) => item.id !== id && item.name.toLowerCase() === name.toLowerCase()
          )
        )
          throw new Error(`A workflow named "${name}" already exists.`);
        workflow.name = name;
      }
      if (body.description !== undefined)
        workflow.description = String(body.description).trim();
      workflow.nodes = nodes;
      workflow.edges = edges;
      if (body.variables !== undefined) {
        if (!Array.isArray(body.variables))
          throw new Error("variables must be an array.");
        workflow.variables = body.variables
          .map((item) => String(item).trim())
          .filter(Boolean);
      }
      workflow.updatedAt = new Date().toISOString();
      if (body.createVersion) {
        workflow.version += 1;
        workflow.status = "published";
        workflow.versions.unshift({
          version: workflow.version,
          savedAt: workflow.updatedAt,
          nodes: structuredClone(workflow.nodes),
          edges: structuredClone(workflow.edges),
          variables: [...workflow.variables],
        });
        workflow.versions = workflow.versions.slice(0, 50);
      }
      updated = workflow;
    });
    if (!updated)
      return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
    return NextResponse.json({ workflow: updated });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not save the workflow.",
      },
      { status: 400 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  let existed = false;
  await mutateWorkflows((workflows) => {
    const next = workflows.filter((workflow) => workflow.id !== id);
    existed = next.length !== workflows.length;
    workflows.splice(0, workflows.length, ...next);
  });
  if (!existed)
    return NextResponse.json({ error: "Workflow not found." }, { status: 404 });
  const runs = await readJson<{ workflowId: string }[]>("workflow-runs.json", []);
  await writeJson(
    "workflow-runs.json",
    runs.filter((run) => run.workflowId !== id)
  );
  return NextResponse.json({ ok: true });
}
