// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowSync20Regular,
  CheckmarkCircle20Regular,
  Cloud20Regular,
  DeveloperBoard20Regular,
  ErrorCircle20Regular,
  Flash20Regular,
  Globe20Regular,
  Info20Regular,
  Server20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useMounted } from "@/lib/client";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import type { LocalModel, ProviderStatus } from "@/lib/types";

interface Service {
  id: string;
  name: string;
  type: string;
  description: string;
  endpoint: string;
  icon: React.ReactNode;
  provider?: ProviderStatus;
}

export default function ServicesPage() {
  const { data, refresh } = useApi<{
    stats: { hostname: string; cpuModel: string; totalMem: number; freeMem: number };
    providers: ProviderStatus[];
  }>("/api/system", 15000);
  const { data: modelData } = useApi<{ models: LocalModel[]; providers: ProviderStatus[] }>(
    "/api/models",
    30000
  );

  const providers = data?.providers ?? modelData?.providers ?? [];
  const models = modelData?.models ?? [];
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { ok: boolean; ms: number; detail: string }>>(
    {}
  );
  const [now, setNow] = useState(Date.now());
  // The footer reads the wall clock; render it only after mount so SSR and
  // hydration produce the same text (OS-21, React #418).
  const mounted = useMounted();

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const services = useMemo<Service[]>(() => {
    const list: Service[] = [
      {
        id: "project",
        name: "Local project API",
        type: "OpenAI-compatible",
        description:
          "The Foundry-shaped API used by the playground, agents and external OpenAI clients.",
        endpoint: `${origin}/api/v1`,
        icon: <Cloud20Regular />,
      },
      {
        id: "gateway",
        name: "AI Gateway",
        type: "Routing and caching",
        description:
          "Optional single endpoint in front of deployments with per-key rate limiting and request caching.",
        endpoint: `${origin}/api/gateway/v1/chat/completions`,
        icon: <Flash20Regular />,
      },
    ];
    for (const provider of providers) {
      list.push({
        id: provider.id,
        name: provider.label,
        type: provider.id === "huggingface" ? "Model cache" : "Inference runtime",
        description: provider.detail,
        endpoint: provider.url || "On device",
        icon: provider.id === "foundry" ? <DeveloperBoard20Regular /> : <Server20Regular />,
        provider,
      });
    }
    return list;
  }, [origin, providers]);

  const test = async (service: Service) => {
    setTesting(service.id);
    const started = Date.now();
    try {
      if (service.id === "project" || service.id === "gateway") {
        const res = await fetch("/api/models", { cache: "no-store" });
        if (!res.ok) throw new Error(`Project API returned ${res.status}`);
        const json = (await res.json()) as { models?: unknown[] };
        setResults((current) => ({
          ...current,
          [service.id]: {
            ok: true,
            ms: Date.now() - started,
            detail: `${json.models?.length || 0} models discovered`,
          },
        }));
      } else if (service.id === "huggingface") {
        setResults((current) => ({
          ...current,
          [service.id]: {
            ok: (service.provider?.cachedCount || 0) > 0,
            ms: Date.now() - started,
            detail: `${service.provider?.cachedCount || 0} repositories in the local cache`,
          },
        }));
      } else {
        setResults((current) => ({
          ...current,
          [service.id]: {
            ok: Boolean(service.provider?.online),
            ms: Date.now() - started,
            detail: service.provider?.online
              ? `${service.provider.modelCount} models · ${service.provider.cachedCount} downloaded`
              : "Runtime did not respond",
          },
        }));
      }
      setNow(Date.now());
    } catch (error) {
      setResults((current) => ({
        ...current,
        [service.id]: {
          ok: false,
          ms: Date.now() - started,
          detail: error instanceof Error ? error.message : "Test failed",
        },
      }));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">
            Health and endpoints for every service this project depends on.
          </p>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              refresh();
              setNow(Date.now());
            }}
          >
            <ArrowSync20Regular /> Refresh
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        <button className="tab active">Connected services</button>
        <button className="tab" onClick={() => window.scrollTo({ top: 700, behavior: "smooth" })}>
          Endpoints
        </button>
      </div>

      <div className="service-grid mt-12">
        {services.map((service) => {
          const result = results[service.id];
          return (
            <div className="operate-card service-card" key={service.id}>
              <div className="row between">
                <span className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">{service.icon}</span>
                  <span>
                    <strong className="text-14">{service.name}</strong>
                    <span className="badge gray" style={{ marginLeft: 8 }}>
                      {service.type}
                    </span>
                  </span>
                </span>
                {service.provider ? (
                  <StatusBadge status={service.provider.online ? "Running" : "Stopped"} />
                ) : (
                  <StatusBadge status="Running" />
                )}
              </div>
              <p className="text-12 muted" style={{ lineHeight: "18px" }}>
                {service.description}
              </p>
              <div className="input-with-button">
                <input
                  className="input mono"
                  readOnly
                  aria-label={`${service.name} endpoint`}
                  value={service.endpoint}
                />
                <CopyButton
                  value={service.endpoint}
                  label={`Copy ${service.name} endpoint`}
                  className="icon-button"
                />
              </div>
              <div className="row between">
                <span className="muted text-12">
                  {service.provider?.latencyMs != null
                    ? `Last probe ${service.provider.latencyMs} ms`
                    : "Local process"}
                </span>
                <button
                  className="btn btn-sm btn-secondary"
                  disabled={testing === service.id}
                  onClick={() => test(service)}
                >
                  {testing === service.id ? <Spinner /> : "Test connection"}
                </button>
              </div>
              {result && (
                <div className={`service-result${result.ok ? "" : " error"}`}>
                  {result.ok ? <CheckmarkCircle20Regular /> : <ErrorCircle20Regular />}
                  <span>
                    {result.detail} · {result.ms} ms
                  </span>
                </div>
              )}
            </div>
          );
        })}
        {services.length === 2 && (
          <div className="operate-card muted" style={{ gridColumn: "1 / -1" }}>
            No inference runtimes detected. Start Foundry Local or Ollama and refresh.
          </div>
        )}
      </div>

      <div className="banner info mt-16">
        <Info20Regular />
        <span>
          Foundry Local and Ollama are external services on this computer. This app
          reads their OpenAI-compatible APIs and never provisions cloud capacity.
          Starting or stopping them is done from those applications.
        </span>
      </div>

      <div className="manage-section-title">Runtime inventory</div>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Runtime</th>
              <th style={{ width: 260 }}>Endpoint</th>
              <th style={{ width: 110 }}>Status</th>
              <th style={{ width: 100 }}>Models</th>
              <th style={{ width: 120 }}>Downloaded</th>
              <th style={{ width: 110 }}>Latency</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            {providers.map((provider) => (
              <tr key={provider.id}>
                <td className="cell-strong">{provider.label}</td>
                <td className="mono text-12 truncate" style={{ maxWidth: 260 }}>
                  {provider.url || "On device"}
                </td>
                <td>
                  <StatusBadge status={provider.online ? "Running" : "Stopped"} />
                </td>
                <td>{provider.modelCount}</td>
                <td>{provider.cachedCount}</td>
                <td>{provider.latencyMs != null ? `${provider.latencyMs} ms` : "—"}</td>
                <td className="muted truncate" style={{ maxWidth: 380 }}>
                  {provider.detail}
                </td>
              </tr>
            ))}
            {providers.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 36 }}>
                  No runtimes have reported yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="manage-section-title">Endpoints and samples</div>
      <div className="endpoint-grid">
        <div className="operate-card">
          <div className="row between mb-8">
            <h3>Project endpoint</h3>
            <CopyButton
              value={`${origin}/api/v1`}
              label="Copy project endpoint"
              className="icon-button small"
            />
          </div>
          <pre className="code-block">{`POST ${origin}/api/v1/deployments/<name>/chat/completions
Content-Type: application/json
api-key: <deployment key>

{"messages":[{"role":"user","content":"Hello"}],"stream":false}`}</pre>
        </div>
        <div className="operate-card">
          <div className="row between mb-8">
            <h3>Direct agent chat</h3>
            <CopyButton
              value={`${origin}/api/chat`}
              label="Copy chat endpoint"
              className="icon-button small"
            />
          </div>
          <pre className="code-block">{`POST ${origin}/api/v1/agents/<your-agent-id>/chat/completions
Content-Type: application/json
api-key: <agent key>

{"messages":[{"role":"user","content":"Hello"}]}`}</pre>
        </div>
      </div>

      <div className="row mt-12" style={{ gap: 8 }}>
        <Link href="/manage/gateway" className="btn btn-secondary">
          <Cloud20Regular /> Configure AI Gateway
        </Link>
        <Link href="/manage/resources" className="btn btn-secondary">
          <Server20Regular /> Resource details
        </Link>
        <span className="spacer" />
        <span className="muted text-12">
          {models.length} models discovered · checked{" "}
          {mounted ? formatDate(new Date(now).toISOString()) : "just now"}
        </span>
      </div>

      <div className="banner mt-16">
        <Globe20Regular />
        <span>
          Only the optional web-search tool makes outbound requests, to DuckDuckGo.
          Everything else stays inside this process and the local runtimes.
        </span>
      </div>
    </div>
  );
}
