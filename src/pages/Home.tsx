import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Beaker20Regular,
  Book20Regular,
  Box20Regular,
  Code20Regular,
  DataUsage20Regular,
  Grid20Regular,
  PeopleTeam20Regular,
  Play20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { BentoTileArt, ModelLogo } from "../components/Logos";
import { CopyButton } from "../components/ui";
import { useApp } from "../lib/app-context";
import { dataDirectory } from "../lib/api";
import { formatDate } from "../lib/format";
import { useProviders } from "../lib/useProviders";
import { openExternal } from "../lib/open";

export default function Home() {
  const { data } = useApp();
  const { settings, agents } = data;
  const navigate = useNavigate();
  const { providers, loading } = useProviders(settings);
  const [dataPath, setDataPath] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [modelIndex, setModelIndex] = useState(0);
  const [filter, setFilter] = useState<"All" | "Agents" | "Models">("All");

  useEffect(() => {
    void dataDirectory().then(setDataPath);
  }, []);

  const models = useMemo(
    () =>
      providers
        .flatMap((provider) => provider.models)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [providers]
  );
  const online = providers.filter((provider) => provider.online);
  const visibleModels = models.slice(modelIndex, modelIndex + 5);
  const recentAgents = [...agents].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  const recentModels = models.slice(0, 5);
  const endpoint = online[0]?.baseUrl || "No runtime connected";

  return (
    <div className="home-scroll">
      <div className="home-wrap">
        <h1 className="home-title">Welcome, {settings.displayName || "builder"}</h1>

        <section className="bento" aria-label="Get started">
          <div className="bento-card">
            <BentoTileArt variant="agent" />
            <span className="bento-icon">
              <PeopleTeam20Regular />
            </span>
            <h3 className="bento-title">Build an agent</h3>
            <p className="bento-desc">
              Define instructions, add tools and knowledge, and create an agent for
              your workspace.
            </p>
            <div className="bento-actions">
              <Link to="/build/agents" className="btn btn-primary">
                Create an agent
              </Link>
              <Link to="/docs#agents" className="btn btn-secondary">
                Start from code
              </Link>
            </div>
          </div>
          <div className="bento-card">
            <BentoTileArt variant="model" />
            <span className="bento-icon">
              <Box20Regular />
            </span>
            <h3 className="bento-title">Use a model</h3>
            <p className="bento-desc">
              Manage your existing endpoints or connect a new local runtime.
            </p>
            <div className="bento-actions">
              <Link to="/build/models/deployments" className="btn btn-secondary">
                View models
              </Link>
            </div>
          </div>
        </section>

        <section className="credentials" aria-label="Workspace credentials">
          <div className="credential-field">
            <div className="credential-label">Local API key</div>
            <div className="credential-row">
              <div className="credential-value">
                {showKey ? settings.apiKey : "•".repeat(48)}
              </div>
              <button
                className="credential-copy"
                onClick={() => setShowKey((value) => !value)}
                aria-label={showKey ? "Hide API key" : "Show API key"}
              >
                {showKey ? "Hide" : "Show"}
              </button>
              <CopyButton value={settings.apiKey} label="Copy API key" />
            </div>
          </div>
          <div className="credential-field">
            <div className="credential-label">
              Active provider
              <span
                className="info-dot"
                title="The first provider that responded during the last scan."
              >
                <Search20Regular />
              </span>
            </div>
            <div className="credential-row">
              <div className="credential-value">{endpoint}</div>
              <CopyButton value={endpoint} label="Copy provider endpoint" />
            </div>
          </div>
          <div className="credential-field">
            <div className="credential-label">Workspace data</div>
            <div className="credential-row">
              <div className="credential-value" title={dataPath}>
                {dataPath || "Loading…"}
              </div>
              <CopyButton value={dataPath} label="Copy data directory" />
            </div>
          </div>
        </section>

        <section className="home-section">
          <h2 className="home-section-title">Model selection</h2>
          <div className="quick-row mt-12">
            <Link to="/playground" className="quick-card">
              <span>
                <span className="quick-title">Test in playground</span>
                <span className="quick-desc" style={{ display: "block" }}>
                  Run prompts and see responses.
                </span>
              </span>
              <Beaker20Regular />
            </Link>
            <Link to="/discover/models" className="quick-card">
              <span>
                <span className="quick-title">Explore models</span>
                <span className="quick-desc" style={{ display: "block" }}>
                  Browse models discovered on this computer.
                </span>
              </span>
              <Grid20Regular />
            </Link>
            <Link to="/build/services" className="quick-card">
              <span>
                <span className="quick-title">Provider status</span>
                <span className="quick-desc" style={{ display: "block" }}>
                  {loading
                    ? "Scanning local runtimes…"
                    : `${online.length} of ${providers.length} providers online.`}
                </span>
              </span>
              <DataUsage20Regular />
            </Link>
          </div>

          <div className="carousel-row">
            <button
              className="icon-button"
              aria-label="Previous models"
              disabled={modelIndex === 0}
              onClick={() => setModelIndex(Math.max(0, modelIndex - 5))}
            >
              <ArrowLeft20Regular />
            </button>
            <div className="carousel">
              {visibleModels.map((model) => (
                <button
                  className="model-tile"
                  key={`${model.providerId}/${model.id}`}
                  onClick={() =>
                    navigate(
                      `/playground?provider=${encodeURIComponent(
                        model.providerId
                      )}&model=${encodeURIComponent(model.id)}`
                    )
                  }
                >
                  <ModelLogo publisher={model.publisher} name={model.name} />
                  <span style={{ minWidth: 0 }}>
                    <span className="model-tile-name">{model.name}</span>
                    <span className="model-tile-pub">{model.publisher}</span>
                  </span>
                </button>
              ))}
              {!loading && models.length === 0 && (
                <span className="muted text-12" style={{ padding: "16px 8px" }}>
                  No models discovered. Configure a provider to get started.
                </span>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="Next models"
              disabled={modelIndex + 5 >= models.length}
              onClick={() => setModelIndex(modelIndex + 5)}
            >
              <ArrowRight20Regular />
            </button>
          </div>
        </section>

        <section className="home-section">
          <div className="recent-head">
            <h2 className="home-section-title">Recent work</h2>
            <div className="segmented home-filter" role="group" aria-label="Recent work">
              {(["All", "Agents", "Models"] as const).map((value) => (
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
                  <th style={{ width: 100 }}>Type</th>
                  <th style={{ width: 220 }}>Last updated</th>
                  <th style={{ width: 160 }}>Endpoint</th>
                </tr>
              </thead>
              <tbody>
                {filter !== "Models" &&
                  recentAgents.slice(0, 5).map((agent) => (
                    <tr key={`agent-${agent.id}`}>
                      <td>
                        <Link to={`/build/agents/${agent.id}`} className="agent-name">
                          {agent.name}
                        </Link>
                      </td>
                      <td>1</td>
                      <td>Agent</td>
                      <td>{formatDate(agent.updatedAt)}</td>
                      <td>
                        <Link to={`/build/agents/${agent.id}`} className="btn btn-sm btn-outline">
                          View agent
                        </Link>
                      </td>
                    </tr>
                  ))}
                {filter !== "Agents" &&
                  recentModels.slice(0, filter === "All" ? 3 : 5).map((model) => (
                    <tr key={`model-${model.providerId}-${model.id}`}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <ModelLogo publisher={model.publisher} name={model.name} size={20} />
                          <span className="agent-name">{model.name}</span>
                        </span>
                      </td>
                      <td>—</td>
                      <td>Model</td>
                      <td>{model.providerLabel}</td>
                      <td>
                        <Link
                          to={`/playground?provider=${encodeURIComponent(model.providerId)}&model=${encodeURIComponent(model.id)}`}
                          className="btn btn-sm btn-outline"
                        >
                          Open model
                        </Link>
                      </td>
                    </tr>
                  ))}
                {((filter === "Models" && recentModels.length === 0) ||
                  (filter === "Agents" && recentAgents.length === 0) ||
                  (filter === "All" && recentAgents.length === 0 && recentModels.length === 0)) && (
                  <tr>
                    <td colSpan={5} className="muted" style={{ textAlign: "center", padding: 28 }}>
                      Nothing here yet. Create an agent or connect a model to get started.
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
            <Link to="/docs" className="resource-card">
              <span className="resource-icon"><Book20Regular /></span>
              <span>
                <span className="resource-title">Docs</span>
                <span className="resource-desc" style={{ display: "block" }}>
                  How openFoundry works, from providers to agents.
                </span>
              </span>
            </Link>
            <button
              className="resource-card"
              onClick={() => void openExternal("https://github.com/Sharjeelbaig/openFoundry")}
            >
              <span className="resource-icon"><Code20Regular /></span>
              <span>
                <span className="resource-title">GitHub</span>
                <span className="resource-desc" style={{ display: "block" }}>
                  Source code, issues and release notes.
                </span>
              </span>
            </button>
            <button
              className="resource-card"
              onClick={() => void openExternal("https://github.com/Sharjeelbaig/openFoundry/issues")}
            >
              <span className="resource-icon"><Play20Regular /></span>
              <span>
                <span className="resource-title">Community</span>
                <span className="resource-desc" style={{ display: "block" }}>
                  Ask questions or report issues on GitHub.
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
