// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const agent = {
  id: "gemma-tour",
  name: "gemma-tour",
  model: "gemma4:31b-cloud",
  provider: "ollama" as const,
  status: "Running" as const,
  tools: ["http:http_abc"],
  knowledgeBaseIds: [],
  guardrail: "Default" as const,
  guardrailId: "guardrail-default",
  memoryStoreId: "memory-1",
  apiKey: "local-test",
  instructions: "Be brief.",
};

const chatPost = vi.fn();
const isAgentKey = vi.fn();

vi.mock("@/app/api/chat/route", () => ({
  POST: (request: Request) => chatPost(request),
}));

vi.mock("@/lib/auth", () => ({
  isAgentKey: (request: Request, entry: unknown) =>
    isAgentKey(request, entry),
  unauthorized: () =>
    Response.json(
      { error: { message: "A valid project api-key is required." } },
      { status: 401 }
    ),
}));

vi.mock("@/lib/store", () => ({
  getAgent: async (id: string) => (id === agent.id ? agent : undefined),
}));

import { POST } from "@/app/api/v1/agents/[id]/chat/completions/route";

function request(body: unknown, key = agent.apiKey) {
  return new NextRequest(
    "http://localhost:3000/api/v1/agents/gemma-tour/chat/completions",
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "api-key": key,
      },
      body: JSON.stringify(body),
    }
  );
}

function sseResponse() {
  return new Response(
    [
      'data: {"type":"meta","model":"gemma4:31b-cloud","citations":[]}',
      "",
      'data: {"type":"delta","text":"Hello"}',
      "",
      'data: {"type":"done","promptTokens":4,"completionTokens":1,"latencyMs":12}',
      "",
      "",
    ].join("\n"),
    { headers: { "content-type": "text/event-stream" } }
  );
}

beforeEach(() => {
  chatPost.mockReset();
  chatPost.mockResolvedValue(sseResponse());
  isAgentKey.mockReset();
  isAgentKey.mockResolvedValue(true);
});

describe("agent OpenAI-compatible endpoint", () => {
  it("calls the shared chat handler in-process instead of a guarded HTTP fetch", async () => {
    const response = await POST(request({ messages: [{ role: "user", content: "Hi" }] }), {
      params: Promise.resolve({ id: agent.id }),
    });
    expect(response.status).toBe(200);
    expect(chatPost).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(await chatPost.mock.calls[0][0].text()) as {
      agentId: string;
      tools: string[];
      guardrailId: string;
      memoryStoreId: string;
      messages: { content: string }[];
    };
    expect(sent.agentId).toBe(agent.id);
    expect(sent.tools).toEqual(agent.tools);
    expect(sent.guardrailId).toBe(agent.guardrailId);
    expect(sent.memoryStoreId).toBe(agent.memoryStoreId);
    expect(sent.messages[0].content).toBe("Hi");

    const json = (await response.json()) as {
      choices: { message: { content: string } }[];
      agent: { id: string };
    };
    expect(json.choices[0].message.content).toBe("Hello");
    expect(json.agent.id).toBe(agent.id);
  });

  it("returns the SSE stream unchanged when stream is true", async () => {
    const response = await POST(
      request({ stream: true, messages: [{ role: "user", content: "Hi" }] }),
      { params: Promise.resolve({ id: agent.id }) }
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(await response.text()).toContain('"type":"delta"');
  });

  it("rejects a bad agent key before calling the chat handler", async () => {
    isAgentKey.mockResolvedValue(false);
    const response = await POST(request({ messages: [{ role: "user", content: "Hi" }] }, "bad"), {
      params: Promise.resolve({ id: agent.id }),
    });
    expect(response.status).toBe(401);
    expect(chatPost).not.toHaveBeenCalled();
  });
});
