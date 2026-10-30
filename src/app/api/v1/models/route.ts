import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { getDeployments } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const deployments = await getDeployments();
  return NextResponse.json({
    object: "list",
    data: deployments.map((deployment) => ({
      id: deployment.name,
      object: "model",
      created: Math.floor(new Date(deployment.createdAt).getTime() / 1000),
      owned_by: deployment.providerLabel,
      model: deployment.modelId,
      status: deployment.status,
    })),
  });
}
