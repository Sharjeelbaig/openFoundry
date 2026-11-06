// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-language-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

const completeChat = vi.fn();
vi.mock("@/lib/chat", () => ({ completeChat: (...args: unknown[]) => completeChat(...args) }));

type Language = typeof import("@/lib/language");
let language: Language;

beforeAll(async () => {
  language = await import("@/lib/language");
});

describe("language tasks", () => {
  it("parses a JSON sentiment result", async () => {
    completeChat.mockResolvedValueOnce({
      text: '{"sentiment":"positive","confidence":0.9,"reason":"praise"}',
      promptTokens: 10,
      completionTokens: 10,
      toolCalls: [],
    });
    const result = await language.analyzeText({
      text: "This is excellent.",
      task: "sentiment",
      model: "test:1",
    });
    expect(result.result).toMatchObject({ sentiment: "positive" });
    expect(result.model).toBe("test:1");
  });

  it("returns raw text when the model does not produce JSON", async () => {
    completeChat.mockResolvedValueOnce({
      text: "not json at all",
      promptTokens: 1,
      completionTokens: 1,
      toolCalls: [],
    });
    const result = await language.analyzeText({
      text: "abc",
      task: "keyphrases",
      model: "test:1",
    });
    expect(result.result).toBeNull();
    expect(result.raw).toBe("not json at all");
  });

  it("passes the target language to translation", async () => {
    completeChat.mockResolvedValueOnce({
      text: "Hola mundo",
      promptTokens: 1,
      completionTokens: 1,
      toolCalls: [],
    });
    const result = await language.translateText({
      text: "Hello world",
      target: "Spanish",
      model: "test:1",
    });
    expect(result.translation).toBe("Hola mundo");
    const messages = completeChat.mock.calls.at(-1)?.[0] as {
      messages: { content: string }[];
    };
    expect(messages.messages[0].content).toContain("Spanish");
  });

  it("requires text", async () => {
    await expect(
      language.analyzeText({ text: "  ", task: "entities", model: "test:1" })
    ).rejects.toThrow(/required/i);
  });
});
