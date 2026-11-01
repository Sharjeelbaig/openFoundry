"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  Dismiss20Regular,
  Sparkle20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type {
  Agent,
  Guardrail,
  HttpTool,
  McpServer,
  ToolCatalogEntry,
  Toolbox,
} from "@/lib/types";

interface ToolOption {
  id: string;
  name: string;
  type: string;
  description: string;
}

export default function CreateToolboxPage() {
  const { toast } = useToast();
  const { data: skillData } = useApi<{ tools: ToolCatalogEntry[] }>(
    "/api/tools/catalog?type=Skills"
  );
  const { data: mcpData } = useApi<{ servers: McpServer[] }>("/api/mcp");
  const { data: httpData } = useApi<{ tools: HttpTool[] }>("/api/http-tools");
  const { data: guardrailData } = useApi<{ guardrails: Guardrail[] }>(
    "/api/guardrails"
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [toolSearch, setToolSearch] = useState(true);
  const [guardrailId, setGuardrailId] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const options = useMemo<ToolOption[]>(() => {
    const skills = (skillData?.tools ?? []).map((entry) => ({
      id: `skill:${entry.id}`,
      name: entry.name,
      type: "Skills",
      description: entry.summary,
    }));
    const mcp = (mcpData?.servers ?? []).flatMap((server) =>
      server.tools.map((tool) => ({
        id: `mcp:${server.id}:${tool.name}`,
        name: `${server.name} · ${tool.name}`,
        type: "Remote MCP",
        description: tool.description || "Tool from an MCP server",
      }))
    );
    const http = (httpData?.tools ?? []).map((tool) => ({
      id: `http:${tool.id}`,
      name: tool.name,
      type: "HTTP tool",
      description: tool.description,
    }));
    const builtins = [
      {
        id: "web-search",
        name: "Web search",
        type: "Built-in",
        description: "Search the public web at request time.",
      },
      {
        id: "file-search",
        name: "File search",
        type: "Built-in",
        description: "Retrieve grounded chunks from a knowledge base.",
      },
      {
        id: "calculator",
        name: "Calculator",
        type: "Built-in",
        description: "Evaluate arithmetic in prompts.",
      },
    ];
    return [...builtins, ...skills, ...mcp, ...http];
  }, [skillData, mcpData, httpData]);

  const selectedOptions = useMemo(
    () => selected.map((id) => options.find((option) => option.id === id)),
    [selected, options]
  );

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return options.slice(0, 20);
    return options
      .filter(
        (option) =>
          option.name.toLowerCase().includes(needle) ||
          option.type.toLowerCase().includes(needle) ||
          option.description.toLowerCase().includes(needle)
      )
      .slice(0, 25);
  }, [options, query]);

  const create = async () => {
    if (!name.trim()) {
      setError("Give the toolbox a name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/toolboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          toolIds: selected,
          toolSearch,
          guardrailId: guardrailId || undefined,
        }),
      });
      const json = (await res.json()) as { toolbox?: Toolbox; error?: string };
      if (!res.ok) throw new Error(json.error || "Could not create the toolbox.");
      toast(`Toolbox ${json.toolbox?.name || name.trim()} created`, "success");
      window.location.href = "/build/tools?tab=toolboxes";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the toolbox.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 12 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Link href="/build/tools?tab=toolboxes" className="icon-button" aria-label="Back">
            <ArrowLeft20Regular />
          </Link>
          <h1 className="page-title">Create toolbox</h1>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => window.history.back()}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={create} disabled={busy}>
            {busy ? <Spinner /> : <Add20Regular />} Create
          </button>
        </div>
      </div>

      <div className="catalog-layout">
        <aside className="filters">
          <div className="filter-group">
            <div className="filter-head">Included tools</div>
            <div className="filter-body">
              <div className="muted text-12">
                Group tools, skills and agents into one governed endpoint. Tool
                search can reduce token use when the agent runs.
              </div>
            </div>
          </div>
        </aside>

        <div className="stack" style={{ gap: 16 }}>
          <div className="operate-card">
            <h2 className="mb-12">Basic info</h2>
            <div className="stack" style={{ gap: 12 }}>
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. finance-approvals"
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <textarea
                  className="textarea"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="Describe what this toolbox is for..."
                />
              </label>
            </div>
          </div>

          <div className="operate-card">
            <div className="row between mb-12">
              <h2 style={{ margin: 0 }}>Included ({selected.length})</h2>
              <button
                className="btn btn-sm btn-secondary"
                aria-label="Add tool"
                onClick={() => setQuery("")}
              >
                <Add20Regular /> Add
              </button>
            </div>
            {selectedOptions.length > 0 ? (
              <div className="chip-row">
                {selectedOptions.map((option) =>
                  option ? (
                    <span key={option.id} className="badge gray">
                      {option.name}
                      <button
                        className="icon-button small"
                        aria-label={`Remove ${option.name}`}
                        onClick={() =>
                          setSelected((current) =>
                            current.filter((id) => id !== option.id)
                          )
                        }
                        style={{ marginLeft: 6 }}
                      >
                        <Dismiss20Regular />
                      </button>
                    </span>
                  ) : null
                )}
              </div>
            ) : (
              <p className="muted text-13">
                No tools included yet. Add built-in, MCP, HTTP or skill tools.
              </p>
            )}

            <div className="mt-12">
              <input
                className="input"
                placeholder="Search tools to add"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <div className="stack mt-8" style={{ gap: 6, maxHeight: 320, overflowY: "auto" }}>
                {matches.map((option) => (
                  <div
                    key={option.id}
                    className="row between"
                    style={{ gap: 8, alignItems: "center" }}
                  >
                    <span className="text-13">
                      <strong>{option.name}</strong>
                      <span className="muted" style={{ display: "block" }}>
                        {option.type} · {option.description.slice(0, 90)}
                      </span>
                    </span>
                    <button
                      className="btn btn-sm btn-secondary"
                      aria-label={`Add ${option.name}`}
                      disabled={selected.includes(option.id)}
                      onClick={() =>
                        setSelected((current) =>
                          current.includes(option.id)
                            ? current
                            : [...current, option.id]
                        )
                      }
                    >
                      {selected.includes(option.id) ? "Added" : "Add"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="operate-card">
            <h2 className="mb-12">Tool search</h2>
            <div className="row between">
              <div>
                <strong className="text-14">Let the agent find the right tool</strong>
                <p className="muted text-13" style={{ margin: "4px 0 0" }}>
                  When enabled, openFoundry selects the most relevant tools from
                  this toolbox for each request instead of sending all of them.
                </p>
              </div>
              <button
                type="button"
                className="switch"
                aria-checked={toolSearch}
                aria-label="Tool search"
                onClick={() => setToolSearch((value) => !value)}
              />
            </div>
          </div>

          <div className="operate-card">
            <h2 className="mb-12">Guardrail</h2>
            <label className="field">
              <span className="field-label">Guardrail</span>
              <select
                className="select"
                value={guardrailId}
                onChange={(event) => setGuardrailId(event.target.value)}
              >
                <option value="">None</option>
                {(guardrailData?.guardrails ?? []).map((guardrail) => (
                  <option key={guardrail.id} value={guardrail.id}>
                    {guardrail.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {error && <div className="banner error">{error}</div>}
        </div>
      </div>
    </div>
  );
}
