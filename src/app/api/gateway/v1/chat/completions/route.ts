// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { completeChat } from "@/lib/chat";
import { getDeployments, saveDeployments } from "@/lib/store";
import { nodeForDeployment } from "@/lib/nodes";
import { ChatMessage } from "@/lib/types";
import { getGateway } from "@/lib/gateway";
import { isDeploymentKey, unauthorized } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CacheEntry {
  expires: number;
  payload: Record<string, unknown>;
}

const globalForGateway = globalThis as unknown as {
  __foundryGatewayCache?: Map<string, CacheEntry>;
  __foundryGatewayRate?: Map<string, number[]>;
};
const cache = (globalForGateway.__foundryGatewayCache ||= new Map());
const hits = (globalForGateway.__foundryGatewayRate ||= new Map());

function rateLimited(key: string, limit: number): boolean {
  const now = Date.now();
  const windowStart = now - 60_000;
  const list = (hits.get(key) || []).filter((time: number) => time > windowStart);
  if (list.length >= limit) {
    hits.set(key, list);
    return true;
  }
  list.push(now);
  hits.set(key, list);
  return false;
}

export async function POST(req: NextRequest) {
  const config = await getGateway();
  if (!config.enabled) {
    return NextResponse.json(
      { error: "The local AI Gateway is disabled. Enable it in Manage → AI Gateway." },
      { status: 503 }
    );
  }

  const key =
    req.headers.get("api-key") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ||
    "";
  const deploymentsForKey = await getDeployments();
  const matchesDeployment = await Promise.all(
    deploymentsForKey.map((item) => isDeploymentKey(req, item))
  );
  if (!key || !matchesDeployment.some(Boolean)) return unauthorized();
  if (rateLimited(key, config.rateLimitPerMinute)) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded: ${config.rateLimitPerMinute} requests per minute.`,
      },
      { status: 429 }
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    model?: string;
    messages?: ChatMessage[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
  };
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return NextResponse.json(
      { error: "messages is required and must be a non-empty array" },
      { status: 400 }
    );
  }

  const deployments = await getDeployments();
  const requested = body.model || "";
  const route = config.routes.find(
    (item) =>
      item.enabled &&
      (item.name === requested ||
        item.deploymentId === requested ||
        deployments.find((dep) => dep.id === item.deploymentId)?.name === requested)
  );
  const deployment =
    deployments.find((item) => item.id === (route?.deploymentId || config.defaultDeploymentId)) ||
    deployments.find((item) => item.name === requested || item.modelId === requested) ||
    (config.defaultDeploymentId
      ? deployments.find((item) => item.id === config.defaultDeploymentId)
      : undefined);

  if (!deployment) {
    return NextResponse.json(
      {
        error:
          "No deployment is available for this route. Deploy a model and choose a default route.",
      },
      { status: 404 }
    );
  }

  const cacheKey = config.cacheEnabled
    ? JSON.stringify({
        model: deployment.id,
        messages: body.messages,
        temperature: body.temperature ?? 0.7,
        maxTokens: body.max_tokens ?? 1024,
      })
    : "";
  if (cacheKey) {
    const cached = cache.get(cacheKey);
    if (cached && cached.expires > Date.now()) {
      return NextResponse.json(
        { ...cached.payload, gateway: { cached: true, route: route?.name || deployment.name } },
        { headers: { "x-foundry-gateway-cache": "hit" } }
      );
    }
  }

  try {
    const node = await nodeForDeployment(deployment);
    const result = await completeChat({
      model: deployment.modelId,
      provider: deployment.provider,
      messages: body.messages,
      temperature: body.temperature,
      topP: body.top_p,
      maxTokens: body.max_tokens,
      baseUrl: node?.baseUrl,
    });
    deployment.requests += 1;
    deployment.tokens += result.promptTokens + result.completionTokens;
    await saveDeployments(deployments);
    const payload = {
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: requested || deployment.modelId,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: result.text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
      },
      gateway: {
        cached: false,
        route: route?.name || deployment.name,
        deployment: deployment.name,
      },
    };
    if (cacheKey) {
      cache.set(cacheKey, {
        expires: Date.now() + config.cacheTtlSeconds * 1000,
        payload,
      });
      if (cache.size > 200) {
        const oldest = [...cache.entries()]
          .sort((a, b) => a[1].expires - b[1].expires)
          .slice(0, 50);
        for (const [entry] of oldest) cache.delete(entry);
      }
    }
    return NextResponse.json(payload, {
      headers: { "x-foundry-gateway-cache": cacheKey ? "miss" : "off" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: `The local model runtime failed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
      { status: 502 }
    );
  }
}
