"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  Dismiss20Regular,
  PlugConnected20Regular,
  Document20Regular,
  Search20Regular,
  Server20Regular,
  Sparkle20Regular,
  Warning20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
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

type Sort = "Featured" | "Name" | "Type";
type Availability = "all" | "local" | "alternative";

const TYPE_ORDER: Record<ToolCatalogType, number> = {
  Skills: 0,
  "Remote MCP": 1,
  "Local MCP": 2,
  Custom: 3,
};

function typeIcon(type: ToolCatalogType) {
  if (type === "Skills") return <Document20Regular />;
  if (type === "Remote MCP") return <PlugConnected20Regular />;
  if (type === "Local MCP") return <Server20Regular />;
  return <Wrench20Regular />;
}

function authLabel(value: string): string {
  const key = value.toLowerCase();
  if (key.includes("oauth")) return "OAuth 2.0";
  if (key.includes("apikey") || key.includes("key-based")) return "Key-based";
  if (key.includes("managedidentity")) return "Managed identity";
  if (key.includes("agent")) return "Agent identity";
  if (key.includes("entra")) return "Microsoft Entra";
  if (key.includes("unauthenticated") || key === "none") return "None";
  return value;
}

function authLabels(auth: string[]): string[] {
  const labels = auth.map(authLabel);
  return [...new Set(labels.length ? labels : ["None"])];
}

function providerOf(entry: ToolCatalogEntry): string {
  return entry.company || "Other publishers";
}

