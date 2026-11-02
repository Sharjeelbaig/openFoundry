"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft20Regular,
  Checkmark20Regular,
  ChevronDown20Regular,
  Code20Regular,
  Dismiss20Regular,
  Info20Regular,
  Play20Regular,
  Shield20Regular,
} from "@fluentui/react-icons";
import {
  formatBytes,
  formatDate,
  formatNumber,
  useApi,
  useDeployments,
  useModels,
} from "@/lib/client";
import { useToast } from "@/components/Toast";
import { useDownloads } from "@/components/Downloads";
import { ModelLogo } from "@/components/Logos";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import {
  availabilityLabel,
  modelDescription,
  modelTags,
  publisherLabel,
  runtimeLabel,
  taskLabel,
} from "@/lib/model-info";
import type { DataZone, Deployment, LocalModel, Trace } from "@/lib/types";
import { LOCAL_DEPLOYMENT_TYPE, deploymentTypeFor } from "@/lib/deployment-types";
import DeploymentTypeSelect from "@/components/DeploymentTypeSelect";
import { REGIONS, ZONES } from "@/lib/regions";
import { useOrigin } from "@/components/Origin";

type Tab = "Details" | "Deployments" | "Benchmarks" | "Responsible AI" | "License";

export default function ModelDetail({ modelKey }: { modelKey: string }) {
  const origin = useOrigin();
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, refresh: refreshModels } = useModels(30000);
  const { data: deploymentData, refresh: refreshDeployments } = useDeployments(4000);
  const { jobs, startDownload } = useDownloads();
  const { data: traceData } = useApi<{ traces: Trace[] }>("/api/traces", 10000);
  const { data: systemData } = useApi<{
    stats: { freeMem: number; totalMem: number; cpuModel: string; platform: string };
  }>("/api/system");

  const models = data?.models ?? [];
  const providers = data?.providers ?? [];
  const model = models.find((item) => item.key === modelKey);
  const ollamaOnline = providers.some((provider) => provider.id === "ollama" && provider.online);
  const foundryOnline = providers.some((provider) => provider.id === "foundry" && provider.online);
  const activeDownload = jobs.find(
    (job) =>
      job.modelKey === modelKey &&
      (job.status === "queued" || job.status === "running")
  );
  const deployments = (deploymentData?.deployments ?? []).filter(
    (item) => item.modelId === model?.id
  );
  const traces = (traceData?.traces ?? []).filter(
    (trace) =>
      trace.model === model?.id || (model && trace.model.includes(model.name))
  );

  const [tab, setTab] = useState<Tab>("Details");
  const [versionOpen, setVersionOpen] = useState(false);
  const [deployOpen, setDeployOpen] = useState(false);
  const [codeFor, setCodeFor] = useState<Deployment | null>(null);

  const stats = useMemo(() => {
    if (!traces.length) return null;
    const latency =
      traces.reduce((sum, trace) => sum + trace.latencyMs, 0) / traces.length;
    const tokens = traces.reduce(
      (sum, trace) => sum + trace.completionTokens,
      0
    );
    return {
      runs: traces.length,
      latency,
      tokens,
      tokensPerSecond:
        tokens && latency
          ? tokens / (traces.reduce((s, t) => s + t.latencyMs, 0) / 1000)
          : 0,
    };
  }, [traces]);

  useEffect(() => {
    const onChanged = () => {
      void refreshModels();
      void refreshDeployments();
    };
    window.addEventListener("foundry:downloads-changed", onChanged);
    return () => window.removeEventListener("foundry:downloads-changed", onChanged);
  }, [refreshModels, refreshDeployments]);

  const downloadModel = async () => {
    if (!model || activeDownload) return;
    if (model.provider === "huggingface" && !ollamaOnline) {
      router.push(
        `/setup?provider=ollama&return=${encodeURIComponent(
          `/discover/models/${encodeURIComponent(model.key)}`
        )}`
      );
      return;
    }
    const job = await startDownload(model.key);
    if (job && job.status === "complete") {
      toast(`${model.displayName} is already downloaded.`, "success");
    }
  };

  const setupHref = `/setup?provider=${
    model?.provider === "huggingface" ? "ollama" : model?.provider || "ollama"
  }&return=${encodeURIComponent(`/discover/models/${encodeURIComponent(modelKey)}`)}`;

  if (loading && !model) {
    return (
      <div className="page row" style={{ gap: 8, color: "var(--fg-3)" }}>
        <Spinner /> Loading model…
      </div>
    );
  }

  if (!model) {
    return (
      <div className="page">
        <div className="banner error">
          This model is no longer present in the local catalog. It may have been
          removed from the runtime or cache. A Hugging Face model that was downloaded
          through Ollama appears under the Ollama runtime instead.
        </div>
        <div className="row mt-16" style={{ gap: 8 }}>
          <Link href="/discover/models" className="btn btn-secondary">
            Back to models
          </Link>
          <Link
            href="/discover/models?provider=ollama"
            className="btn btn-primary"
          >
            Browse Ollama models
          </Link>
        </div>
      </div>
    );
  }

  const facts = [
    { label: "Publisher", value: publisherLabel(model) },
    { label: "Author", value: model.publisher },
    { label: "Type", value: taskLabel(model.task) },
    {
      label: "Lifecycle",
      value: deployments.length
        ? "Deployed in this project"
        : model.cached
        ? "Downloaded, not deployed"
        : "Download required",
    },
  ];
  const io = {
    input:
      model.task === "vision"
        ? "text, image"
        : model.task === "speech"
        ? "audio"
        : model.task === "image"
        ? "text"
        : "text",
    output:
      model.task === "embedding"
        ? "vector"
        : model.task === "image"
        ? "image"
        : model.task === "speech"
        ? "audio"
        : "text",
  };

  return (
    <div className="page model-detail-page" style={{ paddingTop: 18 }}>
      <div className="model-detail-head">
        <button
          className="icon-button"
          onClick={() => router.push("/discover/models")}
          aria-label="Back to models"
        >
          <ArrowLeft20Regular />
        </button>
        <ModelLogo publisher={publisherLabel(model)} name={model.displayName} size={32} />
        <h1 className="model-detail-title">{model.displayName}</h1>
        <span className="grow" />
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-secondary"
            onClick={() => setVersionOpen((value) => !value)}
            aria-expanded={versionOpen}
          >
            Version: {model.version || "1"}{" "}
            <ChevronDown20Regular style={{ width: 14, height: 14 }} />
          </button>
          {versionOpen && (
            <div className="menu-popover" style={{ right: 0, top: 38, minWidth: 260 }}>
              <div className="muted text-12" style={{ padding: "6px 10px" }}>
                AVAILABLE VERSIONS
              </div>
              <button className="menu-item" onClick={() => setVersionOpen(false)}>
                <Checkmark20Regular />
                <span style={{ flex: 1 }}>{model.version || "1"}</span>
                <span className="muted text-12">{runtimeLabel(model)}</span>
              </button>
              <p className="muted text-12" style={{ padding: "4px 10px 8px" }}>
                The local runtime exposes one alias per model. Pull another tag in
                Ollama or Local runtime to see more versions.
              </p>
            </div>
          )}
        </div>
        {model.provider === "huggingface" ? (
          model.cached ? (
            <button
              className="btn btn-secondary"
              disabled
              title="This repository is already in the local Hugging Face cache."
            >
              Cached
            </button>
          ) : !ollamaOnline ? (
            <Link href={setupHref} className="btn btn-primary">
              Set up Ollama
            </Link>
          ) : (
            <button
              className="btn btn-primary"
              disabled={Boolean(activeDownload)}
              title={
                activeDownload
                  ? "Download in progress"
                  : "Download this repository through Ollama"
              }
              onClick={() => void downloadModel()}
            >
              {activeDownload ? (
                <>
                  <Spinner /> Downloading
                </>
              ) : (
                "Download"
              )}
            </button>
          )
        ) : (
          <button
            className="btn btn-primary"
            disabled={Boolean(activeDownload)}
            title={
              activeDownload
                ? "Download in progress"
                : !model.cached
                ? "Download this model into the local cache"
                : "Deploy this model on this computer"
            }
            onClick={() =>
              !model.cached ? void downloadModel() : setDeployOpen(true)
            }
          >
            {activeDownload ? (
              <>
                <Spinner /> Downloading
              </>
            ) : !model.cached ? (
              "Download"
            ) : (
              "Deploy"
            )}
          </button>
        )}
      </div>

      <div className="tabbar mt-8" style={{ marginBottom: 18 }}>
        {(["Details", "Deployments", "Benchmarks", "Responsible AI", "License"] as Tab[]).map(
          (item) => (
            <button
              key={item}
              className={`tab${tab === item ? " active" : ""}`}
              onClick={() => setTab(item)}
            >
              {item}
              {item === "Deployments" && deployments.length > 0 && (
                <span className="badge gray" style={{ marginLeft: 6 }}>
                  {deployments.length}
                </span>
              )}
            </button>
          )
        )}
      </div>

      {model.provider === "foundry" && !foundryOnline && (
        <div className="banner info mb-16">
          <Info20Regular />
          <span>
            Foundry Local is not serving right now. You can still download catalog
            models with the CLI, but starting the local server is required before
            deployment.
          </span>
          <Link href={setupHref} className="btn btn-secondary btn-sm">
            Set up Foundry Local
          </Link>
        </div>
      )}

      {model.provider === "huggingface" && !ollamaOnline && (
        <div className="banner info mb-16">
          <Info20Regular />
          <span>
            Ollama is not running. It is required to download and run Hugging Face
            models on this computer. Configure it in provider setup, then come back
            to this model.
          </span>
          <Link href={setupHref} className="btn btn-secondary btn-sm">
            Set up Ollama
          </Link>
        </div>
      )}

      {activeDownload && (
        <div className="banner info mb-16">
          <Spinner />
          <span>
            Downloading {model.displayName} with {activeDownload.providerLabel}. The
            download continues while you use the app.
          </span>
          <span className="mono text-12">{Math.round(activeDownload.progress)}%</span>
        </div>
      )}

      <div className="model-detail-layout">
        <div>
          {tab === "Details" && (
            <>
              <p className="model-detail-desc">{modelDescription(model)}</p>
              <div className="chip-row mt-12">
                <span className="badge gray">
                  <ModelLogo publisher={publisherLabel(model)} size={12} />
                  {publisherLabel(model)}
                </span>
                <span className="badge gray">Version: {model.version || "1"}</span>
                <span className="badge gray">{taskLabel(model.task)}</span>
                <span className="badge gray">{runtimeLabel(model)}</span>
              </div>

              <div className="model-highlights">
                <h3 className="section-title bold mb-8">
                  {model.displayName.split(/[/-]/).pop()?.slice(0, 40)}
                </h3>
                <div className="model-spec-table">
                  {[
                    ["Model id", model.id],
                    ["Provider", runtimeLabel(model)],
                    ["Publisher", model.publisher],
                    ["Inference task", taskLabel(model.task)],
                    [
                      "Context window",
                      model.contextWindow
                        ? `${model.contextWindow.toLocaleString()} tokens`
                        : "Not published by the runtime",
                    ],
                    ["Model size on disk", model.sizeBytes ? formatBytes(model.sizeBytes) : "—"],
                    ["Availability", availabilityLabel(model)],
                    ["License", model.license || "See model card"],
                  ].map(([label, value]) => (
                    <div className="model-spec-row" key={label}>
                      <span>{label}</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="model-prose">
                <h3 className="section-title bold mb-8">What runs here</h3>
                <p>
                  This model is discovered from{" "}
                  <strong>{runtimeLabel(model)}</strong> and served by the local
                  Foundry-compatible endpoint on this computer. Deploying it loads{" "}
                  {model.cached
                    ? "the downloaded weights"
                    : "the weights (downloading them first)"}{" "}
                  and exposes an OpenAI-compatible chat completions route. Requests,
                  prompts and responses stay on this machine.
                </p>
                <p>
                  {model.cached
                    ? "The model is already in the local cache, so a deployment becomes ready immediately."
                    : "The runtime will fetch the model before the deployment becomes ready. The deployment is created right away and reports Creating until the download finishes."}
                </p>
              </div>

              <div className="model-cards">
                <div className="operate-card">
                  <h3 className="mb-8">Capabilities</h3>
                  <ul className="model-list">
                    <li>{taskLabel(model.task)} over the OpenAI-compatible API</li>
                    <li>Streaming and non-streaming responses</li>
                    <li>Runs offline after the weights are cached</li>
                    <li>
                      {model.task === "embedding"
                        ? "Vector embeddings for local retrieval"
                        : "Can be used by agents, playground and batch jobs"}
                    </li>
                  </ul>
                </div>
                <div className="operate-card">
                  <h3 className="mb-8">Tags</h3>
                  <div className="chip-row" style={{ marginBottom: 0 }}>
                    {modelTags(model).map((tag) => (
                      <span className="badge gray" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "Deployments" && (
            <>
              <div className="row between mb-12">
                <p className="muted text-13">
                  Deployments created from this catalog entry in the local project.
                </p>
                {model.provider === "huggingface" ? (
                  model.cached ? (
                    <button className="btn btn-secondary btn-sm" disabled>
                      Cached
                    </button>
                  ) : !ollamaOnline ? (
                    <Link href={setupHref} className="btn btn-primary btn-sm">
                      Set up Ollama
                    </Link>
                  ) : (
                    <button
                      className="btn btn-primary btn-sm"
                      disabled={Boolean(activeDownload)}
                      onClick={() => void downloadModel()}
                    >
                      {activeDownload ? "Downloading…" : "Download"}
                    </button>
                  )
                ) : (
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={Boolean(activeDownload)}
                    onClick={() =>
                      !model.cached ? void downloadModel() : setDeployOpen(true)
                    }
                  >
                    {activeDownload
                      ? "Downloading…"
                      : !model.cached
                      ? "Download"
                      : "Deploy"}
                  </button>
                )}
              </div>
              <div className="table-card">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th style={{ width: 130 }}>Status</th>
                      <th style={{ width: 170 }}>Deployment type</th>
                      <th style={{ width: 180 }}>Created</th>
                      <th style={{ width: 190 }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deployments.map((deployment) => (
                      <tr key={deployment.id}>
                        <td className="cell-strong">{deployment.name}</td>
                        <td>
                          <StatusBadge status={deployment.status} />
                        </td>
                        <td>{deployment.sku}</td>
                        <td>{formatDate(deployment.createdAt)}</td>
                        <td>
                          <div className="inline-actions">
                            <Link
                              href={`/playground?deployment=${encodeURIComponent(
                                deployment.name
                              )}`}
                              className="btn btn-sm btn-outline"
                            >
                              <Play20Regular /> Test
                            </Link>
                            <button
                              className="btn btn-sm btn-ghost"
                              onClick={() => setCodeFor(deployment)}
                            >
                              <Code20Regular /> Code
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {deployments.length === 0 && (
                      <tr>
                        <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 36 }}>
                          No deployments for this model yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "Benchmarks" && (
            <>
              <div className="banner info mb-16">
                <Play20Regular />
                <span>
                  No third-party benchmark scores are bundled. These numbers are
                  measured locally from saved traces for this model.
                </span>
              </div>
              <div className="metric-grid">
                <div className="metric-card">
                  <span className="metric-label">Runs measured</span>
                  <span className="metric-value">{stats?.runs || "—"}</span>
                  <span className="metric-note">Traces for this model</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Average latency</span>
                  <span className="metric-value">
                    {stats ? `${Math.round(stats.latency)} ms` : "—"}
                  </span>
                  <span className="metric-note">End-to-end per response</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Completion tokens</span>
                  <span className="metric-value">{stats ? formatNumber(stats.tokens) : "—"}</span>
                  <span className="metric-note">Generated on this computer</span>
                </div>
                <div className="metric-card">
                  <span className="metric-label">Throughput</span>
                  <span className="metric-value">
                    {stats ? `${Math.max(0, stats.tokensPerSecond).toFixed(1)} tok/s` : "—"}
                  </span>
                  <span className="metric-note">Completion tokens / wall time</span>
                </div>
              </div>
              <div className="table-card mt-16">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 170 }}>Time</th>
                      <th>Prompt</th>
                      <th style={{ width: 100 }}>Latency</th>
                      <th style={{ width: 110 }}>Tokens</th>
                    </tr>
                  </thead>
                  <tbody>
                    {traces.slice(0, 20).map((trace) => (
                      <tr key={trace.id}>
                        <td className="muted">{formatDate(trace.at)}</td>
                        <td className="truncate" style={{ maxWidth: 460 }}>
                          {trace.prompt}
                        </td>
                        <td>{trace.latencyMs} ms</td>
                        <td>{trace.promptTokens + trace.completionTokens}</td>
                      </tr>
                    ))}
                    {traces.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 36 }}>
                          No local measurements yet. Test this model in the playground
                          to populate real latency data.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "Responsible AI" && (
            <div className="model-prose">
              <h3 className="section-title bold mb-8">Local execution and privacy</h3>
              <p>
                Inference runs on this computer through {runtimeLabel(model)}. Prompts,
                documents and responses are written only to the local{" "}
                <span className="mono">data/</span> directory and never sent to a cloud service.
                The optional web search tool is the one exception: when an agent uses
                it, the query is sent to DuckDuckGo.
              </p>
              <h3 className="section-title bold mb-8 mt-16">Guardrails</h3>
              <p>
                Agents can apply a Default or Strict guardrail, which injects safety
                instructions into every system prompt. Stricter prompt filtering and
                PII redaction are not performed by the local model, so review outputs
                before using them in production.
              </p>
              <div className="row" style={{ gap: 8 }}>
                <Link href="/build/guardrails" className="btn btn-secondary">
                  <Shield20Regular /> Manage guardrails
                </Link>
                <Link href="/operate/compliance" className="btn btn-secondary">
                  View compliance posture
                </Link>
              </div>
              <h3 className="section-title bold mb-8 mt-16">Limitations</h3>
              <p>
                Local models are smaller than hosted frontier models. They can
                hallucinate, lose coherence on long prompts and produce biased or
                outdated content. Capability claims on this page come only from the
                runtime metadata that actually exists on disk.
              </p>
            </div>
          )}

          {tab === "License" && (
            <div className="model-prose">
              <h3 className="section-title bold mb-8">License</h3>
              <p>{model.license || "The local runtime did not expose a license for this model."}</p>
              <p>
                Model weights remain subject to the license published by{" "}
                {model.publisher}. Check the model card before redistributing weights
                or using outputs commercially.
              </p>
              {model.provider === "huggingface" && (
                <a
                  className="btn btn-secondary"
                  href={`https://huggingface.co/${model.id}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open model card
                </a>
              )}
              {model.provider === "ollama" && (
                <a
                  className="btn btn-secondary"
                  href={`https://ollama.com/library/${model.name.split(":")[0]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open Ollama model page
                </a>
              )}
            </div>
          )}
        </div>

        <aside className="model-facts">
          <div className="operate-card">
            <h3 className="mb-12">Quick facts</h3>
            <div className="facts-list">
              {facts.map((fact) => (
                <div className="fact-row" key={fact.label}>
                  <span>{fact.label}</span>
                  <span>{fact.value}</span>
                </div>
              ))}
            </div>
            <div className="divider" style={{ margin: "12px 0" }} />
            <div className="facts-list">
              <div className="fact-row">
                <span>Input type</span>
                <span>{io.input}</span>
              </div>
              <div className="fact-row">
                <span>Output type</span>
                <span>{io.output}</span>
              </div>
              <div className="fact-row">
                <span>Context window</span>
                <span>
                  {model.contextWindow
                    ? `${model.contextWindow.toLocaleString()}`
                    : "—"}
                </span>
              </div>
              <div className="fact-row">
                <span>Pricing</span>
                <span>$0 local</span>
              </div>
              <div className="fact-row">
                <span>Availability</span>
                <span>{availabilityLabel(model)}</span>
              </div>
            </div>
          </div>

          <div className="operate-card mt-16">
            <h3 className="mb-8">Model ID</h3>
            <div className="model-id-box mono">{model.id}</div>
            <CopyButton
              value={model.id}
              label="Copy model id"
              className="btn btn-secondary btn-sm mt-8"
            />
          </div>

          {stats && (
            <div className="operate-card mt-16">
              <h3 className="mb-8">Measured locally</h3>
              <div className="facts-list">
                <div className="fact-row">
                  <span>Average latency</span>
                  <span>{Math.round(stats.latency)} ms</span>
                </div>
                <div className="fact-row">
                  <span>Runs</span>
                  <span>{stats.runs}</span>
                </div>
              </div>
              <Link
                href={`/playground?model=${encodeURIComponent(model.key)}`}
                className="btn btn-secondary btn-sm mt-12"
              >
                <Play20Regular /> Test in playground
              </Link>
            </div>
          )}
        </aside>
      </div>

      {deployOpen && (
        <DeployDrawer
          model={model}
          freeMem={systemData?.stats.freeMem}
          onClose={() => setDeployOpen(false)}
          onCreated={(deployment) => {
            setDeployOpen(false);
            setTab("Deployments");
            refreshDeployments();
            toast(`Deployment ${deployment.name} created`, "success");
          }}
        />
      )}

      {codeFor && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeFor(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Deployment code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Use {codeFor.name}</h2>
                <p className="dialog-sub">
                  OpenAI-compatible endpoint served from this computer.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeFor(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Endpoint</span>
                <span className="input-with-button">
                  <input className="input mono" readOnly value={`${codeFor.endpoint}/chat/completions`} />
                  <CopyButton
                    value={`${codeFor.endpoint}/chat/completions`}
                    label="Copy endpoint"
                    className="btn btn-secondary btn-icon-only"
                  />
                </span>
              </label>
              <label className="field">
                <span className="field-label">API key</span>
                <span className="input-with-button">
                  <input className="input mono" readOnly value={codeFor.apiKey} />
                  <CopyButton
                    value={codeFor.apiKey}
                    label="Copy key"
                    className="btn btn-secondary btn-icon-only"
                  />
                </span>
              </label>
              <pre className="code-block">{`from openai import OpenAI

client = OpenAI(
    base_url="${origin}/api/v1/deployments/${codeFor.name}",
    api_key="${codeFor.apiKey}",
)

response = client.chat.completions.create(
    model="${codeFor.modelId}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`}</pre>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setCodeFor(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DeployDrawer({
  model,
  freeMem,
  onClose,
  onCreated,
}: {
  model: LocalModel;
  freeMem?: number;
  onClose: () => void;
  onCreated: (deployment: Deployment) => void;
}) {
  const { toast } = useToast();
  const defaultName = model.name
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  const [name, setName] = useState(defaultName);
  const [type, setType] = useState(LOCAL_DEPLOYMENT_TYPE);
  const [description, setDescription] = useState("");
  const [modelVersion, setModelVersion] = useState(model.version || "latest");
  const [autoUpdate, setAutoUpdate] = useState(true);
  const [guardrails, setGuardrails] = useState<"Default" | "Strict" | "Off">("Default");
  const [zone, setZone] = useState<DataZone>("US");
  const [region, setRegion] = useState("East US");
  const [tpm, setTpm] = useState(240000);
  const [units, setUnits] = useState(1);
  const [checking, setChecking] = useState(true);
  const [capacityOk, setCapacityOk] = useState<boolean | null>(null);
  const [creating, setCreating] = useState(false);
  const deploymentType = deploymentTypeFor(type);
  const servingMode = deploymentType.servingMode;
  const scope = deploymentType.scope;
  const isProvisioned = Boolean(deploymentType.reserved) || servingMode === "Dedicated";
  const isTokenMetered = servingMode === "Standard" || servingMode === "Developer";

  useEffect(() => {
    setTpm(servingMode === "Developer" ? 50000 : 240000);
  }, [servingMode]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!model.sizeBytes) {
        setCapacityOk(true);
      } else {
        setCapacityOk(!freeMem || model.sizeBytes * units < freeMem * 0.9);
      }
      setChecking(false);
    }, 700);
    return () => clearTimeout(timer);
  }, [model.sizeBytes, freeMem, units]);

  const create = async () => {
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/deployments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelKey: model.key,
          name,
          kind: deploymentType.kind,
          sku: deploymentType.label,
          capacity: isProvisioned ? units : 1,
          reservedSlots: isProvisioned ? units : undefined,
          tpm: isTokenMetered ? tpm : undefined,
          description,
          modelVersion,
          autoUpdate,
          guardrails,
          zone: scope === "Data Zone" ? zone : undefined,
          region: scope === "Region" ? region : undefined,
        }),
      });
      const json = (await res.json()) as { deployment?: Deployment; error?: string };
      if (!res.ok || !json.deployment) throw new Error(json.error || "Deploy failed");
      onCreated(json.deployment);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Deploy failed", "error");
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside className="drawer deploy-drawer" aria-label={`Deploy ${model.displayName}`}>
        <div className="drawer-head">
          <h2 className="drawer-title">Deploy {model.displayName}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="drawer-body">
          <label className="field">
            <span className="field-label">
              Deployment name <span className="required">*</span>
            </span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <div className="field">
            <span className="field-label">Deployment type</span>
            <DeploymentTypeSelect value={type} onChange={setType} />
            <span className="field-hint">{deploymentType.description}</span>
          </div>

          {scope === "Region" && (
            <label className="field">
              <span className="field-label">Region</span>
              <Select
                className="select"
                value={region}
                onChange={(event) => setRegion(event.target.value)}
              >
                {REGIONS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
              <span className="field-hint">
                Pinned to an isolated local runtime for this region.
              </span>
            </label>
          )}

          {scope === "Data Zone" && (
            <label className="field">
              <span className="field-label">Data zone</span>
              <Select
                className="select"
                value={zone}
                onChange={(event) => setZone(event.target.value as DataZone)}
              >
                {ZONES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </Select>
              <span className="field-hint">
                Requests route only to local runtimes tagged for this data zone.
              </span>
            </label>
          )}

          <div className="field">
            <span className="field-label">Model version settings</span>
            <div className="form-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
              <Select
                className="select"
                value={modelVersion}
                onChange={(event) => setModelVersion(event.target.value)}
                aria-label="Model version"
              >
                <option value="latest">latest</option>
                {model.version && model.version !== "latest" && (
                  <option value={model.version}>{model.version}</option>
                )}
              </Select>
              <Select
                className="select"
                value={autoUpdate ? "on" : "off"}
                onChange={(event) => setAutoUpdate(event.target.value === "on")}
                aria-label="Model auto-update"
              >
                <option value="on">Auto-update enabled</option>
                <option value="off">Auto-update disabled</option>
              </Select>
            </div>
          </div>

          {isTokenMetered && (
            <label className="field">
              <span className="field-label">Tokens per minute rate limit</span>
              <input
                className="input"
                type="number"
                min={1000}
                step={1000}
                value={tpm}
                onChange={(event) => setTpm(Math.max(1000, Number(event.target.value)))}
              />
              <span className="field-hint">
                Enforced locally: requests over this rate receive 429 with Retry-After.
              </span>
            </label>
          )}

          {isProvisioned && (
            <div className="field">
              <span className="field-label">
                {servingMode === "Dedicated"
                  ? "Reserved model instances"
                  : "Provisioned throughput units"}
                <span className="required"> *</span>
              </span>
              <div className="instance-row">
                <input
                  type="range"
                  className="range"
                  min={1}
                  max={10}
                  value={units}
                  onChange={(event) => setUnits(Number(event.target.value))}
                  aria-label="Reserved units"
                />
                <input
                  className="input instance-input"
                  type="number"
                  min={1}
                  max={10}
                  value={units}
                  onChange={(event) =>
                    setUnits(Math.min(10, Math.max(1, Number(event.target.value))))
                  }
                />
                <span className="muted">/10</span>
              </div>
              <span className="field-hint">
                Reserves {units} local concurrency {units === 1 ? "slot" : "slots"};
                extra requests queue and are measured.
              </span>
            </div>
          )}

          <label className="field">
            <span className="field-label">Guardrails</span>
            <Select
              className="select"
              value={guardrails}
              onChange={(event) =>
                setGuardrails(event.target.value as "Default" | "Strict" | "Off")
              }
            >
              <option value="Default">Default</option>
              <option value="Strict">Strict</option>
              <option value="Off">Off</option>
            </Select>
          </label>

          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="textarea"
              style={{ minHeight: 72 }}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What is this deployment for?"
            />
          </label>

          <div className="banner">
            <Shield20Regular />
            <span>
              {servingMode} serving runs for real on this computer: token metering,
              rate limits, reserved slots and queues are enforced. Data residency is the
              one part that stays simulated — everything runs on this machine, so nothing
              is billed and no cloud quota is consumed.
            </span>
          </div>
          <p className="capacity-note">
            {model.sizeBytes
              ? `Weights: ${formatBytes(model.sizeBytes)} · free memory: ${
                  freeMem ? formatBytes(freeMem) : "unknown"
                }`
              : "Weight size is not published by this runtime."}
          </p>
        </div>
        <div className="drawer-footer">
          {checking ? (
            <span className="row muted text-12" style={{ gap: 8 }}>
              <Spinner /> Checking capacity…
            </span>
          ) : capacityOk ? (
            <span className="badge green">
              <Checkmark20Regular /> Capacity available
            </span>
          ) : (
            <span className="badge">Not enough free memory — the model may be slow</span>
          )}
          <span className="grow" />
          <button className="btn btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={checking || creating || !name.trim()}
            onClick={create}
          >
            {creating ? <Spinner /> : null} Deploy
          </button>
        </div>
      </aside>
    </>
  );
}
