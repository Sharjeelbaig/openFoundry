// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { Deployment, ModelTask } from "./types";

/**
 * Classify a model by name. Kept here (instead of in `providers.ts`, which is
 * server-only) so client pickers can tell a chat model from an embeddings or
 * speech one without pulling in the Node runtime.
 */
export function taskFor(name: string): ModelTask {
  const n = name.toLowerCase();
  if (n.includes("embed")) return "embedding";
  // Image generation is checked before vision: "image" appears in both names.
  if (
    n.includes("sdxl") ||
    n.includes("stable-diffusion") ||
    n.includes("diffusion") ||
    n.includes("flux") ||
    n.includes("dall-e") ||
    n.includes("sd3") ||
    n.includes("kandinsky") ||
    n.includes("playground-v2")
  )
    return "image";
  if (
    n.includes("whisper") ||
    n.includes("speech") ||
    n.includes("asr") ||
    n.includes("tts") ||
    n.includes("parakeet") ||
    n.includes("moonshine") ||
    n.includes("wav2vec") ||
    n.includes("piper") ||
    n.includes("kokoro") ||
    n.includes("bark")
  )
    return "speech";
  if (
    n.includes("vision") ||
    n.includes("vl-") ||
    n.includes("multimodal") ||
    n.includes("llava") ||
    n.includes("moondream") ||
    n.includes("pixtral") ||
    n.includes("idefics") ||
    n.includes("internvl") ||
    n.includes("minicpm-v") ||
    n.includes("image") ||
    n.includes("sam") ||
    n.includes("florence")
  )
    return "vision";
  return "chat";
}

/**
 * True when a deployment can serve chat completions. Vision models are
 * chat-capable too; embeddings, speech and image deployments are not, so they
 * must not be offered by a "Chat completions model" picker (OS-24).
 */
export function isChatDeployment(
  deployment: Pick<Deployment, "modelId" | "modelName">
): boolean {
  const task = taskFor(deployment.modelId || deployment.modelName || "");
  return task === "chat" || task === "vision";
}
