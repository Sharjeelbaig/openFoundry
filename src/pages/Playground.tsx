import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowClockwise20Regular,
  Attach20Regular,
  Code20Regular,
  Dismiss20Regular,
  History20Regular,
  Send20Regular,
  Settings20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { ModelLogo, OpenFoundryMark } from "../components/Logos";
import { CopyButton, Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { streamChat } from "../lib/api";
import { contextLabel } from "../lib/format";
import { useProviders } from "../lib/useProviders";
import type { ChatMessage, ModelInfo } from "../lib/types";

interface Turn {
  role: "user" | "assistant";
  content: string;
  error?: string;
}

export default function Playground() {
  const { data } = useApp();
  const { providers, loading, refresh } = useProviders(data.settings);
  const [params] = useSearchParams();
  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );

  const [selected, setSelected] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState<{ prompt: number; completion: number } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current || models.length === 0) return;
    initialized.current = true;
    const provider = params.get("provider");
    const model = params.get("model");
    const match = models.find(
      (entry) => entry.providerId === provider && entry.id === model
    );
    const fallback =
      models.find(
        (entry) =>
          entry.providerId === data.settings.defaultProvider &&
          entry.id === data.settings.defaultModel
      ) || models[0];
    const chosen = match || fallback;
    setSelected(`${chosen.providerId}|${chosen.id}`);
  }, [models, params, data.settings]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streaming]);

  const active: ModelInfo | undefined = useMemo(() => {
    if (!selected) return undefined;
    const [providerId, ...rest] = selected.split("|");
    const modelId = rest.join("|");
    return models.find((model) => model.providerId === providerId && model.id === modelId);
  }, [selected, models]);

  const provider = providers.find((entry) => entry.id === active?.providerId);

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming || !active) return;
    const next: Turn[] = [...messages, { role: "user", content: text }];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setStreaming(true);
    setUsage(null);
    let answer = "";
    const payload: ChatMessage[] = [
      ...(systemPrompt.trim() ? [{ role: "system" as const, content: systemPrompt }] : []),
      ...next.map((turn) => ({ role: turn.role, content: turn.content })),
    ];
    try {
      await streamChat(
        {
          providerId: active.providerId,
          model: active.id,
          messages: payload,
          temperature,
          maxTokens,
        },
        (event) => {
          if (event.type === "delta") {
            answer += event.text;
            setMessages((current) =>
              current.map((turn, index) =>
                index === current.length - 1
                  ? { ...turn, content: answer }
                  : turn
              )
            );
          } else if (event.type === "done") {
            setUsage({ prompt: event.promptTokens, completion: event.completionTokens });
          } else if (event.type === "error") {
            throw new Error(event.message);
          }
        }
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setMessages((current) =>
        current.map((turn, index) =>
          index === current.length - 1
            ? { ...turn, content: answer, error: message }
            : turn
        )
      );
    } finally {
      setStreaming(false);
    }
  };

  if (loading && models.length === 0) {
    return (
      <div className="page row" style={{ gap: 8, color: "var(--fg-3)" }}>
        <Spinner /> Scanning local providers…
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="page">
        <div className="page-header">
          <div>
            <h1 className="page-title">Playground</h1>
            <p className="page-subtitle">Test models served by local providers.</p>
          </div>
        </div>
        <div className="empty" style={{ paddingTop: 60 }}>
          <OpenFoundryMark size={48} />
          <h2>No models available</h2>
          <p>
            Start a provider or add an OpenAI-compatible endpoint, then return here.
          </p>
          <div className="row mt-12" style={{ gap: 8 }}>
            <Link to="/manage" className="btn btn-primary">
              <Settings20Regular /> Manage providers
            </Link>
            <button className="btn btn-secondary" onClick={() => void refresh()}>
              <ArrowClockwise20Regular /> Scan again
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="playground-page">
      <div className="playground-title-row">
        <div>
          <h1 className="page-title">Playground</h1>
          <p className="page-subtitle">
            Test models on this computer with the same API your agents will use.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setCodeOpen(true)}>
            <Code20Regular /> API sample
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setMessages([]);
              setUsage(null);
            }}
          >
            <History20Regular /> New chat
          </button>
        </div>
      </div>

      <div className="playground-body">
        <aside className="playground-config">
          <div>
            <div className="field-label mb-8">Model</div>
            <select
              className="select"
              value={selected}
              onChange={(event) => setSelected(event.target.value)}
            >
              {models.map((model) => (
                <option key={`${model.providerId}/${model.id}`} value={`${model.providerId}|${model.id}`}>
                  {model.name} · {model.providerLabel}
                </option>
              ))}
            </select>
            {active && (
              <p className="field-hint">
                {active.publisher} · {provider?.label} ·{" "}
                {contextLabel(active.contextWindow)} context
              </p>
            )}
          </div>

          <div>
            <div className="field-label mb-8">Parameters</div>
            <label className="field mb-12">
              <span className="field-label">Temperature · {temperature.toFixed(2)}</span>
              <input
                className="range"
                type="range"
                min={0}
                max={2}
                step={0.05}
                value={temperature}
                onChange={(event) => setTemperature(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Max tokens</span>
              <input
                className="input"
                type="number"
                min={16}
                max={32768}
                value={maxTokens}
                onChange={(event) => setMaxTokens(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">System prompt</span>
            <textarea
              className="textarea"
              style={{ minHeight: 130 }}
              placeholder="Optional instructions sent before the conversation."
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </label>

          <div className="banner">
            <Sparkle20Regular />
            <span>
              Requests go directly to {provider?.label || "your provider"}. openFoundry
              does not proxy or store prompts.
            </span>
          </div>

          {usage && (
            <div className="operate-card" style={{ padding: 12 }}>
              <div className="row between text-12">
                <span className="muted">Prompt tokens</span>
                <span>{usage.prompt}</span>
              </div>
              <div className="row between text-12">
                <span className="muted">Completion tokens</span>
                <span>{usage.completion}</span>
              </div>
            </div>
          )}
        </aside>

        <div className="playground-chat">
          <div className="builder-chat">
            <div className="chat-head">
              <span className="chat-head-meta">
                {active ? (
                  <>
                    <ModelLogo publisher={active.publisher} name={active.name} size={20} />
                    <strong>{active.name}</strong>
                    <span className="badge gray">{active.providerLabel}</span>
                  </>
                ) : (
                  "No model selected"
                )}
              </span>
              <span className="spacer" />
              <button className="icon-button small" onClick={() => void refresh()} aria-label="Refresh providers">
                <ArrowClockwise20Regular />
              </button>
            </div>

            <div className="chat-body" ref={bodyRef}>
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <ModelLogo publisher={active?.publisher || "Community"} name={active?.name || "?"} size={44} />
                  <h2>Start a conversation</h2>
                  <p>
                    Send a message to test {active?.name || "a local model"}. Responses
                    stream directly from the provider.
                  </p>
                  <div className="suggestion-grid">
                    {[
                      "Explain what this model can do in two sentences.",
                      "Write a short checklist for testing an AI app.",
                      "Summarize the trade-offs of small local models.",
                      "Create a two-line product description for a desk lamp.",
                    ].map((suggestion) => (
                      <button
                        className="suggestion"
                        key={suggestion}
                        onClick={() => void send(suggestion)}
                      >
                        {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="chat-messages">
                  {messages.map((turn, index) => (
                    <div className={`chat-msg ${turn.role}`} key={index}>
                      <span className="chat-msg-label">
                        {turn.role === "user" ? "You" : active?.name || "Assistant"}
                      </span>
                      <div className="chat-bubble">
                        {turn.content}
                        {streaming &&
                          index === messages.length - 1 &&
                          turn.role === "assistant" && (
                            <span className="chat-streaming" />
                          )}
                      </div>
                      {turn.error && <div className="banner error">{turn.error}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="chat-composer">
              <div className="chat-input-wrap">
                <textarea
                  className="chat-input"
                  placeholder="Message the model…"
                  value={input}
                  disabled={!active}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
              </div>
              <div className="chat-composer-actions">
                <button
                  className="icon-button small"
                  aria-label="Attach text file"
                  onClick={() => {
                    const chooser = document.createElement("input");
                    chooser.type = "file";
                    chooser.accept = ".txt,.md,.csv,.json,.html";
                    chooser.onchange = async () => {
                      const file = chooser.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      setInput(`${input}${input ? "\n\n" : ""}${text.slice(0, 8000)}`);
                    };
                    chooser.click();
                  }}
                >
                  <Attach20Regular />
                </button>
                <span className="spacer" />
                <button
                  className="icon-button"
                  aria-label="Send message"
                  disabled={streaming || !input.trim() || !active}
                  onClick={() => void send()}
                >
                  {streaming ? <Spinner /> : <Send20Regular />}
                </button>
              </div>
              <div className="chat-disclaimer">AI-generated content may be incorrect</div>
            </div>
          </div>
        </div>
      </div>

      {codeOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setCodeOpen(false);
        }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="API sample">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">OpenAI-compatible sample</h2>
                <p className="dialog-sub">
                  Point any OpenAI client at the provider endpoint.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <pre className="code-block">{`from openai import OpenAI

client = OpenAI(
    base_url="${provider?.baseUrl || "http://127.0.0.1:11434"}/v1",
    api_key="local",
)

response = client.chat.completions.create(
    model="${active?.id || "your-model"}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`}</pre>
              <div className="banner">
                <Sparkle20Regular />
                <span>
                  Ollama also exposes its native <span className="mono">/api/chat</span>{" "}
                  endpoint. openFoundry uses the provider&apos;s native API.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <CopyButton value={`${provider?.baseUrl || "http://127.0.0.1:11434"}`} label="Copy provider URL" />
              <button className="btn btn-primary" onClick={() => setCodeOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
