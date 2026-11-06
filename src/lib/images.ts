// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { getSettings } from "./store";
import type { LocalSettings } from "./types";

/**
 * Image generation through a local, user-configured runtime.
 *
 * Two protocols cover the common self-hosted servers:
 *   - AUTOMATIC1111 / Forge / SD.Next: /sdapi/v1/txt2img
 *   - OpenAI-compatible image servers (LocalAI and friends): /v1/images/generations
 *
 * The runtime is never bundled. openFoundry probes it, lists its models, and
 * reports the exact connection error when it is not running.
 */

export type ImageProviderKind = "automatic1111" | "openai";

export interface ImageTarget {
  kind: ImageProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface ImageStatus {
  available: boolean;
  kind?: ImageProviderKind;
  baseUrl?: string;
  models: string[];
  reason?: string;
}

const KNOWN_URLS: { kind: ImageProviderKind; url: string }[] = [
  { kind: "automatic1111", url: "http://127.0.0.1:7860" },
  { kind: "openai", url: "http://127.0.0.1:8080" },
];

function authHeaders(target: ImageTarget): Record<string, string> {
  return target.apiKey ? { authorization: `Bearer ${target.apiKey}` } : {};
}

async function timeoutFetch(
  url: string,
  init: RequestInit,
  ms: number
): Promise<Response> {
  return fetch(url, { ...init, signal: AbortSignal.timeout(ms) });
}

function trimBase(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export async function candidates(): Promise<
  { kind: ImageProviderKind; baseUrl: string; apiKey: string; model: string }[]
> {
  const settings = await getSettings();
  if (settings.imageUrl?.trim()) {
    const configured = trimBase(settings.imageUrl);
    if (settings.imageProvider !== "auto") {
      return [
        {
          kind: settings.imageProvider,
          baseUrl: configured,
          apiKey: settings.imageApiKey || "",
          model: settings.imageModel || "",
        },
      ];
    }
    return KNOWN_URLS.map((entry) => ({
      kind: entry.kind,
      baseUrl: configured,
      apiKey: settings.imageApiKey || "",
      model: settings.imageModel || "",
    }));
  }
  return KNOWN_URLS.map((entry) => ({
    kind: entry.kind,
    baseUrl: entry.url,
    apiKey: settings.imageApiKey || "",
    model: settings.imageModel || "",
  }));
}

async function probeAutomatic1111(target: ImageTarget): Promise<string[] | null> {
  try {
    const res = await timeoutFetch(`${target.baseUrl}/sdapi/v1/sd-models`, {}, 1500);
    if (!res.ok) return null;
    const models = (await res.json()) as { title?: string; model_name?: string }[];
    return models
      .map((model) => model.title || model.model_name || "")
      .filter(Boolean);
  } catch {
    return null;
  }
}

async function probeOpenAI(target: ImageTarget): Promise<string[] | null> {
  try {
    const res = await timeoutFetch(
      `${target.baseUrl}/v1/models`,
      { headers: authHeaders(target) },
      1500
    );
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { id?: string }[] };
    return (body.data || []).map((model) => model.id || "").filter(Boolean);
  } catch {
    return null;
  }
}

/** Finds the first reachable runtime and returns its models. */
export async function imageStatus(): Promise<ImageStatus> {
  const targets = await candidates();
  const tried: string[] = [];
  for (const target of targets) {
    tried.push(`${target.kind} at ${target.baseUrl}`);
    const models =
      target.kind === "automatic1111"
        ? await probeAutomatic1111(target)
        : await probeOpenAI(target);
    if (models) {
      return {
        available: true,
        kind: target.kind,
        baseUrl: target.baseUrl,
        models,
      };
    }
  }
  return {
    available: false,
    models: [],
    reason: `No image runtime answered. Tried ${tried.join(", ")}. Start AUTOMATIC1111, Forge, SD.Next or a local OpenAI-compatible image server, or set its URL in Manage.`,
  };
}

function mimeFor(base64: string): string {
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("UklGR")) return "image/webp";
  return "image/png";
}

export interface GenerateImageInput {
  prompt: string;
  negativePrompt?: string;
  width?: number;
  height?: number;
  steps?: number;
  seed?: number;
  model?: string;
}

export interface GeneratedImage {
  buffer: Buffer;
  mime: string;
  model: string;
  seed: number;
  provider: ImageProviderKind;
}

export async function generateImage(
  input: GenerateImageInput
): Promise<GeneratedImage> {
  const prompt = input.prompt?.trim();
  if (!prompt) throw new Error("A prompt is required.");
  if (prompt.length > 4000) throw new Error("The prompt is limited to 4000 characters.");
  const width = Math.min(Math.max(input.width ?? 1024, 64), 2048);
  const height = Math.min(Math.max(input.height ?? 1024, 64), 2048);
  const steps = Math.min(Math.max(input.steps ?? 25, 1), 150);
  const seed = Number.isFinite(input.seed) ? Number(input.seed) : -1;

  const targets = await candidates();
  const failures: string[] = [];

  for (const target of targets) {
    const model = input.model?.trim() || target.model;
    try {
      if (target.kind === "automatic1111") {
        const res = await timeoutFetch(
          `${target.baseUrl}/sdapi/v1/txt2img`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              prompt,
              negative_prompt: input.negativePrompt || "",
              width,
              height,
              steps,
              cfg_scale: 7,
              seed,
              sampler_name: "DPM++ 2M Karras",
            }),
          },
          180_000
        );
        if (!res.ok) {
          failures.push(`${target.baseUrl} returned ${res.status}`);
          continue;
        }
        const body = (await res.json()) as { images?: string[]; info?: string };
        const base64 = body.images?.[0];
        if (!base64) {
          failures.push(`${target.baseUrl} returned no image`);
          continue;
        }
        let resolvedSeed = seed;
        try {
          const info = body.info ? (JSON.parse(body.info) as { seed?: number }) : null;
          if (info?.seed != null) resolvedSeed = info.seed;
        } catch {
          // info is optional
        }
        return {
          buffer: Buffer.from(base64, "base64"),
          mime: mimeFor(base64),
          model: model || "automatic1111",
          seed: resolvedSeed,
          provider: "automatic1111",
        };
      }

      const res = await timeoutFetch(
        `${target.baseUrl}/v1/images/generations`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            ...authHeaders(target),
          },
          body: JSON.stringify({
            ...(model ? { model } : {}),
            prompt,
            n: 1,
            size: `${width}x${height}`,
            response_format: "b64_json",
          }),
        },
        180_000
      );
      if (!res.ok) {
        failures.push(`${target.baseUrl} returned ${res.status}`);
        continue;
      }
      const body = (await res.json()) as {
        data?: { b64_json?: string }[];
        seed?: number;
      };
      const base64 = body.data?.[0]?.b64_json;
      if (!base64) {
        failures.push(`${target.baseUrl} returned no image`);
        continue;
      }
      return {
        buffer: Buffer.from(base64, "base64"),
        mime: mimeFor(base64),
        model: model || "openai-compatible",
        seed: body.seed ?? seed,
        provider: "openai",
      };
    } catch (error) {
      failures.push(
        `${target.baseUrl}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  throw new Error(
    `No image runtime produced an image. ${failures.join("; ")}. Configure the runtime URL in Manage → Runtime endpoints.`
  );
}

/** Settings shape used by the API, for callers that already hold settings. */
export function imageSettings(settings: LocalSettings) {
  return {
    provider: settings.imageProvider,
    url: settings.imageUrl,
    model: settings.imageModel,
  };
}