function availabilityLabel(entry: ToolCatalogEntry): string {
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

interface HttpDraft {
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
  if (base) return base;
  return entry.remoteUrl || entry.docs[0]?.url || "";
}

export default function ToolCatalog() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, error } = useApi<{
    tools: ToolCatalogEntry[];
    total: number;
  }>("/api/tools/catalog");
  const { data: agentData, refresh: refreshAgents } = useApi<{ agents: Agent[] }>(
    "/api/agents"
  );
  const { data: mcpData, refresh: refreshMcp } = useApi<{ servers: McpServer[] }>(
    "/api/mcp",
    15000
  );

  const tools = useMemo(() => data?.tools ?? [], [data?.tools]);
  const agents = agentData?.agents ?? [];
  const servers = mcpData?.servers ?? [];

  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("Featured");
  const [availability, setAvailability] = useState<Availability>("all");
  const [selectedTypes, setSelectedTypes] = useState<ToolCatalogType[]>([]);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [selectedAuth, setSelectedAuth] = useState<string[]>([]);
  const [limit, setLimit] = useState(48);
  const [selected, setSelected] = useState<ToolCatalogEntry | null>(null);
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState("");
  const [setup, setSetup] = useState<ToolSetup | null>(null);
  const [setupLoading, setSetupLoading] = useState(false);
  const [setupError, setSetupError] = useState("");

  useEffect(() => {
    if (!selected) {
      setSetup(null);
      setSetupError("");
      return;
    }
    let cancelled = false;
    setSetup(null);
    setSetupError("");
    setSetupLoading(true);
    fetch(`/api/tools/catalog/${encodeURIComponent(selected.id)}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        const json = (await res.json()) as {
          setup?: ToolSetup;
          error?: string;
        };
        if (!res.ok) throw new Error(json.error || "Could not load tool setup.");
        if (!cancelled) setSetup(json.setup || null);
      })
      .catch((err) => {
        if (!cancelled)
          setSetupError(err instanceof Error ? err.message : "Could not load setup.");
      })
      .finally(() => {
        if (!cancelled) setSetupLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  useEffect(() => {
    setLimit(48);
  }, [query, sort, availability, selectedTypes, selectedProviders, selectedCategories, selectedAuth]);

  useEffect(() => {
    if (!selected && agents[0]) setAgentId(agents[0].id);
  }, [agents, selected]);

  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tools) map.set(entry.type, (map.get(entry.type) || 0) + 1);
    return map;
  }, [tools]);

  const companyCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tools) {
      const company = providerOf(entry);
      map.set(company, (map.get(company) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [tools]);

  const companyOptions = useMemo(() => {
    const named = companyCounts
      .filter(
        ([company]) =>
          company !== "Independent" && company !== "Other publishers"
      )
      .slice(0, 20);
    const tail = companyCounts
      .filter(
        ([company]) =>
          company === "Independent" || company === "Other publishers"
      )
      .sort(([a], [b]) => (a === "Independent" ? -1 : b === "Independent" ? 1 : 0));
    return [...named, ...tail];
  }, [companyCounts]);

  const categoryCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tools) {
      if (!entry.category) continue;
      map.set(entry.category, (map.get(entry.category) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [tools]);

  const authCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const entry of tools) {
      for (const label of authLabels(entry.auth)) {
        map.set(label, (map.get(label) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [tools]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const result = tools.filter((entry) => {
      if (!matchesQuery(entry, needle)) return false;
      if (selectedTypes.length && !selectedTypes.includes(entry.type)) return false;
      if (
        selectedProviders.length &&
        !selectedProviders.includes(providerOf(entry))
      )
        return false;
      if (
        selectedCategories.length &&
        (!entry.category || !selectedCategories.includes(entry.category))
      )
        return false;
      if (selectedAuth.length) {
        const labels = authLabels(entry.auth);
        if (!labels.some((label) => selectedAuth.includes(label))) return false;
      }
      if (availability === "local" && entry.availability === "http") return false;
      if (availability === "alternative" && entry.availability !== "http")
        return false;
      return true;
    });
    if (sort === "Name")
      return [...result].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "Type")
      return [...result].sort(
        (a, b) =>
          TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || a.name.localeCompare(b.name)
      );
    return result;
  }, [
    tools,
    query,
    selectedTypes,
    selectedProviders,
    selectedCategories,
    selectedAuth,
    availability,
    sort,
  ]);

  const shown = filtered.slice(0, limit);

  const toggle = <T,>(
    value: T,
    list: T[],
    setList: (next: T[]) => void
  ) => {
    setList(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]);
  };

  const clearFilters = () => {
    setQuery("");
    setSort("Featured");
    setAvailability("all");
    setSelectedTypes([]);
    setSelectedProviders([]);
    setSelectedCategories([]);
    setSelectedAuth([]);
  };

  const activeFilterCount =
    selectedTypes.length +
    selectedProviders.length +
    selectedCategories.length +
    selectedAuth.length +
    (availability !== "all" ? 1 : 0);

  const addSkill = async (entry: ToolCatalogEntry) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      toast("Create an agent first.", "error");
      return;
    }
    const id = `skill:${entry.id}`;
    if (agent.tools.includes(id)) {
      toast(`${entry.name} is already on ${agent.name}.`, "info");
      return;
    }
    setBusy("skill");
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...agent.tools, id] }),
      });
      if (!res.ok) throw new Error("Could not attach the skill.");
      toast(`${entry.name} attached to ${agent.name}`, "success");
      refreshAgents();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Attach failed.", "error");
    } finally {
      setBusy("");
    }
  };

  const connectMcp = async (
    entry: ToolCatalogEntry,
    headers: Record<string, string> = {}
  ) => {
    if (!entry.remoteUrl) {
      toast(
        "This catalog entry does not publish a remote endpoint. Use the local MCP setup in Build → Tools.",
        "error"
      );
      return;
    }
    const existing = servers.find(
      (server) =>
        server.name === entry.name ||
        (server.transport === "http" && server.url === entry.remoteUrl)
    );
    if (existing && Object.keys(headers).length === 0) {
      toast(
        `${entry.name} is already registered. Add credentials here and connect again, or edit it in Build → Tools.`,
        "info"
      );
      return;
    }
    setBusy("mcp");
    try {
      const res = await fetch(
        existing ? `/api/mcp/${encodeURIComponent(existing.id)}` : "/api/mcp",
        {
          method: existing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: entry.name,
            transport: "http",
            url: entry.remoteUrl,
            headers,
          }),
        }
      );
      const json = (await res.json()) as { server?: McpServer; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not register the MCP server.");
      refreshMcp();
      if (json.server?.status === "Error") {
        toast(
          `Server saved, but the connection failed: ${json.server.error || "check the endpoint."}`,
          "error"
        );
      } else {
        toast(
          `${entry.name} connected with ${json.server?.tools.length || 0} tools.`,
          "success"
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "MCP connection failed.", "error");
    } finally {
      setBusy("");
    }
  };

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
    <div>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Tools ({tools.length.toLocaleString()})</h1>
          <p className="page-subtitle">
            Every tool in the local catalog. Nothing is provisioned in a cloud
            subscription: MCP servers run from this machine, skills become agent
            instructions, and custom connectors get a local HTTP alternative.
          </p>
          <p className="muted text-12" style={{ marginTop: 4 }}>
            {tools.length.toLocaleString()} unique tools from the reference
            catalog&apos;s 1,683 entries; registry duplicates are collapsed.
          </p>
          <p className="muted text-12" style={{ marginTop: 2 }}>
            Tool names and links belong to their publishers. openFoundry is an
            independent local index; no affiliation or endorsement is implied.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/tools" className="btn btn-secondary">
            <Server20Regular /> Manage connections
          </Link>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search tools"
          />
        </div>
        <select
          className="select"
          style={{ width: 190 }}
          value={sort}
          onChange={(event) => setSort(event.target.value as Sort)}
          aria-label="Sort tools"
        >
          <option value="Featured">Sort by: Featured</option>
          <option value="Name">Name (A-Z)</option>
          <option value="Type">Type</option>
        </select>
        <span className="grow" />
        <span className="muted text-12">
          Showing {Math.min(limit, filtered.length).toLocaleString()} of{" "}
          {filtered.length.toLocaleString()}
        </span>
      </div>

      <div className="catalog-layout">
        <aside className="filters">
          <div className="row between" style={{ marginBottom: 8 }}>
            <strong className="text-13">Filters</strong>
            {activeFilterCount > 0 && (
              <button className="link text-12" onClick={clearFilters}>
                Clear all
              </button>
            )}
          </div>

          <FilterGroup title="Availability">
            {[
              ["all", "All tools"],
              ["local", "Real local action"],
              ["alternative", "Local alternative"],
            ].map(([value, label]) => (
              <label className="filter-option" key={value}>
                <input
                  type="radio"
                  name="availability"
                  checked={availability === value}
                  onChange={() => setAvailability(value as Availability)}
                />
                <span>{label}</span>
              </label>
            ))}
          </FilterGroup>

          <FilterGroup title="Type">
            {(["Custom", "Remote MCP", "Local MCP", "Skills"] as ToolCatalogType[]).map(
              (type) => (
                <label className="filter-option" key={type}>
                  <input
                    type="checkbox"
                    checked={selectedTypes.includes(type)}
                    onChange={() =>
                      toggle(type, selectedTypes, setSelectedTypes)
                    }
                  />
                  <span>{type}</span>
                  <span className="muted" style={{ marginLeft: "auto" }}>
                    {typeCounts.get(type) || 0}
                  </span>
                </label>
              )
            )}
          </FilterGroup>

          <FilterGroup title="Company">
            {companyOptions.map(([company, count]) => (
              <label className="filter-option" key={company}>
                <input
                  type="checkbox"
                  checked={selectedProviders.includes(company)}
                  onChange={() =>
                    toggle(company, selectedProviders, setSelectedProviders)
                  }
                />
                <span className="truncate" title={company}>
                  {company}
                </span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {count}
                </span>
              </label>
            ))}
          </FilterGroup>

          <FilterGroup title="Category">
            {categoryCounts.map(([category, count]) => (
              <label className="filter-option" key={category}>
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={() =>
                    toggle(category, selectedCategories, setSelectedCategories)
                  }
                />
                <span className="truncate" title={category}>
                  {category}
                </span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {count}
                </span>
              </label>
            ))}
          </FilterGroup>

          <FilterGroup title="Supported auth">
            {authCounts.map(([label, count]) => (
              <label className="filter-option" key={label}>
                <input
                  type="checkbox"
                  checked={selectedAuth.includes(label)}
                  onChange={() => toggle(label, selectedAuth, setSelectedAuth)}
                />
                <span>{label}</span>
                <span className="muted" style={{ marginLeft: "auto" }}>
                  {count}
                </span>
              </label>
            ))}
          </FilterGroup>
        </aside>

        <div>
          <div className="tool-catalog-grid">
            {shown.map((entry) => (
              <button
                className="tool-catalog-card"
                key={entry.id}
                onClick={() => {
                  if (entry.type === "Skills") {
                    router.push(`/discover/tools/${entry.slug}`);
                  } else {
                    setSelected(entry);
                  }
                }}
              >
                <div className="tool-catalog-card-head">
                  <span className="tool-catalog-card-icon">
                    {entry.icon ? (
                      <img
                        src={entry.icon}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          event.currentTarget.style.display = "none";
                        }}
                      />
                    ) : null}
                    <span className="tool-catalog-glyph">{typeIcon(entry.type)}</span>
                  </span>
                  <span className="tool-catalog-title">{entry.name}</span>
                </div>
                <span className="tool-catalog-desc">{entry.summary}</span>
                <span className="tool-catalog-tags">
                  <span className="badge gray">{entry.type}</span>
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

          {limit < filtered.length && (
            <div className="row" style={{ justifyContent: "center", marginTop: 20 }}>
              <button
                className="btn btn-secondary"
                onClick={() => setLimit((value) => value + 48)}
              >
                Load more
              </button>
            </div>
          )}
        </div>
      </div>

      {selected && (
        <ToolDetail
          entry={selected}
          setup={setup}
          setupLoading={setupLoading}
          setupError={setupError}
          existingServer={
            selected
              ? servers.find(
                  (server) =>
                    server.name === selected.name ||
                    (server.transport === "http" &&
                      server.url === selected.remoteUrl)
                )
              : undefined
          }
          agents={agents}
          agentId={agentId}
          setAgentId={setAgentId}
          busy={busy}
          onClose={() => setSelected(null)}
          onAddSkill={() => void addSkill(selected)}
          onConnectMcp={(headers) => void connectMcp(selected, headers)}
          onCreateHttpDraft={(draft) => {
            try {
              window.sessionStorage.setItem(
                "openfoundry:http-draft",
                JSON.stringify(draft)
              );
            } catch {
              // The navigation still opens the builder without the draft.
            }
            window.location.assign("/build/tools");
          }}
        />
      )}
    </div>
  );
}

function FilterGroup({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="filter-group">
      <div className="filter-head">{title}</div>
      <div className="filter-body">{children}</div>
    </div>
  );
}

function ToolDetail({
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
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`${entry.name} details`}
      >
        <div className="drawer-head">
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
              <h2 className="drawer-title">{entry.name}</h2>
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
        <div className="drawer-body">
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
                This is a hosted connector in the reference catalog. The local
                alternative is a generic HTTP tool: point it at the provider&apos;s
                native REST endpoint with your own credentials. No Azure connector
                is provisioned.
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
                    is the hosted Azure connector gateway, not the provider API. It is
                    listed for reference only and is not called locally.
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
        <div className="drawer-footer">
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
      </aside>
    </>
  );
}
