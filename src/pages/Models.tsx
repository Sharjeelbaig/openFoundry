import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowClockwise20Regular,
  Dismiss20Regular,
  Search20Regular,
  Settings20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { ModelLogo } from "../components/Logos";
import { CopyButton, Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { contextLabel, formatBytes } from "../lib/format";
import { useProviders } from "../lib/useProviders";
import type { ModelInfo } from "../lib/types";

export default function Models() {
  const { data } = useApp();
  const { providers, loading, error, refresh } = useProviders(data.settings);
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [providerId, setProviderId] = useState("all");
  const [selected, setSelected] = useState<ModelInfo | null>(null);

  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );
  const filtered = useMemo(
    () =>
      models.filter((model) => {
        if (providerId !== "all" && model.providerId !== providerId) return false;
        const q = query.trim().toLowerCase();
        return (
          !q ||
          model.name.toLowerCase().includes(q) ||
          model.id.toLowerCase().includes(q) ||
          model.publisher.toLowerCase().includes(q)
        );
      }),
    [models, providerId, query]
  );

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 14 }}>
        <div>
          <h1 className="page-title">Models {models.length ? `(${models.length})` : ""}</h1>
          <p className="page-subtitle">
            Models discovered from providers on this computer.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => void refresh()}>
            <ArrowClockwise20Regular /> Refresh
          </button>
        </div>
      </div>

      <div className="provider-strip">
        {providers.map((provider) => (
          <button
            key={provider.id}
            className={`provider-pill${providerId === provider.id ? " active" : ""}`}
            onClick={() => setProviderId(providerId === provider.id ? "all" : provider.id)}
          >
            <span className={`status-dot${provider.online ? "" : " muted"}`} />
            <span>{provider.label}</span>
            <span className="badge gray">{provider.models.length}</span>
          </button>
        ))}
        {providers.length === 0 && (
          <span className="muted text-12">No providers configured.</span>
        )}
      </div>

      <div className="catalog-toolbar mt-16">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search models"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 220 }}
          value={providerId}
          onChange={(event) => setProviderId(event.target.value)}
          aria-label="Filter provider"
        >
          <option value="all">All providers</option>
          {providers.map((provider) => (
            <option value={provider.id} key={provider.id}>
              {provider.label}
            </option>
          ))}
        </select>
        <span className="grow" />
        <span className="muted text-12">{filtered.length} models</span>
      </div>

      {error && <div className="banner error mt-12">{error}</div>}

      {loading && models.length === 0 ? (
        <div className="row mt-16" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Scanning local providers…
        </div>
      ) : filtered.length === 0 ? (
        <div className="operate-card mt-16" style={{ textAlign: "center", padding: 48 }}>
          <Sparkle20Regular style={{ width: 26, height: 26, color: "var(--fg-3)" }} />
          <h3 className="mt-12">No models found</h3>
          <p className="muted text-13" style={{ maxWidth: 520, margin: "6px auto 0" }}>
            Start Ollama, LM Studio, llama.cpp or Foundry CLI, then refresh. You can
            also add a custom OpenAI-compatible endpoint.
          </p>
          <button
            className="btn btn-secondary mt-12"
            onClick={() => navigate("/manage")}
          >
            <Settings20Regular /> Manage providers
          </button>
        </div>
      ) : (
        <div className="catalog-grid mt-16">
          {filtered.map((model) => (
            <button
              className="catalog-card"
              key={`${model.providerId}/${model.id}`}
              onClick={() => setSelected(model)}
            >
              <div className="catalog-card-head">
                <ModelLogo publisher={model.publisher} name={model.name} size={36} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="catalog-card-name">{model.name}</div>
                  <div className="catalog-card-pub">
                    <ModelLogo publisher={model.publisher} name={model.publisher} size={14} />
                    <span className="truncate">{model.publisher}</span>
                  </div>
                </div>
              </div>
              <div className="catalog-task">
                <span className="badge gray">Chat completion</span>
              </div>
              <div className="catalog-metrics">
                <span className="catalog-metric">
                  <span>Provider</span>
                  <span className="truncate">{model.providerLabel}</span>
                </span>
                <span className="catalog-metric">
                  <span>Model id</span>
                  <span className="truncate">{model.id}</span>
                </span>
                <span className="catalog-metric">
                  <span>Size</span>
                  <span>{formatBytes(model.sizeBytes)}</span>
                </span>
                <span className="catalog-metric">
                  <span>Context</span>
                  <span>{contextLabel(model.contextWindow)}</span>
                </span>
              </div>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <>
          <div className="drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="drawer" aria-label="Model details">
            <div className="drawer-head">
              <div className="row" style={{ gap: 10 }}>
                <ModelLogo publisher={selected.publisher} name={selected.name} size={36} />
                <div>
                  <h2 className="drawer-title">{selected.name}</h2>
                  <p className="muted text-12">
                    {selected.publisher} · {selected.providerLabel}
                  </p>
                </div>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="drawer-body">
              <div className="model-id-box mono">{selected.id}</div>
              <div className="facts-list">
                <div className="fact-row">
                  <span>Provider</span>
                  <span>{selected.providerLabel}</span>
                </div>
                <div className="fact-row">
                  <span>Publisher</span>
                  <span>{selected.publisher}</span>
                </div>
                <div className="fact-row">
                  <span>Context window</span>
                  <span>{selected.contextWindow ? `${selected.contextWindow.toLocaleString()} tokens` : "Not published"}</span>
                </div>
                <div className="fact-row">
                  <span>Size on disk</span>
                  <span>{formatBytes(selected.sizeBytes)}</span>
                </div>
              </div>
              <div className="row" style={{ gap: 8 }}>
                <CopyButton value={selected.id} label="Copy model id" />
                <span className="muted text-12">Copy model identifier</span>
              </div>
              <div className="banner">
                <Sparkle20Regular />
                <span>
                  Models stay in the provider&apos;s own store. openFoundry does not
                  download or redistribute weights.
                </span>
              </div>
            </div>
            <div className="drawer-footer">
              <button className="btn btn-secondary" onClick={() => setSelected(null)}>
                Close
              </button>
              <button
                className="btn btn-secondary"
                onClick={() =>
                  navigate(
                    `/build/agents?provider=${encodeURIComponent(
                      selected.providerId
                    )}&model=${encodeURIComponent(selected.id)}`
                  )
                }
              >
                Use in agent
              </button>
              <button
                className="btn btn-primary"
                onClick={() =>
                  navigate(
                    `/playground?provider=${encodeURIComponent(
                      selected.providerId
                    )}&model=${encodeURIComponent(selected.id)}`
                  )
                }
              >
                Open in playground
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
