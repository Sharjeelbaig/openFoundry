import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { deleteAgentVersion, getAgentVersion } from "@/lib/agent-versions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ project: string; name: string; version: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  if (!(await isProjectKey(req))) return unauthorized();
  const { name, version } = await params;
  const found = await getAgentVersion(name, version);
  if (!found)
    return NextResponse.json(
      {
        error: {
          message: `Agent ${name} version ${version} not found`,
          type: "not_found",
        },
      },
      { status: 404 }
    );
  return NextResponse.json(found);
}

/** `project_client.agents.delete_version(...)` — the SDK requires a 200 with this body. */
export async function DELETE(req: NextRequest, { params }: Params) {
  if (!(await isProjectKey(req))) return unauthorized();
  const { name, version } = await params;
  const removed = await deleteAgentVersion(name, version);
  if (!removed)
    return NextResponse.json(
      {
        error: {
          message: `Agent ${name} version ${version} not found`,
          type: "not_found",
        },
      },
      { status: 404 }
    );
  return NextResponse.json({
    object: "agent.version.deleted",
    name,
    version,
    deleted: true,
  });
}
