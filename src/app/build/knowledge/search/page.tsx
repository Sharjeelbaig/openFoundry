// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { OpenFoundryAppIcon } from "@/components/Logos";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowClockwise20Regular,
  Book20Regular,
  Delete20Regular,
  Dismiss20Regular,
  MoreHorizontal20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useKnowledge } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { Connection, KnowledgeBase, SearchIndex } from "@/lib/types";

type Tab = "Knowledge bases" | "Indexes";

export default function KnowledgePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, refresh } = useKnowledge();
  const { data: connectionsData } = useApi<{ connections: Connection[] }>(
    "/api/connections"
  );
  const bases = data?.knowledgeBases ?? [];
  const indexes =
    (data as { indexes?: SearchIndex[] } | null)?.indexes ?? [];
  const connections = connectionsData?.connections ?? [];

  const [tab, setTab] = useState<Tab>("Knowledge bases");
  const [query, setQuery] = useState("");
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState<string | null>(null);
  const [connection, setConnection] = useState<Connection | null>(null);

  const activeConnection = connection ?? connections[0] ?? null;

  const filtered = useMemo(
    () =>
      bases.filter(
        (base) =>
          !query ||
          base.name.toLowerCase().includes(query.toLowerCase()) ||
          base.description.toLowerCase().includes(query.toLowerCase())
      ),
    [bases, query]
  );

  const filteredIndexes = useMemo(
    () =>
      indexes.filter(
        (index) => !query || index.name.toLowerCase().includes(query.toLowerCase())
      ),
    [indexes, query]
  );

  const reindex = async (base: KnowledgeBase) => {
    setReindexing(base.id);
    setMenuFor(null);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reindex", id: base.id }),
      });
      if (!res.ok) throw new Error("Reindex failed");
      toast(`${base.name} reindexed`, "success");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Reindex failed", "error");
    } finally {
      setReindexing(null);
    }
  };

  const remove = async (base: KnowledgeBase) => {
    setMenuFor(null);
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: base.id }),
    });
    if (!res.ok) {
      toast("Could not delete the knowledge base", "error");
      return;
    }
    toast(`${base.name} deleted`, "success");
    refresh();
  };

  const chunks = bases.reduce(
    (sum, base) => sum + base.documents.reduce((n, doc) => n + doc.chunks.length, 0),
    0
  );
  const vectors = bases.reduce(
    (sum, base) =>
      sum +
      base.documents.reduce((n, doc) => n + (doc.embeddings?.length || 0), 0),
    0
  );

  const startCreate = () => router.push("/build/knowledge/create");

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Knowledge (Foundry IQ)</h1>
        {bases.length > 0 ? (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={startCreate}>
              Create a knowledge base
            </button>
          </div>
        ) : null}
      </div>

      <div className="tabbar mt-8">
        {(["Knowledge bases", "Indexes"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Knowledge bases" && (
        <>
          {activeConnection && (
            <div className="kb-connection-row">
              <span className="kb-connection-label">Connection</span>
              <button
                className="kb-connection-chip"
                aria-label="Connection"
                title={activeConnection.target}
              >
                {activeConnection.name}
              </button>
              {activeConnection !== connections[0] || connections.length > 1 ? (
                <button
                  className="icon-button small"
                  aria-label="Clear selection"
                  onClick={() => setConnection(null)}
                >
                  <Dismiss20Regular />
                </button>
              ) : null}
              <Link
                className="link kb-connection-manage"
                href="/manage/resources/projectDetails/connections"
              >
                Manage
              </Link>
            </div>
          )}

          {loading && bases.length === 0 ? (
            <div className="row" style={{ gap: 8, color: "var(--fg-3)", padding: 40 }}>
              <Spinner /> Reading local knowledge bases...
            </div>
          ) : bases.length === 0 ? (
            <div className="knowledge-hero">
              <div className="knowledge-visual of-knowledge-visual">
                <OpenFoundryAppIcon size={86} />
                <strong>Ground your agent in your own knowledge</strong>
                <span>Documents stay on this computer.</span>
              </div>
              <h2>Ground your agent in enterprise knowledge</h2>
              <p>
                Connect your agent to Foundry IQ to combine multiple data sources
                behind an agentic retrieval engine. In this local build, knowledge
                bases are indexed on this computer with real embeddings and never
                leave it.
              </p>
              <div className="knowledge-create-link">
                <button className="btn btn-primary" onClick={startCreate}>
                  Create a knowledge base
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="page-toolbar">
                <div className="search-input">
                  <Search20Regular />
                  <input
                    className="input"
                    placeholder="Search knowledge bases"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <span className="spacer" />
                <span className="muted text-12">
                  {bases.length} bases · {chunks} chunks · {vectors} vectors
                </span>
              </div>
              <div className="kb-grid">
                {filtered.map((base) => {
                  const baseChunks = base.documents.reduce(
                    (sum, doc) => sum + doc.chunks.length,
                    0
                  );
                  return (
                    <div className="kb-card" key={base.id}>
                      <div className="row between">
                        <span className="kb-icon">
                          <Book20Regular />
                        </span>
                        <div style={{ position: "relative" }}>
                          <button
                            className="icon-button small"
                            aria-label={`Actions for ${base.name}`}
                            onClick={() =>
                              setMenuFor(menuFor === base.id ? null : base.id)
                            }
                          >
                            <MoreHorizontal20Regular />
                          </button>
                          {menuFor === base.id && (
                            <div className="menu-popover" style={{ right: 0, top: 30, minWidth: 190 }}>
                              <button className="menu-item" onClick={() => reindex(base)}>
                                <ArrowClockwise20Regular /> Reindex
                              </button>
                              <button className="menu-item" onClick={() => remove(base)}>
                                <Delete20Regular /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                      <div>
                        <Link
                          href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                          className="kb-name"
                        >
                          {base.name}
                        </Link>
                        <p className="kb-desc">{base.description}</p>
                      </div>
                      <div className="kb-meta">
                        <span>{base.documents.length} documents</span>
                        <span>{baseChunks} chunks</span>
                        <span className="truncate">{base.embeddingModel}</span>
                      </div>
                      <div className="row between">
                        <StatusBadge status={base.status} />
                        <span className="muted text-12">
                          {reindexing === base.id
                            ? "Reindexing..."
                            : formatDate(base.updatedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {filtered.length === 0 && (
                  <div className="operate-card muted" style={{ gridColumn: "1 / -1", padding: 36, textAlign: "center" }}>
                    No knowledge bases match “{query}”.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {tab === "Indexes" && (
        <div className="table-card">
          <table className="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th style={{ width: 100 }}>Version</th>
                <th style={{ width: 180 }}>Type</th>
                <th style={{ width: 140 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredIndexes.map((index) => (
                <tr key={index.id}>
                  <td className="mono text-12">
                    {index.name}
                    <div className="muted text-12" style={{ fontWeight: 400 }}>
                      {index.documents} documents · {index.chunks} chunks
                    </div>
                  </td>
                  <td>{index.version}</td>
                  <td>
                    <StatusBadge status={index.type} />
                  </td>
                  <td>
                    <Link
                      className="btn btn-sm btn-outline"
                      href={`/build/knowledge/${encodeURIComponent(
                        index.id.split(":")[0]
                      )}`}
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
              {filteredIndexes.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 36 }}>
                    {bases.length === 0
                      ? "No indexes yet. Create a knowledge base to build one locally."
                      : `No indexes match “${query}”.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredIndexes.length > 0 && (
            <div className="table-footer">
              1-{filteredIndexes.length} of {filteredIndexes.length}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
