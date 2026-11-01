"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  Book20Regular,
  Calculator20Regular,
  Code20Regular,
  Dismiss20Regular,
  Globe20Regular,
  Play20Regular,
  Search20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import Link from "next/link";
import { useApi, useKnowledge } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import McpServers from "@/components/McpServers";
import HttpTools from "@/components/HttpTools";
import Toolboxes from "@/components/Toolboxes";
import SkillsPanel from "@/components/SkillsPanel";
import type { Agent, KnowledgeBase } from "@/lib/types";

type Tab = "Toolboxes" | "Tools" | "Skills";

const TABS: Tab[] = ["Toolboxes", "Tools", "Skills"];

const TOOLS = [
  {
    id: "web-search",
    name: "Web search",
    type: "Remote HTTP",
    icon: <Globe20Regular />,
    description:
      "Search the public web at request time and inject the top results into the system prompt as untrusted context.",
    behavior:
      "The last user message is parsed for a query. DuckDuckGo's HTML endpoints are queried with no API key.",
    config: "No configuration. Outbound HTTPS to duckduckgo.com.",
    placeholder: "Latest local LLM news",
  },
  {
    id: "file-search",
    name: "File search",
    type: "Local retrieval",
    icon: <Book20Regular />,
    description:
      "Retrieve grounded chunks from a knowledge base on this computer and add numbered citations to the prompt.",
    behavior:
      "Embeds the query with Ollama nomic-embed-text when available, then scores every chunk and returns the top matches.",
    config: "Requires a knowledge base with indexed documents.",
    placeholder: "What is our return policy?",
    needsKnowledge: true,
  },
  {
    id: "calculator",
    name: "Calculator",
    type: "Local function",
    icon: <Calculator20Regular />,
    description:
      "Detect an arithmetic expression in the prompt, evaluate it locally and hand the exact result to the model.",
    behavior:
      "Uses a small deterministic parser. It never evaluates arbitrary code and never calls the network.",
    config: "No configuration. Runs in the Node process.",
    placeholder: "What is 18% of 2450?",
  },
];

