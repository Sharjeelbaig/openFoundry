// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { taskFor } from "@/lib/providers";

describe("local model task classification", () => {
  it("classifies embeddings", () => {
    expect(taskFor("hf.co/nomic-ai/nomic-embed-text-v1.5-GGUF")).toBe("embedding");
    expect(taskFor("qwen3-embedding-0.6b-generic-gpu:1")).toBe("embedding");
  });

  it("classifies speech and vision", () => {
    expect(taskFor("whisper-large-v3")).toBe("speech");
    expect(taskFor("parakeet-tdt-0.6b-v2-generic-cpu:1")).toBe("speech");
    expect(taskFor("qwen3-vl-4b-instruct-generic-cpu:3")).toBe("vision");
    expect(taskFor("llava:13b")).toBe("vision");
  });

  it("classifies image generation", () => {
    expect(taskFor("sdxl-turbo")).toBe("image");
    expect(taskFor("stable-diffusion-xl")).toBe("image");
  });

  it("defaults to chat", () => {
    expect(taskFor("gemma3:270m")).toBe("chat");
    expect(taskFor("qwen2.5-coder:7b")).toBe("chat");
  });
});
