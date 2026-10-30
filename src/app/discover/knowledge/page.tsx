"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowRight20Regular,
  Book20Regular,
  Code20Regular,
  Database20Regular,
  Dismiss20Regular,
  DocumentText20Regular,
  Globe20Regular,
  Search20Regular,
  Shield20Regular,
} from "@fluentui/react-icons";
import { formatDate, useKnowledge } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { KnowledgeBase } from "@/lib/types";

interface Pack {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  documentName: string;
  text: string;
}

const PACKS: Pack[] = [
  {
    id: "employee-handbook",
    name: "Employee handbook",
    category: "Operations",
    description:
      "Remote work, travel, expenses and incident reporting clauses to ground an internal policy agent.",
    icon: <Shield20Regular />,
    documentName: "employee-handbook.md",
    text: `# Employee Handbook (excerpt)

## Remote work
Employees may work remotely up to three days per week with manager approval. Fully remote arrangements require a written exception from the department head.

## Data incidents
Report any suspected data incident to security@example.com within one hour of discovery. Do not investigate alone or delete evidence.

## Travel
Managers may approve travel up to $2,500 per trip. Amounts above require director approval. Receipts are due within 14 days.

## Expenses
Meals are reimbursed up to $60 per day. Alcohol is not reimbursable.

## Equipment
New employees receive a laptop and a $300 home-office allowance in their first month. Replacements require IT approval.`,
  },
  {
    id: "product-catalog",
    name: "Outdoor product catalog",
    category: "Retail",
    description:
      "Tents, sleeping bags and packs with prices, weights and return policy — pairs with the gear advisor agent.",
    icon: <Book20Regular />,
    documentName: "contoso-outdoor-catalog.md",
    text: `# Contoso Outdoor Catalog

## Tents
- Trail Lite 2P: three-season, 2.1 kg, 2 people, $189. Ripstop polyester fly, two doors.
- Base Camp 4P: three-season, 4.4 kg, 4 people, $329. Extra vestibule, aluminum poles.
- Alpine Storm 2P: four-season, 2.9 kg, 2 people, $449. Rated for snow load and high wind.

## Sleeping bags
- Summer Down 30: comfort rating 30°F / -1°C, 0.8 kg, $149.
- Winter Loft 0: comfort rating 0°F / -18°C, 1.5 kg, $289. Draft collar and insulated hood.

## Packs
- Daybreak 22: 22 L daypack, 0.6 kg, $79.
- Trekker 55: 55 L adjustable torso, 1.7 kg, $219.

## Policies
Returns accepted within 30 days with tags attached. Damaged-on-arrival items are replaced at no cost when reported within 7 days with a photo.`,
  },
  {
    id: "api-reference",
    name: "API reference notes",
    category: "Engineering",
    description:
      "A compact OpenAI-compatible API reference so an agent can answer integration questions with citations.",
    icon: <Code20Regular />,
    documentName: "local-api-reference.md",
    text: `# Local API reference

## Base URL
http://localhost:3000/api/v1

## Chat completions
POST /deployments/<name>/chat/completions

Headers:
- Content-Type: application/json
- api-key: the deployment key shown in Models → Deployments

Body:
- messages: array of {role, content}
- temperature: 0 to 2, default 0.7
- max_tokens: integer
- stream: boolean

## Streaming
When stream is true the response is server-sent events. Each data frame contains a JSON object with type delta, done or error.

## Embeddings
Embeddings are produced locally by Ollama nomic-embed-text when that model is pulled. Otherwise retrieval falls back to lexical scoring, which is reported in the knowledge base details.

## Errors
404 means the model is not loaded in the local runtime. 429 is returned by the AI Gateway when its per-minute limit is exceeded.`,
  },
  {
    id: "research-notes",
    name: "On-device inference notes",
    category: "Research",
    description:
      "A short brief on quantisation, memory use and throughput trade-offs for local models.",
    icon: <Globe20Regular />,
    documentName: "on-device-inference.md",
    text: `# On-device inference notes

## Quantisation
4-bit quantisation roughly quarters weight size versus fp16. Quality loss is usually small for instruction following but can show up in arithmetic and long-context recall.

## Memory
A model needs its weights plus a KV cache. The KV cache grows with context length and batch size. Two models loaded at once compete for the same unified memory on Apple Silicon.

## Throughput
Token generation is usually memory-bandwidth bound. Prompt processing is compute bound. Smaller models feel faster mainly because they read fewer weights per token.

## Practical guidance
- Start with a 0.5B to 3B model for agent plumbing.
- Measure latency with real prompts rather than published benchmarks.
- Keep one embedding model and one chat model resident when memory is tight.`,
  },
];

