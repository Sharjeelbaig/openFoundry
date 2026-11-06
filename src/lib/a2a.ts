// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { POST as chatPost } from "@/app/api/chat/route";
import { getAgent, getAgents, newId } from "./store";
import type { Agent } from "./types";

/**
 * A2A (Agent2Agent) JSON-RPC surface.
 *
 * The agent card and message/send shape follow A2A 0.3, with a SendMessage
 * alias and `{ message }` result wrapper for 1.0 clients. The agent execution
 * path is the same /api/chat runtime used by the builder and OpenAI-compatible
 * endpoints, invoked in-process so A2A does not need a browser session.
 */

export const A2A_PROTOCOL_VERSION = "0.3.0";

interface RpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

interface AgentAnswer {
  text: string;
  model?: string;
  citations?: unknown[];
  promptTokens?: number;
  completionTokens?: number;
  latencyMs?: number;
}

export type AgentRunner = (input: {
  agent: Agent;
  text: string;
  origin: string;
  signal?: AbortSignal;
}) => Promise<AgentAnswer>;

function rpcResult(id: RpcRequest["id"], result: unknown) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(
  id: RpcRequest["id"],
  code: number,
  message: string,
  data?: unknown
) {
  return {
    jsonrpc: "2.0",
    id: id ?? null,
    error: { code, message, ...(data === undefined ? {} : { data }) },
  };
}

export function buildAgentCard(agent: Agent | undefined, origin: string) {
  const url = agent
    ? `${origin}/api/a2a?agent=${encodeURIComponent(agent.id)}`
    : `${origin}/api/a2a`;
  const name = agent?.name || "openFoundry Agent";
  const description =
    agent?.description ||
    "An openFoundry agent exposed over the Agent2Agent protocol.";
  return {
    protocolVersion: A2A_PROTOCOL_VERSION,
    name,
    description,
    url,
    preferredTransport: "JSONRPC",
    version: String(agent?.version ?? 1),
    provider: { organization: "openFoundry", url: origin },
    documentationUrl: `${origin}/docs`,
    capabilities: {
      streaming: false,
      pushNotifications: false,
      stateTransitionHistory: false,
    },
    defaultInputModes: ["text/plain"],
    defaultOutputModes: ["text/plain"],
    skills: [
      {
        id: "chat",
        name,
        description,
        tags: [
          "chat",
          "text",
          ...((agent?.knowledgeBaseIds || []).length ? ["knowledge"] : []),
          ...((agent?.tools || []).length ? ["tools"] : []),
        ],
        examples: [
          "What can you help me with?",
          "Answer this question using your configured knowledge.",
        ],
      },
    ],
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "opaque",
        description:
          "Bearer token issued by POST /api/a2a/token for this openFoundry install.",
      },
    },
    security: [{ bearerAuth: [] }],
    // A2A 1.0 renamed `security` to `securityRequirements`.
    securityRequirements: [{ bearerAuth: [] }],
    // A2A 1.0 discovery. Older clients use `url` and `preferredTransport`.
    supportedInterfaces: [
      {
        url,
        protocolBinding: "JSONRPC",
        protocolVersion: A2A_PROTOCOL_VERSION,
      },
      {
        url,
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ],
  };
}

export async function selectA2aAgent(agentId?: string | null): Promise<Agent | null> {
  if (agentId) return (await getAgent(agentId)) || null;
  return (await getAgents())[0] || null;
}

function textFromMessage(message: Record<string, unknown>): string {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return parts
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      const item = part as Record<string, unknown>;
      if (typeof item.text === "string") return item.text;
      return "";
    })
    .filter(Boolean)
    .join("\n")
    .trim();
}

function messageMetadata(answer: AgentAnswer) {
  return {
    model: answer.model || null,
    citations: answer.citations || [],
    promptTokens: answer.promptTokens ?? null,
    completionTokens: answer.completionTokens ?? null,
    latencyMs: answer.latencyMs ?? null,
  };
}

