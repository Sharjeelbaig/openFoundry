// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
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
  Folder20Regular,
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
  Connection,
  KnowledgeBase,
  KnowledgeDocument,
  KnowledgeSource,
} from "@/lib/types";
import { SOURCE_CATALOG, type CatalogEntry } from "@/lib/knowledge/catalog";
import { CONNECTION_PROVIDERS } from "@/lib/connections/catalog";
import type { ActivityEntry, SourceKind } from "@/lib/knowledge/types";

const MODEL_ACTIVITY_TYPES = new Set([
  "modelQueryPlanning",
  "modelAnswerSynthesis",
  "modelWebSummarization",
  "agenticReasoning",
  "heuristicQueryPlanning",
]);

type RetrievalCitation = Citation & {
  refId?: string;
  rerankerScore?: number | null;
};

interface ApiCitation {
  refId?: string;
  documentId: string;
  title: string;
  excerpt: string;
  score: number;
  rerankerScore?: number | null;
  page?: number | null;
  section?: string | null;
  uri?: string | null;
}

interface McpServerLite {
  id: string;
  name: string;
  status: string;
  url?: string;
  tools: { name: string; description?: string }[];
}

function activityLabel(entry: ActivityEntry): string {
  switch (entry.type) {
    case "modelQueryPlanning":
      return "Query planning";
    case "modelAnswerSynthesis":
      return "Answer synthesis";
    case "modelWebSummarization":
      return "Web summarization";
    case "agenticReasoning":
      return "Agentic reasoning";
    case "heuristicQueryPlanning":
      return "Deterministic planning";
    default:
      return entry.knowledgeSourceName || entry.type;
  }
}

function activityDetail(entry: ActivityEntry): string {
  if (entry.type === "agenticReasoning") {
    return `${entry.reasoningTokens ?? 0} reasoning tokens${
      entry.retrievalReasoningEffort?.kind
        ? ` · ${entry.retrievalReasoningEffort.kind} effort`
        : ""
    }`;
  }
  if (
    entry.type === "modelQueryPlanning" ||
    entry.type === "modelAnswerSynthesis" ||
    entry.type === "modelWebSummarization"
  ) {
    return `${entry.inputTokens ?? 0} in · ${entry.outputTokens ?? 0} out${
      entry.model?.modelName ? ` · ${entry.model.modelName}` : ""
    }`;
  }
  if (entry.type === "heuristicQueryPlanning") {
    return "no model call";
  }
  const query =
    entry.fileArguments?.search ||
    entry.searchIndexArguments?.search ||
    (() => {
      const args = entry.mcpServerArguments?.toolArguments || {};
      const first = Object.values(args)[0];
      if (Array.isArray(first)) return first.join(" | ");
      return typeof first === "string" ? first : "";
    })();
  return [`${entry.count ?? 0} result${entry.count === 1 ? "" : "s"}`, query]
    .filter(Boolean)
    .join(" · ");
}

