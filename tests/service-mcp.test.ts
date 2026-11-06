// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-service-mcp-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
writeFileSync(
  path.join(dir, "deployments.json"),
  JSON.stringify([
    {
      id: "dep_test",
      name: "test-deploy",
      modelId: "test:1",
      modelName: "Test",
      provider: "ollama",
      status: "Running",
    },
  ])
);

vi.mock("@/lib/chat", () => ({
  completeChat: vi.fn(async (options: { messages: { role: string; content: string }[] }) => {
    const system = options.messages[0]?.content || "";
    if (system.includes("sentiment")) {
      return {
        text: '{"sentiment":"positive","confidence":0.98,"reason":"praise"}',
        promptTokens: 10,
        completionTokens: 8,
        toolCalls: [],
      };
    }
    if (system.includes("Translate")) {
      return {
        text: "Hola mundo",
        promptTokens: 10,
        completionTokens: 4,
        toolCalls: [],
      };
    }
    return {
      text: '["code","policy"]',
      promptTokens: 10,
      completionTokens: 4,
      toolCalls: [],
    };
  }),
}));

type Tokens = typeof import("@/lib/service-mcp-token");
type LanguageMcp = typeof import("@/lib/language-mcp");
type SpeechMcp = typeof import("@/lib/speech-mcp");
type Speech = typeof import("@/lib/speech");
type Whisper = typeof import("@/lib/whisper");

let tokens: Tokens;
let language: LanguageMcp;
let speechMcp: SpeechMcp;
let speech: Speech;
let whisper: Whisper;

beforeAll(async () => {
  tokens = await import("@/lib/service-mcp-token");
  language = await import("@/lib/language-mcp");
  speechMcp = await import("@/lib/speech-mcp");
  speech = await import("@/lib/speech");
  whisper = await import("@/lib/whisper");
});

describe("service MCP tokens", () => {
  it("issues, verifies and rotates a token per service", async () => {
    const first = await tokens.issueServiceMcpToken("language");
    expect(await tokens.verifyServiceMcpToken("language", first)).toBe(true);
    expect(await tokens.verifyServiceMcpToken("speech", first)).toBe(false);
    expect(await tokens.verifyServiceMcpToken("language", "wrong")).toBe(false);

    const second = await tokens.issueServiceMcpToken("language");
    expect(second).not.toBe(first);
    expect(await tokens.verifyServiceMcpToken("language", first)).toBe(false);
    expect(await tokens.verifyServiceMcpToken("language", second)).toBe(true);
  });
});

describe("language MCP tools", () => {
  it("advertises both tools and analyzes sentiment", async () => {
    expect(language.languageMcpTools.map((tool) => tool.name).sort()).toEqual([
      "analyze_text",
      "translate_text",
    ]);
    const result = await language.callLanguageTool("analyze_text", {
      text: "I love this product",
      task: "sentiment",
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(String(result.content[0].text))).toMatchObject({
      sentiment: "positive",
      confidence: 0.98,
    });
    expect(result.structuredContent).toMatchObject({
      task: "sentiment",
      result: { sentiment: "positive" },
    });
  });

  it("translates text and rejects unknown tasks or tools", async () => {
    const result = await language.callLanguageTool("translate_text", {
      text: "Hello world",
      target: "Spanish",
    });
    expect(result.content[0].text).toBe("Hola mundo");
    expect(result.structuredContent).toMatchObject({
      translation: "Hola mundo",
      target: "Spanish",
    });

    await expect(
      language.callLanguageTool("analyze_text", {
        text: "x",
        task: "unknown",
      })
    ).rejects.toThrow(/task/i);
    await expect(
      language.callLanguageTool("remove_text", { text: "x" })
    ).rejects.toThrow(/Unknown language tool/i);
  });
});

describe("speech MCP tools", () => {
  it("advertises the speech tools and reports status", async () => {
    expect(speechMcp.speechMcpTools.map((tool) => tool.name).sort()).toEqual([
      "speech_status",
      "synthesize_speech",
      "transcribe_audio",
    ]);
    const result = await speechMcp.callSpeechTool("speech_status", {});
    const status = JSON.parse(String(result.content[0].text));
    expect(status).toHaveProperty("tts.available");
    expect(status).toHaveProperty("stt.available");
  });

  it("returns real MCP audio content when the system voice is available", async () => {
    const status = await speech.speechStatus();
    if (!status.tts.available) {
      await expect(
        speechMcp.callSpeechTool("synthesize_speech", { text: "test" })
      ).rejects.toThrow(/Text-to-speech failed/i);
      return;
    }
    const result = await speechMcp.callSpeechTool("synthesize_speech", {
      text: "The vault code is 4417.",
      rate: 220,
    });
    const audio = result.content.find((item) => item.type === "audio") as
      | { data: string; mimeType: string }
      | undefined;
    expect(audio?.mimeType).toBe("audio/wav");
    const bytes = Buffer.from(audio!.data, "base64");
    expect(bytes.length).toBeGreaterThan(44);
    expect(bytes.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(result.structuredContent).toMatchObject({
      mime: "audio/wav",
      bytes: bytes.length,
    });
  }, 60_000);

  it("fails honestly when whisper.cpp or its model is missing", async () => {
    const status = await speech.speechStatus();
    if (status.stt.available) return;
    await expect(
      speechMcp.callSpeechTool("transcribe_audio", {
        audio: Buffer.from("RIFF....WAVE").toString("base64"),
        filename: "sample.wav",
      })
    ).rejects.toThrow(/whisper/i);
  });
});

describe("whisper onboarding", () => {
  it("reports binary, model and downloadable model choices honestly", async () => {
    const status = await whisper.whisperSetupStatus();
    expect(status.models.map((model) => model.id)).toEqual([
      "tiny.en",
      "base.en",
      "small.en",
    ]);
    expect(status.installCommand).toContain("brew install whisper.cpp");
    expect(status.modelDir).toContain(".cache/whisper");
    expect(typeof status.available).toBe("boolean");
    expect(status.available).toBe(Boolean(status.binary && status.model));
    expect(status.reason === undefined).toBe(status.available);
  });

  it("rejects an unknown model id without downloading anything", async () => {
    await expect(whisper.downloadWhisperModel("gigantic")).rejects.toThrow(
      /Unknown model/i
    );
  });
});
