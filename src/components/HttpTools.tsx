"use client";

import { useEffect, useState } from "react";
import {
  Add20Regular,
  Dismiss20Regular,
  Globe20Regular,
  Play20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent, HttpTool } from "@/lib/types";

interface HttpToolsProps {
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

export default function HttpTools({ agents, onAgentsChanged }: HttpToolsProps) {
  const { toast } = useToast();
  const { data, refresh, loading } = useApi<{ tools: HttpTool[] }>(
    "/api/http-tools",
    15000
  );
  const tools = data?.tools ?? [];

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<HttpTool["method"]>("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [schema, setSchema] = useState(
    '{\n  "type": "object",\n  "properties": {\n    "input": { "type": "string" }\n  },\n  "required": ["input"]\n}'
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");
  const [testTarget, setTestTarget] = useState<HttpTool | null>(null);
  const [testArgs, setTestArgs] = useState("{}");
  const [testResult, setTestResult] = useState("");
  const [testError, setTestError] = useState("");
  const [testing, setTesting] = useState(false);
  const [addTarget, setAddTarget] = useState<HttpTool | null>(null);
  const [agentId, setAgentId] = useState("");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem("openfoundry:http-draft");
      if (raw) {
        window.sessionStorage.removeItem("openfoundry:http-draft");
        const draft = JSON.parse(raw) as {
          name?: string;
          description?: string;
          method?: HttpTool["method"];
          url?: string;
          headers?: Record<string, string>;
          bodyTemplate?: string;
          inputSchema?: Record<string, unknown>;
        };
        setName(draft.name || "");
        setDescription(draft.description || "");
        setMethod(draft.method || "GET");
        setUrl(draft.url || "");
        setHeaders(
          Object.entries(draft.headers || {})
            .map(([key, value]) => `${key}=${value}`)
            .join("\n")
        );
        setBodyTemplate(draft.bodyTemplate || "");
        if (draft.inputSchema)
          setSchema(JSON.stringify(draft.inputSchema, null, 2));
        setAddOpen(true);
        return;
      }
    } catch {
      // fall through to the simple query-string prefill
    }
    const params = new URLSearchParams(window.location.search);
    const httpName = params.get("httpName");
    if (!httpName) return;
    setName(httpName);
    setDescription(params.get("httpDescription") || "");
    setAddOpen(true);
  }, []);

  const reset = () => {
    setName("");
    setDescription("");
    setMethod("GET");
    setUrl("");
    setHeaders("");
    setBodyTemplate("");
    setError("");
    setSchema(
      '{\n  "type": "object",\n  "properties": {\n    "input": { "type": "string" }\n  },\n  "required": ["input"]\n}'
    );
  };

  const create = async () => {
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required.");
      return;
    }
    let parsedSchema: Record<string, unknown> | undefined;
    try {
      parsedSchema = JSON.parse(schema);
    } catch {
      setError("Input schema must be valid JSON.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/http-tools", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          method,
          url: url.trim(),
          headers: parsePairs(headers),
          bodyTemplate: bodyTemplate.trim() || undefined,
          inputSchema: parsedSchema,
        }),
      });
      const json = (await res.json()) as { tool?: HttpTool; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not save the HTTP tool.");
      toast(`${json.tool?.name || name.trim()} saved`, "success");
      refresh();
      setAddOpen(false);
      reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the tool.");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (tool: HttpTool) => {
    if (!window.confirm(`Remove "${tool.name}"? It is detached from any agents.`))
      return;
    setBusyId(tool.id);
    try {
      const res = await fetch(`/api/http-tools/${encodeURIComponent(tool.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      refresh();
      toast(`${tool.name} removed`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusyId("");
    }
  };

  const runTest = async () => {
    if (!testTarget) return;
    setTesting(true);
    setTestError("");
    setTestResult("");
    try {
      const res = await fetch(
        `/api/http-tools/${encodeURIComponent(testTarget.id)}/call`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ arguments: testArgs || "{}" }),
        }
      );
      const json = (await res.json()) as {
        text?: string;
        status?: number;
        latencyMs?: number;
        isError?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "The HTTP call failed.");
      setTestResult(
        `HTTP ${json.status ?? "?"} · ${json.latencyMs ?? 0} ms${
          json.isError ? " · error response" : ""
        }\n\n${json.text || "(empty response)"}`
      );
    } catch (err) {
      setTestError(err instanceof Error ? err.message : "The HTTP call failed.");
    } finally {
      setTesting(false);
    }
  };

  const addToAgent = async () => {
    if (!addTarget || !agentId) return;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;
    setAdding(true);
    try {
      const id = `http:${addTarget.id}`;
      const next = agent.tools.includes(id) ? agent.tools : [...agent.tools, id];
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: next }),
      });
      if (!res.ok) throw new Error("Could not update the agent.");
      toast(`${addTarget.name} enabled on ${agent.name}`, "success");
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
            HTTP tools
          </h2>
          <p className="page-subtitle">
            The local alternative to hosted connectors. Point a function at any
            REST endpoint and call it from an agent with real headers and body
            templates.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setAddOpen(true)}>
            <Add20Regular /> Add HTTP tool
          </button>
        </div>
      </div>

      {loading && tools.length === 0 ? (
        <div className="empty">
          <Spinner /> Loading HTTP tools…
        </div>
      ) : tools.length === 0 ? (
        <div className="empty">
          <Globe20Regular />
          <h2>No HTTP tools yet</h2>
          <p>
            Use one to call a connector REST endpoint, an internal service or a
            public API.
          </p>
        </div>
      ) : (
        <div className="tool-detail-grid">
          {tools.map((tool) => (
            <div className="operate-card tool-detail-card" key={tool.id}>
              <div className="row between">
                <span className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">
                    <Globe20Regular />
                  </span>
                  <span>
                    <strong className="text-14">{tool.name}</strong>
                    <div className="muted text-12">
                      {tool.method} · HTTP tool
                    </div>
                  </span>
                </span>
                <span className="badge gray">Local</span>
              </div>
              <p className="text-13 muted" style={{ lineHeight: "20px" }}>
                {tool.description}
              </p>
              <div className="facts-list">
                <div className="fact-row">
                  <span>URL</span>
                  <span className="mono text-12" style={{ wordBreak: "break-all" }}>
                    {tool.url}
                  </span>
                </div>
                <div className="fact-row">
                  <span>Inputs</span>
                  <span>{Object.keys((tool.inputSchema.properties as object) || {}).length}</span>
                </div>
              </div>
              <div className="row mt-8" style={{ gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setTestTarget(tool);
                    setTestArgs("{}");
                    setTestResult("");
                    setTestError("");
                  }}
                >
                  <Play20Regular /> Test
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setAddTarget(tool);
                    setAgentId(agents[0]?.id || "");
                  }}
                  disabled={agents.length === 0}
                >
                  <Add20Regular /> Agent
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void remove(tool)}
                  disabled={busyId === tool.id}
                >
                  <Dismiss20Regular /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {addOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !saving) {
              setAddOpen(false);
              reset();
            }
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Add HTTP tool">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add HTTP tool</h2>
                <p className="dialog-sub">
                  The endpoint is called from this computer with the headers and
                  body you configure.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => {
                  setAddOpen(false);
                  reset();
                }}
                aria-label="Close"
              >
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
                  placeholder="internal-status"
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <input
                  className="input"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What does this endpoint do?"
                />
              </label>
              <div className="row" style={{ gap: 10 }}>
                <label className="field" style={{ width: 130 }}>
                  <span className="field-label">Method</span>
                  <select
                    className="select"
                    value={method}
                    onChange={(event) =>
                      setMethod(event.target.value as HttpTool["method"])
                    }
                  >
                    {["GET", "POST", "PUT", "PATCH", "DELETE"].map((item) => (
                      <option key={item}>{item}</option>
                    ))}
                  </select>
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span className="field-label">URL</span>
                  <input
                    className="input mono"
                    value={url}
                    onChange={(event) => setUrl(event.target.value)}
                    placeholder="https://api.example.com/items/{{id}}"
                  />
                </label>
              </div>
              <label className="field">
                <span className="field-label">
                  Headers (KEY=VALUE, one per line)
                </span>
                <textarea
                  className="textarea mono"
                  value={headers}
                  onChange={(event) => setHeaders(event.target.value)}
                  placeholder="Authorization=Bearer ..."
                />
              </label>
              <label className="field">
                <span className="field-label">
                  Body template (JSON, optional)
                </span>
                <textarea
                  className="textarea mono"
                  value={bodyTemplate}
                  onChange={(event) => setBodyTemplate(event.target.value)}
                  placeholder={'{"query": "{{input}}"}'}
                />
              </label>
              <label className="field">
                <span className="field-label">Input schema (JSON)</span>
                <textarea
                  className="textarea mono"
                  value={schema}
                  onChange={(event) => setSchema(event.target.value)}
                  style={{ minHeight: 130 }}
                />
              </label>
              <div className="banner">
                <Warning20Regular />
                <span>
                  Use <span className="mono">{"{{name}}"}</span> placeholders in the
                  URL, headers or body. The tool runs with your user permissions and
                  can reach any http(s) host you configure.
                </span>
              </div>
              {error && <div className="banner error">{error}</div>}
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setAddOpen(false);
                  reset();
                }}
                disabled={saving}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>
                {saving ? <Spinner /> : <Add20Regular />} Save tool
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
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Test HTTP tool">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Test {testTarget.name}</h2>
                <p className="dialog-sub">
                  {testTarget.method} {testTarget.url}
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
                <span className="field-label">Arguments (JSON object)</span>
                <textarea
                  className="textarea mono"
                  value={testArgs}
                  onChange={(event) => setTestArgs(event.target.value)}
                  style={{ minHeight: 110 }}
                />
              </label>
              {testError && <div className="banner error">{testError}</div>}
              {testResult && (
                <pre className="code-block" style={{ maxHeight: 280, overflow: "auto" }}>
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
                {testing ? <Spinner /> : <Play20Regular />} Run
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
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Add HTTP tool to agent">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add {addTarget.name}</h2>
                <p className="dialog-sub">
                  The agent calls this endpoint when the model requests it.
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
                <select
                  className="select"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.tools.includes(`http:${addTarget.id}`)
                        ? " · already enabled"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
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
