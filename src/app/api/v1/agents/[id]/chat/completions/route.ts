// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { isAgentKey, unauthorized } from "@/lib/auth";
import { getAgent } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

/**
 * Per-agent OpenAI-shaped endpoint. Internally it uses the same agent runtime as
 * the builder chat (tools, retrieval, guardrails, traces), then converts the SSE
 * stream into a normal chat completion when stream is false.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agent = await getAgent(decodeURIComponent(id));
  if (!agent)
    return NextResponse.json(
      { error: { message: "Agent not found", type: "not_found" } },
      { status: 404 }
    );
  if (!(await isAgentKey(req, agent))) return unauthorized();

  const raw = (await req.json().catch(() => ({}))) as {
    model?: string;
    messages?: { role: "system" | "user" | "assistant"; content: string }[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
  };
  if (!raw.messages?.length)
    return NextResponse.json(
      { error: { message: "messages is required", type: "invalid_request_error" } },
      { status: 400 }
    );

  const body = {
    ...raw,
    agentId: agent.id,
    model: raw.model || agent.model,
    provider: agent.provider,
    maxTokens: raw.max_tokens,
    topP: raw.top_p,
    instructions: agent.instructions,
    knowledgeBaseIds: agent.knowledgeBaseIds,
    tools: agent.tools,
    guardrail: agent.guardrail || "Default",
    saveTrace: true,
  };

  const upstream = await fetch(new URL("/api/chat", req.url), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: req.signal,
    cache: "no-store",
  });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: { message: "The agent runtime did not respond.", type: "model_error" } },
      { status: 502 }
    );
  }

  if (raw.stream === true) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    });
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let latencyMs = 0;
  let citations: unknown[] = [];
  let model = agent.model;
  let error: string | null = null;

  const consume = (frame: string) => {
    const line = frame.split("\n").find((item) => item.startsWith("data:"));
    if (!line) return;
    const payload = line.slice(5).trim();
    if (!payload) return;
    try {
      const event = JSON.parse(payload) as {
        type: string;
        text?: string;
        message?: string;
        promptTokens?: number;
        completionTokens?: number;
        latencyMs?: number;
        citations?: unknown[];
        model?: string;
      };
      if (event.type === "delta" && event.text) content += event.text;
      if (event.type === "done") {
        promptTokens = event.promptTokens || 0;
        completionTokens = event.completionTokens || 0;
        latencyMs = event.latencyMs || 0;
        citations = event.citations || [];
      }
      if (event.type === "meta") {
        model = event.model || model;
        citations = event.citations || citations;
      }
      if (event.type === "error") error = event.message || "Model request failed";
    } catch {
      // ignore malformed frames
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() || "";
    for (const frame of frames) consume(frame);
  }
  if (buffer.trim()) consume(buffer);
  if (error)
    return NextResponse.json(
      { error: { message: error, type: "model_error" } },
      { status: 502 }
    );

  return NextResponse.json({
    id: `chatcmpl-${Date.now().toString(36)}`,
    object: "chat.completion",
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: { role: "assistant", content },
        finish_reason: "stop",
      },
    ],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
    agent: {
      id: agent.id,
      name: agent.name,
      latency_ms: latencyMs,
      citations,
    },
  });
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const agent = await getAgent(decodeURIComponent(id));
  if (!agent)
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  if (!(await isAgentKey(req, agent))) return unauthorized();
  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    object: "agent",
    model: agent.model,
    provider: agent.provider,
    version: agent.version,
    status: agent.status,
    endpoint: `/api/v1/agents/${agent.id}/chat/completions`,
  });
}
