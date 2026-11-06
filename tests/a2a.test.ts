// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import { NextRequest } from "next/server";
import type { Agent } from "@/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-a2a-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

const agent: Agent = {
  id: "test-agent",
  name: "test-agent",
  description: "A test agent for A2A",
  model: "test:1",
  provider: "ollama",
  instructions: "Answer briefly.",
  temperature: 0.7,
  topP: 0.95,
  maxTokens: 256,
  voiceMode: false,
  tools: [],
  knowledgeBaseIds: [],
  status: "Draft",
  version: 2,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  lastViewedAt: new Date().toISOString(),
  endpoint: "http://localhost:3000/api/v1/agents/test-agent",
  apiKey: "local-test",
  history: [],
};

writeFileSync(path.join(dir, "agents.json"), JSON.stringify([agent]));

type A2a = typeof import("@/lib/a2a");
let a2a: A2a;

beforeAll(async () => {
  a2a = await import("@/lib/a2a");
});

function rpcRequest(body: unknown, agentId = "test-agent") {
  return new NextRequest(`http://localhost:3000/api/a2a?agent=${agentId}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("A2A agent card", () => {
  it("describes the agent, endpoint, skills and bearer scheme", () => {
    const card = a2a.buildAgentCard(agent, "http://localhost:3000");
    expect(card).toMatchObject({
      protocolVersion: "0.3.0",
      name: "test-agent",
      description: "A test agent for A2A",
      url: "http://localhost:3000/api/a2a?agent=test-agent",
      preferredTransport: "JSONRPC",
      version: "2",
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain"],
      capabilities: {
        streaming: false,
        pushNotifications: false,
        stateTransitionHistory: false,
      },
    });
    expect(card.skills).toHaveLength(1);
    expect(card.skills[0]).toMatchObject({
      id: "chat",
      name: "test-agent",
      tags: ["chat", "text"],
    });
    expect(card.securitySchemes.bearerAuth).toMatchObject({
      type: "http",
      scheme: "bearer",
    });
    expect(card.security).toEqual([{ bearerAuth: [] }]);
    expect(card.securityRequirements).toEqual([{ bearerAuth: [] }]);
    expect(card.supportedInterfaces).toEqual([
      {
        url: "http://localhost:3000/api/a2a?agent=test-agent",
        protocolBinding: "JSONRPC",
        protocolVersion: "0.3.0",
      },
      {
        url: "http://localhost:3000/api/a2a?agent=test-agent",
        protocolBinding: "JSONRPC",
        protocolVersion: "1.0",
      },
    ]);
  });
});

describe("A2A message/send", () => {
  it("returns an A2A agent message with context and metadata", async () => {
    const response = await a2a.handleA2aRequest(
      rpcRequest({
        jsonrpc: "2.0",
        id: 1,
        method: "message/send",
        params: {
          message: {
            role: "user",
            messageId: "client-message-1",
            contextId: "context-1",
            parts: [{ kind: "text", text: "Hello agent" }],
          },
        },
      }),
      async ({ agent: selected, text, origin }) => {
        expect(selected.id).toBe("test-agent");
        expect(text).toBe("Hello agent");
        expect(origin).toBe("http://localhost:3000");
        return {
          text: "Hello from the agent.",
          model: "test:1",
          citations: [],
          promptTokens: 10,
          completionTokens: 6,
          latencyMs: 42,
        };
      }
    );
    const json = (await response.json()) as {
      result: Record<string, unknown>;
    };
    expect(json.result).toMatchObject({
      kind: "message",
      role: "agent",
      contextId: "context-1",
      parts: [{ kind: "text", text: "Hello from the agent." }],
      metadata: {
        model: "test:1",
        promptTokens: 10,
        completionTokens: 6,
        latencyMs: 42,
      },
    });
    expect(String(json.result.messageId)).toMatch(/^msg_/);
  });

  it("supports the SendMessage alias and 1.0 result wrapper", async () => {
    const response = await a2a.handleA2aRequest(
      rpcRequest({
        jsonrpc: "2.0",
        id: 2,
        method: "SendMessage",
        params: {
          message: {
            role: "ROLE_USER",
            messageId: "client-message-2",
            parts: [{ text: "Hello v1" }],
          },
        },
      }),
      async () => ({ text: "Hello v1 client.", model: "test:1" })
    );
    const json = (await response.json()) as {
      result: { message: Record<string, unknown> };
    };
    expect(json.result.message).toMatchObject({
      role: "ROLE_AGENT",
      parts: [{ text: "Hello v1 client." }],
    });
    expect(json.result.message).not.toHaveProperty("kind");
  });

  it("rejects streaming, missing text and unknown agents", async () => {
    const streaming = await a2a.handleA2aRequest(
      rpcRequest({
        jsonrpc: "2.0",
        id: 3,
        method: "message/stream",
        params: { message: { parts: [{ kind: "text", text: "x" }] } },
      }),
      async () => ({ text: "unused" })
    );
    expect((await streaming.json()).error.code).toBe(-32004);

    const missing = await a2a.handleA2aRequest(
      rpcRequest({
        jsonrpc: "2.0",
        id: 4,
        method: "message/send",
        params: { message: { parts: [{ kind: "file", file: { uri: "x" } }] } },
      }),
      async () => ({ text: "unused" })
    );
    expect((await missing.json()).error.code).toBe(-32602);

    const unknown = await a2a.handleA2aRequest(
      rpcRequest(
        {
          jsonrpc: "2.0",
          id: 5,
          method: "message/send",
          params: {
            message: { parts: [{ kind: "text", text: "x" }] },
          },
        },
        "missing-agent"
      ),
      async () => ({ text: "unused" })
    );
    expect((await unknown.json()).error.message).toMatch(/No agent/i);
  });
});
