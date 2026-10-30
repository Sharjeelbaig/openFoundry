"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import {
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Beaker20Regular,
  Book20Regular,
  Box20Regular,
  Chat20Regular,
  ChevronRight20Regular,
  Code20Regular,
  Copy20Regular,
  DataUsage20Regular,
  Dismiss20Regular,
  Grid20Regular,
  Info20Regular,
  PeopleTeam20Regular,
  Rocket20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import {
  AgentTileIcon,
  BentoTileArt,
  ModelLogo,
  ModelTileIcon,
} from "@/components/Logos";
import { CopyButton, StatusBadge } from "@/components/ui";
import { publisherLabel } from "@/lib/model-info";
import type { Agent, Deployment, LocalSettings, LocalModel } from "@/lib/types";

type Filter = "All" | "Agents" | "Models";

const QUICK = [
  {
    title: "Test in playground",
    desc: "Run prompts and see responses.",
    href: "/playground",
    icon: <Beaker20Regular />,
  },
  {
    title: "Explore models",
    desc: "Browse available models.",
    href: "/discover/models",
    icon: <Grid20Regular />,
  },
  {
    title: "Compare models",
    desc: "Review benchmarks and capabilities.",
    href: "/discover/models?view=leaderboard",
    icon: <DataUsage20Regular />,
  },
];

