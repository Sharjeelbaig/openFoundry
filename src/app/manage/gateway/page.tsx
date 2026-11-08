// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  Cloud20Regular,
  Code20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Flash20Regular,
  Play20Regular,
  Shield20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useDeployments } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import type { Deployment, GatewayConfig, LocalSettings } from "@/lib/types";

const EMPTY: GatewayConfig = {
  enabled: false,
  defaultDeploymentId: "",
  rateLimitPerMinute: 60,
  cacheEnabled: false,
  cacheTtlSeconds: 300,
  routes: [],
  updatedAt: "",
};

export default function GatewayPage() {
  const { toast } = useToast();
  const { data, refresh } = useApi<{ gateway: GatewayConfig }>("/api/gateway", 10000);
  const { data: deploymentData } = useDeployments(8000);
  const { data: settingsData } = useApi<{ settings: LocalSettings }>("/api/settings");

  const deployments = deploymentData?.deployments ?? [];
  const gateway = data?.gateway || EMPTY;
  const projectKey = settingsData?.settings.apiKey || "";

  const [enabled, setEnabled] = useState(false);
  const [defaultDeploymentId, setDefaultDeploymentId] = useState("");
  const [rateLimit, setRateLimit] = useState(60);
  const [cacheEnabled, setCacheEnabled] = useState(false);
  const [cacheTtl, setCacheTtl] = useState(300);
  const [routes, setRoutes] = useState<GatewayConfig["routes"]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [addOpen, setAddOpen] = useState(false);
  const [routeName, setRouteName] = useState("");
  const [routeDeployment, setRouteDeployment] = useState("");

  const [testOpen, setTestOpen] = useState(false);
  const [prompt, setPrompt] = useState("Summarize the AI Gateway in one sentence.");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{
    text: string;
    cached: string | null;
    model: string;
    latency: number;
    error?: string;
  } | null>(null);

  const [origin, setOrigin] = useState("http://localhost:3000");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!data?.gateway) return;
    setEnabled(data.gateway.enabled);
    setDefaultDeploymentId(data.gateway.defaultDeploymentId);
    setRateLimit(data.gateway.rateLimitPerMinute);
    setCacheEnabled(data.gateway.cacheEnabled);
    setCacheTtl(data.gateway.cacheTtlSeconds);
    setRoutes(data.gateway.routes);
    setDirty(false);
  }, [data?.gateway]);

  const endpoint = `${origin}/api/gateway/v1/chat/completions`;
  const running = useMemo(
    () => deployments.filter((item) => item.status === "Running"),
    [deployments]
  );
  const usable = running.length ? running : deployments;

  const save = async (patch?: Partial<GatewayConfig>) => {
    setSaving(true);
    try {
      const res = await fetch("/api/gateway", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled,
          defaultDeploymentId,
          rateLimitPerMinute: rateLimit,
          cacheEnabled,
          cacheTtlSeconds: cacheTtl,
          routes,
          ...patch,
        }),
      });
      if (!res.ok) throw new Error("Could not save gateway settings");
      toast("Gateway settings saved", "success");
      setDirty(false);
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const addRoute = () => {
    const deployment = deployments.find((item) => item.id === routeDeployment);
    if (!deployment) return;
    const name =
      routeName.trim() ||
      deployment.name
        .toLowerCase()
        .replace(/[^a-z0-9-_]+/g, "-")
        .slice(0, 48);
    if (routes.some((route) => route.name === name)) {
      toast("A route with that name already exists", "error");
      return;
    }
    setRoutes((current) => [
      ...current,
      {
        id: `route_${Date.now().toString(36)}`,
        name,
        deploymentId: deployment.id,
        enabled: true,
      },
    ]);
    setDirty(true);
    setAddOpen(false);
    setRouteName("");
  };

  const test = async () => {
    if (!prompt.trim()) return;
    setTesting(true);
    const started = Date.now();
    try {
      const res = await fetch(`${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "api-key": projectKey,
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: prompt }],
          max_tokens: 256,
        }),
      });
      const cached = res.headers.get("x-foundry-gateway-cache");
      const json = (await res.json()) as {
        choices?: { message: { content: string } }[];
        model?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || `Gateway returned ${res.status}`);
      setResult({
        text: json.choices?.[0]?.message.content || "",
        cached,
        model: json.model || "",
        latency: Date.now() - started,
      });
    } catch (error) {
      setResult({
        text: "",
        cached: null,
        model: "",
        latency: Date.now() - started,
        error: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="page manage-page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="row" style={{ gap: 10 }}>
          <h1 className="page-title">AI Gateway</h1>
          <span className="preview-tag">Preview</span>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setTestOpen(true)} disabled={!enabled}>
            <Play20Regular /> Test gateway
          </button>
          <button className="btn btn-primary" onClick={() => save()} disabled={saving || !dirty}>
            {saving ? <Spinner /> : <ArrowSync20Regular />} Save
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        <button className="tab active">Configuration</button>
        <button className="tab" onClick={() => setTestOpen(true)}>
          Test
        </button>
      </div>

      <div className="gateway-hero">
        <div className="gateway-hero-icon">
          <Cloud20Regular />
        </div>
        <div className="gateway-hero-body">
          <div className="row" style={{ gap: 10 }}>
            <h2>Local AI Gateway</h2>
            <span className={`badge ${enabled ? "green" : "gray"}`}>
              {enabled ? "Enabled" : "Disabled"}
            </span>
          </div>
          <p>
            One OpenAI-compatible endpoint in front of every deployment on this
            computer. Routes map models to deployments, enforce a per-minute request
            limit and optionally cache identical requests in memory.
          </p>
          <div className="input-with-button" style={{ maxWidth: 620 }}>
            <input className="input mono" readOnly aria-label="Gateway endpoint" value={endpoint} />
            <CopyButton value={endpoint} label="Copy gateway endpoint" className="icon-button" />
          </div>
        </div>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(event) => {
              setEnabled(event.target.checked);
              setDirty(true);
            }}
          />
          <span>Enable gateway</span>
        </label>
      </div>

      <div className="gateway-grid mt-16">
        <div className="operate-card">
          <h3 className="mb-12">Routing</h3>
          <label className="field">
            <span className="field-label">Default deployment</span>
            <Select
              className="select"
              value={defaultDeploymentId}
              onChange={(event) => {
                setDefaultDeploymentId(event.target.value);
                setDirty(true);
              }}
            >
              <option value="">No default — require an explicit model</option>
              {deployments.map((deployment) => (
                <option key={deployment.id} value={deployment.id}>
                  {deployment.name} · {deployment.modelName} · {deployment.status}
                </option>
              ))}
            </Select>
            <span className="field-hint">
              Requests without a matching route fall back to this deployment.
            </span>
          </label>
          <div className="divider" style={{ margin: "14px 0" }} />
          <label className="field">
            <span className="field-label">Requests per minute</span>
            <input
              className="input"
              type="number"
              min={1}
              max={6000}
              value={rateLimit}
              onChange={(event) => {
                setRateLimit(Math.max(1, Number(event.target.value)));
                setDirty(true);
              }}
            />
            <span className="field-hint">
              Enforced per API key in memory. Requests over the limit receive HTTP 429.
            </span>
          </label>
          <label className="switch-row mt-12">
            <input
              type="checkbox"
              checked={cacheEnabled}
              onChange={(event) => {
                setCacheEnabled(event.target.checked);
                setDirty(true);
              }}
            />
            <span>Cache identical requests</span>
          </label>
          {cacheEnabled && (
            <label className="field mt-8">
              <span className="field-label">Cache lifetime</span>
              <div className="row" style={{ gap: 8 }}>
                <input
                  className="input"
                  type="number"
                  min={0}
                  max={86400}
                  value={cacheTtl}
                  onChange={(event) => {
                    setCacheTtl(Number(event.target.value));
                    setDirty(true);
                  }}
                />
                <span className="muted text-12">seconds</span>
              </div>
            </label>
          )}
        </div>

        <div className="operate-card">
          <div className="row between mb-12">
            <h3>Routes</h3>
            <button
              className="btn btn-sm btn-secondary"
              disabled={deployments.length === 0}
              onClick={() => {
                setRouteDeployment(usable[0]?.id || "");
                setAddOpen(true);
              }}
            >
              <Add20Regular /> Add route
            </button>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Route</th>
                  <th style={{ width: 140 }}>Deployment</th>
                  <th style={{ width: 90 }}>Enabled</th>
                  <th style={{ width: 70 }}>Remove</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((route) => {
                  const deployment = deployments.find(
                    (item) => item.id === route.deploymentId
                  );
                  return (
                    <tr key={route.id}>
                      <td>
                        <span className="mono text-12">{route.name}</span>
                      </td>
                      <td className="truncate" style={{ maxWidth: 140 }}>
                        {deployment?.name || "Missing deployment"}
                      </td>
                      <td>
                        <input
                          type="checkbox"
                          checked={route.enabled}
                          aria-label={`Enable ${route.name}`}
                          onChange={(event) => {
                            setRoutes((current) =>
                              current.map((item) =>
                                item.id === route.id
                                  ? { ...item, enabled: event.target.checked }
                                  : item
                              )
                            );
                            setDirty(true);
                          }}
                        />
                      </td>
                      <td>
                        <button
                          className="icon-button small"
                          aria-label={`Remove ${route.name}`}
                          onClick={() => {
                            setRoutes((current) =>
                              current.filter((item) => item.id !== route.id)
                            );
                            setDirty(true);
                          }}
                        >
                          <Delete20Regular />
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {routes.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 28 }}>
                      No routes. Requests fall back to the default deployment.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="facts-list mt-12">
            <div className="fact-row">
              <span>Deployments available</span>
              <span>{deployments.length}</span>
            </div>
            <div className="fact-row">
              <span>Routes enabled</span>
              <span>{routes.filter((route) => route.enabled).length}</span>
            </div>
            <div className="fact-row">
              <span>Last saved</span>
              <span>{gateway.updatedAt ? formatDate(gateway.updatedAt) : "Never"}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="operate-card mt-16">
        <div className="row between mb-12">
          <h3>How requests are handled</h3>
          <span className="badge gray">
            <Shield20Regular /> On device
          </span>
        </div>
        <div className="gateway-steps">
          {[
            ["1", "Authenticate", "The request must carry the project API key (or a deployment key) in the api-key header."],
            ["2", "Rate limit", `At most ${rateLimit} requests per minute per key inside this process.`],
            ["3", "Route", "The request model is matched to a route, then to a deployment, then to the default."],
            ["4", "Cache", cacheEnabled ? `Identical requests are reused for ${cacheTtl} seconds.` : "Caching is off; every request reaches the model."],
            ["5", "Infer", "The selected local runtime streams the completion and token usage is returned."],
          ].map(([step, title, detail]) => (
            <div className="gateway-step" key={step}>
              <span className="gateway-step-number">{step}</span>
              <strong>{title}</strong>
              <span className="muted text-12">{detail}</span>
            </div>
          ))}
        </div>
      </div>

      {deployments.length === 0 && (
        <div className="banner mt-16">
          <Flash20Regular />
          <span>
            The gateway needs at least one deployment.{" "}
            <Link href="/build/models/deployments" className="link">
              Deploy a model
            </Link>{" "}
            first.
          </span>
        </div>
      )}

      {addOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Add gateway route">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add route</h2>
                <p className="dialog-sub">
                  A route exposes a model name that callers can pass in the request.
                </p>
              </div>
              <button className="icon-button" onClick={() => setAddOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Route name</span>
                <input
                  className="input mono"
                  placeholder="gpt-4o-mini"
                  value={routeName}
                  onChange={(event) => setRouteName(event.target.value)}
                />
                <span className="field-hint">
                  Callers send this value as <span className="mono">model</span>. Leave
                  blank to use the deployment name.
                </span>
              </label>
              <label className="field">
                <span className="field-label">Deployment</span>
                <Select
                  className="select"
                  value={routeDeployment}
                  onChange={(event) => setRouteDeployment(event.target.value)}
                >
                  {usable.map((deployment: Deployment) => (
                    <option key={deployment.id} value={deployment.id}>
                      {deployment.name} · {deployment.modelName}
                    </option>
                  ))}
                </Select>
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setAddOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={addRoute} disabled={!routeDeployment}>
                <Add20Regular /> Add route
              </button>
            </div>
          </div>
        </div>
      )}

      {testOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTestOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Test gateway">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Test the gateway</h2>
                <p className="dialog-sub">
                  Sends one request through routing, rate limiting, caching and the
                  selected local deployment.
                </p>
              </div>
              <button className="icon-button" onClick={() => setTestOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Prompt</span>
                <textarea
                  className="textarea"
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                />
              </label>
              {result && (
                <div className="panel" style={{ padding: 12 }}>
                  <div className="row between mb-8">
                    <span className="field-label" style={{ margin: 0 }}>
                      Response
                    </span>
                    <div className="row" style={{ gap: 6 }}>
                      {result.cached && (
                        <span className={`badge ${result.cached === "hit" ? "green" : "gray"}`}>
                          Cache {result.cached}
                        </span>
                      )}
                      <span className="badge gray">{result.latency} ms</span>
                    </div>
                  </div>
                  {result.error ? (
                    <div className="banner error">{result.error}</div>
                  ) : (
                    <div className="chunk-preview">{result.text}</div>
                  )}
                </div>
              )}
              <div className="banner">
                <Code20Regular />
                <span className="mono text-12">
                  curl {endpoint} -H &quot;api-key: {projectKey}&quot; -H
                  &quot;Content-Type: application/json&quot; -d
                  &apos;{"{"}&quot;messages&quot;:[...]{"}"}&apos;
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setTestOpen(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={test}
                disabled={testing || !enabled || !prompt.trim() || !projectKey}
              >
                {testing ? <Spinner /> : <Play20Regular />} Send request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