export default function ToolsPage() {
  const { toast } = useToast();
  const { data: agentData, refresh: refreshAgents } = useApi<{ agents: Agent[] }>(
    "/api/agents"
  );
  const { data: knowledgeData } = useKnowledge();
  const agents = agentData?.agents ?? [];
  const bases = knowledgeData?.knowledgeBases ?? [];

  const usage = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const agent of agents) {
      for (const tool of agent.tools) {
        map.set(tool, [...(map.get(tool) || []), agent]);
      }
    }
    return map;
  }, [agents]);

  const openTest = (tool: (typeof TOOLS)[number]) => {
    setTestTool(tool);
    setInput("");
    setResult(null);
    setKnowledgeBaseId(bases[0]?.id || "");
  };

  const runTest = async () => {
    if (!testTool) return;
    setTesting(true);
    setResult(null);
    try {
      const res = await fetch("/api/tools/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tool: testTool.id,
          input,
          knowledgeBaseId: testTool.needsKnowledge ? knowledgeBaseId : undefined,
        }),
      });
      const json = (await res.json()) as {
        kind: string;
        latencyMs: number;
        results?: { title: string; url: string; snippet: string }[];
        citations?: { documentId: string; documentName: string; chunk: string; score: number }[];
        result?: string | null;
        note?: string;
        embeddingModel?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Tool call failed");
      setResult(json);
    } catch (error) {
      setResult({
        kind: testTool.id,
        latencyMs: 0,
        error: error instanceof Error ? error.message : "Tool call failed",
      });
    } finally {
      setTesting(false);
    }
  };

  const enable = async () => {
    if (!addTool || !agentId) return;
    setSaving(true);
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
      setSaving(false);
    }
  };

  const [tab, setTab] = useState<Tab>("Tools");
  const [testTool, setTestTool] = useState<(typeof TOOLS)[number] | null>(null);
  const [addTool, setAddTool] = useState<(typeof TOOLS)[number] | null>(null);
  const [agentId, setAgentId] = useState("");
  const [input, setInput] = useState("");
  const [knowledgeBaseId, setKnowledgeBaseId] = useState("");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{
    kind: string;
    latencyMs: number;
    results?: { title: string; url: string; snippet: string }[];
    citations?: { documentId: string; documentName: string; chunk: string; score: number }[];
    result?: string | null;
    note?: string;
    embeddingModel?: string;
    error?: string;
  } | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("tab");
    if (requested === "toolboxes" || requested === "tools" || requested === "skills") {
      setTab(
        requested === "toolboxes"
          ? "Toolboxes"
          : requested === "skills"
          ? "Skills"
          : "Tools"
      );
    }
  }, []);

  const switchTab = (next: Tab) => {
    setTab(next);
    const value =
      next === "Toolboxes" ? "toolboxes" : next === "Skills" ? "skills" : "tools";
    window.history.replaceState(null, "", `/build/tools?tab=${value}`);
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h1 className="page-title">Tools</h1>
          <p className="page-subtitle">
            Built-in tools, local MCP and HTTP tools, skills and toolboxes. Test
            each one before an agent uses it.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/discover/tools" className="btn btn-secondary">
            <Search20Regular /> Browse tool catalog
          </Link>
        </div>
      </div>

      <div className="tabbar" style={{ marginBottom: 16 }}>
        {TABS.map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => switchTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Toolboxes" && <Toolboxes />}

      {tab === "Tools" && (
        <>
          <div className="tool-detail-grid">
            {TOOLS.map((tool) => {
              const usedBy = usage.get(tool.id) || [];
              return (
                <div className="operate-card tool-detail-card" key={tool.id}>
                  <div className="row between">
                    <span className="row" style={{ gap: 10 }}>
                      <span className="kb-icon">{tool.icon}</span>
                      <span>
                        <strong className="text-14">{tool.name}</strong>
                        <span className="badge gray" style={{ marginLeft: 8 }}>
                          {tool.type}
                        </span>
                      </span>
                    </span>
                    <span className="muted text-12">{usedBy.length} agents</span>
                  </div>
                  <p className="text-13 muted" style={{ lineHeight: "20px" }}>
                    {tool.description}
                  </p>
                  <div className="facts-list">
                    <div className="fact-row" style={{ alignItems: "flex-start" }}>
                      <span>Behavior</span>
                      <span style={{ maxWidth: 380, textAlign: "left" }}>
                        {tool.behavior}
                      </span>
                    </div>
                    <div className="fact-row" style={{ alignItems: "flex-start" }}>
                      <span>Configuration</span>
                      <span style={{ maxWidth: 380, textAlign: "left" }}>
                        {tool.config}
                      </span>
                    </div>
                  </div>
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
                      <span className="muted text-12">
                        Not enabled on any agent yet.
                      </span>
                    )}
                  </div>
                  <div className="row mt-8" style={{ gap: 8 }}>
                    <button
                      className="btn btn-sm btn-secondary"
                      onClick={() => openTest(tool)}
                    >
                      <Play20Regular /> Test tool
                    </button>
                    <button
                      className="btn btn-sm btn-secondary"
                      disabled={agents.length === 0}
                      onClick={() => {
                        setAgentId(agents[0]?.id || "");
                        setAddTool(tool);
                      }}
                    >
                      <Add20Regular /> Add to agent
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <McpServers agents={agents} onAgentsChanged={refreshAgents} />

          <HttpTools agents={agents} onAgentsChanged={refreshAgents} />

          <div className="banner mt-16">
            <Wrench20Regular />
            <span>
              Built-in tools run in the server process. MCP and HTTP tools are
              called when the model requests them. Every tool can be tested here
              before an agent uses it.
            </span>
          </div>
        </>
      )}

      {tab === "Skills" && <SkillsPanel />}

      {testTool && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTestTool(null);
          }}
        >
          <div
            className="dialog wide"
            role="dialog"
            aria-modal="true"
            aria-label={`Test ${testTool.name}`}
          >
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Test {testTool.name}</h2>
                <p className="dialog-sub">
                  Runs the exact function the agent runtime would call.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setTestTool(null)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              {testTool.needsKnowledge && (
                <label className="field">
                  <span className="field-label">Knowledge base</span>
                  <select
                    className="select"
                    value={knowledgeBaseId}
                    onChange={(event) => setKnowledgeBaseId(event.target.value)}
                  >
                    {bases.map((base: KnowledgeBase) => (
                      <option key={base.id} value={base.id}>
                        {base.name} · {base.documents.length} documents
                      </option>
                    ))}
                    {bases.length === 0 && <option value="">No knowledge bases</option>}
                  </select>
                </label>
              )}
              <label className="field">
                <span className="field-label">Input</span>
                <input
                  className="input"
                  placeholder={testTool.placeholder}
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void runTest();
                  }}
                  autoFocus
                />
              </label>
              {result && (
                <div className="panel" style={{ padding: 12 }}>
                  <div className="row between mb-8">
                    <span className="field-label" style={{ margin: 0 }}>
                      Result
                    </span>
                    <span className="badge gray">{result.latencyMs} ms</span>
                  </div>
                  {result.error ? (
                    <div className="banner error">{result.error}</div>
                  ) : (
                    <>
                      {result.kind === "web-search" && (
                        <div className="stack" style={{ gap: 10 }}>
                          {(result.results || []).map((item, index) => (
                            <div key={index}>
                              <a
                                className="link text-13 strong"
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {item.title || item.url}
                              </a>
                              <div className="muted text-12 truncate">{item.url}</div>
                              {item.snippet && (
                                <p className="text-12 muted">{item.snippet}</p>
                              )}
                            </div>
                          ))}
                          {(result.results || []).length === 0 && (
                            <p className="muted text-13">No results parsed.</p>
                          )}
                        </div>
                      )}
                      {result.kind === "calculator" && (
                        <div className="chunk-preview">
                          {result.result || "No arithmetic expression found."}
                        </div>
                      )}
                      {result.kind === "file-search" && (
                        <div className="stack" style={{ gap: 8 }}>
                          <div className="muted text-12">
                            {result.embeddingModel} · {(result.citations || []).length} chunks
                          </div>
                          {(result.citations || []).map((citation, index) => (
                            <div className="retrieval-result" key={index}>
                              <div className="row between">
                                <span className="text-12 strong">
                                  [{index + 1}] {citation.documentName}
                                </span>
                                <span className="badge gray">{citation.score.toFixed(3)}</span>
                              </div>
                              <p>{citation.chunk}</p>
                            </div>
                          ))}
                          {(result.citations || []).length === 0 && (
                            <p className="muted text-13">
                              No chunks matched. Add documents or use a broader query.
                            </p>
                          )}
                        </div>
                      )}
                      {result.note && (
                        <p className="muted text-12" style={{ marginTop: 8 }}>
                          {result.note}
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setTestTool(null)}
              >
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={runTest}
                disabled={testing || !input.trim() || (testTool.needsKnowledge && !knowledgeBaseId)}
              >
                {testing ? <Spinner /> : <Play20Regular />} Run tool
              </button>
            </div>
          </div>
        </div>
      )}

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
                  The tool becomes part of this agent&apos;s system prompt on the next
                  chat request.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setAddTool(null)}
                aria-label="Close"
              >
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
                  You can remove the tool later in the agent builder. Tool decisions
                  are recorded in the prompt, not hidden in a remote service.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setAddTool(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={enable}
                disabled={saving || !agentId}
              >
                {saving ? <Spinner /> : <Add20Regular />} Add tool
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