export default function HomePage() {
  const { toast } = useToast();
  const [filter, setFilter] = useState<Filter>("All");
  const [endpointFor, setEndpointFor] = useState<Agent | null>(null);
  const [codeOpen, setCodeOpen] = useState(false);
  const carouselRef = useRef<HTMLDivElement>(null);

  const { data: settingsData } = useApi<{ settings: LocalSettings }>("/api/settings");
  const { data: systems } = useApi<{ stats: { hostname: string } }>("/api/system");
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: deploymentData } = useApi<{
    deployments: Deployment[];
  }>("/api/deployments", 8000);
  const { data: modelData } = useApi<{ models: LocalModel[] }>("/api/models", 15000);

  const agents = agentData?.agents ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const models = modelData?.models ?? [];
  const settings = settingsData?.settings;
  const userName = settings?.userName || "Local User";
  const projectKey = settings?.apiKey || "";

  const origin =
    typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";

  const credentials = [
    {
      label: "API key",
      value: projectKey,
      secret: true,
    },
    {
      label: "Project endpoint",
      value: `${origin}/api/v1`,
      info: "OpenAI-compatible base URL served by this computer.",
    },
    { label: "OpenAI-compatible endpoint", value: `${origin}/api/v1/chat/completions` },
  ];

  const recent = useMemo(() => {
    const rows: {
      id: string;
      name: string;
      version: string;
      type: string;
      lastViewed: string;
      href: string;
      endpoint: string;
      agent?: Agent;
    }[] = [];
    if (filter !== "Models") {
      for (const agent of agents) {
        rows.push({
          id: agent.id,
          name: agent.name,
          version: String(agent.version),
          type: "Agent",
          lastViewed: agent.lastViewedAt,
          href: `/build/agents/${encodeURIComponent(agent.id)}/build`,
          endpoint: agent.endpoint,
          agent,
        });
      }
    }
    if (filter !== "Agents") {
      for (const deployment of deployments) {
        rows.push({
          id: deployment.id,
          name: deployment.name,
          version: deployment.status === "Running" ? "live" : deployment.status,
          type: "Model",
          lastViewed: deployment.updatedAt,
          href: "/build/models/deployments",
          endpoint: deployment.endpoint,
        });
      }
    }
    return rows.sort(
      (a, b) => new Date(b.lastViewed).getTime() - new Date(a.lastViewed).getTime()
    );
  }, [agents, deployments, filter]);

  const scrollModels = (direction: 1 | -1) => {
    carouselRef.current?.scrollBy({ left: direction * 540, behavior: "smooth" });
  };

  const detail = endpointFor;

  return (
    <div className="home-scroll">
      <div className="home-wrap">
        <h1 className="home-title">Welcome, {userName}</h1>

        <section className="bento" aria-label="Get started">
          <div className="bento-card">
            <BentoTileArt variant="agent" />
            <span className="bento-icon">
              <AgentTileIcon size={32} />
            </span>
            <h3 className="bento-title">Build an agent</h3>
            <p className="bento-desc">
              Define instructions, add tools and knowledge, and create an agent
              for your project.
            </p>
            <div className="bento-actions">
              <Link href="/build/agents" className="btn btn-primary">
                Create an agent
              </Link>
              <button
                className="btn btn-secondary"
                onClick={() => setCodeOpen(true)}
              >
                Start from code
              </button>
            </div>
          </div>
          <div className="bento-card">
            <BentoTileArt variant="model" />
            <span className="bento-icon">
              <ModelTileIcon size={32} />
            </span>
            <h3 className="bento-title">Use a model</h3>
            <p className="bento-desc">
              Manage your existing endpoints or deploy a new model.
            </p>
            <div className="bento-actions">
              <Link href="/build/models/deployments" className="btn btn-secondary">
                View deployments
              </Link>
            </div>
          </div>
        </section>

        <section className="credentials" aria-label="Project credentials">
          {credentials.map((field) => (
            <div className="credential-field" key={field.label}>
              <div className="credential-label">
                {field.label}
                {field.info && (
                  <span title={field.info} className="info-dot">
                    <Info20Regular />
                  </span>
                )}
              </div>
              <div className="credential-row">
                <div className="credential-value" title={field.value}>
                  {field.secret
                    ? "••••••••••••••••••••••••••••••••••••••••••••••••••••••••"
                    : field.value}
                </div>
                <CopyButton
                  value={field.value}
                  label={`Copy ${field.label.toLowerCase()}`}
                  className="credential-copy"
                />
              </div>
            </div>
          ))}
        </section>

        <section className="home-section">
          <h2 className="home-section-title">Model selection</h2>
          <div className="quick-row mt-12">
            {QUICK.map((item) => (
              <Link href={item.href} className="quick-card" key={item.title}>
                <span>
                  <span className="quick-title">{item.title}</span>
                  <span className="quick-desc" style={{ display: "block" }}>
                    {item.desc}
                  </span>
                </span>
                <span style={{ color: "var(--fg-3)", display: "inline-flex" }}>
                  {item.icon}
                </span>
              </Link>
            ))}
          </div>

          <div className="carousel-row">
            <button
              className="icon-button"
              aria-label="Previous models"
              onClick={() => scrollModels(-1)}
            >
              <ArrowLeft20Regular />
            </button>
            <div className="carousel" ref={carouselRef}>
              {models.slice(0, 18).map((model) => (
                <Link
                  className="model-tile"
                  key={model.key}
                  href={`/discover/models/${encodeURIComponent(model.key)}`}
                >
                  <ModelLogo publisher={publisherLabel(model)} name={model.displayName} />
                  <span style={{ minWidth: 0 }}>
                    <span className="model-tile-name">{model.displayName}</span>
                    <span className="model-tile-pub">{publisherLabel(model)}</span>
                  </span>
                </Link>
              ))}
              {models.length === 0 && (
                <span className="muted text-12" style={{ padding: "16px 8px" }}>
                  Looking for local models…
                </span>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="Next models"
              onClick={() => scrollModels(1)}
            >
              <ArrowRight20Regular />
            </button>
          </div>
        </section>

        <section className="home-section">
          <div className="recent-head">
            <h2 className="home-section-title">Recent work</h2>
            <div className="segmented home-filter" role="group" aria-label="Filter recent work">
              {(["All", "Agents", "Models"] as Filter[]).map((value) => (
                <button
                  key={value}
                  className={filter === value ? "active" : ""}
                  onClick={() => setFilter(value)}
                >
                  {value}
                </button>
              ))}
            </div>
          </div>
          <div className="recent-table">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 90 }}>Version</th>
                  <th style={{ width: 90 }}>Type</th>
                  <th style={{ width: 220 }}>Last viewed</th>
                  <th style={{ width: 300 }}>Endpoint</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((row) => (
                  <tr key={`${row.type}-${row.id}`}>
                    <td>
                      <Link href={row.href} className="agent-name">
                        {row.name}
                      </Link>
                    </td>
                    <td>{row.version}</td>
                    <td>{row.type}</td>
                    <td>{new Date(row.lastViewed).toLocaleString()}</td>
                    <td>
                      {row.agent ? (
                        <button
                          className="btn btn-sm btn-outline"
                          onClick={() => setEndpointFor(row.agent || null)}
                        >
                          <Code20Regular /> View endpoint
                        </button>
                      ) : (
                        <Link href={row.href} className="btn btn-sm btn-outline">
                          <Code20Regular /> View endpoint
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
                {recent.length === 0 && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 28 }}>
                      Nothing here yet. Create an agent or deploy a model to see it
                      in recent work.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="home-section" style={{ marginBottom: 24 }}>
          <h2 className="home-section-title mb-12">Learning and resources</h2>
          <div className="resource-cards">
            <Link href="/docs" className="resource-card">
              <span className="resource-icon">
                <Book20Regular />
              </span>
              <span>
                <span className="resource-title">Docs</span>
                <span className="resource-desc" style={{ display: "block" }}>
                  How this local Foundry works, from model discovery to RAG.
                </span>
              </span>
            </Link>
            <a
              href="https://github.com/Sharjeelbaig/openFoundry"
              target="_blank"
              rel="noreferrer"
              className="resource-card"
            >
              <span className="resource-icon">
                <Code20Regular />
              </span>
              <span>
                <span className="resource-title">GitHub</span>
                <span className="resource-desc" style={{ display: "block" }}>
                  Foundry APIs, samples and the source behind the real portal.
                </span>
              </span>
            </a>
            <Link href="/discover/overview" className="resource-card">
              <span className="resource-icon">
                <Chat20Regular />
              </span>
              <span>
                <span className="resource-title">Community</span>
                <span className="resource-desc" style={{ display: "block" }}>
                  Browse the catalog and see what the local runtimes can serve.
                </span>
              </span>
            </Link>
          </div>
        </section>
      </div>

      {codeOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Start from code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Start from code</h2>
                <p className="dialog-sub">
                  Use the local OpenAI-compatible endpoint from any client. Replace
                  the model id with a downloaded model.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="field-label mb-8">Python</div>
              <pre className="code-block">{`from openai import OpenAI

client = OpenAI(
    base_url="${origin}/api/v1",
    api_key="${projectKey}",
)

response = client.chat.completions.create(
    model="<deployment-name>",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`}</pre>
              <div className="field-label mb-8 mt-12">curl</div>
              <pre className="code-block">{`curl ${origin}/api/chat \
  -H "Content-Type: application/json" \
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'`}</pre>
            </div>
            <div className="dialog-footer">
              <CopyButton
                value={`from openai import OpenAI\n\nclient = OpenAI(base_url="${origin}/api/v1", api_key="${projectKey}")\n\nresponse = client.chat.completions.create(model="<deployment-name>", messages=[{"role": "user", "content": "Hello!"}])\nprint(response.choices[0].message.content)`}
                label="Copy sample"
                className="btn btn-secondary"
              />
              <button className="btn btn-primary" onClick={() => setCodeOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {detail && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEndpointFor(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Agent endpoint">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Get code — {detail.name}</h2>
                <p className="dialog-sub">
                  Point any OpenAI-compatible client at this endpoint. It runs on{" "}
                  {systems?.stats.hostname || "this computer"}.
                </p>
              </div>
              <button className="icon-button" onClick={() => setEndpointFor(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Endpoint</span>
                <span className="input-with-button">
                  <input
                    className="input mono"
                    readOnly
                    value={`${origin}/api/v1/agents/${detail.id}/chat/completions`}
                  />
                  <button
                    className="btn btn-secondary btn-icon-only"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        `${origin}/api/v1/agents/${detail.id}/chat/completions`
                      );
                      toast("Endpoint copied", "success");
                    }}
                    aria-label="Copy endpoint"
                  >
                    <Copy20Regular />
                  </button>
                </span>
              </label>
              <label className="field">
                <span className="field-label">Agent id</span>
                <input className="input mono" readOnly value={detail.id} />
              </label>
              <div>
                <div className="field-label mb-8">Python</div>
                <pre className="code-block">{`from openai import OpenAI

client = OpenAI(
    base_url="${origin}/api/v1/agents/${detail.id}",
    api_key="${detail.apiKey}",
)

response = client.chat.completions.create(
    model="${detail.model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`}</pre>
              </div>
              <div>
                <div className="field-label mb-8">curl</div>
                <pre className="code-block">{`curl ${origin}/api/v1/agents/${detail.id}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "api-key: ${detail.apiKey}" \\
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'`}</pre>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setEndpointFor(null)}>
                Close
              </button>
              <Link href={`/build/agents/${encodeURIComponent(detail.id)}/build`} className="btn btn-primary">
                Open agent <ChevronRight20Regular />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
