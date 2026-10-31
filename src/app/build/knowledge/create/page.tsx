"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  Book20Regular,
  Building20Regular,
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
  Connection,
  KnowledgeBase,
  KnowledgeSource,
  KnowledgeSourceKind,
  OutputMode,
  ReasoningEffort,
} from "@/lib/types";

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
  label: string;
  description: string;
  icon: React.ReactNode;
}

const SOURCE_OPTIONS: SourceOption[] = [
  {
    kind: "work-iq",
    label: "Work IQ",
    description:
      "Ground responses with live, permission-aware organizational context from Microsoft 365 through Work IQ.",
    icon: <Building20Regular />,
  },
  {
    kind: "fabric-iq",
    label: "Fabric IQ (OneLake Catalog)",
    description:
      "Ground responses on an ontology or lakehouse from your Microsoft Fabric workspaces.",
    icon: <Layer20Regular />,
  },
  {
    kind: "azure-blob",
    label: "Azure Blob Storage",
    description: "Retrieve documents and files from Azure Blob Storage",
    icon: <Cloud20Regular />,
  },
  {
    kind: "web",
    label: "Web",
    description: "Ground with real-time web content via Bing",
    icon: <Globe20Regular />,
  },
  {
    kind: "azure-ai-search",
    label: "Azure AI Search Index",
    description: "Enterprise scale search for app development",
    icon: <Database20Regular />,
  },
];

export default function KnowledgeCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: connectionsData } = useApi<{ connections: Connection[] }>(
    "/api/connections"
  );
  const { data: deploymentsData } = useDeployments(0);
  const connections = connectionsData?.connections ?? [];
  const deployments = deploymentsData?.deployments ?? [];
  const chatDeployments = useMemo(
    () => deployments.filter((deployment) => deployment.status === "Running"),
    [deployments]
  );

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("Minimal");
  const [outputMode, setOutputMode] = useState<OutputMode>("Extractive data");
  const [retrievalInstructions, setRetrievalInstructions] = useState("");
  const [connectionId, setConnectionId] = useState("");
  const [sources, setSources] = useState<KnowledgeSource[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [encryptionOpen, setEncryptionOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const addSource = (option: SourceOption) => {
    setSources((current) => [
      ...current,
      {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: option.kind,
        name: option.label,
        detail: option.description,
        status: "Connected",
      },
    ]);
    setSourcesOpen(false);
  };

  const addUploadSource = () => {
    setSources((current) => [
      ...current,
      {
        id: `src-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        kind: "upload",
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
          connectionId: connectionId || undefined,
          chatModel,
          reasoningEffort,
          outputMode,
          retrievalInstructions: retrievalInstructions.trim(),
          sources,
          encryption: { enabled: encryptionEnabled },
        }),
      });
      const json = (await res.json()) as { knowledgeBase?: KnowledgeBase; error?: string };
      if (!res.ok || !json.knowledgeBase)
        throw new Error(json.error || "Could not create the knowledge base");
      toast("Knowledge base created", "success");
      router.push(`/build/knowledge/${encodeURIComponent(json.knowledgeBase.id)}`);
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
              <select
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
              </select>
            </label>
            <label className="field">
              <span className="field-label">
                Retrieval reasoning effort <span className="required">*</span>
              </span>
              <select
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
              </select>
            </label>
          </div>
          <p className="field-hint kb-form-hint">
            {REASONING.find((option) => option.id === reasoningEffort)?.description}
          </p>

          <label className="field">
            <span className="field-label">
              Output mode <span className="required">*</span>
            </span>
            <select
              className="select"
              value={outputMode}
              onChange={(event) => setOutputMode(event.target.value as OutputMode)}
            >
              {OUTPUT_MODES.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.id}
                </option>
              ))}
            </select>
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

          {connections.length > 0 && (
            <label className="field">
              <span className="field-label">Connection</span>
              <select
                className="select"
                value={connectionId}
                onChange={(event) => setConnectionId(event.target.value)}
              >
                <option value="">Select a connection</option>
                {connections.map((connection) => (
                  <option key={connection.id} value={connection.id}>
                    {connection.name} — {connection.kind}
                  </option>
                ))}
              </select>
            </label>
          )}

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
                          key={option.kind}
                          className="menu-item kb-source-option"
                          onClick={() => addSource(option)}
                        >
                          <span className="kb-source-icon">{option.icon}</span>
                          <span>
                            <strong>{option.label}</strong>
                            <span className="muted text-12">{option.description}</span>
                          </span>
                        </button>
                      ))}
                      <button
                        className="menu-item"
                        onClick={() => {
                          setSourcesOpen(false);
                          toast(
                            connections.length
                              ? "Pick a connection above to reuse it"
                              : "No existing sources found",
                            "info"
                          );
                        }}
                      >
                        Use existing sources
                      </button>
                      <button
                        className="menu-item"
                        onClick={() => {
                          setSourcesOpen(false);
                          toast("More source types are not available locally", "info");
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
                Use an encryption key you control. Locally, documents are stored
                under data/ and encrypted with your operating system&apos;s disk
                encryption.
              </p>
              <label className="row" style={{ gap: 8, alignItems: "center" }}>
                <input
                  type="checkbox"
                  checked={encryptionEnabled}
                  onChange={(event) => setEncryptionEnabled(event.target.checked)}
                />
                <span>Encrypt the knowledge base with a customer-managed key</span>
              </label>
            </div>
          )}
        </section>

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
