// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  CheckmarkCircle20Regular,
  Dismiss20Regular,
  Globe20Regular,
  PlugConnected20Regular,
  Search20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type {
  HttpTool,
  McpServer,
  ToolCatalogEntry,
} from "@/lib/types";
import {
  BUILTIN_TOOL_DISPLAYS,
  type ToolDisplay,
} from "./tool-options";
import { ToolKindIcon } from "./ToolKindIcon";
import McpServerDialog from "./McpServerDialog";
import HttpToolDialog from "./HttpToolDialog";

type Tab = "Configured" | "Catalog" | "Custom";
const TABS: Tab[] = ["Configured", "Catalog", "Custom"];

export default function SelectToolDialog({
  open,
  mode,
  selected = [],
  onClose,
  onConfirm,
  onConnectionsChanged,
}: {
  open: boolean;
  mode: "select" | "connect";
  selected?: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  onConnectionsChanged?: () => void;
}) {
  const { toast } = useToast();
  const { data: mcpData, refresh: refreshMcp } = useApi<{
    servers: McpServer[];
  }>("/api/mcp", 15000);
  const { data: httpData, refresh: refreshHttp } = useApi<{
    tools: HttpTool[];
  }>("/api/http-tools", 15000);
  const { data: catalogData, loading: catalogLoading } = useApi<{
    tools: ToolCatalogEntry[];
  }>("/api/tools/catalog?type=Remote%20MCP");
  const servers = useMemo(() => mcpData?.servers ?? [], [mcpData]);
  const httpTools = useMemo(() => httpData?.tools ?? [], [httpData]);
  const catalog = useMemo(() => catalogData?.tools ?? [], [catalogData]);

  const [tab, setTab] = useState<Tab>("Configured");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [customKind, setCustomKind] = useState<"mcp" | "http" | "">("");
  const [mcpDialog, setMcpDialog] = useState(false);
  const [httpDialog, setHttpDialog] = useState(false);
  const [connecting, setConnecting] = useState("");
  const [connectedCatalog, setConnectedCatalog] = useState<string[]>([]);

  const selectedKey = selected.join("\u0000");

  useEffect(() => {
    if (!open) return;
    setTab(mode === "connect" ? "Catalog" : "Configured");
    setQuery("");
    setPicked(selected);
    setCustomKind("");
    setMcpDialog(false);
    setHttpDialog(false);
    setConnecting("");
    setConnectedCatalog([]);
    // selectedKey keeps the reset tied to real changes, not a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mode, selectedKey]);

  const configured = useMemo(() => {
    const mcp: ToolDisplay[] = servers.flatMap((server) =>
      server.tools.map((tool) => ({
        id: `mcp:${server.id}:${tool.name}`,
        internalId: tool.name,
        name: tool.name,
        description: tool.description || `Tool from ${server.name}.`,
        type:
          server.transport === "stdio"
            ? "Model Context Protocol (MCP) · Local"
            : "Model Context Protocol (MCP)",
        kind: "mcp" as const,
        badge: server.name,
      }))
    );
    const http: ToolDisplay[] = httpTools.map((tool) => ({
      id: `http:${tool.id}`,
      internalId: `http_${tool.id}`,
      name: tool.name,
      description: tool.description || `${tool.method} ${tool.url}`,
      type: "HTTP tool",
      kind: "http" as const,
      badge: tool.method,
    }));
    return [...BUILTIN_TOOL_DISPLAYS, ...mcp, ...http];
  }, [servers, httpTools]);

  const needle = query.trim().toLowerCase();
  const matches = (item: { name: string; description: string; type: string }) =>
    !needle ||
    `${item.name} ${item.description} ${item.type}`.toLowerCase().includes(needle);

  const configuredMatches = configured.filter(matches);
  const catalogMatches = catalog.filter((entry) =>
    !needle
      ? true
      : `${entry.name} ${entry.summary} ${entry.company}`
          .toLowerCase()
          .includes(needle)
  );

  const toggle = (id: string) => {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const connectCatalog = async (entry: ToolCatalogEntry) => {
    if (!entry.remoteUrl) {
      toast("This catalog entry does not publish a remote MCP URL.", "error");
      return;
    }
    setConnecting(entry.id);
    try {
      const baseName = entry.name.trim();
      let name = baseName;
      let suffix = 2;
      while (
        servers.some(
          (server) => server.name.toLowerCase() === name.toLowerCase()
        )
      ) {
        name = `${baseName} ${suffix}`;
        suffix += 1;
      }
      const res = await fetch("/api/mcp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          transport: "http",
          url: entry.remoteUrl,
        }),
      });
      const json = (await res.json()) as { server?: McpServer; error?: string };
      if (!res.ok || !json.server)
        throw new Error(json.error || "Could not connect the tool.");
      setConnectedCatalog((current) => [...current, entry.id]);
      refreshMcp();
      onConnectionsChanged?.();
      if (json.server.status === "Error") {
        toast(
          `Connected ${json.server.name}, but the server rejected the connection.`,
          "error"
        );
        return;
      }
      if (mode === "select") {
        const ids = json.server.tools.map(
          (tool) => `mcp:${json.server!.id}:${tool.name}`
        );
        if (!ids.length) {
          toast(
            `${json.server.name} connected, but it advertises no tools.`,
            "error"
          );
          return;
        }
        setPicked((current) => [...new Set([...current, ...ids])]);
        setTab("Configured");
        toast(
          `${json.server.name} connected · ${ids.length} tool${
            ids.length === 1 ? "" : "s"
          } selected`,
          "success"
        );
      } else {
        toast(
          `${json.server.name} connected · ${json.server.tools.length} tools`,
          "success"
        );
        setTab("Configured");
      }
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not connect the tool.",
        "error"
      );
    } finally {
      setConnecting("");
    }
  };

  const onMcpSaved = (server: McpServer) => {
    refreshMcp();
    onConnectionsChanged?.();
    if (mode === "select") {
      const ids = server.tools.map(
        (tool) => `mcp:${server.id}:${tool.name}`
      );
      if (ids.length) {
        setPicked((current) => [...new Set([...current, ...ids])]);
        toast(
          `${server.name} added · ${ids.length} tool${
            ids.length === 1 ? "" : "s"
          } selected`,
          "success"
        );
      } else {
        toast(`${server.name} connected, but it advertises no tools.`, "error");
      }
      setTab("Configured");
    } else {
      toast(
        `${server.name} connected · ${server.tools.length} tools`,
        "success"
      );
    }
    setCustomKind("");
  };

  const onHttpSaved = (tool: HttpTool) => {
    refreshHttp();
    onConnectionsChanged?.();
    if (mode === "select") {
      setPicked((current) => [...new Set([...current, `http:${tool.id}`])]);
      setTab("Configured");
      toast(`${tool.name} created and selected`, "success");
    } else {
      toast(`${tool.name} created`, "success");
    }
    setCustomKind("");
  };

  if (!open) return null;

  const confirm = () => {
    if (mode === "connect") {
      onClose();
      return;
    }
    if (!picked.length) return;
    onConfirm(picked);
  };

  const footerLabel =
    mode === "connect"
      ? "Done"
      : picked.length
      ? `Add ${picked.length}`
      : "Add tool";

  return (
    <>
      <div
        className="dialog-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="dialog tool-picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={mode === "connect" ? "Connect a tool" : "Select a tool"}
        >
          <div className="tool-picker-head">
            <h2 className="dialog-title">
              {mode === "connect" ? "Connect a tool" : "Select a tool"}
            </h2>
            <button className="icon-button" onClick={onClose} aria-label="Close">
              <Dismiss20Regular />
            </button>
          </div>

          <div className="tool-picker-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={tab === item}
                className={`tool-picker-tab${tab === item ? " active" : ""}`}
                onClick={() => {
                  setTab(item);
                  setQuery("");
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="tool-picker-note">
            {tab === "Configured" ? (
              mode === "connect" ? (
                <>
                  These tools are ready to use with your existing authentication
                  and configuration. Choose Catalog or Custom to connect another
                  tool.
                </>
              ) : (
                <>
                  These tools are ready to use with your existing configuration.
                  Select the tools this toolbox should expose to the agent.
                </>
              )
            ) : tab === "Catalog" ? (
              <>
                Connect a remote MCP server from the local catalog. openFoundry
                stores the connection and its discovered tools on this computer.
              </>
            ) : (
              <>
                Create a connection that is not in the catalog. MCP servers and
                HTTP tools both run from this computer.
              </>
            )}
          </div>

          <div className="tool-picker-search">
            <div className="search-input" style={{ width: "100%", maxWidth: 520 }}>
              <Search20Regular />
              <input
                className="input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search"
                aria-label="Search tools"
              />
            </div>
          </div>

          <div className="tool-picker-body">
            {tab === "Configured" && (
              <>
                {configuredMatches.length === 0 ? (
                  <div className="tool-picker-empty">
                    No configured tools match this search.
                  </div>
                ) : (
                  <div className="tool-picker-grid">
                    {configuredMatches.map((tool) => (
                      <ToolCard
                        key={tool.id}
                        tool={tool}
                        selected={picked.includes(tool.id)}
                        selectable={mode === "select"}
                        onClick={() =>
                          mode === "select" ? toggle(tool.id) : undefined
                        }
                      />
                    ))}
                  </div>
                )}
              </>
            )}

            {tab === "Catalog" && (
              <>
                {catalogLoading ? (
                  <div className="tool-picker-empty">
                    <Spinner /> Loading the catalog…
                  </div>
                ) : catalogMatches.length === 0 ? (
                  <div className="tool-picker-empty">
                    No catalog tools match this search.
                  </div>
                ) : (
                  <div className="tool-picker-grid">
                    {catalogMatches.map((entry) => {
                      const isConnected = connectedCatalog.includes(entry.id);
                      return (
                        <div
                          className="tool-picker-card catalog-picker-card static"
                          key={entry.id}
                        >
                          <span className="tool-card-icon">
                            <PlugConnected20Regular />
                          </span>
                          <span className="tool-card-main">
                            <span className="tool-card-name">{entry.name}</span>
                            <span className="tool-card-description">
                              {entry.summary}
                            </span>
                            <span className="tool-card-badges">
                              <span className="badge gray">Remote MCP</span>
                              {entry.company && (
                                <span className="badge gray">{entry.company}</span>
                              )}
                              {isConnected && (
                                <span className="badge green">
                                  <CheckmarkCircle20Regular /> Connected
                                </span>
                              )}
                              {connecting === entry.id && <Spinner />}
                            </span>
                            {!isConnected && (
                              <button
                                type="button"
                                className="btn btn-sm btn-secondary catalog-connect"
                                onClick={() => void connectCatalog(entry)}
                                disabled={Boolean(connecting)}
                              >
                                {connecting === entry.id ? <Spinner /> : <Add20Regular />}{" "}
                                Connect
                              </button>
                            )}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === "Custom" && (
              <>
                {!customKind ? (
                  <div className="custom-tool-grid">
                    <button
                      type="button"
                      className="custom-tool-card"
                      onClick={() => setCustomKind("mcp")}
                    >
                      <span className="tool-card-icon">
                        <PlugConnected20Regular />
                      </span>
                      <strong>MCP server</strong>
                      <span>
                        Connect a streamable HTTP endpoint or start a local stdio
                        process.
                      </span>
                    </button>
                    <button
                      type="button"
                      className="custom-tool-card"
                      onClick={() => setCustomKind("http")}
                    >
                      <span className="tool-card-icon">
                        <Globe20Regular />
                      </span>
                      <strong>HTTP tool</strong>
                      <span>
                        Call any REST endpoint with headers, a body template and a
                        JSON input schema.
                      </span>
                    </button>
                  </div>
                ) : (
                  <div className="custom-tool-picked">
                    <Wrench20Regular />
                    <span>
                      {customKind === "mcp" ? "MCP server" : "HTTP tool"} setup
                      opens in a separate dialog.
                    </span>
                    <button
                      className="btn btn-primary"
                      onClick={() =>
                        customKind === "mcp"
                          ? setMcpDialog(true)
                          : setHttpDialog(true)
                      }
                    >
                      <Add20Regular /> Continue
                    </button>
                    <button
                      className="btn btn-secondary"
                      onClick={() => setCustomKind("")}
                    >
                      Back
                    </button>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="tool-picker-footer">
            <span className="muted text-12">
              {mode === "select"
                ? `${picked.length} selected`
                : `${servers.length + httpTools.length} connected`}
            </span>
            <span className="grow" />
            <button className="btn btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={confirm}
              disabled={mode === "select" && picked.length === 0}
            >
              {mode === "select" ? <Add20Regular /> : null}
              {footerLabel}
            </button>
          </div>
        </div>
      </div>

      <McpServerDialog
        open={mcpDialog}
        onClose={() => setMcpDialog(false)}
        onSaved={onMcpSaved}
      />
      <HttpToolDialog
        open={httpDialog}
        onClose={() => setHttpDialog(false)}
        onSaved={onHttpSaved}
      />
    </>
  );
}

function ToolCard({
  tool,
  selected,
  selectable,
  onClick,
}: {
  tool: ToolDisplay;
  selected: boolean;
  selectable: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`tool-picker-card${selected ? " selected" : ""}${
        selectable ? "" : " static"
      }`}
      onClick={onClick}
      aria-pressed={selectable ? selected : undefined}
      disabled={!selectable}
    >
      <span className="tool-card-icon">
        <ToolKindIcon tool={tool} />
      </span>
      <span className="tool-card-main">
        <span className="tool-card-name">{tool.name}</span>
        <span className="tool-card-description">{tool.description}</span>
        <span className="tool-card-badges">
          <span className="badge gray">{tool.type}</span>
          {tool.badge && <span className="badge gray">{tool.badge}</span>}
          {selected && (
            <span className="badge green">
              <CheckmarkCircle20Regular /> Selected
            </span>
          )}
        </span>
      </span>
    </button>
  );
}
