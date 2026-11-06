// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { ChatTool, ProviderId, WireMessage, WireToolCall } from "./types";
import { hasImageParts } from "./chat-content";
import { getRuntimeUrls } from "./providers";

export interface CompletionOptions {
  model: string;
  provider: ProviderId;
  messages: WireMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  /** Function declarations. When present the call is routed to an OpenAI-compatible endpoint. */
  tools?: ChatTool[];
  toolChoice?: string | Record<string, unknown>;
  signal?: AbortSignal;
  /**
   * Runtime endpoint to use instead of the provider default. Set by the
   * deployment router so a request is served by the deployment's own runtime
   * node (its region/zone), not the shared default runtime.
   */
  baseUrl?: string;
}

export type CompletionEvent =
  | { type: "delta"; text: string }
  | { type: "tool_calls"; calls: WireToolCall[] }
  | {
      type: "usage";
      promptTokens: number;
      completionTokens: number;
    };

function friendlyError(status: number, body: string, provider: ProviderId): string {
  if (status === 404 || /not found|not loaded|no such model/i.test(body)) {
    return provider === "foundry"
      ? "That model is not loaded in Foundry Local. Open Models → Deploy to download and load it first."
      : "That model is not available in Ollama. Pull it first with `ollama pull <model>`.";
  }
  if (status === 500 && /memory|oom/i.test(body)) {
    return "The local runtime ran out of memory while loading the model. Try a smaller variant.";
  }
  return `The local model runtime returned ${status}. ${body.slice(0, 300)}`;
}

function providerName(provider: ProviderId): string {
  if (provider === "foundry") return "Foundry Local";
  if (provider === "ollama") return "Ollama";
  if (provider === "lmstudio") return "LM Studio";
  if (provider === "llamacpp") return "llama.cpp";
  return "The local runtime";
}

function unreachable(provider: ProviderId, base: string): Error {
  return new Error(
    `${providerName(provider)} is not reachable at ${base}. Start the local runtime or select another provider and model.`
  );
}

function rethrowNetworkError(
  error: unknown,
  provider: ProviderId,
  base: string
): never {
  if (error instanceof Error && error.name === "AbortError") throw error;
  throw unreachable(provider, base);
}

interface OpenAiStreamOptions {
  base: string;
  provider: ProviderId;
  model: string;
  messages: WireMessage[];
  temperature: number;
  topP: number;
  maxTokens: number;
  tools?: ChatTool[];
  toolChoice?: string | Record<string, unknown>;
  signal?: AbortSignal;
}

interface ToolCallDelta {
  index?: number;
  id?: string;
  function?: { name?: string; arguments?: string };
}

/**
 * Every local runtime openFoundry supports exposes `/v1/chat/completions`.
 * Talking to all of them through that shape keeps tool calling in one place:
 * Ollama's native `/api/chat` returns tool calls differently and cannot stream
 * them, so any request carrying tools takes this path.
 */
async function* streamOpenAiChat({
  base,
  provider,
  model,
  messages,
  temperature,
  topP,
  maxTokens,
  tools,
  toolChoice,
  signal,
}: OpenAiStreamOptions): AsyncGenerator<CompletionEvent> {
  const payload: Record<string, unknown> = {
    model,
    messages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: true,
    stream_options: { include_usage: true },
  };
  if (tools?.length) {
    payload.tools = tools;
    payload.tool_choice = toolChoice ?? "auto";
  }

  let res: Response;
  try {
    res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (error) {
    rethrowNetworkError(error, provider, base);
  }
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(friendlyError(res.status, body, provider));
  }

  const pending: { id: string; name: string; arguments: string }[] = [];
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const data = trimmed.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const json = JSON.parse(data) as {
          choices?: {
            delta?: { content?: string | null; tool_calls?: ToolCallDelta[] };
          }[];
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const delta = json.choices?.[0]?.delta;
        if (delta?.content) yield { type: "delta", text: delta.content };
        for (const call of delta?.tool_calls || []) {
          const index = call.index ?? 0;
          const slot = (pending[index] ||= { id: "", name: "", arguments: "" });
          if (call.id) slot.id = call.id;
          if (call.function?.name) slot.name += call.function.name;
          if (call.function?.arguments) slot.arguments += call.function.arguments;
        }
        if (json.usage) {
          yield {
            type: "usage",
            promptTokens: json.usage.prompt_tokens || 0,
            completionTokens: json.usage.completion_tokens || 0,
          };
        }
      } catch {
        // ignore malformed keep-alive frames
      }
    }
  }

  const calls = pending
    .filter((call) => call.name)
    .map((call, index): WireToolCall => ({
      id: call.id || `call_${Date.now().toString(36)}${index}`,
      type: "function",
      function: { name: call.name, arguments: call.arguments || "{}" },
    }));
  if (calls.length) yield { type: "tool_calls", calls };
}