export default function DiscoverKnowledgePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, refresh } = useKnowledge();
  const bases = data?.knowledgeBases ?? [];

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [pack, setPack] = useState<Pack | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const categories = ["All", ...new Set(PACKS.map((item) => item.category))];
  const filtered = PACKS.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    if (
      query &&
      !item.name.toLowerCase().includes(query.toLowerCase()) &&
      !item.description.toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const open = (item: Pack) => {
    setPack(item);
    setName(item.id);
  };

  const create = async () => {
    if (!pack || !name.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          description: pack.description,
        }),
      });
      const json = (await res.json()) as { knowledgeBase?: KnowledgeBase; error?: string };
      if (!res.ok || !json.knowledgeBase)
        throw new Error(json.error || "Could not create the knowledge base");
      const add = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "addText",
          id: json.knowledgeBase.id,
          name: pack.documentName,
          text: pack.text,
        }),
      });
      if (!add.ok) throw new Error("The pack was created but indexing failed");
      toast(`${pack.name} indexed locally`, "success");
      setPack(null);
      refresh();
      router.push(`/build/knowledge/${encodeURIComponent(json.knowledgeBase.id)}`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const chunks = useMemo(
    () => bases.reduce((sum, base) => sum + base.documents.reduce((n, doc) => n + doc.chunks.length, 0), 0),
    [bases]
  );

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Knowledge</h1>
          <p className="page-subtitle">
            Starter knowledge packs you can index on this computer, plus the bases you
            already own.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/knowledge/search" className="btn btn-secondary">
            <Database20Regular /> Your knowledge ({bases.length})
          </Link>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search knowledge packs"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <select
          className="select"
          style={{ width: 200 }}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
        >
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </select>
        <span className="grow" />
        <span className="muted text-12">
          {bases.length} bases · {chunks} chunks indexed
        </span>
      </div>

      <div className="template-grid">
        {filtered.map((item) => (
          <div className="operate-card template-card" key={item.id}>
            <div className="row between">
              <span className="row" style={{ gap: 10 }}>
                <span className="kb-icon">{item.icon}</span>
                <span>
                  <strong className="text-14">{item.name}</strong>
                  <div className="muted text-12">{item.category}</div>
                </span>
              </span>
              <span className="badge gray">Starter pack</span>
            </div>
            <p className="text-12 muted" style={{ lineHeight: "18px", minHeight: 54 }}>
              {item.description}
            </p>
            <div className="template-prompts">
              <span className="template-prompt">
                <DocumentText20Regular /> {item.documentName}
              </span>
              <span className="template-prompt">
                {item.text.length.toLocaleString()} characters ·{" "}
                {Math.max(1, Math.ceil(item.text.length / 900))} chunks
              </span>
            </div>
            <div className="row between">
              <span className="badge gray">Indexed with local embeddings</span>
              <button className="btn btn-sm btn-primary" onClick={() => open(item)}>
                Add pack <ArrowRight20Regular />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="operate-card muted" style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center" }}>
            No knowledge packs match that search.
          </div>
        )}
      </div>

      {bases.length > 0 && (
        <>
          <div className="discover-section-head" style={{ marginTop: 28 }}>
            <h2 className="discover-section-title">Your knowledge bases</h2>
            <Link href="/build/knowledge/search" className="btn btn-sm btn-secondary">
              Manage all
            </Link>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 120 }}>Documents</th>
                  <th style={{ width: 100 }}>Chunks</th>
                  <th style={{ width: 220 }}>Embedding model</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 170 }}>Updated</th>
                  <th style={{ width: 90 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {bases.map((base) => (
                  <tr key={base.id}>
                    <td className="cell-strong">{base.name}</td>
                    <td>{base.documents.length}</td>
                    <td>
                      {base.documents.reduce((sum, doc) => sum + doc.chunks.length, 0)}
                    </td>
                    <td className="truncate" style={{ maxWidth: 220 }}>
                      {base.embeddingModel}
                    </td>
                    <td>{base.status}</td>
                    <td>{formatDate(base.updatedAt)}</td>
                    <td>
                      <Link
                        href={`/build/knowledge/${encodeURIComponent(base.id)}`}
                        className="btn btn-sm btn-outline"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {pack && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPack(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Add knowledge pack">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add {pack.name}</h2>
                <p className="dialog-sub">
                  Creates a knowledge base and indexes the pack with the same embedding
                  path agents use.
                </p>
              </div>
              <button className="icon-button" onClick={() => setPack(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Knowledge base name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="field-label">Preview · {pack.documentName}</div>
              <pre className="chunk-preview" style={{ maxHeight: 260, overflow: "auto", whiteSpace: "pre-wrap" }}>
                {pack.text}
              </pre>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setPack(null)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={create} disabled={busy || !name.trim()}>
                {busy ? <Spinner /> : <Add20Regular />} Create and index
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
