"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronDown20Regular,
  Dismiss20Regular,
  Grid20Regular,
  Info20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { useApi, useDeployments, useModels } from "@/lib/client";
import { useDownloads } from "@/components/Downloads";
import { ModelLogo } from "@/components/Logos";
import { Spinner } from "@/components/ui";
import {
  modelFacts,
  publisherLabel,
  runtimeLabel,
  taskLabel,
} from "@/lib/model-info";
import type { LocalModel, ModelTask, ProviderId, Trace } from "@/lib/types";

const AVAILABILITY = ["All models", "Available in my project", "Download required"] as const;
type Availability = (typeof AVAILABILITY)[number];

const PAGE_SIZE = 24;

export default function Catalog() {
  const router = useRouter();
  const params = useSearchParams();
  const { data, loading, refresh: refreshModels } = useModels(30000);
  const { data: deploymentData } = useDeployments(10000);
  const { jobs } = useDownloads();
  const { data: traceData } = useApi<{ traces: Trace[] }>("/api/traces", 15000);

  const models = data?.models ?? [];
  const providers = data?.providers ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const traces = traceData?.traces ?? [];
  const deployedKeys = new Set(
    deployments.map((deployment) => `${deployment.provider}:${deployment.modelId}`)
  );
  const ollamaOnline = providers.some(
    (provider) => provider.id === "ollama" && provider.online
  );
  const foundryOnline = providers.some(
    (provider) => provider.id === "foundry" && provider.online
  );
  const foundryCatalogCount = models.filter(
    (model) => model.provider === "foundry"
  ).length;
  const remoteDownloads = models.filter(
    (model) => model.provider === "huggingface" && !model.cached
  ).length;
  const downloadedKeys = new Set(
    jobs.filter((job) => job.status === "complete").map((job) => job.modelKey)
  );
  const activeKeys = new Set(
    jobs
      .filter((job) => job.status === "queued" || job.status === "running")
      .map((job) => job.modelKey)
  );

  useEffect(() => {
    const onChanged = () => void refreshModels();
    window.addEventListener("foundry:downloads-changed", onChanged);
    return () => window.removeEventListener("foundry:downloads-changed", onChanged);
  }, [refreshModels]);

  const [query, setQuery] = useState(params.get("q") || "");
  const [sort, setSort] = useState("Featured");
  const [availability, setAvailability] = useState<Availability>("All models");
  const [publishers, setPublishers] = useState<string[]>([]);
  const [tasks, setTasks] = useState<ModelTask[]>([]);
  const [runtimes, setRuntimes] = useState<ProviderId[]>([]);
  const [downloadedOnly, setDownloadedOnly] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    Availability: true,
    Publisher: false,
    Tasks: false,
    Runtime: false,
    Lifecycle: false,
  });
  const [visible, setVisible] = useState(PAGE_SIZE);
  const [compare, setCompare] = useState<string[]>([]);
  const [compareOpen, setCompareOpen] = useState(false);
  const [leaderboard, setLeaderboard] = useState(params.get("view") === "leaderboard");

  const providerParam = params.get("provider");
  useEffect(() => {
    if (
      providerParam === "foundry" ||
      providerParam === "ollama" ||
      providerParam === "lmstudio" ||
      providerParam === "llamacpp" ||
      providerParam === "huggingface"
    ) {
      setRuntimes([providerParam as ProviderId]);
      setOpenGroups((current) => ({ ...current, Runtime: true }));
    }
  }, [providerParam]);

  const publisherParam = params.get("publisher");
  useEffect(() => {
    if (publisherParam) {
      setPublishers([publisherParam]);
      setOpenGroups((current) => ({ ...current, Publisher: true }));
    }
  }, [publisherParam]);

  useEffect(() => {
    setVisible(PAGE_SIZE);
  }, [query, availability, publishers, tasks, runtimes, downloadedOnly, sort]);

  const publisherOptions = useMemo(
    () => [...new Set(models.map((model) => model.publisher))].sort(),
    [models]
  );
  const taskOptions = useMemo(
    () => [...new Set(models.map((model) => model.task))].sort(),
    [models]
  );

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    const result = models.filter((model) => {
      if (
        lower &&
        !model.displayName.toLowerCase().includes(lower) &&
        !model.id.toLowerCase().includes(lower) &&
        !model.publisher.toLowerCase().includes(lower)
      )
        return false;
      if (
        availability === "Available in my project" &&
        !deployedKeys.has(`${model.provider}:${model.id}`)
      )
        return false;
      if (availability === "Download required" && model.cached) return false;
      if (downloadedOnly && !model.cached) return false;
      if (publishers.length && !publishers.includes(model.publisher)) return false;
      if (tasks.length && !tasks.includes(model.task)) return false;
      if (runtimes.length && !runtimes.includes(model.provider)) return false;
      return true;
    });
    return result.sort((a, b) => {
      if (sort === "Name A–Z") return a.displayName.localeCompare(b.displayName);
      if (sort === "Context window")
        return (b.contextWindow || 0) - (a.contextWindow || 0);
      if (sort === "Downloaded first")
        return Number(b.cached) - Number(a.cached) ||
          a.displayName.localeCompare(b.displayName);
      return (
        Number(b.cached) - Number(a.cached) ||
        Number(b.loaded) - Number(a.loaded) ||
        a.displayName.localeCompare(b.displayName)
      );
    });
  }, [
    models,
    query,
    availability,
    downloadedOnly,
    publishers,
    tasks,
    runtimes,
    sort,
    deployedKeys,
  ]);

  const shown = filtered.slice(0, visible);

  const toggleGroup = (key: string) =>
    setOpenGroups((current) => ({ ...current, [key]: !current[key] }));

  const toggle = <T,>(value: T, list: T[], setter: (next: T[]) => void) =>
    setter(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value]
    );

  const activeChips: { label: string; clear: () => void }[] = [];
  if (availability !== "All models")
    activeChips.push({
      label: `Availability: ${availability}`,
      clear: () => setAvailability("All models"),
    });
  for (const publisher of publishers)
    activeChips.push({
      label: `Publisher: ${publisher}`,
      clear: () => setPublishers(publishers.filter((item) => item !== publisher)),
    });
  for (const task of tasks)
    activeChips.push({
      label: `Task: ${taskLabel(task)}`,
      clear: () => setTasks(tasks.filter((item) => item !== task)),
    });
  for (const runtime of runtimes)
    activeChips.push({
      label: `Runtime: ${
        runtime === "foundry"
          ? "Foundry Local"
          : runtime === "ollama"
          ? "Ollama"
          : runtime === "lmstudio"
          ? "LM Studio"
          : runtime === "llamacpp"
          ? "llama.cpp"
          : "Hugging Face cache"
      }`,
      clear: () => setRuntimes(runtimes.filter((item) => item !== runtime)),
    });
  if (downloadedOnly)
    activeChips.push({
      label: "Lifecycle: Downloaded",
      clear: () => setDownloadedOnly(false),
    });

  const clearAll = () => {
    setAvailability("All models");
    setPublishers([]);
    setTasks([]);
    setRuntimes([]);
    setDownloadedOnly(false);
  };

  const traceStats = useMemo(() => {
    const map = new Map<
      string,
      { runs: number; latency: number; tokens: number }
    >();
    for (const trace of traces) {
      const key =
        models.find((model) => model.id === trace.model)?.key ||
        models.find((model) => model.name === trace.model)?.key;
      if (!key) continue;
      const entry = map.get(key) || { runs: 0, latency: 0, tokens: 0 };
      entry.runs += 1;
      entry.latency += trace.latencyMs;
      entry.tokens += trace.promptTokens + trace.completionTokens;
      map.set(key, entry);
    }
    return map;
  }, [traces, models]);

  const leaderboardRows = useMemo(() => {
    return models
      .map((model) => {
        const stats = traceStats.get(model.key);
        return {
          model,
          runs: stats?.runs || 0,
          latency: stats && stats.runs ? stats.latency / stats.runs : null,
          tokens: stats?.tokens || 0,
        };
      })
      .sort((a, b) => {
        if (a.latency == null && b.latency == null)
          return a.model.displayName.localeCompare(b.model.displayName);
        if (a.latency == null) return 1;
        if (b.latency == null) return -1;
        return a.latency - b.latency;
      });
  }, [models, traceStats]);

  const selectedModels = models.filter((model) => compare.includes(model.key));

  const toggleCompare = (key: string) => {
    setCompare((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : current.length >= 4
        ? current
        : [...current, key]
    );
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 16 }}>
        <h1 className="page-title">
          Models {models.length ? `(${models.length})` : ""}
        </h1>
        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            disabled={compare.length < 2}
            title={
              compare.length < 2
                ? "Select at least two models with the compare checkbox"
                : "Compare selected models"
            }
            onClick={() => setCompareOpen(true)}
          >
            Compare models
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => {
              setLeaderboard((value) => !value);
              router.replace(
                leaderboard
                  ? "/discover/models"
                  : "/discover/models?view=leaderboard",
                { scroll: false }
              );
            }}
          >
            {leaderboard ? "View catalog" : "View leaderboard"}
          </button>
        </div>
      </div>

      {!leaderboard && (
        <>
          <div className="catalog-toolbar">
            <div className="search-input">
              <Search20Regular />
              <input
                className="input"
                placeholder="Search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <select
              className="select"
              style={{ width: 260 }}
              value={sort}
              onChange={(event) => setSort(event.target.value)}
              aria-label="Sort models"
            >
              <option>Featured</option>
              <option>Name A–Z</option>
              <option>Context window</option>
              <option>Downloaded first</option>
            </select>
          </div>

          {foundryCatalogCount > 0 && !foundryOnline && (
            <div className="banner info mb-16">
              <Info20Regular />
              <span>
                The Foundry Local CLI catalog is available, but its local server
                is not responding. Downloads can continue; start the server for
                deployments.
              </span>
              <Link
                href={`/setup?provider=foundry&return=${encodeURIComponent(
                  "/discover/models"
                )}`}
                className="btn btn-secondary btn-sm"
              >
                Set up Foundry Local
              </Link>
            </div>
          )}

          {remoteDownloads > 0 && !ollamaOnline && (
            <div className="banner info mb-16">
              <Info20Regular />
              <span>
                {remoteDownloads} Hugging Face models can be downloaded, but Ollama
                is not running. It is the local download and serving runtime for
                those models.
              </span>
              <Link
                href={`/setup?provider=ollama&return=${encodeURIComponent(
                  "/discover/models"
                )}`}
                className="btn btn-secondary btn-sm"
              >
                Set up Ollama
              </Link>
            </div>
          )}

          <div className="catalog-layout">
            <aside className="filters" aria-label="Filters">
              <div className="filter-tabs">
                {(["All models", "Available in my project"] as Availability[]).map(
                  (item) => (
                    <button
                      key={item}
                      className={`filter-tab${availability === item ? " active" : ""}`}
                      onClick={() => setAvailability(item)}
                    >
                      {item}
                    </button>
                  )
                )}
              </div>

              <FilterGroup
                title="Publisher"
                open={openGroups.Publisher}
                onToggle={() => toggleGroup("Publisher")}
              >
                <div className="filter-search-note">
                  {publisherOptions.length} publishers in the local catalog
                </div>
                {publisherOptions.map((publisher) => (
                  <label className="filter-option" key={publisher}>
                    <input
                      type="checkbox"
                      className="radio"
                      checked={publishers.includes(publisher)}
                      onChange={() =>
                        toggle(publisher, publishers, setPublishers)
                      }
                    />
                    <span className="truncate">{publisher}</span>
                  </label>
                ))}
              </FilterGroup>

              <FilterGroup
                title="Inference tasks"
                open={openGroups.Tasks}
                onToggle={() => toggleGroup("Tasks")}
              >
                {taskOptions.map((task) => (
                  <label className="filter-option" key={task}>
                    <input
                      type="checkbox"
                      className="radio"
                      checked={tasks.includes(task)}
                      onChange={() => toggle(task, tasks, setTasks)}
                    />
                    <span>{taskLabel(task)}</span>
                  </label>
                ))}
              </FilterGroup>

              <FilterGroup
                title="Deployment options"
                open={openGroups.Runtime}
                onToggle={() => toggleGroup("Runtime")}
              >
                {(
                  [
                    ["foundry", "Foundry Local"],
                    ["ollama", "Ollama"],
                    ["lmstudio", "LM Studio"],
                    ["llamacpp", "llama.cpp"],
                    ["huggingface", "Hugging Face cache"],
                  ] as [ProviderId, string][]
                ).map(([id, label]) => (
                  <label className="filter-option" key={id}>
                    <input
                      type="checkbox"
                      className="radio"
                      checked={runtimes.includes(id)}
                      onChange={() => toggle(id, runtimes, setRuntimes)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </FilterGroup>

              <FilterGroup
                title="Lifecycle"
                open={openGroups.Lifecycle}
                onToggle={() => toggleGroup("Lifecycle")}
              >
                <label className="filter-option">
                  <input
                    type="checkbox"
                    className="radio"
                    checked={downloadedOnly}
                    onChange={() => setDownloadedOnly((value) => !value)}
                  />
                  <span>Downloaded</span>
                </label>
              </FilterGroup>

              <p className="filter-search-note mt-12">
                Every model here is discovered from a runtime on this computer.
                Selecting a model never provisions cloud capacity.
              </p>
            </aside>

            <div>
              {activeChips.length > 0 && (
                <div className="chip-row">
                  {activeChips.map((chip, index) => (
                    <span className="filter-chip" key={`${chip.label}-${index}`}>
                      {chip.label}
                      <button onClick={chip.clear} aria-label={`Clear ${chip.label}`}>
                        <Dismiss20Regular />
                      </button>
                    </span>
                  ))}
                  <button className="btn btn-sm btn-ghost" onClick={clearAll}>
                    Clear filters
                  </button>
                </div>
              )}

              {loading && models.length === 0 ? (
                <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
                  <Spinner /> Discovering models on this computer…
                </div>
              ) : models.length === 0 ? (
                <div className="operate-card catalog-empty-runtime">
                  <Grid20Regular style={{ width: 28, height: 28, color: "var(--fg-3)" }} />
                  <h3 className="mt-12">No local runtime is connected</h3>
                  <p className="muted text-13">
                    openFoundry discovers models from the runtimes you configure. Check
                    that Foundry Local, Ollama, LM Studio or llama.cpp is running, or
                    update its endpoint.
                  </p>
                  <div className="row" style={{ justifyContent: "center", gap: 8 }}>
                    <Link
                      href={`/setup?return=${encodeURIComponent("/discover/models")}`}
                      className="btn btn-primary"
                    >
                      Set up providers
                    </Link>
                    <Link href="/discover/overview" className="btn btn-secondary">
                      Discover overview
                    </Link>
                  </div>
                </div>
              ) : filtered.length === 0 ? (
                <div className="operate-card" style={{ textAlign: "center", padding: 48 }}>
                  <Grid20Regular style={{ width: 28, height: 28, color: "var(--fg-3)" }} />
                  <h3 className="mt-12">No models match those filters</h3>
                  <p className="muted text-13">Clear filters or adjust the search.</p>
                </div>
              ) : (
                <>
                  <div className="catalog-grid">
                    {shown.map((model) => {
                      const compared = compare.includes(model.key);
                      return (
                        <div
                          className="catalog-card"
                          key={model.key}
                          role="link"
                          tabIndex={0}
                          onClick={() =>
                            router.push(
                              `/discover/models/${encodeURIComponent(model.key)}`
                            )
                          }
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              router.push(
                                `/discover/models/${encodeURIComponent(model.key)}`
                              );
                          }}
                        >
                          <div className="catalog-card-head">
                            <ModelLogo
                              publisher={publisherLabel(model)}
                              name={model.displayName}
                              size={44}
                            />
                            <div className="min-w-0" style={{ flex: 1 }}>
                              <div className="catalog-card-name">{model.displayName}</div>
                              <div className="catalog-card-pub">
                                <ModelLogo
                                  publisher={publisherLabel(model)}
                                  name={model.publisher}
                                  size={14}
                                />
                                <span className="truncate">
                                  {publisherLabel(model)}
                                </span>
                                {deployedKeys.has(`${model.provider}:${model.id}`) ? (
                                  <span className="badge green" style={{ marginLeft: 4 }}>
                                    Deployed
                                  </span>
                                ) : model.cached ? (
                                  <span className="badge green" style={{ marginLeft: 4 }}>
                                    Downloaded
                                  </span>
                                ) : downloadedKeys.has(model.key) ? (
                                  <span className="badge green" style={{ marginLeft: 4 }}>
                                    Downloaded
                                  </span>
                                ) : activeKeys.has(model.key) ? (
                                  <span className="badge warning" style={{ marginLeft: 4 }}>
                                    Downloading
                                  </span>
                                ) : null}
                              </div>
                            </div>
                            <label
                              className="checkbox-row"
                              title="Add to comparison"
                              onClick={(event) => event.stopPropagation()}
                            >
                              <input
                                type="checkbox"
                                checked={compared}
                                onChange={() => toggleCompare(model.key)}
                                aria-label={`Compare ${model.displayName}`}
                              />
                            </label>
                          </div>
                          <div className="catalog-task">
                            <span className="badge gray">{taskLabel(model.task)}</span>
                          </div>
                          <div className="catalog-metrics">
                            {modelFacts(model).map((fact) => (
                              <span className="catalog-metric" key={fact.label}>
                                <span>{fact.label}</span>
                                <span className="truncate">{fact.value}</span>
                              </span>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="row between mt-16">
                    <span className="muted text-12">
                      {shown.length} of {filtered.length} models · {models.length} discovered
                    </span>
                    {visible < filtered.length && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => setVisible((value) => value + PAGE_SIZE)}
                      >
                        Load more
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {leaderboard && (
        <>
          <div className="banner info mb-16">
            <Grid20Regular />
            <span>
              This leaderboard is measured on this computer. Each row reflects runs
              stored in traces — no benchmark scores are fetched or invented. Run a
              prompt in the playground to add data.
            </span>
          </div>
          <div className="leaderboard">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 48 }}>#</th>
                  <th>Model</th>
                  <th style={{ width: 180 }}>Publisher</th>
                  <th style={{ width: 150 }}>Task</th>
                  <th style={{ width: 150 }}>Runtime</th>
                  <th style={{ width: 110 }}>Context</th>
                  <th style={{ width: 70 }}>Runs</th>
                  <th style={{ width: 120 }}>Avg latency</th>
                  <th style={{ width: 100 }}>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {leaderboardRows.map((row, index) => (
                  <tr key={row.model.key}>
                    <td className="muted">{index + 1}</td>
                    <td>
                      <Link
                        href={`/discover/models/${encodeURIComponent(row.model.key)}`}
                        className="agent-name"
                      >
                        {row.model.displayName}
                      </Link>
                    </td>
                    <td>{publisherLabel(row.model)}</td>
                    <td>{taskLabel(row.model.task)}</td>
                    <td>{runtimeLabel(row.model)}</td>
                    <td>
                      {row.model.contextWindow
                        ? `${(row.model.contextWindow / 1000).toFixed(0)}k`
                        : "—"}
                    </td>
                    <td>{row.runs || "—"}</td>
                    <td>
                      {row.latency ? `${Math.round(row.latency)} ms` : "Not measured"}
                    </td>
                    <td>{row.tokens || "—"}</td>
                  </tr>
                ))}
                {leaderboardRows.length === 0 && (
                  <tr>
                    <td colSpan={9} className="muted" style={{ textAlign: "center", padding: 40 }}>
                      No models discovered yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {compare.length > 0 && (
        <div className="compare-bar">
          <span className="text-13">
            {compare.length} of 4 models selected
          </span>
          <button className="btn btn-sm btn-ghost" onClick={() => setCompare([])}>
            Clear
          </button>
          <span className="grow" />
          <button
            className="btn btn-primary btn-sm"
            disabled={compare.length < 2}
            onClick={() => setCompareOpen(true)}
          >
            Compare
          </button>
        </div>
      )}

      {compareOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCompareOpen(false);
          }}
        >
          <div className="dialog xwide" role="dialog" aria-modal="true" aria-label="Compare models">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Compare models</h2>
                <p className="dialog-sub">
                  Metadata comes from the local runtimes. Nothing is provisioned.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCompareOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body" style={{ overflowX: "auto" }}>
              <table className="data-table compare-table">
                <thead>
                  <tr>
                    <th style={{ width: 160 }}>Attribute</th>
                    {selectedModels.map((model) => (
                      <th key={model.key}>{model.displayName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["Publisher", (model: LocalModel) => publisherLabel(model)],
                    ["Inference task", (model: LocalModel) => taskLabel(model.task)],
                    ["Runtime", (model: LocalModel) => runtimeLabel(model)],
                    [
                      "Context window",
                      (model: LocalModel) =>
                        model.contextWindow
                          ? `${model.contextWindow.toLocaleString()} tokens`
                          : "—",
                    ],
                    [
                      "Availability",
                      (model: LocalModel) =>
                        model.loaded
                          ? "Loaded"
                          : model.cached
                          ? "Downloaded"
                          : "Download on deploy",
                    ],
                    [
                      "Model size",
                      (model: LocalModel) =>
                        model.sizeBytes
                          ? `${(model.sizeBytes / 1024 ** 3).toFixed(2)} GB`
                          : "—",
                    ],
                    ["Version", (model: LocalModel) => model.version || "—"],
                    ["Model id", (model: LocalModel) => model.id],
                  ].map(([label, getter]) => (
                    <tr key={label as string}>
                      <td className="muted">{label as string}</td>
                      {selectedModels.map((model) => (
                        <td key={model.key} className="text-12">
                          {(getter as (model: LocalModel) => string)(model)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCompareOpen(false)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => {
                  setCompareOpen(false);
                  router.push(
                    `/playground?model=${encodeURIComponent(
                      selectedModels[0]?.key || ""
                    )}`
                  );
                }}
                disabled={selectedModels.length === 0}
              >
                Open in playground
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterGroup({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="filter-group">
      <button className="filter-head" onClick={onToggle} aria-expanded={open}>
        {open ? <ChevronDown20Regular /> : <ChevronDown20Regular style={{ transform: "rotate(-90deg)" }} />}
        {title}
      </button>
      {open && <div className="filter-body">{children}</div>}
    </div>
  );
}