export async function* streamCompletion({
  model,
  provider,
  messages,
  temperature = 0.7,
  topP = 0.95,
  maxTokens = 1024,
  tools,
  toolChoice,
  signal,
  baseUrl,
}: CompletionOptions): AsyncGenerator<CompletionEvent> {
  const urls = await getRuntimeUrls();
  const vision = messages.some((message) => hasImageParts(message.content));
  if (provider === "foundry" || provider === "lmstudio" || provider === "llamacpp") {
    const base =
      baseUrl ||
      (provider === "foundry"
        ? urls.foundry
        : provider === "lmstudio"
        ? urls.lmstudio
        : urls.llamacpp);
    yield* streamOpenAiChat({
      base,
      provider,
      model,
      messages,
      temperature,
      topP,
      maxTokens,
      tools,
      toolChoice,
      signal,
    });
    return;
  }

  if (provider === "ollama") {
    const ollamaBase = baseUrl || urls.ollama;
    // Ollama serves the same OpenAI-compatible shape, and it is the only route
    // that streams tool calls or accepts image parts. Native /api/chat is kept
    // for plain text completions.
    if (tools?.length || vision) {
      yield* streamOpenAiChat({
        base: ollamaBase,
        provider,
        model,
        messages,
        temperature,
        topP,
        maxTokens,
        tools,
        toolChoice,
        signal,
      });
      return;
    }
    let res: Response;
    try {
      res = await fetch(`${ollamaBase}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
          keep_alive: "10m",
          options: {
            temperature,
            top_p: topP,
            num_predict: maxTokens,
          },
        }),
        signal,
      });
    } catch (error) {
      rethrowNetworkError(error, provider, ollamaBase);
    }
    if (!res.ok || !res.body) {
      const body = await res.text().catch(() => "");
      throw new Error(friendlyError(res.status, body, provider));
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const json = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
            prompt_eval_count?: number;
            eval_count?: number;
          };
          if (json.message?.content) {
            yield { type: "delta", text: json.message.content };
          }
          if (json.done) {
            yield {
              type: "usage",
              promptTokens: json.prompt_eval_count || 0,
              completionTokens: json.eval_count || 0,
            };
          }
        } catch {
          // ignore malformed lines
        }
      }
    }
    return;
  }

  throw new Error(
    "Hugging Face cache entries cannot be served directly. Connect a local runtime first."
  );
}

export async function completeChat(options: CompletionOptions): Promise<{
  text: string;
  toolCalls: WireToolCall[];
  promptTokens: number;
  completionTokens: number;
}> {
  let text = "";
  let toolCalls: WireToolCall[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  for await (const event of streamCompletion(options)) {
    if (event.type === "delta") text += event.text;
    if (event.type === "tool_calls") toolCalls = event.calls;
    if (event.type === "usage") {
      promptTokens = event.promptTokens;
      completionTokens = event.completionTokens;
    }
  }
  return { text, toolCalls, promptTokens, completionTokens };
}
