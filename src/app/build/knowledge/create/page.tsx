// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft20Regular,
  ArrowUpload20Regular,
  Book20Regular,
  ChevronDown20Regular,
  Cloud20Regular,
  Database20Regular,
  Dismiss20Regular,
  DocumentArrowUp20Regular,
  Globe20Regular,
  Layer20Regular,
  LockClosed20Regular,
} from "@fluentui/react-icons";
import { useApi, useDeployments } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Field, Spinner } from "@/components/ui";
import type {
  KnowledgeBase,
  KnowledgeSource,
  KnowledgeSourceKind,
  OutputMode,
  ReasoningEffort,
} from "@/lib/types";
import {
  SOURCE_CATALOG,
  catalogEntry,
  type CatalogEntry,
} from "@/lib/knowledge/catalog";
import type { SourceKind } from "@/lib/knowledge/types";

const REASONING: { id: ReasoningEffort; label: string; description: string }[] = [
  {
    id: "Minimal",
    label: "Minimal",
    description:
      "Searches knowledge sources directly without AI query planning, for the lowest cost and latency.",
  },
  {
    id: "Low",
    label: "Low",
    description:
      "Uses one pass of AI query planning to balance speed, cost, and retrieval depth.",
  },
  {
    id: "Medium",
    label: "Medium",
    description:
      "Evaluates result relevance and can refine the search once for more complete results, at higher cost and latency.",
  },
];

const OUTPUT_MODES: { id: OutputMode; hint: string }[] = [
  { id: "Answer synthesis", hint: "Returns a natural-language answer grounded in the sources." },
  { id: "Extractive data", hint: "Returns the raw retrieved chunks for the caller to use." },
];

interface SourceOption {
  kind: KnowledgeSourceKind;
  catalogKind: SourceKind;
  label: string;
  description: string;
  available: boolean;
  reason?: string;
  icon: React.ReactNode;
  /** Existing source to clone instead of opening a new-source dialog. */
  reuseOf?: string;
}

interface ReusableSource {
  id: string;
  baseId: string;
  baseName: string;
  name: string;
  description: string;
  kind: SourceKind;
  mode: "indexed" | "remote" | "unavailable";
  status: string;
  connectionId: string | null;
  config: Record<string, unknown>;
  documentCount: number;
  lastSyncedAt: string | null;
}

/** The five types Foundry shows before "Browse more". */
const PRIMARY_KINDS: SourceKind[] = [
  "work-iq",
  "fabric-data-agent",
  "azure-blob",
  "web",
  "azure-ai-search",
];

function iconFor(kind: SourceKind): React.ReactNode {
  if (kind === "web") return <Globe20Regular />;
  if (kind === "s3" || kind === "azure-blob" || kind === "gcs") return <Cloud20Regular />;
  if (kind === "sqlite" || kind === "csv" || kind === "azure-ai-search")
    return <Database20Regular />;
  if (kind === "file") return <ArrowUpload20Regular />;
  return <Layer20Regular />;
}

const LEGACY_KIND: Partial<Record<SourceKind, KnowledgeSourceKind>> = {
  file: "upload",
  folder: "upload",
  git: "upload",
  csv: "upload",
  sqlite: "azure-blob",
  s3: "azure-blob",
  gcs: "azure-blob",
  "fabric-data-agent": "fabric-iq",
  "fabric-ontology": "fabric-iq",
};

function optionFor(entry: CatalogEntry): SourceOption {
  return {
    kind: LEGACY_KIND[entry.kind] || (entry.kind as KnowledgeSourceKind),
    catalogKind: entry.kind,
    label: entry.label,
    description: entry.description,
    available: entry.available,
    reason: entry.reason,
    icon: iconFor(entry.kind),
  };
}

const SOURCE_OPTIONS: SourceOption[] = PRIMARY_KINDS.map((kind) => catalogEntry(kind))
  .filter((entry): entry is CatalogEntry => Boolean(entry))
  .map(optionFor);


