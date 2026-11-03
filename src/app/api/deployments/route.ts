import { NextRequest, NextResponse } from "next/server";
import {
  downloadFoundryModel,
  findModel,
  getProviders,
  isFoundryCached,
  loadFoundryModel,
  unloadFoundryModel,
  unloadOllama,
  warmOllama,
} from "@/lib/providers";
import {
  getDeployments,
  newId,
  nowIso,
  saveDeployments,
} from "@/lib/store";
import { DataZone, Deployment, DeploymentKind } from "@/lib/types";
import { ensureNode, listNodes, ZONE_REGION } from "@/lib/nodes";
import { may } from "@/lib/directory/redact";
import {
  LOCAL_DEPLOYMENT_TYPE,
  deploymentTypeFor,
  isKnownDeploymentType,
} from "@/lib/deployment-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [deployments, providers, nodes, canInvoke] = await Promise.all([
    getDeployments(),
    getProviders(),
    listNodes(),
    may("models.invoke"),
  ]);
  return NextResponse.json({
    deployments: canInvoke
      ? deployments
      : deployments.map((deployment) => ({ ...deployment, apiKey: "" })),
    providers,
    nodes,
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    modelKey?: string;
    name?: string;
    kind?: DeploymentKind;
    sku?: string;
    capacity?: number;
    description?: string;
    zone?: DataZone;
    region?: string;
    modelVersion?: string;
    autoUpdate?: boolean;
    guardrails?: "Default" | "Strict" | "Off";
    tpm?: number;
    reservedSlots?: number;
  };
  if (!body.modelKey)
    return NextResponse.json({ error: "modelKey is required" }, { status: 400 });
  if (body.sku && !isKnownDeploymentType(body.sku))
    return NextResponse.json(
      { error: `Unknown deployment type "${body.sku}"` },
      { status: 400 }
    );
  const deploymentType = deploymentTypeFor(body.sku || LOCAL_DEPLOYMENT_TYPE);
  if (!deploymentType.available)
    return NextResponse.json(
      {
        error: `"${deploymentType.label}" cannot run on this computer. ${
          deploymentType.unavailableReason || ""
        }`.trim(),
      },
      { status: 400 }
    );
  const model = await findModel(body.modelKey);
  if (!model)
    return NextResponse.json({ error: "Model not found" }, { status: 404 });
  if (model.provider === "huggingface") {
    return NextResponse.json(
      {
        error:
          "This repository is cached but has no local serving runtime. Pick the same model from Foundry Local or Ollama, or pull it into Ollama first.",
      },
      { status: 400 }
    );
  }

  const servingMode = deploymentType.servingMode;
  const scope = deploymentType.scope;
  const zone: DataZone | undefined =
    scope === "Data Zone" ? body.zone || "US" : undefined;
  const region =
    scope === "Region"
      ? body.region || "East US"
      : scope === "Data Zone"
      ? ZONE_REGION[(zone || "US") as DataZone]
      : scope === "Device"
      ? "On device"
      : undefined;
  const tpm =
    body.tpm ||
    (servingMode === "Standard"
      ? 240000
      : servingMode === "Developer"
      ? 50000
      : undefined);
  const reservedSlots =
    body.reservedSlots ||
    (deploymentType.reserved || servingMode === "Dedicated"
      ? Math.max(1, body.capacity || 1)
      : undefined);

  const deployments = await getDeployments();
  const baseName =
    (body.name || model.name)
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9-_]+/g, "-")
      .replace(/^-+|-+$/g, "") || "deployment";
  let name = baseName;
  let counter = 2;
  while (deployments.some((item) => item.name === name)) {
    name = `${baseName}-${counter++}`;
  }

  const id = newId("dep");
  const now = nowIso();
  const deployment: Deployment = {
    id,
    name,
    modelId: model.id,
    modelName: model.displayName,
    provider: model.provider,
    providerLabel: model.providerLabel,
    status: "Creating",
    kind: body.kind === "Adapter" ? "Adapter" : deploymentType.kind,
    sku: deploymentType.label,
    capacity: body.capacity || reservedSlots || 1,
    endpoint: `${req.nextUrl.origin}/api/v1/deployments/${name}`,
    apiKey: `local-${newId("key").slice(-20)}`,
    createdAt: now,
    updatedAt: now,
    requests: 0,
    tokens: 0,
    servingMode,
    scope,
    zone,
    region,
    tpm,
    reservedSlots,
    modelVersion: body.modelVersion,
    autoUpdate: body.autoUpdate ?? true,
    description: body.description?.trim() || undefined,
    guardrails: body.guardrails || "Default",
  };
  deployments.unshift(deployment);
  await saveDeployments(deployments);

  // The scope may need its own isolated runtime node. Spawning one can take a
  // few seconds, so the deployment starts on the default runtime and is pinned
  // to the new node as soon as it is ready.
  if ((scope === "Region" || scope === "Data Zone") && model.provider === "ollama") {
    void (async () => {
      const node = await ensureNode(model.provider, { region, zone });
      if (!node) return;
      const current = await getDeployments();
      const found = current.find((item) => item.id === id);
      if (found) {
        found.nodeId = node.id;
        found.updatedAt = nowIso();
        await saveDeployments(current);
      }
    })();
  }

  if (model.provider === "ollama") {
    void warmOllama(model.id);
    deployment.status = "Running";
    deployment.updatedAt = nowIso();
    await saveDeployments(deployments);
  } else if (model.provider === "lmstudio" || model.provider === "llamacpp") {
    deployment.status = "Running";
    deployment.updatedAt = nowIso();
    await saveDeployments(deployments);
    return NextResponse.json({ deployment }, { status: 201 });
  } else if (await isFoundryCached(model.id)) {
    try {
      await loadFoundryModel(model.id);
      deployment.status = "Running";
    } catch {
      // The OpenAI-compatible server often loads on first request; keep it running.
      deployment.status = "Running";
    }
    deployment.updatedAt = nowIso();
    await saveDeployments(deployments);
  } else {
    // Real download, in the background. The deployment stays "Creating" until the
    // model is fetched into the Foundry Local cache and loaded.
    void (async () => {
      try {
        await downloadFoundryModel(model.id);
        await loadFoundryModel(model.id);
        const current = await getDeployments();
        const found = current.find((item) => item.id === id);
        if (found) {
          found.status = "Running";
          found.updatedAt = nowIso();
          await saveDeployments(current);
        }
      } catch {
        const current = await getDeployments();
        const found = current.find((item) => item.id === id);
        if (found) {
          found.status = "Failed";
          found.updatedAt = nowIso();
          await saveDeployments(current);
        }
      }
    })();
  }

  return NextResponse.json({ deployment }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    id?: string;
    action?: "start" | "stop";
  };
  if (!body.id || !body.action)
    return NextResponse.json(
      { error: "id and action are required" },
      { status: 400 }
    );
  const deployments = await getDeployments();
  const deployment = deployments.find((item) => item.id === body.id);
  if (!deployment)
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });

  if (body.action === "stop") {
    if (deployment.provider === "foundry") {
      await unloadFoundryModel(deployment.modelId);
    } else if (deployment.provider === "ollama") {
      await unloadOllama(deployment.modelId);
    }
    deployment.status = "Stopped";
    deployment.updatedAt = nowIso();
    await saveDeployments(deployments);
    return NextResponse.json({ deployment });
  }

  if (deployment.provider === "ollama") {
    void warmOllama(deployment.modelId);
    deployment.status = "Running";
  } else if (await isFoundryCached(deployment.modelId)) {
    try {
      await loadFoundryModel(deployment.modelId);
    } catch {
      // The server can also load on first request.
    }
    deployment.status = "Running";
  } else {
    deployment.status = "Creating";
    void (async () => {
      try {
        await downloadFoundryModel(deployment.modelId);
        await loadFoundryModel(deployment.modelId);
        const current = await getDeployments();
        const found = current.find((item) => item.id === deployment.id);
        if (found) {
          found.status = "Running";
          found.updatedAt = nowIso();
          await saveDeployments(current);
        }
      } catch {
        const current = await getDeployments();
        const found = current.find((item) => item.id === deployment.id);
        if (found) {
          found.status = "Failed";
          found.updatedAt = nowIso();
          await saveDeployments(current);
        }
      }
    })();
  }
  deployment.updatedAt = nowIso();
  await saveDeployments(deployments);
  return NextResponse.json({ deployment });
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id)
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  const deployments = await getDeployments();
  const found = deployments.find((item) => item.id === id);
  if (!found)
    return NextResponse.json({ error: "Deployment not found" }, { status: 404 });
  const next = deployments.filter((item) => item.id !== id);
  await saveDeployments(next);
  if (found.provider === "foundry") {
    void unloadFoundryModel(found.modelId);
  } else if (found.provider === "ollama") {
    void unloadOllama(found.modelId);
  }
  return NextResponse.json({ ok: true });
}
