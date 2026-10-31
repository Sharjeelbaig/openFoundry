import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { createAgentVersion, versionsFor } from "@/lib/agent-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ project: string; name: string }>;
}

/** `project_client.agents.create_version(...)` — stores the definition the agent runs against. */
export async function POST(req: NextRequest, { params }: Params) {
  if (!(await isProjectKey(req))) return unauthorized();
  const { name } = await params;
  if (!name?.trim())
    return NextResponse.json(
      { error: { message: "Agent name is required", type: "invalid_request_error" } },
      { status: 400 }
    );

  const body = (await req.json().catch(() => ({}))) as {
    definition?: Record<string, unknown>;
    metadata?: Record<string, string>;
    description?: string;
    draft?: boolean;
  };
  if (!body.definition || typeof body.definition !== "object")
    return NextResponse.json(
      { error: { message: "definition is required", type: "invalid_request_error" } },
      { status: 400 }
    );

  const created = await createAgentVersion(name, body);
  return NextResponse.json(created);
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isProjectKey(req))) return unauthorized();
  const { name } = await params;
  const versions = await versionsFor(name);
  return NextResponse.json({
    object: "list",
    data: versions,
    first_id: versions[0]?.id || null,
    last_id: versions[versions.length - 1]?.id || null,
    has_more: false,
  });
}
