import { NextRequest, NextResponse } from "next/server";
import { deploymentChat } from "@/lib/deployment-chat";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { getDeployments } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const body = (await req.clone().json().catch(() => ({}))) as {
    model?: string;
  };
  const deployments = await getDeployments();
  if (deployments.length === 0)
    return NextResponse.json(
      {
        error: {
          message: "No deployments exist. Deploy a model in Build → Models.",
          type: "not_found",
        },
      },
      { status: 404 }
    );
  const requested = body.model?.trim();
  const deployment =
    deployments.find(
      (item) =>
        item.name === requested ||
        item.modelId === requested ||
        item.modelName === requested
    ) ||
    (requested ? undefined : deployments.find((item) => item.status === "Running"));
  if (!deployment)
    return NextResponse.json(
      {
        error: {
          message: requested
            ? `No deployment matches model "${requested}".`
            : "No running deployment is available.",
          type: "not_found",
        },
      },
      { status: 404 }
    );
  return deploymentChat(req, deployment);
}