function agentMessage(
  answer: AgentAnswer,
  contextId: string,
  taskId: string | undefined,
  protocol: "0.3" | "1.0"
) {
  const common = {
    messageId: newId("msg"),
    contextId,
    ...(taskId ? { taskId } : {}),
    parts:
      protocol === "0.3"
        ? [{ kind: "text", text: answer.text }]
        : [{ text: answer.text }],
    metadata: messageMetadata(answer),
  };
  if (protocol === "0.3") {
    return { kind: "message", role: "agent", ...common };
  }
  return { role: "ROLE_AGENT", ...common };
}

const runAgentViaChat: AgentRunner = async ({ agent, text, origin, signal }) => {
  const response = await chatPost(
    new NextRequest(new URL("/api/chat", origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        agentId: agent.id,
        messages: [{ role: "user", content: text }],
        saveTrace: true,
      }),
      signal,
    })
  );
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    throw new Error(
      `The agent runtime returned ${response.status}. ${detail.slice(0, 300)}`.trim()
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";
  let model = agent.model;
  let citations: unknown[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let latencyMs = 0;
  let runtimeError: string | null = null;

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
      if (event.type === "delta" && event.text) answer += event.text;
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
      if (event.type === "error") {
        runtimeError = event.message || "The agent runtime failed.";
      }
    } catch {
      // Ignore malformed SSE frames.
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
  if (runtimeError) throw new Error(runtimeError);
  if (!answer.trim()) throw new Error("The agent returned no text.");

  return {
    text: answer.trim(),
    model,
    citations,
    promptTokens,
    completionTokens,
    latencyMs,
  };
};

export async function handleA2aRequest(
  req: NextRequest,
  runner: AgentRunner = runAgentViaChat
): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as RpcRequest | null;
  if (!body) {
    return NextResponse.json(rpcError(null, -32700, "Parse error"), {
      status: 400,
    });
  }
  if (!body.jsonrpc) {
    return NextResponse.json(rpcError(body.id, -32600, "Invalid Request"));
  }

  const method = body.method || "";
  if (method === "message/stream" || method === "SendStreamingMessage") {
    return NextResponse.json(
      rpcError(
        body.id,
        -32004,
        "Streaming is not supported by this agent. Use message/send."
      )
    );
  }
  if (
    method === "tasks/get" ||
    method === "GetTask" ||
    method === "tasks/cancel" ||
    method === "CancelTask"
  ) {
    return NextResponse.json(
      rpcError(body.id, -32001, "Task not found.")
    );
  }
  if (method !== "message/send" && method !== "SendMessage") {
    return NextResponse.json(
      rpcError(body.id, -32601, `Method not found: ${method}`)
    );
  }

  const params = body.params || {};
  const message =
    params.message && typeof params.message === "object"
      ? (params.message as Record<string, unknown>)
      : null;
  if (!message) {
    return NextResponse.json(
      rpcError(body.id, -32602, "params.message is required.")
    );
  }
  const text = textFromMessage(message);
  if (!text) {
    return NextResponse.json(
      rpcError(body.id, -32602, "The message must contain a text part.")
    );
  }

  const agent = await selectA2aAgent(req.nextUrl.searchParams.get("agent"));
  if (!agent) {
    return NextResponse.json(
      rpcError(body.id, -32602, "No agent is configured on this install.")
    );
  }

  const contextId = String(message.contextId || newId("ctx"));
  const taskId = message.taskId ? String(message.taskId) : undefined;

  try {
    const answer = await runner({
      agent,
      text,
      origin: req.nextUrl.origin,
      signal: req.signal,
    });
    const protocol = method === "SendMessage" ? "1.0" : "0.3";
    const result = agentMessage(answer, contextId, taskId, protocol);
    return NextResponse.json(
      rpcResult(body.id, protocol === "1.0" ? { message: result } : result)
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      rpcError(body.id, -32603, "The agent failed to answer.", {
        message: detail,
        agent: agent.id,
      })
    );
  }
}
