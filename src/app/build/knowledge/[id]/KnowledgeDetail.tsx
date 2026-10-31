"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  ArrowLeft20Regular,
  Book20Regular,
  Cloud20Regular,
  Code20Regular,
  Database20Regular,
  Delete20Regular,
  Dismiss20Regular,
  DocumentText20Regular,
  Globe20Regular,
  Layer20Regular,
  MoreHorizontal20Regular,
  Search20Regular,
  ArrowUpload20Regular,
} from "@fluentui/react-icons";
import { formatBytes, formatDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import type {
  Citation,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSource,
  KnowledgeSourceKind,
} from "@/lib/types";

const ADD_SOURCE_OPTIONS: { kind: KnowledgeSourceKind; label: string; detail: string }[] = [
  { kind: "work-iq", label: "Work IQ (Preview)", detail: "Microsoft 365 organizational context" },
  { kind: "fabric-iq", label: "Fabric IQ (OneLake Catalog) (Preview)", detail: "Fabric ontology or lakehouse" },
  { kind: "azure-blob", label: "Azure Blob Storage", detail: "Documents and files from a container" },
  { kind: "web", label: "Web", detail: "Real-time web content" },
  { kind: "azure-ai-search", label: "Azure AI Search Index", detail: "Existing enterprise search index" },
];

export default function KnowledgeDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
    3000
  );
  const bases = data?.knowledgeBases ?? [];
  const base = bases.find((item) => item.id === id);

  const [drag, setDrag] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState("pasted-text.txt");
  const [pasteText, setPasteText] = useState("");
  const [preview, setPreview] = useState<KnowledgeDocument | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [renameDescription, setRenameDescription] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Citation[] | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const sources = base?.sources ?? [];

  const addSource = async (kind: KnowledgeSourceKind, label: string, detail: string) => {
    if (!base) return;
    setSourceMenuOpen(false);
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "addSource",
        id: base.id,
        sourceKind: kind,
        sourceName: label,
        sourceDetail: detail,
      }),
    });
    if (!res.ok) {
      toast("Could not add the source", "error");
      return;
    }
    toast(`${label} added to ${base.name}`, "success");
    refresh();
  };

  const removeSource = async (source: KnowledgeSource) => {
    if (!base) return;
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteSource", id: base.id, sourceId: source.id }),
    });
    if (!res.ok) {
      toast("Could not remove the source", "error");
      return;
    }
    toast(`${source.name} removed`, "success");
    refresh();
  };

  const chunks = useMemo(
    () =>
      base
        ? base.documents.reduce((sum, doc) => sum + doc.chunks.length, 0)
        : 0,
    [base]
  );

  const upload = async (files: FileList | File[] | null) => {
    if (!files || !base) return;
    const list = Array.from(files);
    if (!list.length) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.set("knowledgeBaseId", base.id);
      for (const file of list) form.append("files", file);
      const res = await fetch("/api/knowledge", { method: "POST", body: form });
      const json = (await res.json()) as {
        documents?: KnowledgeDocument[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast(
        `Indexed ${json.documents?.length || 0} document(s) into ${base.name}`,
        "success"
      );
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const addText = async () => {
    if (!base || !pasteText.trim()) return;
    setUploading(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addText",
          id: base.id,
          name: pasteName || "pasted-text.txt",
          text: pasteText,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not add the text");
      toast("Text indexed", "success");
      setPasteOpen(false);
      setPasteText("");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Add failed", "error");
    } finally {
      setUploading(false);
    }
  };

  const removeDoc = async (doc: KnowledgeDocument) => {
    if (!base) return;
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "deleteDocument",
        id: base.id,
        documentId: doc.id,
      }),
    });
    if (!res.ok) {
      toast("Could not delete the document", "error");
      return;
    }
    toast(`${doc.name} removed`, "success");
    refresh();
  };

  const reindex = async () => {
    if (!base) return;
    setReindexing(true);
    setMenuOpen(false);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reindex", id: base.id }),
      });
      if (!res.ok) throw new Error("Reindex failed");
      toast("Index rebuilt", "success");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Reindex failed", "error");
    } finally {
      setReindexing(false);
    }
  };

  const rename = async () => {
    if (!base || !renameValue.trim()) return;
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "rename",
        id: base.id,
        name: renameValue,
        description: renameDescription,
      }),
    });
    if (!res.ok) {
      toast("Rename failed", "error");
      return;
    }
    toast("Knowledge base updated", "success");
    setRenameOpen(false);
    refresh();
  };

  const removeBase = async () => {
    if (!base) return;
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: base.id }),
    });
    if (!res.ok) {
      toast("Delete failed", "error");
      return;
    }
    toast("Knowledge base deleted", "success");
    router.push("/build/knowledge/search");
  };

  const search = async () => {
    if (!base || !query.trim()) return;
    setSearching(true);
    try {
      const res = await fetch("/api/knowledge/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          knowledgeBaseId: base.id,
          query,
          topK: 6,
        }),
      });
      const json = (await res.json()) as {
        citations?: Citation[];
        embeddingModel?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Search failed");
      setResults(json.citations || []);
      setEmbeddingModel(json.embeddingModel || "");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Search failed", "error");
    } finally {
      setSearching(false);
    }
  };

  if (!base) {
    return (
      <div className="page">
        {loading ? (
          <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
            <Spinner /> Loading knowledge base…
          </div>
        ) : (
          <>
            <div className="banner error">Knowledge base not found.</div>
            <Link href="/build/knowledge/search" className="btn btn-secondary mt-16">
              Back to knowledge
            </Link>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="page knowledge-detail" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <button
            className="icon-button"
            onClick={() => router.push("/build/knowledge/search")}
            aria-label="Back to knowledge bases"
          >
            <ArrowLeft20Regular />
          </button>
          <span className="kb-icon">
            <Book20Regular />
          </span>
          <div>
            <h1 className="page-title">{base.name}</h1>
            <div className="page-subtitle row" style={{ gap: 8 }}>
              <StatusBadge status={base.status} />
              <span>{base.documents.length} documents</span>
              <span>·</span>
              <span>{chunks} chunks</span>
              <span>·</span>
              <span className="truncate">{base.embeddingModel}</span>
            </div>
          </div>
        </div>
        <div className="page-header-actions">
          <button
            className="btn btn-secondary"
            disabled={reindexing || base.documents.length === 0}
            onClick={reindex}
          >
            {reindexing ? <Spinner /> : <ArrowClockwise20Regular />} Reindex
          </button>
          <button className="btn btn-primary" onClick={() => fileRef.current?.click()}>
            <ArrowUpload20Regular /> Upload
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="icon-button"
              aria-label="More actions"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MoreHorizontal20Regular />
            </button>
            {menuOpen && (
              <div className="menu-popover" style={{ right: 0, top: 36, minWidth: 200 }}>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMenuOpen(false);
                    setRenameValue(base.name);
                    setRenameDescription(base.description);
                    setRenameOpen(true);
                  }}
                >
                  <DocumentText20Regular /> Rename
                </button>
                <button className="menu-item" onClick={() => setDeleteOpen(true)}>
                  <Delete20Regular /> Delete knowledge base
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <p className="muted" style={{ maxWidth: 780, marginBottom: 20 }}>
        {base.description || "No description."}
      </p>

      <div className="metric-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
        <div className="metric-card">
          <span className="metric-label">Documents</span>
          <span className="metric-value">{base.documents.length}</span>
          <span className="metric-note">Uploaded and indexed locally</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Chunks</span>
          <span className="metric-value">{chunks}</span>
          <span className="metric-note">900 chars with overlap</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Embeddings</span>
          <span className="metric-value" style={{ fontSize: 18 }}>
            {base.embeddingProvider === "lexical" ? "Lexical" : "Vector"}
          </span>
          <span className="metric-note truncate">{base.embeddingModel}</span>
        </div>
        <div className="metric-card">
          <span className="metric-label">Index name</span>
          <span className="metric-value mono" style={{ fontSize: 14 }}>
            {base.indexName}
          </span>
          <span className="metric-note">Updated {formatDate(base.updatedAt)}</span>
        </div>
      </div>

      <div className="knowledge-split mt-16">
        <div>
          <div className="operate-card mb-16">
            <div className="row between mb-12">
              <h3>Knowledge sources</h3>
              <div style={{ position: "relative" }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setSourceMenuOpen((open) => !open)}
                >
                  <Add20Regular /> Add sources
                </button>
                {sourceMenuOpen && (
                  <div className="menu-popover kb-source-menu" style={{ right: 0, top: 32 }}>
                    {ADD_SOURCE_OPTIONS.map((option) => (
                      <button
                        key={option.kind}
                        className="menu-item"
                        onClick={() => addSource(option.kind, option.label, option.detail)}
                      >
                        <span className="kb-source-icon">
                          {option.kind === "web" ? (
                            <Globe20Regular />
                          ) : option.kind === "azure-blob" ? (
                            <Cloud20Regular />
                          ) : option.kind === "azure-ai-search" ? (
                            <Database20Regular />
                          ) : (
                            <Layer20Regular />
                          )}
                        </span>
                        <span>
                          <strong>{option.label}</strong>
                          <span className="muted text-12">{option.detail}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {sources.length === 0 ? (
              <p className="muted text-12">
                No sources configured yet. Add a source to expand what this base can
                retrieve from, or upload files below.
              </p>
            ) : (
              <div className="stack" style={{ gap: 8 }}>
                {sources.map((source) => (
                  <div className="kb-source-item" key={source.id}>
                    <span className="kb-source-icon">
                      {source.kind === "web" ? (
                        <Globe20Regular />
                      ) : source.kind === "azure-blob" ? (
                        <Cloud20Regular />
                      ) : source.kind === "azure-ai-search" ? (
                        <Database20Regular />
                      ) : source.kind === "upload" ? (
                        <ArrowUpload20Regular />
                      ) : (
                        <Layer20Regular />
                      )}
                    </span>
                    <span className="kb-source-body">
                      <strong>{source.name}</strong>
                      <span className="muted text-12">{source.detail}</span>
                    </span>
                    <StatusBadge status={source.status} />
                    <button
                      className="icon-button small"
                      aria-label={`Remove ${source.name}`}
                      onClick={() => removeSource(source)}
                    >
                      <Dismiss20Regular />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="operate-card">
            <div className="row between mb-12">
              <h3>Documents</h3>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-sm btn-secondary" onClick={() => setPasteOpen(true)}>
                  Paste text
                </button>
                <button className="btn btn-sm btn-secondary" onClick={() => fileRef.current?.click()}>
                  {uploading ? <Spinner /> : <ArrowUpload20Regular />} Upload
                </button>
              </div>
            </div>
            <input
              ref={fileRef}
              type="file"
              multiple
              hidden
              accept=".txt,.md,.csv,.json,.html,.pdf"
              onChange={(event) => upload(event.target.files)}
            />
            <div
              className={`upload-zone${drag ? " drag" : ""}`}
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => {
                event.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDrag(false);
                upload(event.dataTransfer.files);
              }}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") fileRef.current?.click();
              }}
            >
              <ArrowUpload20Regular />
              <span className="text-14">
                {uploading
                  ? "Extracting text and building embeddings…"
                  : "Drop files here or click to upload"}
              </span>
              <span className="text-12 muted">
                .txt, .md, .csv, .json, .html and .pdf · text is extracted on this
                computer
              </span>
            </div>

            <div className="table-card mt-16">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th style={{ width: 130 }}>Type</th>
                    <th style={{ width: 90 }}>Size</th>
                    <th style={{ width: 80 }}>Chunks</th>
                    <th style={{ width: 170 }}>Added</th>
                    <th style={{ width: 150 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {base.documents.map((doc) => (
                    <tr key={doc.id}>
                      <td className="cell-strong">{doc.name}</td>
                      <td className="muted">{doc.type || "text/plain"}</td>
                      <td>{formatBytes(doc.size)}</td>
                      <td>{doc.chunks.length}</td>
                      <td>{formatDate(doc.addedAt)}</td>
                      <td>
                        <div className="inline-actions">
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => setPreview(doc)}
                          >
                            Preview
                          </button>
                          <button
                            className="icon-button small"
                            aria-label={`Delete ${doc.name}`}
                            onClick={() => removeDoc(doc)}
                          >
                            <Delete20Regular />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {base.documents.length === 0 && (
                    <tr>
                      <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 40 }}>
                        This knowledge base is empty. Upload a document or paste text
                        to build the index.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <aside>
          <div className="operate-card">
            <h3 className="mb-8">Test retrieval</h3>
            <p className="muted text-12 mb-12">
              Runs the same retrieval path agents use and shows the exact chunks and
              scores the model would receive.
            </p>
            <div className="row" style={{ gap: 6 }}>
              <input
                className="input"
                placeholder="Ask something in your documents"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void search();
                }}
              />
              <button
                className="btn btn-primary btn-icon-only"
                aria-label="Search knowledge"
                onClick={search}
                disabled={searching || !query.trim() || base.documents.length === 0}
              >
                {searching ? <Spinner /> : <Search20Regular />}
              </button>
            </div>
            {results && (
              <div className="stack mt-12" style={{ gap: 10 }}>
                <div className="row between">
                  <span className="text-12 muted">
                    {results.length} chunks · {embeddingModel}
                  </span>
                  <button className="btn btn-sm btn-ghost" onClick={() => setResults(null)}>
                    Clear
                  </button>
                </div>
                {results.map((citation, index) => (
                  <div className="retrieval-result" key={index}>
                    <div className="row between">
                      <span className="text-12 strong truncate" style={{ maxWidth: 180 }}>
                        [{index + 1}] {citation.documentName}
                      </span>
                      <span className="badge gray">{citation.score.toFixed(3)}</span>
                    </div>
                    <p>{citation.chunk}</p>
                  </div>
                ))}
                {results.length === 0 && (
                  <p className="muted text-12">
                    No chunks matched. Add more documents or try a broader query.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="operate-card mt-16">
            <h3 className="mb-8">Index details</h3>
            <div className="facts-list">
              <div className="fact-row">
                <span>Index name</span>
                <span className="mono text-12">{base.indexName}</span>
              </div>
              <div className="fact-row">
                <span>Chat completions model</span>
                <span>{base.chatModel || "--"}</span>
              </div>
              <div className="fact-row">
                <span>Retrieval reasoning effort</span>
                <span>{base.reasoningEffort || "Minimal"}</span>
              </div>
              <div className="fact-row">
                <span>Output mode</span>
                <span>{base.outputMode || "Extractive data"}</span>
              </div>
              <div className="fact-row">
                <span>Embedding runtime</span>
                <span>{base.embeddingProvider}</span>
              </div>
              <div className="fact-row">
                <span>Created</span>
                <span>{formatDate(base.createdAt)}</span>
              </div>
              <div className="fact-row">
                <span>Updated</span>
                <span>{formatDate(base.updatedAt)}</span>
              </div>
            </div>
            {base.retrievalInstructions && (
              <div className="banner mt-12">
                <Search20Regular />
                <span>Retrieval instructions: {base.retrievalInstructions}</span>
              </div>
            )}
            <div className="banner mt-12">
              <Code20Regular />
              <span>
                Agents use this base through{" "}
                <span className="mono">knowledgeBaseIds</span>. Retrieved chunks are
                injected into the system prompt with numbered citations.
              </span>
            </div>
          </div>
        </aside>
      </div>

      {pasteOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPasteOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Paste text">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Paste text</h2>
                <p className="dialog-sub">
                  The text is chunked and embedded exactly like an uploaded file.
                </p>
              </div>
              <button className="icon-button" onClick={() => setPasteOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Document name</span>
                <input
                  className="input"
                  value={pasteName}
                  onChange={(event) => setPasteName(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Text</span>
                <textarea
                  className="textarea"
                  style={{ minHeight: 280 }}
                  placeholder="Paste product documentation, policies, notes…"
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                />
                <span className="field-hint">
                  {pasteText.length.toLocaleString()} characters · approximately{" "}
                  {Math.max(1, Math.ceil(pasteText.length / 900))} chunks
                </span>
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setPasteOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={!pasteText.trim() || uploading}
                onClick={addText}
              >
                {uploading ? <Spinner /> : null} Add and index
              </button>
            </div>
          </div>
        </div>
      )}

      {preview && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPreview(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Document preview">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">{preview.name}</h2>
                <p className="dialog-sub">
                  {preview.chunks.length} chunks · {formatBytes(preview.size)} ·{" "}
                  {formatDate(preview.addedAt)}
                </p>
              </div>
              <button className="icon-button" onClick={() => setPreview(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body" style={{ maxHeight: "60vh", overflow: "auto" }}>
              {preview.chunks.map((chunk, index) => (
                <div className="chunk-block" key={index}>
                  <div className="row between mb-4">
                    <span className="field-label">Chunk {index + 1}</span>
                    <span className="muted text-12">{chunk.length} chars</span>
                  </div>
                  <div className="chunk-preview">{chunk}</div>
                </div>
              ))}
            </div>
            <div className="dialog-footer">
              <CopyButton value={preview.text} label="Copy full text" className="btn btn-secondary" />
              <button className="btn btn-primary" onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {renameOpen && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Rename knowledge base">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Edit knowledge base</h2>
              </div>
              <button className="icon-button" onClick={() => setRenameOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                />
              </label>
              <label className="field">
                <span className="field-label">Description</span>
                <textarea
                  className="textarea"
                  value={renameDescription}
                  onChange={(event) => setRenameDescription(event.target.value)}
                />
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setRenameOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={rename} disabled={!renameValue.trim()}>
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteOpen && (
        <div className="dialog-backdrop">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Delete knowledge base">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Delete {base.name}?</h2>
                <p className="dialog-sub">
                  The documents and their embeddings are removed from this computer.
                  Agents connected to this base will stop retrieving from it.
                </p>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={removeBase}>
                Delete knowledge base
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
