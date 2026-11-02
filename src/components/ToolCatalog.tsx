"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  ChevronDown20Regular,
  Dismiss20Regular,
  Document20Regular,
  PlugConnected20Regular,
  Search20Regular,
  Server20Regular,
  Sparkle20Regular,
  Warning20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { Spinner } from "@/components/ui";
import type {
  Agent,
  McpServer,
  ToolCatalogEntry,
  ToolCatalogType,
  ToolSetup,
  ToolSetupAuthMethod,
  ToolSetupOperation,
} from "@/lib/types";

type Sort = "Featured" | "Newest" | "Recently updated";

const PAGE_SIZE = 50;

const TYPE_PARAM: Record<ToolCatalogType, string> = {
  Custom: "connector",
  "Remote MCP": "remotes",
  "Local MCP": "local",
  Skills: "skill",
};

const PARAM_TYPE: Record<string, ToolCatalogType> = {
  connector: "Custom",
  custom: "Custom",
  remotes: "Remote MCP",
  remote: "Remote MCP",
  local: "Local MCP",
  skill: "Skills",
  skills: "Skills",
};

export function typeIcon(type: ToolCatalogType) {
  if (type === "Skills") return <Document20Regular />;
  if (type === "Remote MCP") return <PlugConnected20Regular />;
  if (type === "Local MCP") return <Server20Regular />;
  return <Wrench20Regular />;
}

export function authLabel(value: string): string {
  const key = value.toLowerCase();
  if (key.includes("oauth")) return "OAuth 2.0";
  if (key.includes("apikey") || key.includes("key-based")) return "Key-based";
  if (key.includes("managedidentity")) return "Managed identity";
  if (key.includes("agentonbehalfofuser")) return "Agent on behalf of user";
  if (key.includes("userentratoken")) return "User Entra token";
  if (key.includes("agent")) return "Agent identity";
  if (key.includes("unauthenticated") || key === "none") return "None";
  return value;
}

export function authLabels(auth: string[]): string[] {
  const labels = auth.map(authLabel);
  return [...new Set(labels.length ? labels : ["None"])];
}

export function providerOf(entry: ToolCatalogEntry): string {
  return entry.company || "Other publishers";
}

function providerBucket(entry: ToolCatalogEntry): string | null {
  const company = providerOf(entry);
  if (company === "Microsoft") return "Microsoft";
  if (company === "Independent" || company === "Other publishers") return null;
  return "Third-party";
}

export function registryOf(entry: ToolCatalogEntry): string {
  if (entry.type === "Skills") return "Local skill catalog";
  if (entry.type === "Remote MCP" || entry.type === "Local MCP")
    return "Public MCP registry";
  return "Connector catalog";
}

export function availabilityLabel(entry: ToolCatalogEntry): string {
  if (entry.availability === "local-skill") return "Local skill";
  if (entry.availability === "mcp") return "Remote MCP";
  if (entry.availability === "mcp-local") return "Local MCP";
  return "HTTP alternative";
}

function matchesQuery(entry: ToolCatalogEntry, query: string): boolean {
  if (!query) return true;
  const haystack = [
    entry.name,
    entry.summary,
    entry.description,
    entry.company,
    entry.category,
    entry.connector,
    ...(entry.tags || []),
    ...(entry.categories || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function countBy<T>(items: T[], key: (item: T) => string | null): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const value = key(item);
    if (!value) continue;
    map.set(value, (map.get(value) || 0) + 1);
  }
  return map;
}

function dateValue(entry: ToolCatalogEntry): number {
  return entry.releaseDate ? Date.parse(entry.releaseDate) || 0 : 0;
}

export interface HttpDraft {
  name: string;
  description: string;
  method: string;
  url: string;
  headers: Record<string, string>;
  bodyTemplate?: string;
  inputSchema: Record<string, unknown>;
}

function setupHeaders(
  method: ToolSetupAuthMethod | undefined,
  values: Record<string, string>
): Record<string, string> {
  if (!method) return {};
  const token =
    values.accessToken ||
    values.Authorization ||
    values.authorization ||
    values.token ||
    values.apiKey ||
    values.ApiKey;
  if (method.type === "oauth2" || method.type === "bearer") {
    if (!token) return {};
    return {
      Authorization: /^Bearer\s/i.test(token) ? token : `Bearer ${token}`,
    };
  }
  if (method.type === "apiKey") {
    if (!token) return {};
    const name = method.headerName || "Authorization";
    return { [name]: token };
  }
  const headers: Record<string, string> = {};
  for (const field of method.fields) {
    const value = values[field.name];
    if (!value) continue;
    if (
      /^(authorization|x-|api[-_]?key|token)/i.test(field.name) ||
      /header/i.test(field.description)
    ) {
      headers[field.name] = value;
    }
  }
  return headers;
}

function setupUrl(
  entry: ToolCatalogEntry,
  setup: ToolSetup | null,
  values: Record<string, string>,
  baseUrl: string,
  operation: ToolSetupOperation | undefined
): string {
  let path = operation?.path || "";
  if (path) {
    path = path.replace(/^\/\{connectionId\}/i, "");
    path = path.replace(/\{([^}]+)\}/g, (_, key: string) =>
      values[key] ? encodeURIComponent(values[key]) : `{${key}}`
    );
  }
  const base = baseUrl
    .trim()
    .replace(/\/+$/, "")
    .replace(/\{([^}]+)\}/g, (_, key: string) =>
      values[key] ? encodeURIComponent(values[key]) : `{${key}}`
    );
  if (base && path) return `${base}${path.startsWith("/") ? path : `/${path}`}`;
  return base || path;
}