export default function KnowledgeDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge",
    3000
  );
  const bases = data?.knowledgeBases ?? [];
  const base = bases.find((item) => item.id === id);
  const { data: mcpData } = useApi<{ servers: McpServerLite[] }>("/api/mcp", 15_000);

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
  const [results, setResults] = useState<RetrievalCitation[] | null>(null);
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [activity, setActivity] = useState<ActivityEntry[]>([]);
  const [answer, setAnswer] = useState<string | null>(null);
  const [sourceMenuOpen, setSourceMenuOpen] = useState(false);
  const [sourceDialog, setSourceDialog] = useState<CatalogEntry | null>(null);
  const [sourceName, setSourceName] = useState("");
  const [sourceConfig, setSourceConfig] = useState<Record<string, unknown>>({});
  const [sourceBusy, setSourceBusy] = useState(false);
  const [sourceConnectionId, setSourceConnectionId] = useState("");
  const [pendingAdds, setPendingAdds] = useState<SourceKind[]>([]);
  const [connectionMode, setConnectionMode] = useState<"new" | "saved">("new");
  const [connectionTarget, setConnectionTarget] = useState("");
  const [connectionConfig, setConnectionConfig] = useState<Record<string, unknown>>({});
  const [connectionSecret, setConnectionSecret] = useState<Record<string, unknown>>({});
  const [lastJob, setLastJob] = useState<string>("");
  const [mcpToken, setMcpToken] = useState("");
  const mcpServers = mcpData?.servers ?? [];
  const selectedMcpServer = mcpServers.find(
    (server) => server.id === String(sourceConfig.serverId || "")
  );
  const [mcpBusy, setMcpBusy] = useState(false);
  const { data: connectionsData, refresh: refreshConnections } = useApi<{
    connections: Connection[];
  }>("/api/connections", 0);
  const connections = connectionsData?.connections ?? [];
  const fileRef = useRef<HTMLInputElement>(null);
  const openedFromQuery = useRef(false);
  const reusedFromQuery = useRef(false);

  const sources = base?.sources ?? [];
  const connectionSpec = sourceDialog?.connectionProvider
    ? CONNECTION_PROVIDERS[sourceDialog.connectionProvider]
    : null;

  const dismissSourceDialog = () => {
    setSourceDialog(null);
    setPendingAdds([]);
    window.history.replaceState({}, "", window.location.pathname);
  };

  const openSource = (entry: CatalogEntry) => {
    setSourceMenuOpen(false);
    if (!entry.available) {
      toast(entry.reason || "This source is not available yet.", "error");
      return;
    }
    setSourceDialog(entry);
    setSourceName(entry.label);
    setSourceConfig({});
    setSourceConnectionId("");
    setConnectionMode("new");
    setConnectionTarget("");
    setConnectionConfig({});
    setConnectionSecret({});
    setLastJob("");
  };

  // The create page hands off every chosen source type. The first dialog opens
  // immediately and the rest follow after each successful save.
  useEffect(() => {
    if (openedFromQuery.current || !base) return;
    openedFromQuery.current = true;
    const raw = new URLSearchParams(window.location.search).get("add");
    if (!raw) return;
    const entries = raw
      .split(",")
      .map((kind) => kind.trim())
      .map((kind) => SOURCE_CATALOG.find((item) => item.kind === kind))
      .filter((entry): entry is CatalogEntry => Boolean(entry?.available));
    if (entries.length === 0) return;
    setPendingAdds(entries.slice(1).map((entry) => entry.kind));
    openSource(entries[0]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  // "Use existing sources" on the create page hands off source ids. Clone each
  // one into this base; its config, connection and indexed content come along.
  useEffect(() => {
    if (reusedFromQuery.current || !base) return;
    reusedFromQuery.current = true;
    const raw = new URLSearchParams(window.location.search).get("reuse");
    if (!raw) return;
    const sourceIds = raw
      .split(",")
      .map((sourceId) => sourceId.trim())
      .filter(Boolean);
    if (sourceIds.length === 0) return;
    void (async () => {
      let attached = 0;
      for (const sourceId of sourceIds) {
        try {
          const res = await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "reuseSource",
              id: base.id,
              sourceId,
            }),
          });
          const json = (await res.json().catch(() => ({}))) as {
            error?: string;
          };
          if (!res.ok) {
            throw new Error(json.error || "Could not reuse that source.");
          }
          attached += 1;
        } catch (error) {
          toast(
            error instanceof Error ? error.message : "Could not reuse that source.",
            "error"
          );
        }
      }
      if (attached > 0) {
        toast(
          `${attached} existing source${attached === 1 ? "" : "s"} attached`,
          "success"
        );
        refresh();
      }
      window.history.replaceState(
        {},
        "",
        `${window.location.pathname}${window.location.search
          .replace(/([?&])reuse=[^&]*&?/, "$1")
          .replace(/[?&]$/, "")}`
      );
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [base?.id]);

  const submitSource = async () => {
    if (!base || !sourceDialog) return;
    setSourceBusy(true);
    try {
      let resolvedConnectionId: string | undefined;
      if (sourceDialog.connectionProvider && connectionSpec) {
        if (connectionSpec.oauth || connectionMode === "saved") {
          if (!sourceConnectionId) throw new Error("Choose a connection first.");
          resolvedConnectionId = sourceConnectionId;
        } else {
          const target = connectionTarget.trim().replace(/\/+$/, "");
          if (!target) throw new Error(`${connectionSpec.targetLabel} is required.`);
          if (!/^https?:\/\//i.test(target)) {
            throw new Error("Enter a full http(s) URL.");
          }
          for (const field of connectionSpec.secretFields) {
            const value = connectionSecret[field.key];
            if (
              field.required &&
              (typeof value !== "string" || !value.trim())
            ) {
              throw new Error(`${field.label} is required.`);
            }
          }
          const existing = connections.find(
            (item) =>
              item.provider === connectionSpec.id &&
              item.target.replace(/\/+$/, "") === target
          );
          if (existing) {
            resolvedConnectionId = existing.id;
          } else {
            let host = connectionSpec.label;
            try {
              host = new URL(target).host;
            } catch {
              // keep the provider label
            }
            let connectionName = `${connectionSpec.label} · ${host}`;
            if (connections.some((item) => item.name === connectionName)) {
              connectionName = `${connectionName} ${connections.length + 1}`;
            }
            const created = await fetch("/api/connections", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                name: connectionName,
                provider: connectionSpec.id,
                target,
                authType: connectionSpec.authTypes[0].id,
                config: connectionConfig,
                secret: connectionSecret,
              }),
            });
            const createdJson = (await created.json()) as {
              connection?: Connection;
              error?: string;
            };
            if (!created.ok || !createdJson.connection) {
              throw new Error(
                createdJson.error || "Could not create the connection"
              );
            }
            resolvedConnectionId = createdJson.connection.id;
            const tested = await fetch(
              `/api/connections/${resolvedConnectionId}/test`,
              { method: "POST" }
            );
            const testedJson = (await tested.json()) as {
              result?: { ok?: boolean; detail?: string };
            };
            if (!testedJson.result?.ok) {
              await fetch(`/api/connections?id=${resolvedConnectionId}`, {
                method: "DELETE",
              });
              throw new Error(
                testedJson.result?.detail || "The connection test failed"
              );
            }
            refreshConnections();
          }
        }
      }

      const cleanConfig: Record<string, unknown> = {};
      for (const field of sourceDialog.fields) {
        const raw = sourceConfig[field.key];
        if (field.type === "boolean") {
          cleanConfig[field.key] = raw === true;
        } else if (field.type === "number") {
          if (raw !== "" && raw != null) cleanConfig[field.key] = Number(raw);
        } else if (field.type === "list") {
          const text = typeof raw === "string" ? raw : "";
          const list = text.split(/[\n,]/).map((value) => value.trim()).filter(Boolean);
          if (list.length) cleanConfig[field.key] = list;
        } else if (typeof raw === "string" && raw.trim()) {
          cleanConfig[field.key] = raw.trim();
        }
      }
      const added = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addSource",
          id: base.id,
          sourceKind: sourceDialog.kind,
          sourceName: sourceName || sourceDialog.label,
          sourceDetail: sourceDialog.description,
          sourceConfig: cleanConfig,
          connectionId: resolvedConnectionId,
        }),
      });
      const addedJson = (await added.json()) as {
        source?: KnowledgeSource;
        error?: string;
      };
      if (!added.ok || !addedJson.source) {
        throw new Error(addedJson.error || "Could not add the source");
      }
      // A source is only useful once it has content, so sync immediately.
      if (sourceDialog.mode === "indexed" && sourceDialog.kind !== "file") {
        const synced = await fetch(
          `/api/knowledge/${base.id}/sources/${addedJson.source.id}/sync`,
          { method: "POST" }
        );
        const syncedJson = (await synced.json()) as {
          job?: { status?: string };
          errors?: string[];
          error?: string;
        };
        if (!synced.ok) throw new Error(syncedJson.error || "Sync failed");
        const status = syncedJson.job?.status || "unknown";
        setLastJob(
          syncedJson.errors?.length
            ? `${status}: ${syncedJson.errors[0]}`
            : `${status}`
        );
        if (status === "failed") {
          toast(`Source failed: ${syncedJson.errors?.[0] || "no items indexed"}`, "error");
        } else if (status === "partial") {
          toast("Indexed with errors — see the source row", "info");
        } else {
          toast(`${sourceName} indexed`, "success");
        }
      } else {
        toast(`${sourceName} added`, "success");
      }
      refresh();
      const [nextKind, ...rest] = pendingAdds;
      if (nextKind) {
        setPendingAdds(rest);
        setSourceDialog(null);
        const next = SOURCE_CATALOG.find((entry) => entry.kind === nextKind);
        if (next) {
          window.setTimeout(() => openSource(next), 150);
        }
      } else {
        dismissSourceDialog();
      }
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not add the source", "error");
    } finally {
      setSourceBusy(false);
    }
  };

  const syncSource = async (source: KnowledgeSource) => {
    if (!base) return;
    const res = await fetch(`/api/knowledge/${base.id}/sources/${source.id}/sync`, {
      method: "POST",
    });
    const json = (await res.json()) as {
      job?: { status?: string };
      errors?: string[];
      error?: string;
    };
    if (!res.ok) {
      toast(json.error || "Sync failed", "error");
      return;
    }
    toast(
      json.errors?.length
        ? `Sync ${json.job?.status}: ${json.errors[0]}`
        : `Sync ${json.job?.status}`,
      json.errors?.length ? "error" : "success"
    );
    refresh();
  };

  const generateMcpToken = async () => {
    if (!base) return;
    setMcpBusy(true);
    try {
      const res = await fetch(`/api/knowledge/${base.id}/mcp/token`, {
        method: "POST",
      });
      const json = (await res.json()) as { token?: string; error?: string };
      if (!res.ok || !json.token) {
        throw new Error(json.error || "Could not issue a token");
      }
      setMcpToken(json.token);
      toast("MCP token created. Copy it now; it is shown once.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Could not issue a token", "error");
    } finally {
      setMcpBusy(false);
    }
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
      const res = await fetch(
        `/api/knowledge/${encodeURIComponent(base.id)}/retrieve`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: query }],
            includeActivity: true,
            maxOutputDocuments: 6,
          }),
        }
      );
      const json = (await res.json()) as {
        citations?: ApiCitation[];
        activity?: ActivityEntry[];
        response?: { content?: { type: string; text?: string }[] }[];
        meta?: { embeddingModel?: string };
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Search failed");
      setResults(
        (json.citations || []).map((citation) => ({
          documentId: citation.documentId,
          documentName: citation.title,
          chunk: citation.excerpt,
          score: citation.score,
          page: citation.page,
          section: citation.section,
          uri: citation.uri,
          refId: citation.refId,
          rerankerScore: citation.rerankerScore,
        }))
      );
      setActivity(json.activity || []);
      setEmbeddingModel(json.meta?.embeddingModel || "lexical");
      setAnswer(
        base.outputMode === "Answer synthesis"
          ? json.response?.[0]?.content?.[0]?.text || null
          : null
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Search failed", "error");
    } finally {
      setSearching(false);
    }
  };

  const clearSearch = () => {
    setResults(null);
    setActivity([]);
    setAnswer(null);
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
                    {SOURCE_CATALOG.map((entry) => (
                      <button
                        key={entry.kind}
                        className="menu-item"
                        style={entry.available ? undefined : { opacity: 0.55 }}
                        title={entry.available ? entry.description : entry.reason}
                        onClick={() => openSource(entry)}
                      >
                        <span className="kb-source-icon">
                          {entry.kind === "web" ? (
                            <Globe20Regular />
                          ) : entry.kind === "s3" || entry.kind === "azure-blob" || entry.kind === "gcs" ? (
                            <Cloud20Regular />
                          ) : entry.kind === "folder" || entry.kind === "git" ? (
                            <Folder20Regular />
                          ) : entry.kind === "sqlite" || entry.kind === "csv" || entry.kind === "azure-ai-search" ? (
                            <Database20Regular />
                          ) : entry.kind === "file" ? (
                            <ArrowUpload20Regular />
                          ) : entry.kind === "mcp" || entry.kind === "http" ? (
                            <Code20Regular />
                          ) : (
                            <Layer20Regular />
                          )}
                        </span>
                        <span>
                          <strong>{entry.label}</strong>
                          <span className="muted text-12">
                            {entry.available
                              ? `${entry.mode === "remote" ? "Queried live" : "Indexed"} · ${entry.description}`
                              : entry.reason}
                          </span>
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
                    {source.kind !== "work-iq" &&
                      source.kind !== "fabric-iq" &&
                      source.kind !== "azure-ai-search" && (
                        <button
                          className="icon-button small"
                          aria-label={`Sync ${source.name}`}
                          title="Sync now"
                          onClick={() => syncSource(source)}
                        >
                          <ArrowClockwise20Regular />
                        </button>
                      )}
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

          <div className="operate-card mt-16">
            <div className="row between mb-8">
              <h3>MCP endpoint</h3>
              <button
                className="btn btn-sm btn-secondary"
                disabled={mcpBusy}
                onClick={generateMcpToken}
              >
                {mcpBusy ? <Spinner /> : null} Generate token
              </button>
            </div>
            <p className="muted text-12">
              Agents call this base through the{" "}
              <span className="mono">knowledge_base_retrieve</span> tool. The
              endpoint takes a bearer token; rotating it invalidates the old one.
            </p>
            <div className="mono text-12">
              /api/knowledge/{base.id}/mcp
            </div>
            {mcpToken ? (
              <div className="banner mt-8">
                Token (shown once): <span className="mono">{mcpToken}</span>
                <CopyButton value={mcpToken} label="Copy" className="btn btn-sm btn-secondary ml-8" />
              </div>
            ) : null}
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
              accept=".txt,.md,.csv,.json,.html,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp"
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
                .txt, .md, .csv, .json, .html, .pdf and images · text and OCR run
                on this computer
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
                disabled={searching || !query.trim() || (base.sources?.length ?? 0) === 0}
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
                  <button className="btn btn-sm btn-ghost" onClick={clearSearch}>
                    Clear
                  </button>
                </div>
                {answer && <div className="retrieval-answer">{answer}</div>}
                {results.map((citation, index) => (
                  <div className="retrieval-result" key={index}>
                    <div className="row between">
                      <span className="text-12 strong truncate" style={{ maxWidth: 180 }}>
                        [ref_id:{citation.refId ?? index}] {citation.documentName}
                      </span>
                      <span className="badge gray">
                        {citation.rerankerScore != null
                          ? `rerank ${citation.rerankerScore.toFixed(2)}`
                          : citation.score.toFixed(3)}
                      </span>
                    </div>
                    <p>{citation.chunk}</p>
                  </div>
                ))}
                {results.length === 0 && (
                  <p className="muted text-12">
                    No chunks matched. Add more documents or try a broader query.
                  </p>
                )}
                {activity.length > 0 && (
                  <div className="activity-log">
                    <div className="row between">
                      <span className="text-12 strong">Activity</span>
                      <span className="text-12 muted">{activity.length} steps</span>
                    </div>
                    {activity.map((entry) => (
                      <div className="activity-row" key={entry.id}>
                        <span
                          className={`activity-id${
                            MODEL_ACTIVITY_TYPES.has(entry.type) ? " model" : ""
                          }`}
                        >
                          {entry.id}
                        </span>
                        <div className="activity-copy">
                          <div className="text-12 strong">{activityLabel(entry)}</div>
                          <div className="text-12 muted">{activityDetail(entry)}</div>
                          {entry.warning && (
                            <div className="text-12 activity-warning">{entry.warning}</div>
                          )}
                          {entry.note && (
                            <div className="text-12 muted">{entry.note}</div>
                          )}
                        </div>
                        <span className="text-12 muted activity-time">
                          {entry.elapsedMs != null ? `${entry.elapsedMs} ms` : ""}
                        </span>
                      </div>
                    ))}
                  </div>
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

      {sourceDialog && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) dismissSourceDialog();
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Create a knowledge source">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Create a knowledge source</h2>
                <p className="dialog-sub">{sourceDialog.description}</p>
              </div>
              <button className="icon-button" onClick={dismissSourceDialog} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  value={sourceName}
                  onChange={(event) => setSourceName(event.target.value)}
                />
              </label>
              {sourceDialog.connectionProvider && connectionSpec ? (
                <>
                  {connectionSpec.oauth ? (
                    <div className="banner">
                      <span>
                        Google Drive is authorized in{" "}
                        <Link href="/build/knowledge/connections" className="link">
                          Connections
                        </Link>
                        . Choose a connected account below.
                      </span>
                    </div>
                  ) : (
                    <label className="field">
                      <span className="field-label">Authentication</span>
                      <select
                        className="select"
                        value={connectionMode}
                        onChange={(event) =>
                          setConnectionMode(event.target.value as "new" | "saved")
                        }
                      >
                        <option value="new">Enter connection details</option>
                        <option value="saved">Use a saved connection</option>
                      </select>
                      <span className="field-hint">
                        Enter the account once; it is stored encrypted and reused
                        by every source that points at it.
                      </span>
                    </label>
                  )}
                  {connectionMode === "saved" || connectionSpec.oauth ? (
                    <label className="field">
                      <span className="field-label">
                        Connection <span className="required">*</span>
                      </span>
                      <select
                        className="select"
                        value={sourceConnectionId}
                        onChange={(event) => setSourceConnectionId(event.target.value)}
                      >
                        <option value="">Select a connection</option>
                        {connections
                          .filter(
                            (connection) =>
                              connection.provider === sourceDialog.connectionProvider
                          )
                          .map((connection) => (
                            <option key={connection.id} value={connection.id}>
                              {connection.name} · {connection.target}
                            </option>
                          ))}
                      </select>
                      <span className="field-hint">
                        <Link href="/build/knowledge/connections" className="link">
                          Manage connections
                        </Link>
                      </span>
                    </label>
                  ) : (
                    <>
                      <label className="field">
                        <span className="field-label">
                          {connectionSpec.targetLabel}{" "}
                          <span className="required">*</span>
                        </span>
                        <input
                          className="input"
                          placeholder={connectionSpec.targetPlaceholder}
                          value={connectionTarget}
                          onChange={(event) => setConnectionTarget(event.target.value)}
                        />
                      </label>
                      {connectionSpec.fields.map((field) => (
                        <label className="field" key={`conn-${field.key}`}>
                          <span className="field-label">
                            {field.label}
                            {field.required ? <span className="required"> *</span> : null}
                          </span>
                          <input
                            className="input"
                            placeholder={field.placeholder}
                            value={String(connectionConfig[field.key] ?? "")}
                            onChange={(event) =>
                              setConnectionConfig((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                          {field.help ? (
                            <span className="field-hint">{field.help}</span>
                          ) : null}
                        </label>
                      ))}
                      {connectionSpec.secretFields.map((field) => (
                        <label className="field" key={`secret-${field.key}`}>
                          <span className="field-label">
                            {field.label}
                            {field.required ? <span className="required"> *</span> : null}
                          </span>
                          <input
                            className="input"
                            type={field.type === "password" ? "password" : "text"}
                            autoComplete="off"
                            value={String(connectionSecret[field.key] ?? "")}
                            onChange={(event) =>
                              setConnectionSecret((current) => ({
                                ...current,
                                [field.key]: event.target.value,
                              }))
                            }
                          />
                          {field.help ? (
                            <span className="field-hint">{field.help}</span>
                          ) : null}
                        </label>
                      ))}
                    </>
                  )}
                </>
              ) : null}
              {sourceDialog.kind === "mcp" ? (
                <>
                  <label className="field">
                    <span className="field-label">
                      MCP server <span className="required">*</span>
                    </span>
                    <select
                      className="select"
                      value={String(sourceConfig.serverId ?? "")}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          serverId: event.target.value,
                          tool: "",
                        }))
                      }
                    >
                      <option value="">Select a saved MCP server</option>
                      {mcpServers.map((server) => (
                        <option key={server.id} value={server.id}>
                          {server.name} · {server.status}
                        </option>
                      ))}
                    </select>
                    <span className="field-hint">
                      Manage servers under{" "}
                      <Link href="/build/tools" className="link">
                        Build → Tools
                      </Link>
                      .
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">
                      Tool <span className="required">*</span>
                    </span>
                    <select
                      className="select"
                      value={String(sourceConfig.tool ?? "")}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          tool: event.target.value,
                        }))
                      }
                    >
                      <option value="">Select a tool</option>
                      {(selectedMcpServer?.tools || []).map((tool) => (
                        <option key={tool.name} value={tool.name}>
                          {tool.name}
                        </option>
                      ))}
                    </select>
                    {selectedMcpServer && selectedMcpServer.tools.length === 0 ? (
                      <span className="field-hint">
                        This server advertises no tools. Test it under Build → Tools
                        first.
                      </span>
                    ) : null}
                  </label>
                  <label className="field">
                    <span className="field-label">Query argument</span>
                    <input
                      className="input"
                      placeholder="query"
                      value={String(sourceConfig.queryArgument ?? "query")}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          queryArgument: event.target.value,
                        }))
                      }
                    />
                    <span className="field-hint">
                      The argument the tool expects for the search text.
                    </span>
                  </label>
                  <label className="field">
                    <span className="field-label">Query format</span>
                    <select
                      className="select"
                      value={String(sourceConfig.queryFormat ?? "string")}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          queryFormat: event.target.value,
                        }))
                      }
                    >
                      <option value="string">string</option>
                      <option value="query_variants">query_variants (string array)</option>
                    </select>
                  </label>
                </>
              ) : null}
              {sourceDialog.kind === "mcp"
                ? null
                : sourceDialog.fields.map((field) => (
                <label className="field" key={field.key}>
                  <span className="field-label">
                    {field.label}
                    {field.required ? <span className="required"> *</span> : null}
                  </span>
                  {field.type === "boolean" ? (
                    <input
                      type="checkbox"
                      checked={sourceConfig[field.key] === true}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          [field.key]: event.target.checked,
                        }))
                      }
                    />
                  ) : field.type === "list" ? (
                    <textarea
                      className="textarea"
                      style={{ minHeight: 72 }}
                      placeholder={field.placeholder}
                      value={String(sourceConfig[field.key] ?? "")}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  ) : (
                    <input
                      className="input"
                      type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
                      placeholder={field.placeholder}
                      value={String(sourceConfig[field.key] ?? "")}
                      onChange={(event) =>
                        setSourceConfig((current) => ({
                          ...current,
                          [field.key]: event.target.value,
                        }))
                      }
                    />
                  )}
                  {field.help ? <span className="field-hint">{field.help}</span> : null}
                </label>
              ))}
              {lastJob ? <div className="banner">{lastJob}</div> : null}
              <p className="muted text-12">
                {sourceDialog.mode === "indexed"
                  ? "Saving runs the first sync immediately. The source only shows Ready once content is indexed."
                  : "This source is queried live and is never indexed."}
              </p>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={dismissSourceDialog}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                disabled={
                  sourceBusy ||
                  Boolean(
                    sourceDialog.connectionProvider &&
                      (connectionMode === "saved" || connectionSpec?.oauth) &&
                      !sourceConnectionId
                  )
                }
                onClick={submitSource}
              >
                {sourceBusy ? <Spinner /> : null}
                {sourceDialog.mode === "indexed" && sourceDialog.kind !== "file"
                  ? "Create and index"
                  : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}

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
