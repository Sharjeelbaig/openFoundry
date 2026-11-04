// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { getDeployments } from "@/lib/store";
import { discoverModels } from "@/lib/providers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Models reachable through this project: deployments first, then whatever the
 * connected local runtimes serve, deduplicated by id.
 */
export async function GET(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const deployments = await getDeployments();
  const data: Record<string, unknown>[] = [];
  const seen = new Set<string>();

  for (const deployment of deployments) {
    seen.add(deployment.name);
    seen.add(deployment.modelId);
    data.push({
      id: deployment.name,
      object: "model",
      created: Math.floor(new Date(deployment.createdAt).getTime() / 1000),
      owned_by: deployment.providerLabel,
      model: deployment.modelId,
      status: deployment.status,
    });
  }

  for (const model of await discoverModels()) {
    if (model.provider === "huggingface" || seen.has(model.id)) continue;
    seen.add(model.id);
    data.push({
      id: model.id,
      object: "model",
      created: 0,
      owned_by: model.providerLabel,
      model: model.id,
      status: model.loaded ? "Running" : "Available",
    });
  }

  return NextResponse.json({ object: "list", data });
}