export default function ToolCatalog() {
  const router = useRouter();
  const { data, loading, error } = useApi<{
    tools: ToolCatalogEntry[];
    total: number;
  }>("/api/tools/catalog");

  const tools = useMemo(() => data?.tools ?? [], [data?.tools]);

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("Featured");
  const [selectedTypes, setSelectedTypes] = useState<ToolCatalogType[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedRegistries, setSelectedRegistries] = useState<string[]>([]);
  const [selectedAuth, setSelectedAuth] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hydrated, setHydrated] = useState(false);
  const sentinel = useRef<HTMLDivElement | null>(null);

  // The reference keeps catalog state in the URL (type=remotes, etc.). Read it
  // once on mount, then mirror every change with replaceState so a reload or a
  // shared link restores the same filtered view.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const rawTypes = (params.get("type") || "").split(",").filter(Boolean);
    const nextTypes = rawTypes
      .map((value) => PARAM_TYPE[value.toLowerCase()])
      .filter((value): value is ToolCatalogType => Boolean(value));
    setQuery(params.get("q") || "");
    const rawSort = params.get("sort");
    setSort(
      rawSort === "newest"
        ? "Newest"
        : rawSort === "updated"
        ? "Recently updated"
        : "Featured"
    );
    setSelectedTypes([...new Set(nextTypes)]);
    setSelectedProviders(
      (params.get("provider") || "").split(",").filter(Boolean)
    );
    setSelectedCategories(
      (params.get("category") || "").split(",").filter(Boolean)
    );
    setSelectedRegistries(
      (params.get("registry") || "").split(",").filter(Boolean)
    );
    setSelectedAuth((params.get("auth") || "").split(",").filter(Boolean));
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    if (sort === "Newest") params.set("sort", "newest");
    if (sort === "Recently updated") params.set("sort", "updated");
    if (selectedTypes.length)
      params.set("type", selectedTypes.map((type) => TYPE_PARAM[type]).join(","));
    if (selectedProviders.length)
      params.set("provider", selectedProviders.join(","));
    if (selectedCategories.length)
      params.set("category", selectedCategories.join(","));
    if (selectedRegistries.length)
      params.set("registry", selectedRegistries.join(","));
    if (selectedAuth.length) params.set("auth", selectedAuth.join(","));
    const search = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${search ? `?${search}` : ""}`
    );
  }, [
    hydrated,
    query,
    sort,
    selectedTypes,
    selectedProviders,
    selectedCategories,
    selectedRegistries,
    selectedAuth,
  ]);

  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [
    query,
    sort,
    selectedTypes,
    selectedProviders,
    selectedCategories,
    selectedRegistries,
    selectedAuth,
  ]);

  const typeCounts = useMemo(() => countBy(tools, (entry) => entry.type), [tools]);

  const providerCounts = useMemo(
    () => countBy(tools, (entry) => providerBucket(entry)),
    [tools]
  );

  const categoryCounts = useMemo(() => {
    const map = countBy(
      tools.filter((entry) => Boolean(entry.category)),
      (entry) => entry.category || null
    );
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
  }, [tools]);

  const registryCounts = useMemo(
    () => countBy(tools, (entry) => registryOf(entry)),
    [tools]
  );

  const authCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tools) {
      for (const label of authLabels(entry.auth))
        map.set(label, (map.get(label) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [tools]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return tools.filter((entry) => {
      if (!matchesQuery(entry, needle)) return false;
      if (selectedTypes.length && !selectedTypes.includes(entry.type)) return false;
      if (selectedProviders.length) {
        const bucket = providerBucket(entry);
        if (!bucket || !selectedProviders.includes(bucket)) return false;
      }
      if (
        selectedCategories.length &&
        (!entry.category || !selectedCategories.includes(entry.category))
      )
        return false;
      if (
        selectedRegistries.length &&
        !selectedRegistries.includes(registryOf(entry))
      )
        return false;
      if (selectedAuth.length) {
        const labels = authLabels(entry.auth);
        if (!labels.some((label) => selectedAuth.includes(label))) return false;
      }
      return true;
    });
  }, [
    tools,
    query,
    selectedTypes,
    selectedProviders,
    selectedCategories,
    selectedRegistries,
    selectedAuth,
  ]);

  const sorted = useMemo(() => {
    if (sort === "Newest") {
      return [...filtered].sort(
        (a, b) => dateValue(b) - dateValue(a) || a.name.localeCompare(b.name)
      );
    }
    if (sort === "Recently updated") {
      return [...filtered].sort(
        (a, b) => dateValue(b) - dateValue(a) || a.name.localeCompare(b.name)
      );
    }
    return filtered;
  }, [filtered, sort]);

  const shown = sorted.slice(0, limit);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || limit >= sorted.length) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setLimit((value) => Math.min(value + PAGE_SIZE, sorted.length));
      },
      { rootMargin: "240px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [limit, sorted.length]);

  const toggle = <T,>(value: T, list: T[], setList: (next: T[]) => void) => {
    setList(
      list.includes(value)
        ? list.filter((item) => item !== value)
        : [...list, value]
    );
  };

  const clearFilters = () => {
    setQuery("");
    setSort("Featured");
    setSelectedTypes([]);
    setSelectedProviders([]);
    setSelectedCategories([]);
    setSelectedRegistries([]);
    setSelectedAuth([]);
  };

  const toggleSection = (key: string) => {
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));
  };

  const chips: { key: string; label: string; clear: () => void }[] = [
    ...selectedTypes.map((type) => ({
      key: `type:${type}`,
      label: `Type: ${type}`,
      clear: () => toggle(type, selectedTypes, setSelectedTypes),
    })),
    ...selectedProviders.map((provider) => ({
      key: `provider:${provider}`,
      label: `Provider: ${provider}`,
      clear: () => toggle(provider, selectedProviders, setSelectedProviders),
    })),
    ...selectedCategories.map((category) => ({
      key: `category:${category}`,
      label: `Category: ${category}`,
      clear: () => toggle(category, selectedCategories, setSelectedCategories),
    })),
    ...selectedRegistries.map((registry) => ({
      key: `registry:${registry}`,
      label: `Registry: ${registry}`,
      clear: () => toggle(registry, selectedRegistries, setSelectedRegistries),
    })),
    ...selectedAuth.map((auth) => ({
      key: `auth:${auth}`,
      label: `Auth: ${auth}`,
      clear: () => toggle(auth, selectedAuth, setSelectedAuth),
    })),
  ];

  if (loading && tools.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 40 }}>
        <Spinner /> Loading the local tool catalog…
      </div>
    );
  }

  if (error) {
    return (
      <div className="banner error">
        The tool catalog could not be loaded: {error}
      </div>
    );
  }

  return (
    <div className="page discover-tools-page">
      <div className="discover-tools-head">
        <h1 className="discover-tools-title">
          Tools <span>({filtered.length.toLocaleString()})</span>
        </h1>
        <p className="discover-tools-desc">
          When you connect a third-party tool, data you send may leave this
          computer and is processed under that provider&apos;s terms.{" "}
          <Link href="/docs">Learn more</Link>
        </p>
      </div>

      <div className="discover-tools-toolbar">
        <button
          className="btn btn-secondary discover-filter-toggle"
          onClick={() => setFiltersOpen((value) => !value)}
          aria-expanded={filtersOpen}
        >
          {filtersOpen ? "Hide filters" : "Filters"}
        </button>
        <div className="search-input discover-search">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search tools"
          />
        </div>
        <div className="discover-sort">
          <span className="discover-sort-label">Sort by</span>
          <span className="discover-sort-field">
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as Sort)}
              aria-label="Sort tools"
            >
              <option value="Featured">Featured</option>
              <option value="Newest">Newest</option>
              <option value="Recently updated">Recently updated</option>
            </select>
            <ChevronDown20Regular />
          </span>
        </div>
      </div>

      <div className="discover-tools-layout">
        <aside
          className={`discover-filters${filtersOpen ? " open" : ""}`}
          aria-label="Filters"
        >
          <FilterSection
            title="Type"
            count={selectedTypes.length}
            collapsed={Boolean(collapsed.type)}
            onToggle={() => toggleSection("type")}
          >
            {(["Custom", "Remote MCP", "Local MCP", "Skills"] as ToolCatalogType[]).map(
              (type) => (
                <FilterOption
                  key={type}
                  label={type}
                  count={typeCounts.get(type) || 0}
                  checked={selectedTypes.includes(type)}
                  onChange={() => toggle(type, selectedTypes, setSelectedTypes)}
                />
              )
            )}
          </FilterSection>

          <FilterSection
            title="Provider"
            count={selectedProviders.length}
            collapsed={Boolean(collapsed.provider)}
            onToggle={() => toggleSection("provider")}
          >
            {(["Microsoft", "Third-party"] as const).map((provider) => (
              <FilterOption
                key={provider}
                label={provider}
                count={providerCounts.get(provider) || 0}
                checked={selectedProviders.includes(provider)}
                onChange={() =>
                  toggle(provider, selectedProviders, setSelectedProviders)
                }
              />
            ))}
          </FilterSection>

          <FilterSection
            title="Category"
            count={selectedCategories.length}
            collapsed={Boolean(collapsed.category)}
            onToggle={() => toggleSection("category")}
          >
            {categoryCounts.map(([category, count]) => (
              <FilterOption
                key={category}
                label={category}
                count={count}
                checked={selectedCategories.includes(category)}
                onChange={() =>
                  toggle(category, selectedCategories, setSelectedCategories)
                }
              />
            ))}
          </FilterSection>

          <FilterSection
            title="Registry"
            count={selectedRegistries.length}
            collapsed={Boolean(collapsed.registry)}
            onToggle={() => toggleSection("registry")}
          >
            {(
              [
                "Connector catalog",
                "Public MCP registry",
                "Local skill catalog",
              ] as const
            ).map((registry) => (
              <FilterOption
                key={registry}
                label={registry}
                count={registryCounts.get(registry) || 0}
                checked={selectedRegistries.includes(registry)}
                onChange={() =>
                  toggle(registry, selectedRegistries, setSelectedRegistries)
                }
              />
            ))}
          </FilterSection>

          <FilterSection
            title="Supported auth"
            count={selectedAuth.length}
            collapsed={Boolean(collapsed.auth)}
            onToggle={() => toggleSection("auth")}
          >
            {authCounts.map(([label, count]) => (
              <FilterOption
                key={label}
                label={label}
                count={count}
                checked={selectedAuth.includes(label)}
                onChange={() => toggle(label, selectedAuth, setSelectedAuth)}
              />
            ))}
          </FilterSection>
        </aside>

        <div className="discover-results">
          <span className="visually-hidden">
            Showing {shown.length.toLocaleString()} of{" "}
            {filtered.length.toLocaleString()} items
          </span>

          {chips.length > 0 && (
            <div className="chip-row discover-chips">
              {chips.map((chip) => (
                <button
                  className="filter-chip"
                  key={chip.key}
                  onClick={chip.clear}
                  aria-label={`Remove ${chip.label} filter`}
                >
                  {chip.label}
                  <Dismiss20Regular />
                </button>
              ))}
              <button className="btn btn-sm btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}

          <div className="discover-grid">
            {shown.map((entry) => (
              <button
                className="discover-tool-card"
                key={entry.id}
                onClick={() =>
                  router.push(`/discover/tools/${encodeURIComponent(entry.slug)}`)
                }
                aria-label={`${entry.name}. ${entry.summary}`}
              >
                <span className="discover-tool-icon">{typeIcon(entry.type)}</span>
                <span className="discover-tool-body">
                  <span className="discover-tool-name">{entry.name}</span>
                  <span className="discover-tool-summary">{entry.summary}</span>
                  {entry.preview && (
                    <span className="discover-tool-badges">
                      <span className="discover-tool-badge">Preview</span>
                    </span>
                  )}
                </span>
              </button>
            ))}
          </div>

          {shown.length === 0 && (
            <div className="empty" style={{ paddingTop: 40 }}>
              <h2>No tools match those filters</h2>
              <p>Clear a filter or search for a different capability.</p>
              <button className="btn btn-secondary" onClick={clearFilters}>
                Clear filters
              </button>
            </div>
          )}

          <div className="discover-load">
            {limit < sorted.length && (
              <button
                className="btn btn-secondary"
                onClick={() =>
                  setLimit((value) => Math.min(value + PAGE_SIZE, sorted.length))
                }
              >
                Load more
              </button>
            )}
          </div>
          <div ref={sentinel} className="discover-sentinel" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function FilterSection({
  title,
  count,
  collapsed,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="discover-filter-section">
      <button
        className={`discover-filter-head${collapsed ? " collapsed" : ""}`}
        onClick={onToggle}
        aria-expanded={!collapsed}
      >
        <ChevronDown20Regular className="discover-chevron" />
        <span>
          {title}
          {count > 0 ? ` (${count})` : ""}
        </span>
      </button>
      {!collapsed && (
        <div className="discover-filter-body">{children}</div>
      )}
    </section>
  );
}

function FilterOption({
  label,
  count,
  checked,
  onChange,
}: {
  label: string;
  count: number;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="discover-filter-option">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="discover-filter-label">{label}</span>
      <span className="discover-filter-count">{count.toLocaleString()}</span>
    </label>
  );
}

export function ToolDetail({
  entry,
  setup,
  setupLoading,
  setupError,
  existingServer,
  agents,
  agentId,
  setAgentId,
  busy,
  onClose,
  onAddSkill,
  onConnectMcp,
  onCreateHttpDraft,
}: {
  entry: ToolCatalogEntry;
  setup: ToolSetup | null;
  setupLoading: boolean;
  setupError: string;
  existingServer?: McpServer;
  agents: Agent[];
  agentId: string;
  setAgentId: (value: string) => void;
  busy: string;
  onClose: () => void;
  onAddSkill: () => void;
  onConnectMcp: (headers: Record<string, string>) => void;
  onCreateHttpDraft: (draft: HttpDraft) => void;
}) {
  const skillId = `skill:${entry.id}`;
  const alreadyAttached = agents
    .find((agent) => agent.id === agentId)
    ?.tools.includes(skillId);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const [authId, setAuthId] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [baseUrl, setBaseUrl] = useState("");
  const [operationId, setOperationId] = useState("");
  const [origin, setOrigin] = useState("");
  const [oauthClientId, setOauthClientId] = useState("");
  const [oauthClientSecret, setOauthClientSecret] = useState("");
  const [oauthScopes, setOauthScopes] = useState("");
  const [oauthBusy, setOauthBusy] = useState(false);
  const [oauthConnected, setOauthConnected] = useState(false);
  const [oauthError, setOauthError] = useState("");

  useEffect(() => {
    if (!setup) return;
    setAuthId(setup.authMethods[0]?.id || "");
    setValues({});
    setBaseUrl(setup.baseUrlHint || "");
    setOperationId(setup.operations[0]?.id || "");
  }, [setup, entry.id]);

  const authMethod =
    setup?.authMethods.find((method) => method.id === authId) ||
    setup?.authMethods[0];
  const operation = setup?.operations.find((item) => item.id === operationId);
  const setupAuthLabels = [
    ...new Set(
      (setup?.authMethods || [])
        .filter((method) => method.type !== "none")
        .map((method) => method.label)
    ),
  ];
  const headers = setupHeaders(authMethod, values);
  const targetUrl = setupUrl(entry, setup, values, baseUrl, operation);
  const missingRequired =
    authMethod?.fields.filter(
      (field) => field.required && !values[field.name]?.trim()
    ).length ?? 0;
  const isHttp = entry.availability === "http";
  const isMcp = entry.availability === "mcp";
  const isLocalMcp = entry.availability === "mcp-local";
  const oauthReady = Boolean(
    authMethod?.oauth?.authorizationUrl && authMethod.oauth.tokenUrl
  );

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    setOauthClientId("");
    setOauthClientSecret("");
    const published = (authMethod?.oauth?.scopes || []).join(" ");
    const atlassianFallback = authMethod?.oauth?.authorizationUrl?.includes(
      "atlassian.com"
    )
      ? "read:jira-work read:confluence-content.all offline_access"
      : "";
    setOauthScopes(published || atlassianFallback);
    setOauthConnected(false);
    setOauthError("");
  }, [authMethod?.id, authMethod?.oauth]);

  useEffect(() => {
    if (!authMethod?.oauth?.authorizationUrl) return;
    let cancelled = false;
    fetch(
      `/api/oauth/token?toolId=${encodeURIComponent(
        entry.id
      )}&authMethodId=${encodeURIComponent(authMethod.id)}`,
      { cache: "no-store" }
    )
      .then(async (res) => (res.ok ? await res.json() : null))
      .then((json: { connected?: boolean; reference?: string } | null) => {
        if (cancelled || !json?.connected || !json.reference) return;
        setOauthConnected(true);
        setValues((current) => ({
          ...current,
          accessToken: json.reference as string,
        }));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [entry.id, authMethod?.id, authMethod?.oauth]);

  useEffect(() => {
    const method = authMethod;
    if (!method) return;
    const handler = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const data = event.data as {
        type?: string;
        ok?: boolean;
        toolId?: string;
        authMethodId?: string;
        error?: string;
      };
      if (data?.type !== "openfoundry-oauth") return;
      if (data.toolId !== entry.id || data.authMethodId !== method.id)
        return;
      if (!data.ok) {
        setOauthError(data.error || "The OAuth connection failed.");
        return;
      }
      setOauthError("");
      fetch(
        `/api/oauth/token?toolId=${encodeURIComponent(
          entry.id
        )}&authMethodId=${encodeURIComponent(method.id)}`,
        { cache: "no-store" }
      )
        .then(async (res) => (res.ok ? await res.json() : null))
        .then((json: { connected?: boolean; reference?: string } | null) => {
          if (!json?.connected || !json.reference) return;
          setOauthConnected(true);
          setValues((current) => ({
            ...current,
            accessToken: json.reference as string,
          }));
        })
        .catch(() => setOauthError("OAuth succeeded but the token could not be read."));
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [entry.id, authMethod?.id]);

  const startOAuth = async () => {
    if (!authMethod?.oauth?.authorizationUrl) return;
    const popup = window.open(
      "about:blank",
      "openfoundry-oauth",
      "width=620,height=760"
    );
    if (!popup) {
      setOauthError("The OAuth window was blocked. Allow popups for this page.");
      return;
    }
    setOauthBusy(true);
    setOauthError("");
    try {
      const res = await fetch("/api/oauth/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          toolId: entry.id,
          authMethodId: authMethod.id,
          clientId: oauthClientId.trim(),
          clientSecret: oauthClientSecret.trim() || undefined,
          scopes: oauthScopes,
        }),
      });
      const json = (await res.json()) as {
        authorizeUrl?: string;
        error?: string;
      };
      if (!res.ok || !json.authorizeUrl)
        throw new Error(json.error || "Could not start OAuth.");
      popup.location.href = json.authorizeUrl;
    } catch (error) {
      popup.close();
      setOauthError(
        error instanceof Error ? error.message : "Could not start OAuth."
      );
    } finally {
      setOauthBusy(false);
    }
  };

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        className="dialog wide connect-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.name} details`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div className="row" style={{ gap: 12, alignItems: "flex-start" }}>
            <span className="tool-catalog-icon large">
              {entry.icon ? (
                <img
                  src={entry.icon}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              ) : null}
              <span className="tool-catalog-glyph">{typeIcon(entry.type)}</span>
            </span>
            <div>
              <h2 className="dialog-title">{entry.name}</h2>
              <div className="muted text-12">
                {entry.type} · {providerOf(entry)}
                {entry.preview ? " · Preview" : ""}
              </div>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          <p className="text-14" style={{ lineHeight: "22px" }}>
            {entry.summary}
          </p>

          <div className="facts-list">
            <div className="fact-row">
              <span>Availability</span>
              <span>{availabilityLabel(entry)}</span>
            </div>
            <div className="fact-row">
              <span>Auth</span>
              <span>
                {setupAuthLabels.length
                  ? setupAuthLabels.join(", ")
                  : authLabels(entry.auth).join(", ")}
              </span>
            </div>
            {entry.category && (
              <div className="fact-row">
                <span>Category</span>
                <span>{entry.category}</span>
              </div>
            )}
            {entry.connector && (
              <div className="fact-row">
                <span>Connector</span>
                <span className="mono text-12">{entry.connector}</span>
              </div>
            )}
            {entry.remoteUrl && (
              <div className="fact-row">
                <span>Endpoint</span>
                <span className="mono text-12" style={{ wordBreak: "break-all" }}>
                  {entry.remoteUrl}
                </span>
              </div>
            )}
          </div>

          {entry.availability === "local-skill" && (
            <div className="banner">
              <Sparkle20Regular />
              <span>
                This skill becomes local instructions on the agent. It does not
                provision a cloud resource. Azure-only steps are translated to the
                local workspace or reported as unavailable.
              </span>
            </div>
          )}
          {isMcp && (
            <div className="banner">
              <PlugConnected20Regular />
              <span>
                Connect this remote MCP endpoint from your computer. The server and
                its tools stay in the local registry.
              </span>
            </div>
          )}
          {isMcp && existingServer && (
            <div
              className={`banner ${
                existingServer.status === "Error" ? "error" : ""
              }`}
            >
              <Warning20Regular />
              <span>
                Already registered as <strong>{existingServer.name}</strong> (
                {existingServer.status}
                {existingServer.error ? `: ${existingServer.error}` : ""}). Enter
                credentials below and connect again to update the existing server.
              </span>
            </div>
          )}
          {isLocalMcp && (
            <div className="banner">
              <Server20Regular />
              <span>
                This is a local MCP integration. Point the local MCP client at the
                matching database or service. If that service is not installed, use
                a local file, SQLite or knowledge-base alternative.
              </span>
            </div>
          )}
          {isHttp && (
            <div className="banner">
              <Wrench20Regular />
              <span>
                This catalog entry is a hosted connector in the source catalog.
                The local alternative is a generic HTTP tool: point it at the
                provider&apos;s native REST endpoint with your own credentials. No
                cloud connector is provisioned.
              </span>
            </div>
          )}

          {setupLoading && (
            <div className="row muted text-13" style={{ gap: 8 }}>
              <Spinner /> Loading connection setup…
            </div>
          )}
          {setupError && <div className="banner error">{setupError}</div>}

          {setup && (isMcp || isHttp) && (
            <div className="setup-card">
              <div className="row between mb-8">
                <strong className="text-13">Connection setup</strong>
                {setup.authMethods.length > 1 && (
                  <select
                    className="select"
                    style={{ width: 230 }}
                    value={authMethod?.id || ""}
                    onChange={(event) => setAuthId(event.target.value)}
                    aria-label="Authentication method"
                  >
                    {setup.authMethods.map((method) => (
                      <option key={method.id} value={method.id}>
                        {method.label}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {authMethod ? (
                <div className="stack" style={{ gap: 10 }}>
                  {authMethod.description && (
                    <p className="muted text-12" style={{ margin: 0 }}>
                      {authMethod.description}
                    </p>
                  )}
                  {authMethod.fields
                    .filter(
                      (field) =>
                        !(oauthConnected && field.name === "accessToken")
                    )
                    .map((field) => (
                    <label className="field" key={field.name}>
                      <span className="field-label">
                        {field.label}
                        {field.required && <span className="required"> *</span>}
                      </span>
                      {field.type === "select" ? (
                        <select
                          className="select"
                          value={values[field.name] || ""}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))
                          }
                        >
                          <option value="">Choose…</option>
                          {field.options.map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className="input mono"
                          type={field.secret ? "password" : "text"}
                          value={values[field.name] || ""}
                          placeholder={field.placeholder}
                          onChange={(event) =>
                            setValues((current) => ({
                              ...current,
                              [field.name]: event.target.value,
                            }))
                          }
                        />
                      )}
                      {field.description && (
                        <span className="field-hint">{field.description}</span>
                      )}
                    </label>
                  ))}

                  {authMethod.oauth && (
                    <div className="oauth-card">
                      <div className="row between">
                        <strong className="text-13">Connect with OAuth 2.0</strong>
                        {oauthConnected && (
                          <span className="badge green">Connected</span>
                        )}
                      </div>

                      {oauthReady ? (
                        <>
                          <label className="field">
                            <span className="field-label">
                              Client ID <span className="required">*</span>
                            </span>
                            <input
                              className="input mono"
                              value={oauthClientId}
                              onChange={(event) =>
                                setOauthClientId(event.target.value)
                              }
                              placeholder="From your provider OAuth application"
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">Client secret</span>
                            <input
                              className="input mono"
                              type="password"
                              value={oauthClientSecret}
                              onChange={(event) =>
                                setOauthClientSecret(event.target.value)
                              }
                              placeholder="Only if your provider app requires one"
                            />
                          </label>
                          <label className="field">
                            <span className="field-label">
                              Scopes (space or comma separated)
                            </span>
                            <input
                              className="input mono"
                              value={oauthScopes}
                              onChange={(event) =>
                                setOauthScopes(event.target.value)
                              }
                              placeholder="read:jira-work offline_access"
                            />
                          </label>
                          <div className="field-hint">
                            Redirect URI to register in the provider app:{" "}
                            <span className="mono">
                              {origin || "http://localhost:3000"}
                              /api/oauth/callback
                            </span>
                          </div>

                          {oauthError && (
                            <div className="banner error">{oauthError}</div>
                          )}

                          {oauthConnected ? (
                            <div className="banner">
                              <PlugConnected20Regular />
                              <span>
                                OAuth connected. The access token is stored locally
                                and refreshed automatically when it expires.{" "}
                                <button
                                  className="link"
                                  onClick={() => {
                                    setOauthConnected(false);
                                    setOauthError("");
                                    setValues((current) => ({
                                      ...current,
                                      accessToken: "",
                                    }));
                                  }}
                                >
                                  Use a manual token instead
                                </button>
                              </span>
                            </div>
                          ) : (
                            <button
                              className="btn btn-secondary"
                              onClick={() => void startOAuth()}
                              disabled={oauthBusy || !oauthClientId.trim()}
                            >
                              {oauthBusy ? (
                                <Spinner />
                              ) : (
                                <PlugConnected20Regular />
                              )}{" "}
                              Connect with OAuth
                            </button>
                          )}
                        </>
                      ) : (
                        <p className="muted text-12" style={{ margin: 0 }}>
                          This auth method did not publish OAuth authorization and
                          token URLs. Paste an access token above instead.
                        </p>
                      )}

                      <div className="facts-list">
                        {authMethod.oauth.authorizationUrl && (
                          <div className="fact-row">
                            <span>Authorize</span>
                            <a
                              className="link mono text-12"
                              href={authMethod.oauth.authorizationUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open authorization URL
                            </a>
                          </div>
                        )}
                        {authMethod.oauth.tokenUrl && (
                          <div className="fact-row">
                            <span>Token URL</span>
                            <span
                              className="mono text-12"
                              style={{ wordBreak: "break-all" }}
                            >
                              {authMethod.oauth.tokenUrl}
                            </span>
                          </div>
                        )}
                        {(authMethod.oauth.scopes?.length || 0) > 0 && (
                          <div
                            className="fact-row"
                            style={{ alignItems: "flex-start" }}
                          >
                            <span>Published scopes</span>
                            <span
                              className="row"
                              style={{ gap: 4, flexWrap: "wrap" }}
                            >
                              {authMethod.oauth.scopes!.map((scope) => (
                                <span className="badge gray" key={scope}>
                                  {scope}
                                </span>
                              ))}
                            </span>
                          </div>
                        )}
                        {authMethod.oauth.note && (
                          <p className="muted text-12" style={{ margin: 0 }}>
                            {authMethod.oauth.note}
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {isHttp &&
                    Object.keys(headers).length === 0 &&
                    authMethod.type !== "none" && (
                      <p className="muted text-12" style={{ margin: 0 }}>
                        These fields are not simple request headers. The provider may
                        require SDK signing, a token exchange, or a connection string.
                        You can still create the HTTP tool and add the exact headers
                        in Build → Tools, or use a local service instead.
                      </p>
                    )}

                  {isHttp && (
                    <>
                      <label className="field">
                        <span className="field-label">
                          Provider API base URL
                          {!baseUrl && <span className="required"> *</span>}
                        </span>
                        <input
                          className="input mono"
                          value={baseUrl}
                          onChange={(event) => setBaseUrl(event.target.value)}
                          placeholder="https://api.example.com"
                        />
                        <span className="field-hint">
                          The hosted connector gateway URL is not used locally. Enter
                          the provider&apos;s native API base.
                        </span>
                      </label>
                      {setup.operations.length > 0 && (
                        <label className="field">
                          <span className="field-label">Start from an operation</span>
                          <select
                            className="select"
                            value={operationId}
                            onChange={(event) => setOperationId(event.target.value)}
                          >
                            {setup.operations.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.method} {item.name}
                              </option>
                            ))}
                          </select>
                          {operation && (
                            <span className="field-hint mono">
                              {operation.method} {operation.path}
                            </span>
                          )}
                          {setup.runtimeUrls.length > 0 && operation && (
                            <span className="field-hint">
                              This is the hosted connector&apos;s operation path.
                              Treat it as a capability reference and edit the URL
                              for the provider&apos;s native REST API.
                            </span>
                          )}
                        </label>
                      )}
                      {targetUrl && (
                        <div className="chunk-preview mono text-12">
                          {targetUrl}
                        </div>
                      )}
                      <p className="muted text-12" style={{ margin: 0 }}>
                        Credential values are used as URL placeholders when the
                        operation path contains matching names. Header-like fields
                        are added to the HTTP tool automatically; you can edit the
                        rest in Build → Tools.
                      </p>
                    </>
                  )}
                </div>
              ) : (
                <p className="muted text-13">
                  This catalog entry did not publish credential fields. Use the
                  provider documentation below.
                </p>
              )}

              {setup.runtimeUrls.length > 0 && (
                <div className="banner">
                  <Warning20Regular />
                  <span>
                    Published runtime:{" "}
                    <span className="mono">{setup.runtimeUrls.join(", ")}</span>. This
                    is the vendor-hosted connector gateway, not the provider API. It
                    is listed for reference only and is not called locally.
                  </span>
                </div>
              )}

              {setup.note && (
                <p className="muted text-12" style={{ margin: 0 }}>
                  {setup.note}
                </p>
              )}
            </div>
          )}

          {entry.availability === "local-skill" && entry.instructions && (
            <details>
              <summary className="link text-13" style={{ cursor: "pointer" }}>
                Full skill instructions
              </summary>
              <pre
                className="code-block"
                style={{
                  marginTop: 8,
                  maxHeight: 320,
                  overflow: "auto",
                  whiteSpace: "pre-wrap",
                }}
              >
                {entry.instructions}
              </pre>
            </details>
          )}

          {entry.tags.length > 0 && (
            <div>
              <div className="field-label">Tags</div>
              <div className="chip-row" style={{ marginTop: 6 }}>
                {entry.tags.map((tag) => (
                  <span className="badge gray" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {entry.docs.length > 0 && (
            <div>
              <div className="field-label">Reference</div>
              <div className="stack" style={{ gap: 6, marginTop: 6 }}>
                {entry.docs.map((doc) => (
                  <a
                    className="link text-13"
                    key={doc.url}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.title}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="dialog-footer">
          {entry.availability === "local-skill" ? (
            <>
              <select
                className="select"
                style={{ width: 190 }}
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
                aria-label="Agent"
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
              <button
                className="btn btn-primary"
                onClick={onAddSkill}
                disabled={busy === "skill" || agents.length === 0 || alreadyAttached}
              >
                {busy === "skill" ? <Spinner /> : <Add20Regular />}
                {alreadyAttached ? "Already attached" : "Add to agent"}
              </button>
            </>
          ) : isMcp ? (
            <button
              className="btn btn-primary"
              onClick={() => onConnectMcp(headers)}
              disabled={busy === "mcp" || !entry.remoteUrl || missingRequired > 0}
              title={
                missingRequired > 0
                  ? "Fill the required credential fields first."
                  : undefined
              }
            >
              {busy === "mcp" ? <Spinner /> : <ArrowSync20Regular />}
              Connect MCP server
            </button>
          ) : isHttp ? (
            <button
              className="btn btn-primary"
              onClick={() =>
                onCreateHttpDraft({
                  name: operation
                    ? `${entry.name} · ${operation.name}`
                    : entry.name,
                  description: entry.summary,
                  method: operation?.method || "GET",
                  url: targetUrl,
                  headers,
                  inputSchema: {
                    type: "object",
                    properties: {},
                    additionalProperties: true,
                  },
                })
              }
              disabled={!targetUrl || missingRequired > 0}
              title={
                !targetUrl
                  ? "Enter the provider API base URL first."
                  : missingRequired > 0
                  ? "Fill the required credential fields first."
                  : undefined
              }
            >
              <Add20Regular /> Create HTTP tool
            </button>
          ) : (
            <Link href="/build/tools" className="btn btn-primary">
              <Server20Regular /> Set up local MCP
            </Link>
          )}
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
