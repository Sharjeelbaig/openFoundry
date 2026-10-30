import "server-only";
import { ChatMessage, ProviderId } from "./types";
import { getRuntimeUrls } from "./providers";

export interface CompletionOptions {
  model: string;
  provider: ProviderId;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export type CompletionEvent =
  | { type: "delta"; text: string }
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

export async function* streamCompletion({
  model,
  provider,
  messages,
  temperature = 0.7,
  topP = 0.95,
  maxTokens = 1024,
  signal,
}: CompletionOptions): AsyncGenerator<CompletionEvent> {
  const urls = await getRuntimeUrls();
  if (provider === "foundry" || provider === "lmstudio" || provider === "llamacpp") {
    const base =
      provider === "foundry"
        ? urls.foundry
        : provider === "lmstudio"
        ? urls.lmstudio
        : urls.llamacpp;
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        top_p: topP,
        max_tokens: maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      }),
      signal,
    });
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
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          const json = JSON.parse(payload) as {
            choices?: { delta?: { content?: string } }[];
            usage?: { prompt_tokens?: number; completion_tokens?: number };
          };
          const text = json.choices?.[0]?.delta?.content;
          if (text) yield { type: "delta", text };
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
    return;
  }

  if (provider === "ollama") {
    const res = await fetch(`${urls.ollama}/api/chat`, {
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

export async function completeChat(
  options: CompletionOptions
): Promise<{ text: string; promptTokens: number; completionTokens: number }> {
  let text = "";
  let promptTokens = 0;
  let completionTokens = 0;
  for await (const event of streamCompletion(options)) {
    if (event.type === "delta") text += event.text;
    if (event.type === "usage") {
      promptTokens = event.promptTokens;
      completionTokens = event.completionTokens;
    }
  }
  return { text, promptTokens, completionTokens };
}
