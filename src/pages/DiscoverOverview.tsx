import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Box20Regular } from "@fluentui/react-icons";
import { ModelLogo } from "../components/Logos";
import { Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { useProviders } from "../lib/useProviders";
import type { ModelInfo } from "../lib/types";

const COLLECTIONS = [
  {
    title: "Local models",
    desc: "Everything discovered from runtimes on this computer.",
    href: "/discover/models",
    image: "/images/collection-azure.svg",
  },
  {
    title: "OpenAI-compatible",
    desc: "LM Studio, llama.cpp, Foundry CLI and custom endpoints.",
    href: "/discover/models",
    image: "/images/collection-labs.svg",
  },
  {
    title: "Bring your own",
    desc: "Point openFoundry at any local OpenAI-compatible server.",
    href: "/manage",
    image: "/images/collection-local.svg",
  },
];

export default function DiscoverOverview() {
  const { data } = useApp();
  const { providers, loading } = useProviders(data.settings);
  const models = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );
  const featured = useMemo(() => {
    const seen = new Set<string>();
    const list: ModelInfo[] = [];
    for (const model of models) {
      const key = model.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      list.push(model);
      if (list.length >= 10) break;
    }
    return list;
  }, [models]);
  const publishers = useMemo(() => {
    const counts = new Map<string, number>();
    for (const model of models)
      counts.set(model.publisher, (counts.get(model.publisher) || 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [models]);

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="discover-wrap" style={{ paddingTop: 0 }}>
        <h1 className="discover-title" style={{ marginBottom: 6 }}>Discover what&apos;s possible</h1>
        <p className="muted text-13" style={{ marginBottom: 28 }}>
          Models and runtimes discovered on this computer. No cloud catalog, no fake
          availability.
        </p>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Featured models</h2>
            <Link to="/discover/models" className="btn btn-sm btn-secondary">View all models</Link>
          </div>
          {loading && featured.length === 0 ? (
            <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
              <Spinner /> Scanning local runtimes…
            </div>
          ) : (
            <div className="featured-grid" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
              {featured.map((model) => (
                <Link
                  className="featured-item"
                  key={`${model.providerId}/${model.id}`}
                  to={`/playground?provider=${encodeURIComponent(model.providerId)}&model=${encodeURIComponent(model.id)}`}
                >
                  <ModelLogo publisher={model.publisher} name={model.name} size={32} />
                  <span className="min-w-0">
                    <span className="featured-name">{model.name}</span>
                    <span className="featured-task">{model.providerLabel}</span>
                    <span className="featured-task">{model.publisher}</span>
                  </span>
                </Link>
              ))}
              {featured.length === 0 && (
                <p className="muted text-13">No models found. Configure a provider to get started.</p>
              )}
            </div>
          )}
        </section>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Explore by publisher</h2>
          </div>
          <div className="publisher-grid">
            {publishers.map(([publisher, count]) => (
              <Link
                className="publisher-card"
                key={publisher}
                to={`/discover/models?publisher=${encodeURIComponent(publisher)}`}
              >
                <ModelLogo publisher={publisher} name={publisher} size={22} />
                <span className="truncate">{publisher}</span>
                <span className="muted text-12">{count}</span>
              </Link>
            ))}
            {publishers.length === 0 && <span className="muted text-13">Publishers appear when models are discovered.</span>}
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Browse collections</h2>
          </div>
          <div className="collection-grid">
            {COLLECTIONS.map((collection) => (
              <Link
                className="collection-card"
                key={collection.title}
                to={collection.href}
                style={{ backgroundImage: `url(${collection.image})` }}
              >
                <span className="collection-title">{collection.title}</span>
                <span className="collection-desc">{collection.desc}</span>
              </Link>
            ))}
          </div>
        </section>

        <section className="discover-section">
          <div className="discover-section-head">
            <h2 className="discover-section-title">Provider health</h2>
            <Link to="/build/services" className="btn btn-sm btn-secondary">Open services</Link>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 110 }}>Models</th>
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
                    <td className="mono text-12">{provider.baseUrl}</td>
                  </tr>
                ))}
                {providers.length === 0 && (
                  <tr><td colSpan={4} className="muted" style={{ textAlign: "center", padding: 30 }}>No providers configured.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <div className="banner">
          <Box20Regular />
          <span>
            openFoundry only lists models your providers report. It does not download or
            mirror model weights.
          </span>
        </div>
      </div>
    </div>
  );
}
