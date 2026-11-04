// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Play20Regular,
  Server20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent, McpServer, McpToolDefinition } from "@/lib/types";

interface McpServersProps {
  agents: Agent[];
  onAgentsChanged?: () => void;
}

function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function toolId(server: McpServer, tool: McpToolDefinition): string {
  return `mcp:${server.id}:${tool.name}`;
}

export default function McpServers({ agents, onAgentsChanged }: McpServersProps) {
  const { toast } = useToast();
  const { data, refresh, loading } = useApi<{ servers: McpServer[] }>(
    "/api/mcp",
    15000
  );
  const servers = data?.servers ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState("");
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http">("stdio");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [testTarget, setTestTarget] = useState<{
    server: McpServer;
    tool: McpToolDefinition;
  } | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testResult, setTestResult] = useState<string>("");
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const [addTarget, setAddTarget] = useState<{
    server: McpServer;
    tool: McpToolDefinition;
  } | null>(null);
  const [agentId, setAgentId] = useState("");
  const [adding, setAdding] = useState(false);

  const usage = useMemo(() => {
    const map = new Map<string, Agent[]>();
    for (const agent of agents) {
      for (const id of agent.tools) {
        map.set(id, [...(map.get(id) || []), agent]);
      }
    }
    return map;
  }, [agents]);

  const resetForm = () => {
    setEditId("");
    setName("");
    setTransport("stdio");
    setCommand("");
    setArgs("");
    setEnv("");
    setUrl("");
    setHeaders("");
    setError("");
  };

  const closeAdd = () => {
    if (saving) return;
    setAddOpen(false);
    resetForm();
  };

  const openEdit = (server: McpServer) => {
    setEditId(server.id);
    setName(server.name);
    setTransport(server.transport);
    setCommand(server.command || "");
    setArgs((server.args || []).join("\n"));
    setEnv(
      Object.entries(server.env || {})
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")
    );
    setUrl(server.url || "");
    setHeaders(
      Object.entries(server.headers || {})
        .map(([key, value]) => `${key}=${value}`)
        .join("\n")
    );
    setError("");
    setAddOpen(true);
  };

  const create = async () => {
    if (!name.trim()) {
      setError("Give the server a name.");
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      setError("Enter the command that starts the MCP server.");
      return;
    }
    if (transport === "http" && !url.trim()) {
      setError("Enter the MCP server URL.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editId ? `/api/mcp/${encodeURIComponent(editId)}` : "/api/mcp",
        {
          method: editId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            transport,
            command: transport === "stdio" ? command.trim() : undefined,
            args:
              transport === "stdio"
                ? args
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                : undefined,
            env: transport === "stdio" ? parsePairs(env) : undefined,
            url: transport === "http" ? url.trim() : undefined,
            headers: transport === "http" ? parsePairs(headers) : undefined,
          }),
        }
      );
      const json = (await res.json()) as { server?: McpServer; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save the server.");
      refresh();
      if (json.server?.status === "Error") {
        toast("Server saved, but the connection failed. Check the error card.", "error");
      } else {
        toast(
          `${editId ? "Saved" : "Connected to"} ${json.server?.name || name.trim()} · ${
            json.server?.tools.length || 0
          } tools`,
          "success"
        );
      }
      setAddOpen(false);
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the server.");
    } finally {
      setSaving(false);
    }
  };

  const refreshServer = async (server: McpServer) => {
    setBusyId(server.id);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const json = (await res.json()) as { server?: McpServer; error?: string };
      if (!res.ok) throw new Error(json.error || "Refresh failed.");
      refresh();
      if (json.server?.status === "Error") {
        toast(json.server.error || "The server did not connect.", "error");
      } else {
        toast(
          `${json.server?.tools.length || 0} tools from ${server.name}`,
          "success"
        );
      }
    } catch (err) {
      toast(err instanceof Error ? err.message : "Refresh failed.", "error");
    } finally {
      setBusyId("");
    }
  };

  const remove = async (server: McpServer) => {
    if (
      !window.confirm(
        `Remove "${server.name}"? Its tools are also detached from any agents that use them.`
      )
    )
      return;
    setBusyId(server.id);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      refresh();
      toast(`${server.name} removed`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusyId("");
    }
  };

  const openTest = (server: McpServer, tool: McpToolDefinition) => {
    setTestTarget({ server, tool });
    setTestArgs("{}");
    setTestResult("");
    setTestError("");
  };

  const runTest = async () => {
    if (!testTarget) return;
    setTesting(true);
    setTestError("");
    setTestResult("");
    try {
      const res = await fetch(
        `/api/mcp/${encodeURIComponent(testTarget.server.id)}/call`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tool: testTarget.tool.name,
            arguments: testArgs || "{}",
          }),
        }
      );
      const json = (await res.json()) as {
        text?: string;
        isError?: boolean;
        latencyMs?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "The tool call failed.");
      setTestResult(
        `${json.isError ? "[tool reported an error]\n" : ""}${
          json.text || "(no text content)"
        }${json.latencyMs ? `\n\n${json.latencyMs} ms` : ""}`
      );
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "The tool call failed.");
    } finally {
      setTesting(false);
    }
  };

  const openAdd = (server: McpServer, tool: McpToolDefinition) => {
    setAddTarget({ server, tool });
    setAgentId(agents[0]?.id || "");
  };

  const addToAgent = async () => {
    if (!addTarget || !agentId) return;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;
    setAdding(true);
    try {
      const id = toolId(addTarget.server, addTarget.tool);
      const next = agent.tools.includes(id) ? agent.tools : [...agent.tools, id];
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: next }),
      });
      if (!res.ok) throw new Error("Could not update the agent.");
      toast(
        `${addTarget.tool.name} enabled on ${agent.name}`,
        "success"
      );
      setAddTarget(null);
      onAgentsChanged?.();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Update failed.", "error");
    } finally {
      setAdding(false);
    }
  };

  return (
    <section className="mt-16">
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>
            MCP servers
          </h2>
          <p className="page-subtitle">
            Connect a local stdio process or a streamable HTTP endpoint. Its tools
            become callable by agents on this computer.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setAddOpen(true)}>
            <Add20Regular /> Add server
          </button>
        </div>
      </div>

      {loading && servers.length === 0 ? (
        <div className="empty">
          <Spinner /> Loading MCP servers…
        </div>
      ) : servers.length === 0 ? (
        <div className="empty">
          <Server20Regular />
          <h2>No MCP servers yet</h2>
          <p>
            Add a local server such as a filesystem, Git or database MCP process.
          </p>
        </div>
      ) : (
        <div className="tool-detail-grid">
          {servers.map((server) => (
            <div className="operate-card tool-detail-card" key={server.id}>
              <div className="row between">
                <span className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">
                    <Server20Regular />
                  </span>
                  <span>
                    <strong className="text-14">{server.name}</strong>
                    <div className="muted text-12">
                      {server.transport === "stdio" ? "Local stdio" : "Streamable HTTP"}
                    </div>
                  </span>
                </span>
                <span
                  className={`badge ${
                    server.status === "Connected"
                      ? "green"
                      : server.status === "Error"
                      ? "warning"
                      : "gray"
                  }`}
                >
                  {server.status}
                </span>
              </div>

              <div className="facts-list">
                <div className="fact-row">
                  <span>{server.transport === "stdio" ? "Command" : "URL"}</span>
                  <span className="mono text-12" style={{ textAlign: "left", maxWidth: 360 }}>
                    {server.transport === "stdio"
                      ? [server.command, ...(server.args || [])].join(" ")
                      : server.url}
                  </span>
                </div>
                <div className="fact-row">
                  <span>Tools</span>
                  <span>{server.tools.length}</span>
                </div>
                <div className="fact-row">
                  <span>Last connected</span>
                  <span>
                    {server.lastConnectedAt
                      ? new Date(server.lastConnectedAt).toLocaleString()
                      : "Never"}
                  </span>
                </div>
              </div>

              {server.error && (
                <div className="banner error" style={{ marginTop: 4 }}>
                  <Warning20Regular />
                  <span>{server.error}</span>
                </div>
              )}

              <div className="chip-row" style={{ marginBottom: 0, marginTop: 10 }}>
                {server.tools.map((tool) => {
                  const usedBy = usage.get(toolId(server, tool)) || [];
                  return (
                    <span
                      key={tool.name}
                      className="badge gray"
                      title={tool.description || tool.name}
                    >
                      {tool.name}
                      {usedBy.length ? ` · ${usedBy.length}` : ""}
                    </span>
                  );
                })}
                {server.tools.length === 0 && (
                  <span className="muted text-12">
                    No tools advertised. Refresh the connection or check the server log.
                  </span>
                )}
              </div>

              <div className="row mt-12" style={{ gap: 8, flexWrap: "wrap" }}>
                {server.tools.length === 1 && (
                  <button
                    className="btn btn-sm btn-secondary"
                    onClick={() => openTest(server, server.tools[0])}
                  >
                    <Play20Regular /> Test tool
                  </button>
                )}
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => openEdit(server)}
                  disabled={busyId === server.id}
                >
                  Edit
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void refreshServer(server)}
                  disabled={busyId === server.id}
                >
                  {busyId === server.id ? <Spinner /> : <ArrowSync20Regular />} Refresh
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void remove(server)}
                  disabled={busyId === server.id}
                >
                  <Delete20Regular /> Remove
                </button>
              </div>

              {server.tools.length > 1 && (
                <div className="stack mt-12" style={{ gap: 6 }}>
                  {server.tools.map((tool) => (
                    <div
                      key={tool.name}
                      className="row between"
                      style={{ gap: 8, alignItems: "center" }}
                    >
                      <span className="text-12" style={{ minWidth: 0 }}>
                        <span className="strong">{tool.name}</span>
                        {tool.description && (
                          <span className="muted" style={{ display: "block" }}>
                            {tool.description.slice(0, 120)}
                          </span>
                        )}
                      </span>
                      <span className="row" style={{ gap: 6 }}>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openTest(server, tool)}
                        >
                          <Play20Regular /> Test
                        </button>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => openAdd(server, tool)}
                          disabled={agents.length === 0}
                        >
                          <Add20Regular /> Agent
                        </button>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {server.tools.length === 1 && (
                <button
                  className="btn btn-sm btn-secondary mt-8"
                  onClick={() => openAdd(server, server.tools[0])}
                  disabled={agents.length === 0}
                >
                  <Add20Regular /> Add to agent
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeAdd();
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Add MCP server">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">
                  {editId ? "Edit MCP server" : "Add MCP server"}
                </h2>
                <p className="dialog-sub">
                  {editId
                    ? "Update the endpoint, command or credentials, then reconnect to refresh the tool list."
                    : "openFoundry connects to the server, asks for its tool list and stores the result locally."}
                </p>
              </div>
              <button className="icon-button" onClick={closeAdd} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="filesystem-tools"
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Transport</span>
                <Select
                  className="select"
                  value={transport}
                  onChange={(event) =>
                    setTransport(event.target.value as "stdio" | "http")
                  }
                  disabled={Boolean(editId)}
                >
                  <option value="stdio">Local stdio process</option>
                  <option value="http">Streamable HTTP</option>
                </Select>
              </label>

              {transport === "stdio" ? (
                <>
                  <label className="field">
                    <span className="field-label">Command</span>
                    <input
                      className="input mono"
                      value={command}
                      onChange={(event) => setCommand(event.target.value)}
                      placeholder="npx"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Arguments (one per line)</span>
                    <textarea
                      className="textarea mono"
                      value={args}
                      onChange={(event) => setArgs(event.target.value)}
                      placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/Users/you/Documents"}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Environment (KEY=VALUE, one per line)</span>
                    <textarea
                      className="textarea mono"
                      value={env}
                      onChange={(event) => setEnv(event.target.value)}
                      placeholder="OPTIONAL_TOKEN=..."
                    />
                  </label>
                </>
              ) : (
                <>
                  <label className="field">
                    <span className="field-label">URL</span>
                    <input
                      className="input mono"
                      value={url}
                      onChange={(event) => setUrl(event.target.value)}
                      placeholder="http://127.0.0.1:3000/mcp"
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Headers (KEY=VALUE, one per line)</span>
                    <textarea
                      className="textarea mono"
                      value={headers}
                      onChange={(event) => setHeaders(event.target.value)}
                      placeholder="Authorization=Bearer ..."
                    />
                  </label>
                </>
              )}

              <div className="banner">
                <Warning20Regular />
                <span>
                  A stdio server runs a command on this computer with your user
                  permissions. Only add servers whose code you trust.
                </span>
              </div>
              {error && <div className="banner error">{error}</div>}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={closeAdd} disabled={saving}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>
                {saving ? <Spinner /> : <Add20Regular />} Save and connect
              </button>
            </div>
          </div>
        </div>
      )}

      {testTarget && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTestTarget(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Test MCP tool">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Test {testTarget.tool.name}</h2>
                <p className="dialog-sub">
                  {testTarget.server.name} · invoked with a fresh connection
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setTestTarget(null)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Input schema</span>
                <pre className="code-block" style={{ maxHeight: 150, overflow: "auto" }}>
                  {JSON.stringify(testTarget.tool.inputSchema, null, 2)}
                </pre>
              </label>
              <label className="field">
                <span className="field-label">Arguments (JSON object)</span>
                <textarea
                  className="textarea mono"
                  value={testArgs}
                  onChange={(event) => setTestArgs(event.target.value)}
                  style={{ minHeight: 100 }}
                />
              </label>
              {testError && <div className="banner error">{testError}</div>}
              {testResult && (
                <pre className="code-block" style={{ maxHeight: 260, overflow: "auto" }}>
                  {testResult}
                </pre>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setTestTarget(null)}>
                Close
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void runTest()}
                disabled={testing}
              >
                {testing ? <Spinner /> : <Play20Regular />} Run tool
              </button>
            </div>
          </div>
        </div>
      )}

      {addTarget && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAddTarget(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Add MCP tool to agent">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add {addTarget.tool.name}</h2>
                <p className="dialog-sub">
                  The agent calls this tool through {addTarget.server.name} when the
                  model asks for it.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setAddTarget(null)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent</span>
                <Select
                  className="select"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.tools.includes(toolId(addTarget.server, addTarget.tool))
                        ? " · already enabled"
                        : ""}
                    </option>
                  ))}
                </Select>
              </label>
              <div className="banner">
                <Server20Regular />
                <span>
                  Tool calls are made by the local agent process, not by the browser.
                  Results are labeled as untrusted context for the model.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setAddTarget(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void addToAgent()}
                disabled={adding || !agentId}
              >
                {adding ? <Spinner /> : <Add20Regular />} Add tool
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
