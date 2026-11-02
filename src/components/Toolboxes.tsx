"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CheckmarkCircle20Regular,
  Code20Regular,
  Copy20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Toolbox } from "@/lib/types";
import { formatCompact } from "@/components/tools/tool-options";

interface CatalogStats {
  catalogTools: number;
  catalogTokens: number;
  toolSearchTopK: number;
  toolSearchTokens: number;
  reductionPercent: number;
  estimateNote: string;
}

const PAGE_SIZE = 10;

export default function Toolboxes() {
  const { toast } = useToast();
  const { data, refresh, loading } = useApi<{ toolboxes: Toolbox[] }>(
    "/api/toolboxes",
    10000
  );
  const { data: statsData } = useApi<CatalogStats>("/api/tools/catalog/stats");
  const toolboxes = useMemo(() => data?.toolboxes ?? [], [data]);
  const stats = statsData;

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [menuId, setMenuId] = useState("");
  const [codeTarget, setCodeTarget] = useState<Toolbox | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Toolbox | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return toolboxes;
    return toolboxes.filter((toolbox) =>
      `${toolbox.name} ${toolbox.description}`.toLowerCase().includes(needle)
    );
  }, [toolboxes, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/toolboxes/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed.");
      toast(`${deleteTarget.name} deleted`, "success");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && toolboxes.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <Spinner /> Loading toolboxes…
      </div>
    );
  }

  if (toolboxes.length === 0) {
    return (
      <section className="tools-empty tools-empty-toolboxes">
        <h2>Bundle your tools, reduce token costs</h2>
        <p>Group tools, skills and agents into one governed endpoint.</p>
        <Link href="/build/tools/createToolbox" className="btn btn-primary btn-lg">
          Create toolbox
        </Link>

        <div className="benchmark-grid">
          <article className="benchmark-card">
            <div className="benchmark-head">
              <strong>Individual Tools</strong>
            </div>
            <p className="benchmark-note">
              All {stats ? stats.catalogTools.toLocaleString() : "—"} local
              catalog tools
            </p>
            <div className="benchmark-row">
              <span>Tools the model sees</span>
              <span>{stats ? stats.catalogTools.toLocaleString() : "—"}</span>
            </div>
            <div className="benchmark-row">
              <span>Prompt tokens per call</span>
              <span>{stats ? `~${formatCompact(stats.catalogTokens)}` : "—"}</span>
            </div>
          </article>

          <article className="benchmark-card recommended">
            <div className="benchmark-head">
              <strong>Toolbox</strong>
              <span className="badge purple">Recommended</span>
            </div>
            <p className="benchmark-note">
              Top {stats?.toolSearchTopK ?? 8} tools with tool search
            </p>
            <div className="benchmark-row">
              <span>Tools the model sees</span>
              <span className="benchmark-value">
                {stats?.toolSearchTopK ?? "—"}
                {stats && (
                  <span className="benchmark-delta">
                    −{stats.reductionPercent}%
                  </span>
                )}
              </span>
            </div>
            <div className="benchmark-row">
              <span>Prompt tokens per call</span>
              <span className="benchmark-value">
                {stats ? `~${formatCompact(stats.toolSearchTokens)}` : "—"}
                {stats && (
                  <span className="benchmark-delta">
                    −{stats.reductionPercent}%
                  </span>
                )}
              </span>
            </div>
          </article>
        </div>
        <p className="benchmark-footnote">
          *{stats?.estimateNote ||
            "Token counts are estimated from local catalog text. Tool-selection accuracy is not measured locally."}{" "}
          <Link href="/discover/tools" className="link">
            Learn more
          </Link>
        </p>
      </section>
    );
  }

  return (
    <section>
      <p className="tools-list-description">
        Build and curate toolboxes based on your intents, then use them from any
        agent in this workspace.{" "}
        <Link href="/discover/tools" className="link">
          Learn more
        </Link>
      </p>

      <div className="tools-list-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search toolboxes"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            aria-label="Search toolboxes"
          />
        </div>
        <span className="grow" />
        <Link href="/build/tools/createToolbox" className="btn btn-primary">
          Create toolbox
        </Link>
      </div>

      <div className="tools-table-card">
        <table className="data-table tools-table">
          <thead>
            <tr>
              <th style={{ width: "41%" }}>Name</th>
              <th style={{ width: "29%" }}>Version</th>
              <th style={{ width: "30%" }}>Endpoint and samples</th>
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={3} className="cell-muted">
                  No toolboxes match this search.
                </td>
              </tr>
            ) : (
              pageItems.map((toolbox) => (
                <tr key={toolbox.id}>
                  <td>
                    <div className="tools-name-cell">
                      <span
                        className={`tools-status-dot${
                          toolbox.toolIds.length ? " ready" : ""
                        }`}
                        title={
                          toolbox.toolIds.length
                            ? "Ready"
                            : "No tools or skills included"
                        }
                      />
                      <Link
                        href={`/build/toolboxes/${encodeURIComponent(toolbox.id)}`}
                        className="tools-name-link"
                      >
                        {toolbox.name}
                      </Link>
                    </div>
                  </td>
                  <td>
                    <span className="version-chip">
                      {toolbox.version || 1}
                    </span>
                  </td>
                  <td>
                    <div className="tools-endpoint-cell">
                      <button
                        className="btn btn-sm btn-secondary"
                        onClick={() => setCodeTarget(toolbox)}
                      >
                        <Code20Regular /> Get code
                      </button>
                      <div style={{ position: "relative" }}>
                        <button
                          className="icon-button small"
                          aria-label={`Options for ${toolbox.name}`}
                          onClick={() =>
                            setMenuId((current) =>
                              current === toolbox.id ? "" : toolbox.id
                            )
                          }
                        >
                          <MoreHorizontal20Regular />
                        </button>
                        {menuId === toolbox.id && (
                          <>
                            <div
                              className="menu-scrim"
                              onClick={() => setMenuId("")}
                              aria-hidden="true"
                            />
                            <div className="menu-popover" role="menu">
                              <Link
                                href={`/build/toolboxes/${encodeURIComponent(
                                  toolbox.id
                                )}`}
                                className="menu-item"
                                role="menuitem"
                              >
                                <Edit20Regular /> Edit
                              </Link>
                              <button
                                className="menu-item"
                                role="menuitem"
                                onClick={() => {
                                  setMenuId("");
                                  setDeleteTarget(toolbox);
                                }}
                              >
                                <Delete20Regular /> Delete
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))
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
            onClick={() =>
              setPage((value) => Math.min(pageCount - 1, value + 1))
            }
          >
            Next
          </button>
        </div>
      </div>

      {codeTarget && (
        <ToolboxCodeDialog
          toolbox={codeTarget}
          onClose={() => setCodeTarget(null)}
          onCopy={(value) => void copy(value)}
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
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={remove} disabled={busy}>
                {busy ? <Spinner /> : null} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast("Code copied", "success");
    } catch {
      toast("Could not access the clipboard.", "error");
    }
  }
}

function ToolboxCodeDialog({
  toolbox,
  onClose,
  onCopy,
}: {
  toolbox: Toolbox;
  onClose: () => void;
  onCopy: (value: string) => void;
}) {
  const [origin, setOrigin] = useState("");
  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);
  const endpoint = `${origin}/api/toolboxes/${toolbox.id}/call`;
  const callable = toolbox.toolIds.find(
    (id) =>
      id !== "file-search" &&
      !id.startsWith("skill:") &&
      !id.startsWith("toolbox:")
  );
  const sampleName = callable?.startsWith("mcp:")
    ? callable.split(":").slice(2).join(":")
    : callable === "web-search"
    ? "web_search"
    : callable || "tool_name";
  const code = `curl -X POST "${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -d '${JSON.stringify(
    { name: sampleName, arguments: { query: "local AI" } },
    null,
    2
  )}'`;
  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="dialog wide"
        role="dialog"
        aria-modal="true"
        aria-label={`Code for ${toolbox.name}`}
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">{toolbox.name}</h2>
            <p className="dialog-sub">
              Call this toolbox from local code. The endpoint runs on this
              computer.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          <label className="field">
            <span className="field-label">Endpoint</span>
            <div className="endpoint-row">
              <input className="input mono" readOnly value={endpoint} />
              <button className="btn btn-secondary" onClick={() => onCopy(endpoint)}>
                <Copy20Regular /> Copy
              </button>
            </div>
          </label>
          {callable ? (
            <>
              <div className="code-sample-head">
                <span className="field-label">Sample</span>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => onCopy(code)}
                >
                  <Copy20Regular /> Copy code
                </button>
              </div>
              <pre className="code-block code-sample">{code}</pre>
            </>
          ) : (
            <div className="banner">
              <Copy20Regular />
              <span>
                This toolbox only contains skills or retrieval tools. Attach it
                to an agent to use those.
              </span>
            </div>
          )}
          <div className="banner">
            <CheckmarkCircle20Regular />
            <span>
              Version {toolbox.version || 1} · {toolbox.toolIds.length} included ·{" "}
              {toolbox.toolSearch ? "Tool search on" : "Tool search off"} ·{" "}
              Guardrail {guardrailLabel(toolbox.guardrailId)}
            </span>
          </div>
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function guardrailLabel(id?: string): string {
  return id ? "applied" : "none";
}
