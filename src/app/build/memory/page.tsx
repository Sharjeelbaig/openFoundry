"use client";

import { useMemo, useState } from "react";
import {
  Brain20Regular,
  ChevronDown20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Info20Regular,
  Add20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi, useDeployments } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Field, Spinner } from "@/components/ui";
import type { MemoryItem, MemoryStore } from "@/lib/types";

interface MemoryResponse {
  stores: MemoryStore[];
  items: MemoryItem[];
  defaultEmbeddingModel?: string;
}

const FEATURES: { key: keyof MemoryStore["features"]; label: string }[] = [
  { key: "chatSummary", label: "Enable chat summary" },
  { key: "proceduralMemory", label: "Enable procedural memory" },
  { key: "userProfile", label: "Enable user profile" },
];

const KIND_LABEL: Record<MemoryItem["kind"], string> = {
  "chat-summary": "Chat summary",
  procedural: "Procedural memory",
  "user-profile": "User profile",
};

export default function MemoryPage() {
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<MemoryResponse>("/api/memory");
  const { data: deploymentsData } = useDeployments(0);
  const stores = data?.stores ?? [];
  const items = data?.items ?? [];
  const deployments = (deploymentsData?.deployments ?? []).filter(
    (deployment) => deployment.status === "Running"
  );

  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  // create dialog state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [chatModel, setChatModel] = useState("");
  const [embeddingModel, setEmbeddingModel] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [features, setFeatures] = useState({
    chatSummary: true,
    proceduralMemory: true,
    userProfile: true,
  });
  const [userProfileDetails, setUserProfileDetails] = useState("");
  const [ttlSeconds, setTtlSeconds] = useState("0");
  const [busy, setBusy] = useState(false);

  const chatDefault =
    chatModel || deployments.find((d) => !/embed/i.test(d.modelName))?.name || "";
  const runtimeEmbedding = data?.defaultEmbeddingModel || "";
  const embeddingDefault =
    embeddingModel ||
    deployments.find((d) => /embed/i.test(d.modelName))?.name ||
    runtimeEmbedding;

  const filtered = useMemo(
    () =>
      stores.filter(
        (store) =>
          !query ||
          store.name.toLowerCase().includes(query.toLowerCase()) ||
          (store.description || "").toLowerCase().includes(query.toLowerCase())
      ),
    [stores, query]
  );

  const reset = () => {
    setName("");
    setDescription("");
    setChatModel("");
    setEmbeddingModel("");
    setAdvancedOpen(false);
    setFeatures({ chatSummary: true, proceduralMemory: true, userProfile: true });
    setUserProfileDetails("");
    setTtlSeconds("0");
  };

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/memory", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          description: description.trim(),
          chatModel: chatDefault,
          embeddingModel: embeddingDefault,
          features,
          userProfileDetails: userProfileDetails.trim(),
          ttlSeconds: Number(ttlSeconds) || 0,
        }),
      });
      const json = (await res.json()) as { store?: MemoryStore; error?: string };
      if (!res.ok || !json.store)
        throw new Error(json.error || "Could not create the memory store");
      toast("Memory store created", "success");
      setCreateOpen(false);
      reset();
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (store: MemoryStore) => {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: store.id }),
    });
    if (!res.ok) {
      toast("Could not delete the memory store", "error");
      return;
    }
    toast(`${store.name} deleted`, "success");
    refresh();
  };

  const clearStore = async (store: MemoryStore) => {
    const res = await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear", id: store.id }),
    });
    if (!res.ok) {
      toast("Could not clear the memory store", "error");
      return;
    }
    toast(`${store.name} cleared`, "success");
    refresh();
  };

  const deleteItem = async (item: MemoryItem) => {
    await fetch("/api/memory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deleteItem", itemId: item.id }),
    });
    refresh();
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <h1 className="page-title">
          Memory stores ({stores.length}){" "}
          <span className="preview-badge">Preview</span>
        </h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            Create memory store
          </button>
        </div>
      </div>

      <div className="banner warning mt-16">
        <Info20Regular />
        <span>
          This project&apos;s managed identity needs the Foundry User role on this
          project. Locally, memory is written to data/memory.json on this computer
          and never leaves it.
        </span>
        <span className="spacer" />
        <button
          className="btn btn-sm btn-outline"
          onClick={() => toast("Permissions are fully local by default", "info")}
        >
          Resolve
        </button>
      </div>

      {stores.length > 0 && (
        <div className="page-toolbar">
          <div className="search-input">
            <input
              className="input"
              placeholder="Search memory stores"
              aria-label="Search memory stores"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
      )}

      {loading && stores.length === 0 ? (
        <div className="row" style={{ gap: 8, color: "var(--fg-3)", padding: 40 }}>
          <Spinner /> Reading local memory stores...
        </div>
      ) : stores.length === 0 ? (
        <div className="empty">
          <Brain20Regular style={{ width: 46, height: 46, color: "var(--fg-3)" }} />
          <h2>No memory stores yet</h2>
          <p>
            Create a memory store to help your agents retain context across
            conversations.
          </p>
          <div className="mt-12">
            <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
              Create memory store
            </button>
          </div>
        </div>
      ) : (
        <div className="memory-list">
          {filtered.map((store) => {
            const storeItems = items.filter((item) => item.storeId === store.id);
            const open = expanded === store.id;
            const groups = new Map<string, MemoryItem[]>();
            for (const item of storeItems) {
              const list = groups.get(item.kind) || [];
              list.push(item);
              groups.set(item.kind, list);
            }
            return (
              <div className="memory-card" key={store.id}>
                <div className="row between" style={{ gap: 12 }}>
                  <button
                    className="memory-card-head"
                    onClick={() => setExpanded(open ? null : store.id)}
                    aria-expanded={open}
                  >
                    <ChevronDown20Regular
                      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                    />
                    <span>
                      <span className="memory-card-name">{store.name}</span>
                      <span className="memory-card-sub">
                        {store.chatModel} · {store.embeddingModel} ·{" "}
                        {storeItems.length} memories
                      </span>
                    </span>
                  </button>
                  <div className="row" style={{ gap: 8 }}>
                    <span className="muted text-12">
                      {formatDate(store.updatedAt)}
                    </span>
                    <button
                      className="btn btn-sm btn-outline"
                      onClick={() => clearStore(store)}
                    >
                      Clear
                    </button>
                    <button
                      className="icon-button small"
                      aria-label={`Delete ${store.name}`}
                      onClick={() => remove(store)}
                    >
                      <Delete20Regular />
                    </button>
                  </div>
                </div>

                {open && (
                  <div className="memory-card-body">
                    {store.description && (
                      <p className="muted text-12">{store.description}</p>
                    )}
                    <div className="memory-tags">
                      {FEATURES.filter((feature) => store.features[feature.key]).map(
                        (feature) => (
                          <span className="tag" key={feature.key}>
                            {feature.label.replace("Enable ", "")}
                          </span>
                        )
                      )}
                      <span className="tag">
                        TTL {store.ttlSeconds > 0 ? `${store.ttlSeconds}s` : "∞"}
                      </span>
                    </div>
                    {storeItems.length === 0 ? (
                      <p className="muted text-12">
                        Nothing remembered yet. Chat with an agent that uses this
                        store and its facts will appear here.
                      </p>
                    ) : (
                      [...groups.entries()].map(([kind, list]) => (
                        <div className="memory-group" key={kind}>
                          <div className="memory-group-title">
                            {KIND_LABEL[kind as MemoryItem["kind"]]}
                          </div>
                          <ul>
                            {list.map((item) => (
                              <li key={item.id}>
                                <span>{item.value}</span>
                                <button
                                  className="icon-button small"
                                  aria-label="Forget"
                                  onClick={() => deleteItem(item)}
                                >
                                  <Dismiss20Regular />
                                </button>
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="operate-card muted" style={{ padding: 36, textAlign: "center" }}>
              No memory stores match “{query}”.
            </div>
          )}
        </div>
      )}

      {createOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <div
            className="dialog memory-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Create memory store"
          >
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Create memory store</h2>
                <p className="dialog-sub">
                  Create a new memory store to help your agents retain context
                  across conversations.
                </p>
              </div>
            </div>
            <div className="dialog-body">
              <Field label="Name" required>
                <input
                  className="input"
                  autoFocus
                  placeholder="Letters, numbers, and hyphens only (e.g., memory-store-1)"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>

              <ModelPicker
                label="Chat completions model"
                required
                deployments={deployments}
                value={chatDefault}
                onChange={setChatModel}
                onClear={() => setChatModel("")}
              />

              <ModelPicker
                label="Embedding model"
                required
                deployments={deployments}
                value={embeddingDefault}
                onChange={setEmbeddingModel}
                onClear={() => setEmbeddingModel("")}
                preferEmbedding
                fallbackModel={runtimeEmbedding}
              />

              <Field label="Description">
                <textarea
                  className="textarea"
                  placeholder="Describe what this memory store is used for"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </Field>

              <button
                className="kb-disclosure"
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
              >
                <ChevronDown20Regular
                  style={{ transform: advancedOpen ? "rotate(0deg)" : "rotate(-90deg)" }}
                />
                Advanced settings
              </button>

              {advancedOpen && (
                <div className="memory-advanced">
                  <div className="memory-advanced-group">
                    <div className="memory-advanced-title">Features</div>
                    {FEATURES.map((feature) => (
                      <label className="memory-toggle-row" key={feature.key}>
                        <span>{feature.label}</span>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={features[feature.key]}
                          aria-label={feature.label}
                          className="switch"
                          onClick={() =>
                            setFeatures((current) => ({
                              ...current,
                              [feature.key]: !current[feature.key],
                            }))
                          }
                        />
                      </label>
                    ))}
                    <div className="memory-advanced-field">
                      <span className="field-label">
                        User profile details <Info20Regular className="info-icon" />
                      </span>
                      <textarea
                        className="textarea"
                        placeholder="Specify what information to remember or avoid, e.g. dietary restrictions, preferences"
                        value={userProfileDetails}
                        onChange={(event) =>
                          setUserProfileDetails(event.target.value)
                        }
                      />
                    </div>
                  </div>
                  <Field
                    label={
                      <>
                        Default time-to-live (seconds){" "}
                        <Info20Regular className="info-icon" />
                      </>
                    }
                  >
                    <input
                      className="input"
                      inputMode="numeric"
                      placeholder="0"
                      value={ttlSeconds}
                      onChange={(event) => setTtlSeconds(event.target.value)}
                    />
                  </Field>
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" disabled={!name.trim() || busy} onClick={create}>
                {busy && <Spinner />} Create
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => {
                  setCreateOpen(false);
                  reset();
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ModelPicker({
  label,
  required,
  deployments,
  value,
  onChange,
  onClear,
  preferEmbedding,
  fallbackModel,
}: {
  label: string;
  required?: boolean;
  deployments: { id: string; name: string; modelName: string; sku: string }[];
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  preferEmbedding?: boolean;
  /** Runtime model to offer when no deployment matches (e.g. local embeddings). */
  fallbackModel?: string;
}) {
  const [open, setOpen] = useState(false);
  const options = preferEmbedding
    ? deployments.filter((deployment) => /embed/i.test(deployment.modelName))
    : deployments.filter((deployment) => !/embed/i.test(deployment.modelName));
  const list = options.length ? options : preferEmbedding ? [] : deployments;
  const selected = list.find((deployment) => deployment.name === value);
  const showFallback =
    list.length === 0 && Boolean(fallbackModel) && fallbackModel !== value;
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required">*</span>}
      </span>
      <div style={{ position: "relative" }}>
        <div className="model-picker">
          <button
            type="button"
            className="model-picker-value"
            onClick={() => setOpen((open) => !open)}
          >
            Model: {value || "Select a model"}
          </button>
          {selected && <span className="model-picker-sku">{selected.sku}</span>}
          {!selected && value && (
            <span className="model-picker-sku">Local runtime</span>
          )}
          <button
            type="button"
            className="icon-button small"
            aria-label={`Clear ${label}`}
            onClick={onClear}
          >
            <Dismiss20Regular />
          </button>
        </div>
        {open && (
          <div className="menu-popover" style={{ top: 40, left: 0, minWidth: "100%" }}>
            {list.map((deployment) => (
              <button
                key={deployment.id}
                className="menu-item"
                onClick={() => {
                  onChange(deployment.name);
                  setOpen(false);
                }}
              >
                <Add20Regular /> {deployment.name}
                <span className="spacer" />
                <span className="muted text-12">{deployment.sku}</span>
              </button>
            ))}
            {showFallback && (
              <button
                className="menu-item"
                onClick={() => {
                  onChange(fallbackModel as string);
                  setOpen(false);
                }}
              >
                <Add20Regular /> {fallbackModel}
                <span className="spacer" />
                <span className="muted text-12">Local runtime</span>
              </button>
            )}
            {list.length === 0 && !showFallback && (
              <div className="menu-item muted">No deployments available</div>
            )}
          </div>
        )}
      </div>
    </label>
  );
}
