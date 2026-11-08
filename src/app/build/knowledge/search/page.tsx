// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { OpenFoundryAppIcon } from "@/components/Logos";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ChevronLeft20Regular,
  ChevronRight20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { useKnowledge } from "@/lib/client";
import { Spinner, StatusBadge } from "@/components/ui";
import type { SearchIndex } from "@/lib/types";

type Tab = "Knowledge bases" | "Indexes";

const PAGE_SIZE = 20;

function statusPill(status: string): { label: string; tone: string } {
  const value = status.toLowerCase();
  if (value === "ready") return { label: "Active", tone: "ok" };
  if (value === "indexing") return { label: "Indexing", tone: "warn" };
  if (value === "failed") return { label: "Failed", tone: "bad" };
  return { label: status, tone: "muted" };
}

export default function KnowledgePage() {
  const router = useRouter();
  const { data, loading } = useKnowledge();
  const bases = data?.knowledgeBases ?? [];
  const indexes = (data as { indexes?: SearchIndex[] } | null)?.indexes ?? [];

  const [tab, setTab] = useState<Tab>("Knowledge bases");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);

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

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );
  const from = filtered.length === 0 ? 0 : currentPage * PAGE_SIZE + 1;
  const to = Math.min(filtered.length, (currentPage + 1) * PAGE_SIZE);

  const startCreate = () => router.push("/build/knowledge/create");

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <h1 className="page-title">Knowledge (Foundry IQ)</h1>

      <div className="tabbar mt-8">
        {(["Knowledge bases", "Indexes"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => {
              setTab(item);
              setPage(0);
            }}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Knowledge bases" && (
        <>
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
                Connect your agent to a knowledge base to combine multiple data
                sources behind an agentic retrieval engine. In this local build,
                knowledge bases are indexed on this computer with real embeddings
                and never leave it.
              </p>
              <div className="knowledge-create-link">
                <button className="btn btn-primary" onClick={startCreate}>
                  Create a knowledge base
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="kb-toolbar">
                <div className="search-input kb-search">
                  <Search20Regular />
                  <input
                    className="input"
                    placeholder="Search"
                    value={query}
                    onChange={(event) => {
                      setQuery(event.target.value);
                      setPage(0);
                    }}
                  />
                </div>
                <div
                  className="kb-conn"
                  title="Knowledge bases are stored in data/knowledge/knowledge.db on this computer."
                >
                  <span className="kb-conn-label">Connection</span>
                  <span className="kb-conn-value">Local knowledge store</span>
                </div>
                <Link className="link" href="/build/data">
                  Manage
                </Link>
                <span className="spacer" />
                <button className="btn btn-primary" onClick={startCreate}>
                  Create a knowledge base
                </button>
              </div>

              <div className="table-card">
                <table className="data-table kb-table">
                  <thead>
                    <tr>
                      <th style={{ width: "24%" }}>Name</th>
                      <th>Description</th>
                      <th style={{ width: "26%" }}>Knowledge sources</th>
                      <th style={{ width: 120 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((base) => {
                      const pill = statusPill(base.status);
                      const sources = (base.sources ?? [])
                        .map((source) => source.name)
                        .join(", ");
                      return (
                        <tr key={base.id}>
                          <td>
                            <Link
                              href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                              className="kb-row-name"
                            >
                              {base.name}
                            </Link>
                          </td>
                          <td className="cell-muted">
                            <span className="kb-desc">{base.description || "—"}</span>
                          </td>
                          <td className="cell-muted">{sources || "—"}</td>
                          <td>
                            <span className={`kb-pill ${pill.tone}`}>{pill.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr>
                        <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 36 }}>
                          No knowledge bases match “{query}”.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
                <div className="kb-pager">
                  <span>
                    {from}-{to} of {filtered.length}
                  </span>
                  <div className="row" style={{ gap: 4 }}>
                    <button
                      disabled={currentPage === 0}
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft20Regular /> Prev
                    </button>
                    <button
                      disabled={currentPage >= pageCount - 1}
                      onClick={() => setPage(currentPage + 1)}
                    >
                      Next <ChevronRight20Regular />
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === "Indexes" && (
        <div className="table-card" style={{ marginTop: 16 }}>
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
                      : query.trim()
                        ? `No indexes match “${query.trim()}”.`
                        : "No indexes yet. Add documents to a knowledge base to build one locally."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {filteredIndexes.length > 0 && (
            <div className="kb-pager">
              <span>
                1-{filteredIndexes.length} of {filteredIndexes.length}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
