import { Link } from "react-router-dom";
import { ArrowClockwise20Regular, DataUsage20Regular, PeopleTeam20Regular } from "@fluentui/react-icons";
import { Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { formatDate } from "../lib/format";
import { useProviders } from "../lib/useProviders";

export default function Operate() {
  const { data } = useApp();
  const { providers, loading, refresh } = useProviders(data.settings);
  const models = providers.flatMap((provider) => provider.models);

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-subtitle">The local state of this workspace.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => void refresh()}>
            <ArrowClockwise20Regular /> Refresh
          </button>
        </div>
      </div>

      <div className="metric-grid mt-16">
        <div className="operate-card">
          <span className="metric-label">Providers online</span>
          <span className="metric-value">
            {providers.filter((provider) => provider.online).length}
          </span>
          <span className="metric-note">of {providers.length} configured</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Models discovered</span>
          <span className="metric-value">{models.length}</span>
          <span className="metric-note">across local runtimes</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Agents</span>
          <span className="metric-value">{data.agents.length}</span>
          <span className="metric-note"><PeopleTeam20Regular /> local prompt agents</span>
        </div>
        <div className="operate-card">
          <span className="metric-label">Workspace created</span>
          <span className="metric-value" style={{ fontSize: 16 }}>
            {formatDate(data.settings.createdAt).split(",")[0]}
          </span>
          <span className="metric-note">stored on this computer</span>
        </div>
      </div>

      <div className="operate-grid">
        <div className="operate-card">
          <div className="row between mb-12">
            <h3>Providers</h3>
            <Link to="/build/services" className="btn btn-sm btn-secondary">Open services</Link>
          </div>
          {loading && providers.length === 0 ? (
            <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
              <Spinner /> Scanning providers…
            </div>
          ) : (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Provider</th>
                    <th style={{ width: 130 }}>Status</th>
                    <th style={{ width: 100 }}>Models</th>
                    <th>Endpoint</th>
                  </tr>
                </thead>
                <tbody>
                  {providers.map((provider) => (
                    <tr key={provider.id}>
                      <td className="cell-strong">{provider.label}</td>
                      <td>
                        <span className="status">
                          <span className={`status-dot${provider.online ? "" : " muted"}`} />
                          {provider.online ? "Online" : "Offline"}
                        </span>
                      </td>
                      <td>{provider.models.length}</td>
                      <td className="mono text-12 truncate" style={{ maxWidth: 260 }}>
                        {provider.baseUrl}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="stack" style={{ gap: 16 }}>
          <div className="operate-card">
            <div className="row between mb-8">
              <h3>Workspace</h3>
              <DataUsage20Regular className="muted" />
            </div>
            <div className="facts-list">
              <div className="fact-row">
                <span>Name</span>
                <span>{data.settings.workspaceName}</span>
              </div>
              <div className="fact-row">
                <span>Owner</span>
                <span>{data.settings.displayName}</span>
              </div>
              <div className="fact-row">
                <span>Telemetry</span>
                <span>Off</span>
              </div>
              <div className="fact-row">
                <span>Cloud calls</span>
                <span>Only configured providers</span>
              </div>
            </div>
          </div>
          <div className="operate-card">
            <h3 className="mb-8">Recent agents</h3>
            {data.agents.length ? (
              <div className="stack">
                {data.agents.slice(0, 4).map((agent) => (
                  <div className="fact-row" key={agent.id}>
                    <Link to={`/build/agents/${agent.id}`} className="link">
                      {agent.name}
                    </Link>
                    <span className="muted text-12">{agent.providerLabel}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted text-12">No agents yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