export default function KnowledgeCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: deploymentsData } = useDeployments(0);
  const { data: reusableData } = useApi<{ sources: ReusableSource[] }>(
    "/api/knowledge/reusable-sources",
    0
  );
  const reusableSources = reusableData?.sources ?? [];
  const chatDeployments = useMemo(
    () =>
      (deploymentsData?.deployments ?? []).filter(
        (deployment) => deployment.status === "Running"
      ),
    [deploymentsData]
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("Minimal");
  const [outputMode, setOutputMode] = useState<OutputMode>("Extractive data");
  const [retrievalInstructions, setRetrievalInstructions] = useState("");
  const [sources, setSources] = useState<
    (KnowledgeSource & { catalogKind?: SourceKind; reuseOf?: string })[]
  >([]);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [browseMode, setBrowseMode] = useState<"all" | "existing">("all");

  const [encryptionOpen, setEncryptionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const addSource = (option: SourceOption) => {
    if (!option.available) {
      toast(option.reason || "This source needs extra setup.", "error");
      return;
    }
    const duplicate = option.reuseOf
      ? sources.some((source) => source.reuseOf === option.reuseOf)
      : sources.some(
          (source) =>
            !source.reuseOf && source.catalogKind === option.catalogKind
        );
    if (duplicate) {
      toast("That source is already added.", "info");
      return;
    }
    setSources((current) => [
      ...current,
      {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: option.kind,
        catalogKind: option.catalogKind,
        name: option.label,
        detail: option.description,
        status: "Ready",
        reuseOf: option.reuseOf,
      },
    ]);
    setSourcesOpen(false);
  };

  const addExistingSource = (source: ReusableSource) => {
    if (sources.some((item) => item.reuseOf === source.id)) {
      toast("That source is already added.", "info");
      return;
    }
    setSources((current) => [
      ...current,
      {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind:
          LEGACY_KIND[source.kind] ||
          (source.kind as KnowledgeSourceKind),
        catalogKind: source.kind,
        name: source.name,
        detail: `${source.baseName} · ${
          source.mode === "remote"
            ? "queried live"
            : `${source.documentCount} document${
                source.documentCount === 1 ? "" : "s"
              }`
        }`,
        status: "Ready",
        reuseOf: source.id,
      },
    ]);
    setSourcesOpen(false);
    setBrowseOpen(false);
  };

  const addUploadSource = () => {
    setSources((current) => [
      ...current,
      {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: "upload",
        catalogKind: "file",
        name: "Files",
        detail: "Upload documents to index with file search",
        status: "Connected",
      },
    ]);
  };

  const save = async () => {
    if (!name.trim()) {
      toast("Give the knowledge base a name", "error");
      return;
    }
    if (!chatModel) {
      toast("Select a chat completions model", "error");
      return;
    }
    if (sources.length === 0) {
      toast("Add at least one knowledge source", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          description: description.trim(),
          chatModel,
          reasoningEffort,
          outputMode,
          retrievalInstructions: retrievalInstructions.trim(),
          sources,
        }),
      });
      const json = (await res.json()) as {
        knowledgeBase?: KnowledgeBase;
        pendingSources?: SourceKind[];
        pendingReuse?: string[];
        error?: string;
      };
      if (!res.ok || !json.knowledgeBase)
        throw new Error(json.error || "Could not create the knowledge base");
      toast("Knowledge base created", "success");
      // The server already attached every source it could. Only the ones that
      // still need a connection or configuration are handed to the detail page.
      const params = new URLSearchParams();
      if (json.pendingSources?.length)
        params.set("add", json.pendingSources.join(","));
      if (json.pendingReuse?.length)
        params.set("reuse", json.pendingReuse.join(","));
      router.push(
        `/build/knowledge/${encodeURIComponent(json.knowledgeBase.id)}${
          params.size ? `?${params.toString()}` : ""
        }`
      );
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Link
            href="/build/knowledge/search"
            className="icon-button"
            aria-label="Back to knowledge"
          >
            <ArrowLeft20Regular />
          </Link>
          <h1 className="page-title">Create a new knowledge base</h1>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" disabled={busy} onClick={save}>
            {busy && <Spinner />} Save knowledge base
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => router.push("/build/knowledge/search")}
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="kb-form">
        <section className="kb-form-section">
          <h2 className="kb-form-heading">Basic configuration</h2>
          <Field label="Name" required>
            <input
              className="input"
              placeholder="knowledge-base-name"
              autoFocus
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </Field>
          <Field label="Description">
            <textarea
              className="textarea"
              placeholder="Optional summary describing the knowledge base's purpose and content"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </Field>

          <div className="kb-form-row">
            <label className="field">
              <span className="field-label">Chat completions model</span>
              <Select
                className="select"
                value={chatModel}
                onChange={(event) => setChatModel(event.target.value)}
              >
                <option value="">Select model</option>
                {chatDeployments.map((deployment) => (
                  <option key={deployment.id} value={deployment.name}>
                    {deployment.name}
                  </option>
                ))}
              </Select>
            </label>
            <label className="field">
              <span className="field-label">
                Retrieval reasoning effort <span className="required">*</span>
              </span>
              <Select
                className="select"
                value={reasoningEffort}
                onChange={(event) =>
                  setReasoningEffort(event.target.value as ReasoningEffort)
                }
              >
                {REASONING.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </label>
          </div>
          <p className="field-hint kb-form-hint">
            {REASONING.find((option) => option.id === reasoningEffort)?.description}
          </p>

          <label className="field">
            <span className="field-label">
              Output mode <span className="required">*</span>
            </span>
            <Select
              className="select"
              value={outputMode}
              onChange={(event) => setOutputMode(event.target.value as OutputMode)}
            >
              {OUTPUT_MODES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.id}
                </option>
              ))}
            </Select>
          </label>
          <p className="field-hint kb-form-hint">
            {OUTPUT_MODES.find((option) => option.id === outputMode)?.hint}
          </p>

          <Field label="Retrieval instructions">
            <textarea
              className="textarea"
              placeholder="e.g., &quot;Prioritize 'HR_Policies' for benefits questions, otherwise query 'CompanyWeb'&quot;"
              value={retrievalInstructions}
              onChange={(event) => setRetrievalInstructions(event.target.value)}
            />
          </Field>
        </section>

        <section className="kb-form-section">
          <h2 className="kb-form-heading">
            Knowledge sources (Foundry IQ) <span className="required">*</span>
          </h2>

          {sources.length > 0 && (
            <ul className="kb-source-list">
              {sources.map((source) => (
                <li key={source.id} className="kb-source-item">
                  <span className="kb-source-icon">
                    {SOURCE_OPTIONS.find((option) => option.kind === source.kind)?.icon ?? (
                      <DocumentArrowUp20Regular />
                    )}
                  </span>
                  <span className="kb-source-body">
                    <strong>{source.name}</strong>
                    <span className="muted text-12">{source.detail}</span>
                  </span>
                  <button
                    className="icon-button small"
                    aria-label={`Remove ${source.name}`}
                    onClick={() =>
                      setSources((current) =>
                        current.filter((entry) => entry.id !== source.id)
                      )
                    }
                  >
                    <Dismiss20Regular />
                  </button>
                </li>
              ))}
            </ul>
          )}

          {sources.length === 0 && (
            <div className="kb-sources-empty">
              <div className="kb-sources-icons">
                <span><Cloud20Regular /></span>
                <span><Layer20Regular /></span>
                <span><Globe20Regular /></span>
              </div>
              <h3>Add knowledge sources</h3>
              <p>Expand the knowledge that a base has access to by connecting data sources.</p>
              <div className="row" style={{ gap: 10, position: "relative" }}>
                <div style={{ position: "relative" }}>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setSourcesOpen((open) => !open)}
                  >
                    Add sources <ChevronDown20Regular />
                  </button>
                  {sourcesOpen && (
                    <div className="menu-popover kb-source-menu">
                      {SOURCE_OPTIONS.map((option) => (
                        <button
                          key={option.catalogKind}
                          className="menu-item kb-source-option"
                          onClick={() => addSource(option)}
                        >
                          <span className="kb-source-icon">{option.icon}</span>
                          <span>
                            <strong>
                              {option.label}
                              {option.available ? null : (
                                <span className="kb-type-tag">Requires setup</span>
                              )}
                            </strong>
                            <span className="muted text-12">
                              {option.available ? option.description : option.reason}
                            </span>
                          </span>
                        </button>
                      ))}
                      <button
                        className="menu-item"
                        onClick={() => {
                          setSourcesOpen(false);
                          setBrowseMode("existing");
                          setBrowseOpen(true);
                        }}
                      >
                        Use existing sources
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setSourcesOpen(false);
                          setBrowseMode("all");
                          setBrowseOpen(true);
                        }}
                      >
                        Browse more
                      </button>
                    </div>
                  )}
                </div>
                <button className="btn btn-secondary" onClick={addUploadSource}>
                  <DocumentArrowUp20Regular /> Upload files
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="kb-form-section">
          <button
            className="kb-disclosure"
            onClick={() => setEncryptionOpen((open) => !open)}
            aria-expanded={encryptionOpen}
          >
            <ChevronDown20Regular
              style={{ transform: encryptionOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
            />
            <LockClosed20Regular /> Encryption settings
          </button>
          {encryptionOpen && (
            <div className="kb-encryption">
              <p className="muted">
                Customer-managed keys are not available in this build. Knowledge
                data lives in <span className="mono">data/knowledge/knowledge.db</span>{" "}
                and is protected by whatever disk encryption the operating system
                has enabled (FileVault on macOS). Encrypting the database contents
                would break full-text search, so it is not offered rather than
                faked.
              </p>
            </div>
          )}
        </section>

        {browseOpen && (
          <div
            className="dialog-backdrop"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setBrowseOpen(false);
            }}
          >
            <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Choose a knowledge type">
              <div className="dialog-head">
                <div>
                  <h2 className="dialog-title">Choose a knowledge type</h2>
                  <p className="dialog-sub">
                    {browseMode === "existing"
                      ? "Sources already configured in another knowledge base. Reusing one copies its settings and indexed content."
                      : "Every connector this build can host, including local and third-party products."}
                  </p>
                </div>
                <button className="icon-button" onClick={() => setBrowseOpen(false)} aria-label="Close">
                  <Dismiss20Regular />
                </button>
              </div>
              <div className="dialog-body">
                {browseMode === "existing" ? (
                  reusableSources.length === 0 ? (
                    <p className="muted text-12">
                      No sources exist in other knowledge bases yet.
                    </p>
                  ) : (
                    <div className="kb-type-grid">
                      {reusableSources.map((source) => {
                        const added = sources.some(
                          (item) => item.reuseOf === source.id
                        );
                        return (
                          <button
                            key={source.id}
                            className={`kb-type-card${added ? " added" : ""}`}
                            onClick={() => addExistingSource(source)}
                          >
                            <span className="kb-source-icon">
                              {iconFor(source.kind)}
                            </span>
                            <span className="kb-type-body">
                              <strong>{source.name}</strong>
                              <span className="muted text-12">
                                {source.baseName} ·{" "}
                                {source.mode === "remote"
                                  ? "queried live"
                                  : `${source.documentCount} document${
                                      source.documentCount === 1 ? "" : "s"
                                    }`}
                              </span>
                            </span>
                            <span className="kb-type-tag">
                              {added ? "Added" : source.kind}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )
                ) : (
                  <div className="kb-type-grid">
                    {SOURCE_CATALOG.map((entry) => {
                      const added = sources.some(
                        (source) =>
                          !source.reuseOf && source.catalogKind === entry.kind
                      );
                      return (
                        <button
                          key={entry.kind}
                          className={`kb-type-card${
                            entry.available ? "" : " disabled"
                          }${added ? " added" : ""}`}
                          onClick={() => {
                            if (!entry.available) {
                              toast(
                                entry.reason || "This source needs extra setup.",
                                "error"
                              );
                              return;
                            }
                            addSource(optionFor(entry));
                            setBrowseOpen(false);
                          }}
                        >
                          <span className="kb-source-icon">
                            {iconFor(entry.kind)}
                          </span>
                          <span className="kb-type-body">
                            <strong>{entry.label}</strong>
                            <span className="muted text-12">
                              {entry.available ? entry.description : entry.reason}
                            </span>
                          </span>
                          {added ? (
                            <span className="kb-type-tag">Added</span>
                          ) : entry.available ? null : (
                            <span className="kb-type-tag">Requires setup</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              <div className="dialog-footer">
                <button className="btn btn-secondary" onClick={() => setBrowseOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="kb-form-footer">
          <Book20Regular />
          <span>
            Saving creates the base and its local index. Open it next to upload
            files, test retrieval, and attach it to an agent.
          </span>
        </div>
      </div>
    </div>
  );
}
