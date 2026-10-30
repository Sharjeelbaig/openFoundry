import { ArrowClockwise20Regular, Cloud20Regular, PlugConnected20Regular } from "@fluentui/react-icons";
import { Spinner, StatusBadge } from "../components/ui";
import { useApp } from "../lib/app-context";
import { useProviders } from "../lib/useProviders";

export default function Services() {
  const { data } = useApp();
  const { providers, loading, error, refresh } = useProviders(data.settings);

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="page-subtitle">
            Local runtimes and OpenAI-compatible endpoints configured for this workspace.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => void refresh()}>
            <ArrowClockwise20Regular /> Scan
          </button>
        </div>
      </div>

      {error && <div className="banner error mb-16">{error}</div>}

      <div className="service-grid mt-16">
        {providers.map((provider) => (
          <div className="operate-card service-card" key={provider.id}>
            <div className="row between">
              <span className="row" style={{ gap: 10 }}>
                <span className="kb-icon"><Cloud20Regular /></span>
                <span>
                  <strong className="text-14">{provider.label}</strong>
                  <div className="muted text-12">
                    {provider.kind === "ollama" ? "Ollama API" : "OpenAI-compatible"}
                  </div>
                </span>
              </span>
              <StatusBadge status={provider.online ? "Online" : "Offline"} />
            </div>
            <div className="input-with-button">
              <input className="input mono" readOnly value={provider.baseUrl} />
            </div>
            <div className="facts-list">
              <div className="fact-row">
                <span>Models</span>
                <span>{provider.models.length}</span>
              </div>
              <div className="fact-row">
                <span>Latency</span>
                <span>{provider.latencyMs != null ? `${provider.latencyMs} ms` : "—"}</span>
              </div>
            </div>
            {provider.error && (
              <p className="muted text-12" style={{ lineHeight: "18px" }}>
                {provider.error}
              </p>
            )}
          </div>
        ))}
        {providers.length === 0 && !loading && (
          <div className="operate-card muted" style={{ padding: 34 }}>
            <PlugConnected20Regular /> No providers enabled. Add one in Settings.
          </div>
        )}
        {loading && providers.length === 0 && (
          <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
            <Spinner /> Checking providers…
          </div>
        )}
      </div>

      <div className="banner mt-16">
        <Cloud20Regular />
        <span>
          openFoundry never starts or installs services silently. Start your runtime
          yourself and scan again.
        </span>
      </div>
    </div>
  );
}
