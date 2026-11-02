"use client";
import Select from "@/components/Select";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Add20Regular,
  Attach20Regular,
  Code20Regular,
  Dismiss20Regular,
  History20Regular,
  Options20Regular,
  Send20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi, useDeployments, useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import { ModelLogo } from "@/components/Logos";
import { taskLabel } from "@/lib/model-info";
import type { Citation, Deployment, LocalModel } from "@/lib/types";
import { useOrigin } from "@/components/Origin";

type Turn = {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: string;
};

const SUGGESTIONS = [
  "Explain how local inference works in two sentences.",
  "Write a haiku about running models without cloud bills.",
  "Summarize the trade-offs of small language models.",
  "Create a short product description for a camping stove.",
];

export default function Playground() {
  const params = useSearchParams();
  const { toast } = useToast();
  const { data: modelData, loading } = useModels(30000);
  const { data: deploymentData } = useDeployments(5000);

  const models = modelData?.models ?? [];
  const deployments = deploymentData?.deployments ?? [];

  const chatModels = useMemo(
    () => models.filter((model) => model.task === "chat" || model.task === "vision"),
    [models]
  );

  const [modelKey, setModelKey] = useState("");
  const [deploymentId, setDeploymentId] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [messages, setMessages] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [usage, setUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    model: string;
    embeddingModel?: string;
  } | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const [paramsOpen, setParamsOpen] = useState(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const hydrated = useRef(false);
  const stream = useRef<{ assistant: string; citations: Citation[] }>({
    assistant: "",
    citations: [],
  });

  useEffect(() => {
    if (hydrated.current || chatModels.length === 0) return;
    hydrated.current = true;
    const wanted = params.get("model");
    const deploymentParam = params.get("deployment");
    if (deploymentParam) {
      const deployment = deployments.find((item) => item.name === deploymentParam);
      if (deployment) setDeploymentId(deployment.id);
    }
    if (wanted) {
      const match = models.find(
        (model) => model.key === wanted || model.id === wanted
      );
      if (match) {
        setModelKey(match.key);
        return;
      }
    }
    const preferred =
      chatModels.find((model) => model.loaded) ||
      chatModels.find((model) => model.cached) ||
      chatModels[0];
    if (preferred) setModelKey(preferred.key);
  }, [chatModels, deployments, models, params]);

  useEffect(() => {
    bodyRef.current?.scrollTo({
      top: bodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const deployment = deployments.find((item) => item.id === deploymentId);
  const model =
    models.find((item) => item.key === modelKey) ||
    (deployment
      ? models.find(
          (item) =>
            item.id === deployment.modelId &&
            item.provider === deployment.provider
        )
      : undefined);

  const activeModel = deployment
    ? {
        id: deployment.modelId,
        provider: deployment.provider,
        displayName: deployment.modelName,
        publisher: deployment.providerLabel,
      }
    : model;

  const send = async (textOverride?: string) => {
    const text = (textOverride ?? input).trim();
    if (!text || streaming || !activeModel) return;
    const next: Turn[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setStreaming(true);
    stream.current = { assistant: "", citations: [] };
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: activeModel.id,
          provider: activeModel.provider,
          instructions: systemPrompt,
          temperature,
          topP,
          maxTokens,
          saveTrace: true,
          messages: [
            ...(systemPrompt.trim()
              ? [{ role: "system", content: systemPrompt }]
              : []),
            ...next.map((turn) => ({ role: turn.role, content: turn.content })),
          ],
        }),
      });
      if (!res.ok || !res.body) throw new Error("The model did not respond");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      setMessages((current) => [...current, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame
            .split("\n")
            .find((item) => item.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          const event = JSON.parse(payload) as {
            type: string;
            text?: string;
            message?: string;
            citations?: Citation[];
            promptTokens?: number;
            completionTokens?: number;
            latencyMs?: number;
            model?: string;
            embeddingModel?: string;
          };
          if (event.type === "meta") {
            stream.current.citations = event.citations || [];
          } else if (event.type === "delta" && event.text) {
            stream.current.assistant += event.text;
            setMessages((current) =>
              current.map((turn, index) =>
                index === current.length - 1
                  ? { role: "assistant", content: stream.current.assistant }
                  : turn
              )
            );
          } else if (event.type === "done") {
            setUsage({
              promptTokens: event.promptTokens || 0,
              completionTokens: event.completionTokens || 0,
              latencyMs: event.latencyMs || 0,
              model: event.model || activeModel.id,
              embeddingModel: event.embeddingModel,
            });
            setMessages((current) =>
              current.map((turn, index) =>
                index === current.length - 1
                  ? {
                      role: "assistant",
                      content: stream.current.assistant,
                      citations: event.citations || stream.current.citations,
                    }
                  : turn
              )
            );
          } else if (event.type === "error") {
            throw new Error(event.message || "Model request failed");
          }
        }
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Model request failed";
      setMessages((current) => {
        const copy = [...current];
        if (copy[copy.length - 1]?.role === "assistant") {
          copy[copy.length - 1] = {
            role: "assistant",
            content: stream.current.assistant,
            error: message,
          };
        } else {
          copy.push({ role: "assistant", content: "", error: message });
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  const origin = useOrigin();

  const endpoint = deployment
    ? `${origin}/api/v1/deployments/${deployment.name}/chat/completions`
    : `${origin}/api/chat`;
  const curl = deployment
    ? `curl ${endpoint} \\
  -H "Content-Type: application/json" \\
  -H "api-key: ${deployment.apiKey}" \\
  -d '{"messages":[{"role":"user","content":"Hello"}],"stream":false}'`
    : `curl ${endpoint} \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${activeModel?.id || ""}","provider":"${activeModel?.provider || "foundry"}","messages":[{"role":"user","content":"Hello"}]}'`;

  return (
    <div className="playground-page">
      <div className="playground-title-row">
        <div>
          <h1 className="page-title">Playground</h1>
          <p className="page-subtitle">
            Test models and deployments on this computer with the same API agents use.
          </p>
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => setCodeOpen(true)}>
            <Code20Regular /> View code
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
            <div className="field-label mb-8">Deployment</div>
            <Select
              className="select"
              value={deploymentId}
              onChange={(event) => setDeploymentId(event.target.value)}
            >
              <option value="">Direct model (no deployment)</option>
              {deployments.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.modelName}
                </option>
              ))}
            </Select>
            {deployment && (
              <div className="row mt-8" style={{ gap: 8 }}>
                <StatusBadge status={deployment.status} />
                {deployment.status === "Creating" && (
                  <span className="muted text-12">Downloading locally…</span>
                )}
              </div>
            )}
          </div>

          <div>
            <div className="field-label mb-8">Model</div>
            {deployment ? (
              <div className="panel" style={{ padding: 10 }}>
                <div className="row" style={{ gap: 8 }}>
                  <ModelLogo
                    publisher={deployment.providerLabel}
                    name={deployment.modelName}
                    size={28}
                  />
                  <span className="min-w-0">
                    <span className="text-13 strong truncate" style={{ display: "block" }}>
                      {deployment.modelName}
                    </span>
                    <span className="text-12 muted">{deployment.providerLabel}</span>
                  </span>
                </div>
              </div>
            ) : (
              <Select
                className="select"
                value={modelKey}
                onChange={(event) => setModelKey(event.target.value)}
              >
                {chatModels.length === 0 && (
                  <option value="">
                    {loading ? "Discovering models…" : "No chat models found"}
                  </option>
                )}
                {chatModels.map((item) => (
                  <option key={item.key} value={item.key}>
                    {item.displayName} · {item.providerLabel}
                    {item.cached ? "" : " (download)"}
                  </option>
                ))}
              </Select>
            )}
            {activeModel && (
              <p className="field-hint">
                {deployment
                  ? "Routed through the deployment endpoint and its API key."
                  : `${taskLabel(model?.task || "chat")} · ${
                      model?.contextWindow
                        ? `${model.contextWindow.toLocaleString()} token context`
                        : "context not published"
                    }`}
              </p>
            )}
          </div>

          <div>
            <div className="row between mb-8">
              <div className="field-label" style={{ margin: 0 }}>
                Parameters
              </div>
              <button
                className="icon-button small"
                aria-label="Reset parameters"
                onClick={() => {
                  setTemperature(0.7);
                  setTopP(0.95);
                  setMaxTokens(1024);
                  toast("Parameters reset", "success");
                }}
              >
                <Options20Regular />
              </button>
            </div>
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
            <label className="field mb-12">
              <span className="field-label">Top P · {topP.toFixed(2)}</span>
              <input
                className="range"
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={topP}
                onChange={(event) => setTopP(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Max tokens</span>
              <input
                className="input"
                type="number"
                min={16}
                max={8192}
                value={maxTokens}
                onChange={(event) => setMaxTokens(Number(event.target.value))}
              />
            </label>
          </div>

          <label className="field">
            <span className="field-label">System prompt</span>
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              placeholder="Optional instructions sent before the conversation."
              value={systemPrompt}
              onChange={(event) => setSystemPrompt(event.target.value)}
            />
          </label>

          <div className="banner">
            <Sparkle20Regular />
            <span>
              The request runs on {activeModel?.provider === "ollama"
                ? "Ollama"
                : activeModel?.provider === "lmstudio"
                ? "LM Studio"
                : activeModel?.provider === "llamacpp"
                ? "llama.cpp"
                : "Foundry Local"}.
              Traces and token counts are recorded locally.
            </span>
          </div>

          {usage && (
            <div className="operate-card" style={{ padding: 12 }}>
              <div className="row between text-12">
                <span className="muted">Prompt tokens</span>
                <span>{usage.promptTokens}</span>
              </div>
              <div className="row between text-12">
                <span className="muted">Completion tokens</span>
                <span>{usage.completionTokens}</span>
              </div>
              <div className="row between text-12">
                <span className="muted">Latency</span>
                <span>{usage.latencyMs} ms</span>
              </div>
              <div className="row between text-12">
                <span className="muted">Model</span>
                <span className="truncate" style={{ maxWidth: 180 }}>
                  {usage.model}
                </span>
              </div>
            </div>
          )}
        </aside>

        <div className="playground-chat">
          <div className="builder-chat">
            <div className="chat-head">
              <span className="chat-head-meta">
                {activeModel ? (
                  <>
                    <ModelLogo
                      publisher={activeModel.publisher || "local"}
                      name={activeModel.displayName}
                      size={20}
                    />
                    <strong>{activeModel.displayName}</strong>
                    <span className="badge gray">
                      {deployment ? "Deployment" : model?.providerLabel || "Local"}
                    </span>
                  </>
                ) : (
                  "No model selected"
                )}
              </span>
              <span className="spacer" />
              <button
                className="icon-button small"
                aria-label="Chat parameters"
                onClick={() => setParamsOpen((value) => !value)}
              >
                <Options20Regular />
              </button>
              <button
                className="icon-button small"
                aria-label="View code"
                onClick={() => setCodeOpen(true)}
              >
                <Code20Regular />
              </button>
            </div>

            {paramsOpen && (
              <div className="chat-head" style={{ borderTop: "1px solid var(--stroke-4)" }}>
                <span className="text-12 muted">Temperature</span>
                <input
                  className="range"
                  style={{ width: 120 }}
                  type="range"
                  min={0}
                  max={2}
                  step={0.05}
                  value={temperature}
                  onChange={(event) => setTemperature(Number(event.target.value))}
                />
                <span className="text-12">{temperature.toFixed(2)}</span>
                <span className="text-12 muted" style={{ marginLeft: 12 }}>
                  Max tokens
                </span>
                <input
                  className="input"
                  style={{ width: 90 }}
                  type="number"
                  value={maxTokens}
                  onChange={(event) => setMaxTokens(Number(event.target.value))}
                />
                <span className="spacer" />
                <button className="btn btn-sm btn-ghost" onClick={() => setParamsOpen(false)}>
                  Close
                </button>
              </div>
            )}

            <div className="chat-body" ref={bodyRef}>
              {messages.length === 0 ? (
                <div className="chat-empty">
                  <ModelLogo
                    publisher={activeModel?.publisher || "local"}
                    name={activeModel?.displayName || "L"}
                    size={44}
                  />
                  <h2>Start a conversation</h2>
                  <p>
                    Send a message to test {activeModel?.displayName || "a local model"}.
                    Responses stream from this computer.
                  </p>
                  <div className="suggestion-grid">
                    {SUGGESTIONS.map((suggestion) => (
                      <button
                        className="suggestion"
                        key={suggestion}
                        onClick={() => void send(suggestion)}
                        disabled={!activeModel}
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
                        {turn.role === "user" ? "You" : activeModel?.displayName || "Assistant"}
                      </span>
                      <div className="chat-bubble">
                        {turn.content}
                        {streaming &&
                          index === messages.length - 1 &&
                          turn.role === "assistant" && (
                            <span className="chat-streaming" />
                          )}
                      </div>
                      {turn.citations && turn.citations.length > 0 && (
                        <div className="chat-citations">
                          {turn.citations.map((citation, citationIndex) => (
                            <div className="chat-citation" key={citationIndex}>
                              [{citationIndex + 1}] {citation.documentName} ·{" "}
                              {citation.score.toFixed(3)}
                            </div>
                          ))}
                        </div>
                      )}
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
                  disabled={!activeModel}
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
                  aria-label="Attach file"
                  title="Attach text to the next message"
                  onClick={() => {
                    const chooser = document.createElement("input");
                    chooser.type = "file";
                    chooser.accept = ".txt,.md,.csv,.json,.html";
                    chooser.onchange = async () => {
                      const file = chooser.files?.[0];
                      if (!file) return;
                      const text = await file.text();
                      setInput(
                        `${input}${input ? "\n\n" : ""}File: ${file.name}\n\n${text.slice(
                          0,
                          8000
                        )}`
                      );
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
                  disabled={streaming || !input.trim() || !activeModel}
                  onClick={() => void send()}
                  style={{ color: "var(--brand-stroke)" }}
                >
                  {streaming ? <Spinner /> : <Send20Regular />}
                </button>
              </div>
              <div className="chat-disclaimer">
                AI-generated content may be incorrect
              </div>
            </div>
          </div>
        </div>
      </div>

      {codeOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Playground code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Use this model in code</h2>
                <p className="dialog-sub">
                  {deployment
                    ? `Deployment ${deployment.name} · OpenAI-compatible`
                    : "Agent-compatible local endpoint"}
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="subtabs">
                <button className="subtab active">curl</button>
              </div>
              <pre className="code-block">{curl}</pre>
              <div className="field-label">Python</div>
              <pre className="code-block">
                {deployment
                  ? `from openai import OpenAI

client = OpenAI(
    base_url="${origin}/api/v1/deployments/${deployment.name}",
    api_key="${deployment.apiKey}",
)

response = client.chat.completions.create(
    model="${deployment.modelId}",
    messages=[{"role": "user", "content": "Hello"}],
)
print(response.choices[0].message.content)`
                  : `import requests

response = requests.post(
    "${origin}/api/chat",
    json={
        "model": "${activeModel?.id || ""}",
        "provider": "${activeModel?.provider || "foundry"}",
        "messages": [{"role": "user", "content": "Hello"}],
    },
    stream=True,
)
for line in response.iter_lines():
    print(line.decode())`}
              </pre>
            </div>
            <div className="dialog-footer">
              <CopyButton value={curl} label="Copy code" className="btn btn-secondary" />
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
