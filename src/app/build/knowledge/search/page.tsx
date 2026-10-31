"use client";

import Link from "next/link";
import { OpenFoundryAppIcon } from "@/components/Logos";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  Book20Regular,
  Database20Regular,
  Delete20Regular,
  Dismiss20Regular,
  MoreHorizontal20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useKnowledge } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { KnowledgeBase } from "@/lib/types";

type Tab = "Knowledge bases" | "Indexes";

export default function KnowledgePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, refresh } = useKnowledge();
  const { data: systemData } = useApi<{
    stats: { hostname: string; totalMem: number; freeMem: number };
  }>("/api/system");
  const bases = data?.knowledgeBases ?? [];

  const [tab, setTab] = useState<Tab>("Knowledge bases");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState<string | null>(null);

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

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          description: description.trim(),
        }),
      });
      const json = (await res.json()) as { knowledgeBase?: KnowledgeBase; error?: string };
      if (!res.ok || !json.knowledgeBase)
        throw new Error(json.error || "Could not create the knowledge base");
      toast("Knowledge base created", "success");
      setCreateOpen(false);
      setName("");
      setDescription("");
      refresh();
      router.push(`/build/knowledge/${encodeURIComponent(json.knowledgeBase.id)}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

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
      base.documents.reduce(
        (n, doc) => n + (doc.embeddings?.length || 0),
        0
      ),
    0
  );

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">Knowledge (Foundry IQ)</h1>
        {bases.length > 0 ? (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              <Add20Regular /> New knowledge base
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
          {loading && bases.length === 0 ? (
            <div className="row" style={{ gap: 8, color: "var(--fg-3)", padding: 40 }}>
              <Spinner /> Reading local knowledge bases…
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
              <div className="knowledge-connect">
                <label className="field">
                  <span className="field-label">
                    Foundry IQ resource <span className="required">*</span>
                  </span>
                  <select className="select" defaultValue="local">
                    <option value="local">
                      This computer — {systemData?.stats.hostname || "local runtime"}
                    </option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">
                    Auth Type <span className="required">*</span>
                  </span>
                  <select className="select" defaultValue="local">
                    <option value="local">Local (no key required)</option>
                  </select>
                </label>
                <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                  Connect
                </button>
              </div>
              <div className="knowledge-create-link">
                Don&apos;t see your resource?{" "}
                <button className="link" onClick={() => setCreateOpen(true)}>
                  Create new resource
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
                            ? "Reindexing…"
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
        <>
          <div className="banner info mb-16">
            <Database20Regular />
            <span>
              Each knowledge base owns one local vector index. Embeddings are
              produced with {bases[0]?.embeddingModel || "an embedding runtime on this computer"} when
              available, and fall back to lexical scoring when no embedding model is
              cached.
            </span>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Index</th>
                  <th>Knowledge base</th>
                  <th style={{ width: 220 }}>Embedding model</th>
                  <th style={{ width: 110 }}>Documents</th>
                  <th style={{ width: 100 }}>Vectors</th>
                  <th style={{ width: 120 }}>Status</th>
                  <th style={{ width: 170 }}>Updated</th>
                  <th style={{ width: 110 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {bases.map((base) => {
                  const docVectors = base.documents.reduce(
                    (sum, doc) => sum + (doc.embeddings?.length || 0),
                    0
                  );
                  return (
                    <tr key={base.id}>
                      <td className="mono text-12">{base.indexName}</td>
                      <td>
                        <Link
                          href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                          className="agent-name"
                        >
                          {base.name}
                        </Link>
                      </td>
                      <td className="truncate" style={{ maxWidth: 220 }}>
                        {base.embeddingModel}
                      </td>
                      <td>{base.documents.length}</td>
                      <td>{docVectors || "lexical"}</td>
                      <td>
                        <StatusBadge status={base.status} />
                      </td>
                      <td>{formatDate(base.updatedAt)}</td>
                      <td>
                        <button
                          className="btn btn-sm btn-outline"
                          disabled={reindexing === base.id}
                          onClick={() => reindex(base)}
                        >
                          {reindexing === base.id ? <Spinner /> : <ArrowClockwise20Regular />}
                          Reindex
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {bases.length === 0 && (
                  <tr>
                    <td colSpan={8} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      No indexes yet. Create a knowledge base to build one locally.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {createOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="New knowledge base">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">New knowledge base</h2>
                <p className="dialog-sub">
                  Documents are indexed locally. Embeddings come from Ollama or
                  Foundry Local when a model is cached.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">
                  Name <span className="required">*</span>
                </span>
                <input
                  className="input"
                  placeholder="product-catalog"
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void create();
                  }}
                />
                <span className="field-hint">
                  The index name is derived from this and stored under data/knowledge.json.
                </span>
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <textarea
                  className="textarea"
                  placeholder="What is in this knowledge base and who should use it?"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </label>
              <div className="banner">
                <Book20Regular />
                <span>
                  After creation you can upload files, paste text, and test retrieval
                  against the same embedding path agents use.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!name.trim() || busy}
                onClick={create}
              >
                {busy ? <Spinner /> : null} Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
