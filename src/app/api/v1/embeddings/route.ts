// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { getRuntimeUrls } from "@/lib/providers";
import { getDeployments } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    model?: string;
    input?: string | string[];
  };
  const input = Array.isArray(body.input) ? body.input : body.input ? [body.input] : [];
  if (input.length === 0)
    return NextResponse.json(
      { error: { message: "input is required", type: "invalid_request_error" } },
      { status: 400 }
    );

  const deployments = await getDeployments();
  const deployment =
    deployments.find(
      (item) =>
        item.name === body.model ||
        item.modelId === body.model ||
        item.modelName === body.model
    ) ||
    deployments.find((item) => /embed/i.test(item.modelId));
  if (!deployment)
    return NextResponse.json(
      {
        error: {
          message:
            "No embedding deployment exists. Deploy an embedding model in Build → Models.",
          type: "not_found",
        },
      },
      { status: 404 }
    );
  if (deployment.status !== "Running")
    return NextResponse.json(
      {
        error: {
          message: `Deployment ${deployment.name} is ${deployment.status}.`,
          type: "deployment_unavailable",
        },
      },
      { status: 503 }
    );

  const urls = await getRuntimeUrls();
  try {
    if (deployment.provider === "ollama") {
      const res = await fetch(`${urls.ollama}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: deployment.modelId, input }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as { embeddings?: number[][] };
      if (!data.embeddings?.length) throw new Error("No embeddings returned");
      return NextResponse.json({
        object: "list",
        model: deployment.name,
        data: data.embeddings.map((embedding, index) => ({
          object: "embedding",
          index,
          embedding,
        })),
        usage: { prompt_tokens: input.join(" ").length, total_tokens: input.join(" ").length },
      });
    }
    if (deployment.provider === "foundry") {
      const res = await fetch(`${urls.foundry}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: deployment.modelId, input }),
        signal: AbortSignal.timeout(120000),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as {
        data?: { embedding: number[]; index: number }[];
        usage?: { prompt_tokens?: number; total_tokens?: number };
      };
      if (!data.data?.length) throw new Error("No embeddings returned");
      return NextResponse.json({
        object: "list",
        model: deployment.name,
        data: data.data.map((row) => ({
          object: "embedding",
          index: row.index,
          embedding: row.embedding,
        })),
        usage: data.usage || {
          prompt_tokens: 0,
          total_tokens: 0,
        },
      });
    }
    return NextResponse.json(
      {
        error: {
          message: "This runtime cannot serve embeddings.",
          type: "unsupported_provider",
        },
      },
      { status: 400 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message: error instanceof Error ? error.message : "Embedding failed",
          type: "model_error",
        },
      },
      { status: 502 }
    );
  }
}
