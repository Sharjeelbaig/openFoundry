// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-chat-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
process.env.FOUNDRY_LOCAL_URL = "http://127.0.0.1:9";

type Chat = typeof import("@/lib/chat");
let chat: Chat;

beforeAll(async () => {
  chat = await import("@/lib/chat");
});

beforeEach(() => {
  writeFileSync(
    path.join(dir, "settings.json"),
    JSON.stringify({ ollamaUrl: "http://fake-ollama.test" })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sseResponse(text: string): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`)
      );
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

describe("vision routing", () => {
  it("sends image parts to the OpenAI-compatible endpoint", async () => {
    const fetchMock = vi.fn(async () => sseResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const events: string[] = [];
    for await (const event of chat.streamCompletion({
      model: "llava",
      provider: "ollama",
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "What is this?" },
            { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
          ],
        },
      ],
    })) {
      if (event.type === "delta") events.push(event.text);
    }

    expect(events.join("")).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(url).toBe("http://fake-ollama.test/v1/chat/completions");
    const body = JSON.parse(init.body) as {
      messages: { content: unknown }[];
    };
    expect(Array.isArray(body.messages[0].content)).toBe(true);
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "What is this?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
  });

  it("keeps plain text on the native Ollama endpoint", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response('{"message":{"content":"ok"},"done":true}\n', { status: 200 })
    );
    vi.stubGlobal("fetch", fetchMock);

    for await (const _event of chat.streamCompletion({
      model: "llama3",
      provider: "ollama",
      messages: [{ role: "user", content: "hello" }],
    })) {
      // drain
    }

    const [url] = fetchMock.mock.calls[0] as unknown as [string];
    expect(url).toBe("http://fake-ollama.test/api/chat");
  });
});
