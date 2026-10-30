"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  Book20Regular,
  Calculator20Regular,
  Code20Regular,
  Dismiss20Regular,
  Globe20Regular,
  Play20Regular,
  Search20Regular,
  Shield20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent } from "@/lib/types";

const TOOLS = [
  {
    id: "web-search",
    name: "Web search",
    type: "Remote HTTP",
    category: "Retrieval",
    icon: <Globe20Regular />,
    description:
      "Query DuckDuckGo at request time and inject fresh results into the agent prompt as untrusted context.",
    details: [
      "No API key or account required",
      "Results are labeled [W1], [W2] in the system prompt",
      "The model can still ignore them; citations are not guaranteed",
      "One outbound request per user turn when enabled",
    ],
  },
  {
    id: "file-search",
    name: "File search",
    type: "Local retrieval",
    category: "Retrieval",
    icon: <Book20Regular />,
    description:
      "Ground answers in knowledge bases indexed on this computer, with numbered source citations.",
    details: [
      "Vector search through Ollama nomic-embed-text",
      "Falls back to lexical scoring when no embedding model exists",
      "Requires a knowledge base attached to the agent",
      "Retrieved chunks are written to the trace for audit",
    ],
  },
  {
    id: "calculator",
    name: "Calculator",
    type: "Local function",
    category: "Reasoning",
    icon: <Calculator20Regular />,
    description:
      "Detect arithmetic in the user prompt, evaluate it deterministically and add the exact result to the prompt.",
    details: [
      "No network access",
      "Does not evaluate arbitrary code",
      "Handles percentages, parentheses and basic operators",
      "The injected result is visible in the system prompt",
    ],
  },
];

export default function DiscoverToolsPage() {
  const { toast } = useToast();
  const { data } = useApi<{ agents: Agent[] }>("/api/agents");
  const agents = data?.agents ?? [];

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [addTool, setAddTool] = useState<(typeof TOOLS)[number] | null>(null);
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);

  const categories = ["All", ...new Set(TOOLS.map((tool) => tool.category))];
  const filtered = TOOLS.filter((tool) => {
    if (category !== "All" && tool.category !== category) return false;
    if (
      query &&
      !tool.name.toLowerCase().includes(query.toLowerCase()) &&
      !tool.description.toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const usage = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const agent of agents) {
      for (const id of agent.tools) map.set(id, [...(map.get(id) || []), agent]);
    }
    return map;
  }, [agents]);

  const enable = async () => {
    if (!addTool || !agentId) return;
    setBusy(true);
    try {
      const agent = agents.find((item) => item.id === agentId);
      if (!agent) throw new Error("Agent not found");
      const tools = agent.tools.includes(addTool.id)
        ? agent.tools
        : [...agent.tools, addTool.id];
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools }),
      });
      if (!res.ok) throw new Error("Could not update the agent");
      toast(`${addTool.name} enabled on ${agent.name}`, "success");
      setAddTool(null);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Tools</h1>
          <p className="page-subtitle">
            Every tool available to local agents. Enable one here or test it first.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/tools" className="btn btn-secondary">
            <Play20Regular /> Test tools
          </Link>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search tools"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 200 }}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
        >
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span className="grow" />
        <span className="muted text-12">{filtered.length} tools</span>
      </div>

      <div className="tool-detail-grid">
        {filtered.map((tool) => {
          const usedBy = usage.get(tool.id) || [];
          return (
            <div className="operate-card tool-detail-card" key={tool.id}>
              <div className="row between">
                <span className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">{tool.icon}</span>
                  <span>
                    <strong className="text-14">{tool.name}</strong>
                    <div className="muted text-12">
                      {tool.type} · {tool.category}
                    </div>
                  </span>
                </span>
                <span className="badge gray">{usedBy.length} agents</span>
              </div>
              <p className="text-13 muted" style={{ lineHeight: "20px" }}>
                {tool.description}
              </p>
              <ul className="model-list">
                {tool.details.map((detail) => (
                  <li key={detail}>{detail}</li>
                ))}
              </ul>
              <div className="chip-row" style={{ marginBottom: 0 }}>
                {usedBy.map((agent) => (
                  <Link
                    key={agent.id}
                    href={`/build/agents/${encodeURIComponent(agent.id)}/build`}
                    className="badge gray"
                  >
                    {agent.name}
                  </Link>
                ))}
                {usedBy.length === 0 && (
                  <span className="muted text-12">Not enabled on any agent.</span>
                )}
              </div>
              <div className="row mt-8" style={{ gap: 8 }}>
                <button
                  className="btn btn-sm btn-primary"
                  disabled={agents.length === 0}
                  onClick={() => {
                    setAgentId(agents[0]?.id || "");
                    setAddTool(tool);
                  }}
                >
                  <Add20Regular /> Add to agent
                </button>
                <Link href="/build/tools" className="btn btn-sm btn-secondary">
                  <Play20Regular /> Open in Tools
                </Link>
              </div>
            </div>
          );
        })}
      </div>

      <div className="banner mt-16">
        <Shield20Regular />
        <span>
          Tools execute in the Next.js server process before the model runs. The only
          outbound network call is web search, and it is made with no credentials.
        </span>
      </div>

      <div className="discover-section-head" style={{ marginTop: 28 }}>
        <h2 className="discover-section-title">Tool execution contract</h2>
      </div>
      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tool</th>
              <th>Input</th>
              <th>Output</th>
              <th>Where it runs</th>
              <th style={{ width: 130 }}>Failure mode</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="cell-strong">Web search</td>
              <td>Last user message</td>
              <td>Up to 4 titled results</td>
              <td>Server → DuckDuckGo</td>
              <td>Empty result list</td>
            </tr>
            <tr>
              <td className="cell-strong">File search</td>
              <td>Knowledge base ids + query</td>
              <td>Ranked chunks with scores</td>
              <td>Server → local embeddings</td>
              <td>Lexical fallback</td>
            </tr>
            <tr>
              <td className="cell-strong">Calculator</td>
              <td>Arithmetic expression</td>
              <td>Numeric result</td>
              <td>Server process</td>
              <td>No expression detected</td>
            </tr>
          </tbody>
        </table>
      </div>

      {addTool && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddTool(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label={`Add ${addTool.name}`}>
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add {addTool.name}</h2>
                <p className="dialog-sub">
                  The tool is added to the agent configuration and used on the next
                  chat request.
                </p>
              </div>
              <button className="icon-button" onClick={() => setAddTool(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent</span>
                <select
                  className="select"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.tools.includes(addTool.id) ? " · already enabled" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <div className="banner">
                <Code20Regular />
                <span>
                  For file search, also attach a knowledge base in the agent builder.
                  The tool alone does not choose documents.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setAddTool(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={enable} disabled={busy || !agentId}>
                {busy ? <Spinner /> : <Add20Regular />} Add tool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
