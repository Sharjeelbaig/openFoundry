// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight20Regular,
  Book20Regular,
  Cloud20Regular,
  DeveloperBoard20Regular,
  Flash20Regular,
  Globe20Regular,
  Server20Regular,
  Shield20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { CopyButton, StatusBadge } from "@/components/ui";
import type { ProviderStatus } from "@/lib/types";

export default function DiscoverServicesPage() {
  const { data } = useApi<{
    stats: { hostname: string };
    providers: ProviderStatus[];
  }>("/api/system", 15000);
  const providers = data?.providers ?? [];
  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  const services = [
    {
      id: "foundry",
      name: "Local runtime",
      type: "Inference runtime",
      description:
        "The local on-device runtime. Serves cached models through an OpenAI-compatible endpoint and downloads new ones on demand.",
      icon: <DeveloperBoard20Regular />,
      href: "/build/models/deployments",
      provider: providers.find((item) => item.id === "foundry"),
    },
    {
      id: "ollama",
      name: "Ollama",
      type: "Inference runtime",
      description:
        "Community runtime with one-command model pulls. The app uses it for chat models and for nomic-embed-text embeddings.",
      icon: <Server20Regular />,
      href: "/build/models/deployments",
      provider: providers.find((item) => item.id === "ollama"),
    },
    {
      id: "gateway",
      name: "AI Gateway",
      type: "Routing",
      description:
        "Single OpenAI-compatible endpoint with per-key rate limits, routes and optional in-memory response caching.",
      icon: <Flash20Regular />,
      href: "/manage/gateway",
      provider: null,
    },
    {
      id: "project",
      name: "Project API",
      type: "OpenAI-compatible",
      description:
        "The portal's own chat, deployment and agent endpoints, including server-sent-event streaming.",
      icon: <Cloud20Regular />,
      href: "/build/services",
      provider: null,
    },
    {
      id: "embedding",
      name: "Local embeddings",
      type: "Retrieval",
      description:
        "Vector embeddings from Ollama nomic-embed-text, with Local runtime and lexical fallbacks reported in each knowledge base.",
      icon: <Book20Regular />,
      href: "/build/knowledge/search",
      provider: null,
    },
    {
      id: "websearch",
      name: "Web search",
      type: "Public endpoint",
      description:
        "DuckDuckGo HTML search used by the web-search tool. No key, no account, one outbound request per turn.",
      icon: <Globe20Regular />,
      href: "/discover/tools",
      provider: null,
    },
  ];

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">
            Services you can use with this project. Everything runs on or from this
            computer.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/services" className="btn btn-secondary">
            <Server20Regular /> Service health
          </Link>
        </div>
      </div>

      <div className="service-grid mt-16">
        {services.map((service) => (
          <div className="operate-card service-card" key={service.id}>
            <div className="row between">
              <span className="row" style={{ gap: 10 }}>
                <span className="kb-icon">{service.icon}</span>
                <span>
                  <strong className="text-14">{service.name}</strong>
                  <div className="muted text-12">{service.type}</div>
                </span>
              </span>
              {service.provider ? (
                <StatusBadge status={service.provider.online ? "Running" : "Stopped"} />
              ) : (
                <span className="badge green">Available</span>
              )}
            </div>
            <p className="text-12 muted" style={{ lineHeight: "18px", minHeight: 54 }}>
              {service.description}
            </p>
            {service.provider && (
              <div className="facts-list">
                <div className="fact-row">
                  <span>Endpoint</span>
                  <span className="mono text-12 truncate" style={{ maxWidth: 180 }}>
                    {service.provider.url || "On device"}
                  </span>
                </div>
                <div className="fact-row">
                  <span>Models</span>
                  <span>
                    {service.provider.cachedCount}/{service.provider.modelCount} downloaded
                  </span>
                </div>
              </div>
            )}
            {service.id === "project" && (
              <div className="input-with-button">
                <input className="input mono" readOnly value={`${origin}/api/v1`} />
                <CopyButton
                  value={`${origin}/api/v1`}
                  label="Copy project endpoint"
                  className="icon-button"
                />
              </div>
            )}
            {service.id === "gateway" && (
              <div className="input-with-button">
                <input
                  className="input mono"
                  readOnly
                  value={`${origin}/api/gateway/v1/chat/completions`}
                />
                <CopyButton
                  value={`${origin}/api/gateway/v1/chat/completions`}
                  label="Copy gateway endpoint"
                  className="icon-button"
                />
              </div>
            )}
            <div className="row between">
              <Link href={service.href} className="link text-12">
                Configure <ArrowRight20Regular />
              </Link>
              <span className="muted text-12">
                {service.provider?.latencyMs != null
                  ? `${service.provider.latencyMs} ms probe`
                  : "Local"}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="banner info mt-16">
        <Shield20Regular />
        <span>
          There is no marketplace purchase flow here. Services are either already
          installed runtimes or endpoints inside this app, so “connecting” never creates
          a billable resource.
        </span>
      </div>

      <div className="manage-section-title">What each service is used for</div>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Chat</th>
              <th>Embeddings</th>
              <th>Agents</th>
              <th>Evaluations</th>
              <th>Knowledge</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="cell-strong">Local runtime</td>
              <td>Yes</td>
              <td>If cached</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>For qwen3-embedding</td>
            </tr>
            <tr>
              <td className="cell-strong">Ollama</td>
              <td>Yes</td>
              <td>nomic-embed-text</td>
              <td>Yes</td>
              <td>Yes</td>
              <td>Preferred</td>
            </tr>
            <tr>
              <td className="cell-strong">AI Gateway</td>
              <td>Yes (routed)</td>
              <td>No</td>
              <td>Indirect</td>
              <td>Indirect</td>
              <td>No</td>
            </tr>
            <tr>
              <td className="cell-strong">Web search</td>
              <td>Via tool</td>
              <td>No</td>
              <td>Via tool</td>
              <td>No</td>
              <td>No</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
