"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  Book20Regular,
  Box20Regular,
  Cloud20Regular,
  Dismiss20Regular,
  Filter20Regular,
  PeopleTeam20Regular,
  Search20Regular,
  Shield20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { formatDate, formatNumber, useApi, useDeployments } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { Agent, Deployment, KnowledgeBase } from "@/lib/types";

type AssetType = "Agent" | "Deployment" | "Knowledge base" | "Tool";

interface Asset {
  id: string;
  name: string;
  type: AssetType;
  status: string;
  provider: string;
  updatedAt: string;
  href: string;
  detail: string;
}

const TYPE_ICON: Record<AssetType, React.ReactNode> = {
  Agent: <PeopleTeam20Regular />,
  Deployment: <Box20Regular />,
  "Knowledge base": <Book20Regular />,
  Tool: <Wrench20Regular />,
};

export default function AssetsPage() {
  const { toast } = useToast();
  const { data: agentData, refresh: refreshAgents } = useApi<{ agents: Agent[] }>(
    "/api/agents",
    8000
  );
  const { data: deploymentData, refresh: refreshDeployments } = useDeployments(6000);
  const { data: knowledgeData } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
    10000
  );
  const { data: traceData } = useApi<{ traces: { agentId: string; latencyMs: number }[] }>(
    "/api/traces",
    10000
  );

  const agents = agentData?.agents ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const knowledgeBases = knowledgeData?.knowledgeBases ?? [];
  const traces = traceData?.traces ?? [];

  const [query, setQuery] = useState("");
  const [type, setType] = useState<"All" | AssetType>("All");
  const [status, setStatus] = useState("All");
  const [registerOpen, setRegisterOpen] = useState(false);
  const [registerAgent, setRegisterAgent] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Asset | null>(null);

  const assets = useMemo<Asset[]>(() => {
    const list: Asset[] = [];
    for (const agent of agents) {
      list.push({
        id: agent.id,
        name: agent.name,
        type: "Agent",
        status: agent.status,
        provider: agent.provider === "ollama" ? "Ollama" : "Foundry Local",
        updatedAt: agent.updatedAt,
        href: `/build/agents/${encodeURIComponent(agent.id)}/build`,
        detail: `${agent.model} · v${agent.version}`,
      });
    }
    for (const deployment of deployments) {
      list.push({
        id: deployment.id,
        name: deployment.name,
        type: "Deployment",
        status: deployment.status,
        provider: deployment.providerLabel,
        updatedAt: deployment.updatedAt,
        href: "/build/models/deployments",
        detail: `${deployment.modelName} · ${deployment.sku}`,
      });
    }
    for (const base of knowledgeBases) {
      list.push({
        id: base.id,
        name: base.name,
        type: "Knowledge base",
        status: base.status,
        provider: base.embeddingProvider === "lexical" ? "Lexical" : base.embeddingProvider,
        updatedAt: base.updatedAt,
        href: `/build/knowledge/${encodeURIComponent(base.id)}`,
        detail: `${base.documents.length} documents · ${base.indexName}`,
      });
    }
    for (const tool of [
      { id: "web-search", name: "Web search", status: "Ready", detail: "DuckDuckGo at request time" },
      { id: "file-search", name: "File search", status: "Ready", detail: "Local vector retrieval" },
      { id: "calculator", name: "Calculator", status: "Ready", detail: "Deterministic arithmetic" },
    ]) {
      list.push({
        id: tool.id,
        name: tool.name,
        type: "Tool",
        status: tool.status,
        provider: "Local function",
        updatedAt: "",
        href: "/build/tools",
        detail: tool.detail,
      });
    }
    return list;
  }, [agents, deployments, knowledgeBases]);

  const filtered = useMemo(
    () =>
      assets.filter((asset) => {
        if (type !== "All" && asset.type !== type) return false;
        if (status !== "All" && asset.status !== status) return false;
        if (
          query &&
          !asset.name.toLowerCase().includes(query.toLowerCase()) &&
          !asset.detail.toLowerCase().includes(query.toLowerCase())
        )
          return false;
        return true;
      }),
    [assets, type, status, query]
  );

  const counts = useMemo(() => {
    const map = new Map<AssetType, number>();
    for (const asset of assets) map.set(asset.type, (map.get(asset.type) || 0) + 1);
    return map;
  }, [assets]);

  const register = async () => {
    if (!registerAgent) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(registerAgent)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      if (!res.ok) throw new Error("Could not register the asset");
      toast("Asset registered in the local project", "success");
      setRegisterOpen(false);
      refreshAgents();
      refreshDeployments();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Register failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div className="row" style={{ gap: 10 }}>
          <h1 className="page-title">Assets</h1>
          <span className="preview-tag">Preview</span>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            disabled={agents.length === 0}
            onClick={() => {
              setRegisterAgent(agents[0]?.id || "");
              setRegisterOpen(true);
            }}
          >
            <Add20Regular /> Register asset
          </button>
        </div>
      </div>
      <p className="muted text-13" style={{ marginBottom: 16, maxWidth: 900 }}>
        Every agent, deployment, knowledge base and tool created on this computer is
        an asset. Assets are stored under <span className="mono">data/</span> and can
        be inspected or opened from here.
      </p>

      <div className="asset-strip">
        {(
          [
            ["Agent", <PeopleTeam20Regular key="a" />],
            ["Deployment", <Box20Regular key="d" />],
            ["Knowledge base", <Book20Regular key="k" />],
            ["Tool", <Wrench20Regular key="t" />],
          ] as [AssetType, React.ReactNode][]
        ).map(([label, icon]) => (
          <button
            key={label}
            className={`asset-tile${type === label ? " active" : ""}`}
            onClick={() => setType(type === label ? "All" : label)}
          >
            <span className="kb-icon">{icon}</span>
            <span>
              <span className="metric-label">{label}</span>
              <span className="metric-value" style={{ fontSize: 20 }}>
                {counts.get(label) || 0}
              </span>
            </span>
          </button>
        ))}
      </div>

      <div className="page-toolbar mt-16">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search assets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          className="select"
          style={{ width: 170 }}
          value={type}
          onChange={(event) => setType(event.target.value as "All" | AssetType)}
          aria-label="Asset type"
        >
          <option value="All">All types</option>
          <option value="Agent">Agents</option>
          <option value="Deployment">Deployments</option>
          <option value="Knowledge base">Knowledge bases</option>
          <option value="Tool">Tools</option>
        </Select>
        <Select
          className="select"
          style={{ width: 150 }}
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          aria-label="Asset status"
        >
          <option value="All">All statuses</option>
          <option value="Running">Running</option>
          <option value="Ready">Ready</option>
          <option value="Creating">Creating</option>
          <option value="Stopped">Stopped</option>
          <option value="Failed">Failed</option>
        </Select>
        <span className="spacer" />
        <span className="muted text-12">
          {filtered.length} of {assets.length} assets · {traces.length} traces
        </span>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th style={{ width: 150 }}>Type</th>
              <th style={{ width: 130 }}>Status</th>
              <th style={{ width: 170 }}>Runtime</th>
              <th>Details</th>
              <th style={{ width: 170 }}>Last updated</th>
              <th style={{ width: 90 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((asset) => (
              <tr key={`${asset.type}-${asset.id}`}>
                <td>
                  <button className="agent-name" style={{ whiteSpace: "nowrap" }} onClick={() => setSelected(asset)}>
                    {asset.name}
                  </button>
                </td>
                <td>
                  <span className="row" style={{ gap: 6 }}>
                    {TYPE_ICON[asset.type]}
                    {asset.type}
                  </span>
                </td>
                <td>
                  <StatusBadge status={asset.status} />
                </td>
                <td>{asset.provider}</td>
                <td className="muted truncate" style={{ maxWidth: 320 }}>
                  {asset.detail}
                </td>
                <td className="muted">{asset.updatedAt ? formatDate(asset.updatedAt) : "—"}</td>
                <td>
                  <Link href={asset.href} className="btn btn-sm btn-outline">
                    Open
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 44 }}>
                  No assets match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span className="row" style={{ gap: 6 }}>
          <Filter20Regular /> {filtered.length} assets
        </span>
        <span className="muted">
          Local project · {formatNumber(traces.length)} traces stored
        </span>
      </div>

      {selected && (
        <div
          className="drawer-backdrop"
          onClick={() => setSelected(null)}
        />
      )}
      {selected && (
        <aside className="drawer" aria-label={`${selected.name} details`}>
          <div className="drawer-head">
            <div className="row" style={{ gap: 10 }}>
              <span className="kb-icon">{TYPE_ICON[selected.type]}</span>
              <div>
                <h2 className="drawer-title">{selected.name}</h2>
                <p className="muted text-12">
                  {selected.type} · {selected.provider}
                </p>
              </div>
            </div>
            <button
              className="icon-button"
              onClick={() => setSelected(null)}
              aria-label="Close"
            >
              <Dismiss20Regular />
            </button>
          </div>
          <div className="drawer-body">
            <div className="facts-list">
              <div className="fact-row">
                <span>Status</span>
                <span>
                  <StatusBadge status={selected.status} />
                </span>
              </div>
              <div className="fact-row">
                <span>Type</span>
                <span>{selected.type}</span>
              </div>
              <div className="fact-row">
                <span>Runtime</span>
                <span>{selected.provider}</span>
              </div>
              <div className="fact-row">
                <span>Identifier</span>
                <span className="mono text-12">{selected.id}</span>
              </div>
              <div className="fact-row">
                <span>Last updated</span>
                <span>{selected.updatedAt ? formatDate(selected.updatedAt) : "—"}</span>
              </div>
            </div>
            <div className="banner">
              <Shield20Regular />
              <span>
                This asset exists only on this computer. No telemetry is sent to
                openFoundry and no cloud resource is billed.
              </span>
            </div>
            <Link href={selected.href} className="btn btn-primary">
              Open asset
            </Link>
          </div>
        </aside>
      )}

      {registerOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setRegisterOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Register asset">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Register asset</h2>
                <p className="dialog-sub">
                  Publish an agent so operate metrics and compliance treat it as a
                  monitored asset.
                </p>
              </div>
              <button className="icon-button" onClick={() => setRegisterOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent</span>
                <Select
                  className="select"
                  value={registerAgent}
                  onChange={(event) => setRegisterAgent(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name} · {agent.status} · v{agent.version}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="banner">
                <Cloud20Regular />
                <span>
                  Publishing creates a local version record. It does not create an
                  cloud resource and does not consume quota.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setRegisterOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={busy || !registerAgent}
                onClick={register}
              >
                {busy ? <Spinner /> : <ArrowSync20Regular />} Register
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
