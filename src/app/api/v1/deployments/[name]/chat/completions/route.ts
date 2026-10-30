import { NextRequest, NextResponse } from "next/server";
import { deploymentChat } from "@/lib/deployment-chat";
import { isDeploymentKey, unauthorized } from "@/lib/auth";
import { getDeployments } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ name: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { name } = await params;
  const deployments = await getDeployments();
  const deployment = deployments.find((item) => item.name === name);
  if (!deployment)
    return NextResponse.json(
      { error: { message: `Deployment ${name} not found`, type: "not_found" } },
      { status: 404 }
    );
  if (!(await isDeploymentKey(req, deployment))) return unauthorized();
  return deploymentChat(req, deployment);
}

export async function GET(req: NextRequest, { params }: Params) {
  const { name } = await params;
  const deployments = await getDeployments();
  const deployment = deployments.find((item) => item.name === name);
  if (!deployment)
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  if (!(await isDeploymentKey(req, deployment))) return unauthorized();
  return NextResponse.json({
    id: deployment.modelId,
    object: "model",
    created: Math.floor(new Date(deployment.createdAt).getTime() / 1000),
    owned_by: deployment.providerLabel,
    deployment: deployment.name,
    status: deployment.status,
  });
}
