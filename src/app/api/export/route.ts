// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextResponse } from "next/server";
import {
  getAgents,
  getDeployments,
  getHttpTools,
  getKnowledgeBases,
  getMcpServers,
  getSettings,
  getTraces,
  readJson,
} from "@/lib/store";
import { getGateway } from "@/lib/gateway";
import {
  BatchJob,
  EvaluationRun,
  QuotaRequest,
  Routine,
  Workflow,
} from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [agents, deployments, knowledgeBases, mcpServers, httpTools, traces, settings, gateway, evaluations, routines, workflows, batch, quotaRequests] =
    await Promise.all([
      getAgents(),
      getDeployments(),
      getKnowledgeBases(),
      getMcpServers(),
      getHttpTools(),
      getTraces(),
      getSettings(),
      getGateway(),
      readJson<EvaluationRun[]>("evaluations.json", []),
      readJson<Routine[]>("routines.json", []),
      readJson<Workflow[]>("workflows.json", []),
      readJson<BatchJob[]>("batch.json", []),
      readJson<QuotaRequest[]>("quota-requests.json", []),
    ]);
  const bundle = {
    exportedAt: new Date().toISOString(),
    note: "Local openFoundry mirror export. No cloud resources are represented.",
    settings,
    agents,
    deployments,
    knowledgeBases,
    mcpServers,
    httpTools,
    traces,
    evaluations,
    routines,
    workflows,
    batch,
    quotaRequests,
    gateway,
  };
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="foundry-local-export-${new Date()
        .toISOString()
        .slice(0, 10)}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
