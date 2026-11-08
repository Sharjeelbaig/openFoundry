// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { isChatDeployment, taskFor } from "../src/lib/model-task";

describe("taskFor", () => {
  it("classifies embeddings models", () => {
    expect(taskFor("nomic-embed-text:latest")).toBe("embedding");
    expect(taskFor("qwen3-embedding-0.6b")).toBe("embedding");
  });

  it("classifies vision, speech and image models", () => {
    expect(taskFor("llava:13b")).toBe("vision");
    expect(taskFor("minicpm-v")).toBe("vision");
    expect(taskFor("whisper-large-v3")).toBe("speech");
    expect(taskFor("kokoro-82m")).toBe("speech");
    expect(taskFor("stable-diffusion-xl")).toBe("image");
    expect(taskFor("flux-schnell")).toBe("image");
  });

  it("treats everything else as chat", () => {
    expect(taskFor("qwen2.5-coder-1.5b-instruct")).toBe("chat");
    expect(taskFor("gemma4-31b-cloud")).toBe("chat");
  });
});

describe("isChatDeployment", () => {
  it("rejects an embeddings-only deployment (the OS-24 case)", () => {
    expect(
      isChatDeployment({ modelId: "nomic-embed-text:latest", modelName: "Nomic Embed Text" })
    ).toBe(false);
  });

  it("accepts chat and vision deployments", () => {
    expect(isChatDeployment({ modelId: "gemma4-31b-cloud", modelName: "Gemma 4 31B" })).toBe(true);
    expect(isChatDeployment({ modelId: "qwen2-5-coder-1-5b-instruct", modelName: "Qwen2.5 Coder" })).toBe(true);
    expect(isChatDeployment({ modelId: "llava:13b", modelName: "LLaVA 13B" })).toBe(true);
  });

  it("reads the model name when modelId is missing", () => {
    expect(isChatDeployment({ modelId: "", modelName: "Nomic Embed Text" })).toBe(false);
    expect(isChatDeployment({ modelId: "", modelName: "Gemma 4 31B" })).toBe(true);
  });
});
