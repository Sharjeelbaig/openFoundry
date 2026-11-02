"use client";
import Select from "@/components/Select";

import { useMemo, useState } from "react";
import {
  ArrowSync20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  Play20Regular,
  Add20Regular,
  Search20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { DottedObject, Spinner } from "@/components/ui";
import type { HttpTool, McpServer } from "@/lib/types";
import { formatModified } from "@/components/tools/tool-options";
import SelectToolDialog from "@/components/tools/SelectToolDialog";
import McpServerDialog from "@/components/tools/McpServerDialog";
import HttpToolDialog from "@/components/tools/HttpToolDialog";

type Connection =
  | { kind: "mcp"; id: string; name: string; updatedAt: string; server: McpServer }
  | { kind: "http"; id: string; name: string; updatedAt: string; tool: HttpTool };

const PAGE_SIZE = 10;

export default function ConnectedTools() {
  const { toast } = useToast();
  const { data: mcpData, refresh: refreshMcp, loading: mcpLoading } = useApi<{
    servers: McpServer[];
  }>("/api/mcp", 15000);
  const { data: httpData, refresh: refreshHttp, loading: httpLoading } = useApi<{
    tools: HttpTool[];
  }>("/api/http-tools", 15000);
  const servers = useMemo(() => mcpData?.servers ?? [], [mcpData]);
  const httpTools = useMemo(() => httpData?.tools ?? [], [httpData]);
  const loading = mcpLoading && httpLoading && !servers.length && !httpTools.length;

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [connectOpen, setConnectOpen] = useState(false);
  const [menuId, setMenuId] = useState("");
  const [editMcp, setEditMcp] = useState<McpServer | null>(null);
  const [editHttp, setEditHttp] = useState<HttpTool | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Connection | null>(null);
  const [testTarget, setTestTarget] = useState<Connection | null>(null);
  const [busy, setBusy] = useState("");

  const connections = useMemo<Connection[]>(() => {
    const mcp = servers.map((server) => ({
      kind: "mcp" as const,
      id: server.id,
      name: server.name,
      updatedAt: server.updatedAt || server.lastConnectedAt || server.createdAt,
      server,
    }));
    const http = httpTools.map((tool) => ({
      kind: "http" as const,
      id: tool.id,
      name: tool.name,
      updatedAt: tool.updatedAt,
      tool,
    }));
    return [...mcp, ...http].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    );
  }, [servers, httpTools]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return connections;
    return connections.filter((item) =>
      `${item.name} ${item.kind === "mcp" ? "model context protocol mcp" : "http tool"}`
        .toLowerCase()
        .includes(needle)
    );
  }, [connections, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  const refreshAll = () => {
    refreshMcp();
    refreshHttp();
  };

  const refreshServer = async (server: McpServer) => {
    setBusy(server.id);
    try {
      const res = await fetch(`/api/mcp/${encodeURIComponent(server.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      const json = (await res.json()) as { server?: McpServer; error?: string };
      if (!res.ok) throw new Error(json.error || "Refresh failed.");
      refreshMcp();
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
      setBusy("");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(deleteTarget.id);
    try {
      const res = await fetch(
        deleteTarget.kind === "mcp"
          ? `/api/mcp/${encodeURIComponent(deleteTarget.id)}`
          : `/api/http-tools/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed.");
      toast(`${deleteTarget.name} removed`, "success");
      setDeleteTarget(null);
      refreshAll();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy("");
    }
  };

  if (loading) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <Spinner /> Loading connected tools…
      </div>
    );
  }

  if (!connections.length) {
    return (
      <section className="tools-empty">
        <DottedObject />
        <h2>Connect your first tool</h2>
        <p>
          Connect an MCP server or an HTTP endpoint. Connected tools can be
          called by agents and included in toolboxes.
        </p>
        <button
          className="btn btn-primary"
          onClick={() => setConnectOpen(true)}
        >
          <Add20Regular /> Connect a tool
        </button>
        <LinkSmall />

        <SelectToolDialog
          open={connectOpen}
          mode="connect"
          onClose={() => {
            setConnectOpen(false);
            refreshAll();
          }}
          onConfirm={() => {
            setConnectOpen(false);
            refreshAll();
          }}
          onConnectionsChanged={refreshAll}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="tools-list-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search tools"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            aria-label="Search tools"
          />
        </div>
        <span className="grow" />
        <button
          className="btn btn-primary"
          onClick={() => setConnectOpen(true)}
        >
          Connect a tool
        </button>
      </div>

      <div className="tools-table-card">
        <table className="data-table tools-table">
          <thead>
            <tr>
              <th style={{ width: "50%" }}>Name</th>
              <th style={{ width: "25%" }}>Type</th>
              <th style={{ width: "20%" }}>Modified on</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="cell-muted">
                  No connected tools match this search.
                </td>
              </tr>
            ) : (
              pageItems.map((item) => {
                const error =
                  item.kind === "mcp" && item.server.status === "Error";
                return (
                  <tr key={`${item.kind}:${item.id}`}>
                    <td>
                      <div className="tools-name-cell">
                        <span
                          className={`tools-status-dot${
                            error ? " error" : " ready"
                          }`}
                          title={error ? "Connection error" : "Connected"}
                        />
                        <button
                          className="tools-name-link"
                          title={
                            item.kind === "mcp"
                              ? item.server.status === "Error"
                                ? item.server.error || "Connection error"
                                : `${item.server.tools.length} tools · ${
                                    item.server.transport === "stdio"
                                      ? "Local stdio"
                                      : "Streamable HTTP"
                                  }`
                              : `${item.tool.method} ${item.tool.url}`
                          }
                          onClick={() =>
                            item.kind === "mcp"
                              ? setEditMcp(item.server)
                              : setEditHttp(item.tool)
                          }
                        >
                          {item.name}
                        </button>
                      </div>
                    </td>
                    <td>
                      {item.kind === "mcp"
                        ? "Model Context Protocol (MCP)"
                        : "HTTP tool"}
                    </td>
                    <td>{formatModified(item.updatedAt)}</td>
                    <td>
                      <div style={{ position: "relative" }}>
                        <button
                          className="icon-button small"
                          aria-label={`Options for ${item.name}`}
                          onClick={() =>
                            setMenuId((current) =>
                              current === `${item.kind}:${item.id}`
                                ? ""
                                : `${item.kind}:${item.id}`
                            )
                          }
                        >
                          <MoreHorizontal20Regular />
                        </button>
                        {menuId === `${item.kind}:${item.id}` && (
                          <>
                            <div
                              className="menu-scrim"
                              onClick={() => setMenuId("")}
                              aria-hidden="true"
                            />
                            <div className="menu-popover" role="menu">
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setMenuId("");
                                  setTestTarget(item);
                                }}
                              >
                                <Play20Regular /> Test
                              </button>
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setMenuId("");
                                  if (item.kind === "mcp") setEditMcp(item.server);
                                  else setEditHttp(item.tool);
                                }}
                              >
                                <Edit20Regular /> Edit
                              </button>
                              {item.kind === "mcp" && (
                                <button
                                  className="menu-item"
                                  role="menuitem"
                                  onClick={() => {
                                    setMenuId("");
                                    void refreshServer(item.server);
                                  }}
                                >
                                  <ArrowSync20Regular /> Refresh
                                </button>
                              )}
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setMenuId("");
                                  setDeleteTarget(item);
                                }}
                              >
                                <Delete20Regular /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span>
          {filtered.length === 0
            ? "0 of 0"
            : `${currentPage * PAGE_SIZE + 1}-${Math.min(
                (currentPage + 1) * PAGE_SIZE,
                filtered.length
              )} of ${filtered.length}`}
        </span>
        <div className="pager">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Prev
          </button>
          <button
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <SelectToolDialog
        open={connectOpen}
        mode="connect"
        onClose={() => {
          setConnectOpen(false);
          refreshAll();
        }}
        onConfirm={() => {
          setConnectOpen(false);
          refreshAll();
        }}
        onConnectionsChanged={refreshAll}
      />

      <McpServerDialog
        open={Boolean(editMcp)}
        server={editMcp}
        onClose={() => setEditMcp(null)}
        onSaved={(server) => {
          refreshMcp();
          toast(`${server.name} saved`, "success");
        }}
      />
      <HttpToolDialog
        open={Boolean(editHttp)}
        tool={editHttp}
        onClose={() => setEditHttp(null)}
        onSaved={(tool) => {
          refreshHttp();
          toast(`${tool.name} saved`, "success");
        }}
      />

      {testTarget && (
        <TestConnectionDialog
          target={testTarget}
          onClose={() => setTestTarget(null)}
        />
      )}

      {deleteTarget && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setDeleteTarget(null);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label={`Delete ${deleteTarget.name}`}
          >
            <div className="dialog-head">
              <h2 className="dialog-title">Delete {deleteTarget.name}?</h2>
            </div>
            <div className="dialog-body">
              <p className="dialog-sub" style={{ margin: 0 }}>
                Are you sure you want to delete {deleteTarget.name}? This action
                cannot be undone.
              </p>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={Boolean(busy)}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={remove} disabled={Boolean(busy)}>
                {busy ? <Spinner /> : null} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function LinkSmall() {
  return (
    <a
      className="tools-empty-link"
      href="/discover/tools"
      target="_blank"
      rel="noreferrer"
    >
      Browse the tool catalog
    </a>
  );
}

function TestConnectionDialog({
  target,
  onClose,
}: {
  target: Connection;
  onClose: () => void;
}) {
  const tools =
    target.kind === "mcp" ? target.server.tools.map((tool) => tool.name) : [];
  const [toolName, setToolName] = useState(tools[0] || "");
  const [args, setArgs] = useState("{}");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);

  const run = async () => {
    setTesting(true);
    setError("");
    setResult("");
    try {
      const res = await fetch(
        target.kind === "mcp"
          ? `/api/mcp/${encodeURIComponent(target.server.id)}/call`
          : `/api/http-tools/${encodeURIComponent(target.tool.id)}/call`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            target.kind === "mcp"
              ? { tool: toolName, arguments: args || "{}" }
              : { arguments: args || "{}" }
          ),
        }
      );
      const json = (await res.json()) as {
        text?: string;
        latencyMs?: number;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "The tool call failed.");
      setResult(
        `${json.text || "(empty response)"}${
          json.latencyMs ? `\n\n${json.latencyMs} ms` : ""
        }`
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "The tool call failed.");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Test tool">
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">Test {target.name}</h2>
            <p className="dialog-sub">
              Runs the same function an agent calls at request time.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          {target.kind === "mcp" && tools.length > 0 && (
            <label className="field">
              <span className="field-label">Tool</span>
              <Select
                className="select"
                value={toolName}
                onChange={(event) => setToolName(event.target.value)}
              >
                {tools.map((tool) => (
                  <option key={tool} value={tool}>
                    {tool}
                  </option>
                ))}
              </Select>
            </label>
          )}
          {target.kind === "mcp" && tools.length === 0 && (
            <div className="banner warning">
              <Warning20Regular />
              <span>
                This server has not advertised any tools. Edit or refresh the
                connection first.
              </span>
            </div>
          )}
          <label className="field">
            <span className="field-label">Arguments (JSON object)</span>
            <textarea
              className="textarea mono"
              value={args}
              onChange={(event) => setArgs(event.target.value)}
              style={{ minHeight: 110 }}
            />
          </label>
          {error && <div className="banner error">{error}</div>}
          {result && (
            <pre className="code-block" style={{ maxHeight: 280, overflow: "auto" }}>
              {result}
            </pre>
          )}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={run}
            disabled={testing || (target.kind === "mcp" && !toolName)}
          >
            {testing ? <Spinner /> : <Play20Regular />} Run tool
          </button>
        </div>
      </div>
    </div>
  );
}
