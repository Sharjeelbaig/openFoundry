// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowRight20Regular,
  Book20Regular,
  Briefcase20Regular,
  Code20Regular,
  Dismiss20Regular,
  Filter20Regular,
  PeopleTeam20Regular,
  Search20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi, useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { Agent, LocalModel } from "@/lib/types";

interface Template {
  id: string;
  name: string;
  category: string;
  description: string;
  instructions: string;
  icon: React.ReactNode;
  prompts: string[];
  tools: string[];
  seed?: { name: string; text: string };
}

const TEMPLATES: Template[] = [
  {
    id: "outdoor-gear",
    name: "Outdoor gear advisor",
    category: "Retail",
    description:
      "Answers product questions from a local catalog, recommends gear by conditions and cites the source document.",
    instructions:
      "You are a Contoso outdoor gear specialist. Answer questions about camping and hiking products using only the connected knowledge base. Recommend gear by weather, trip length and experience level. Always cite the source document with [1], [2]. If a product is not in the catalog, say so instead of inventing it.",
    icon: <Briefcase20Regular />,
    prompts: [
      "What should I pack for a three-day rainy hike?",
      "Compare the two-person and four-person tents.",
      "Do you have a sleeping bag rated for freezing temperatures?",
    ],
    tools: ["file-search"],
    seed: {
      name: "contoso-outdoor-catalog.md",
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
  },
  {
    id: "support-triage",
    name: "Support triage agent",
    category: "Customer service",
    description:
      "Classifies incoming support messages, proposes a reply and escalates anything that needs a human.",
    instructions:
      "You are a support triage assistant. For each message: (1) classify the issue as billing, shipping, product defect, account access or other; (2) state urgency as low, medium or high; (3) draft a short, empathetic reply; (4) say whether a human must take over. Never promise a refund or a delivery date you cannot verify.",
    icon: <PeopleTeam20Regular />,
    prompts: [
      "My order arrived with a cracked lid.",
      "I was charged twice this month.",
      "I cannot sign in after changing my email.",
    ],
    tools: [],
  },
  {
    id: "policy-helper",
    name: "Policy and compliance helper",
    category: "Operations",
    description:
      "Answers employee policy questions with citations and refuses to guess when a policy is missing.",
    instructions:
      "You are an internal policy assistant. Answer only from the connected knowledge base. Quote the relevant clause and cite it with [1], [2]. If the policy does not cover the question, say the policy is silent and recommend contacting HR or Legal. Do not provide legal advice.",
    icon: <Book20Regular />,
    prompts: [
      "How many days of remote work are allowed?",
      "What is the process for reporting a data incident?",
      "Can I approve travel above my limit?",
    ],
    tools: ["file-search"],
    seed: {
      name: "employee-handbook.md",
      text: `# Employee Handbook (excerpt)

## Remote work
Employees may work remotely up to three days per week with manager approval. Fully remote arrangements require a written exception from the department head.

## Data incidents
Report any suspected data incident to eng.sharjeel.baig@gmail.com within one hour of discovery. Do not attempt to investigate alone or delete evidence.

## Travel
Managers may approve travel up to $2,500 per trip. Amounts above that require director approval. Receipts are due within 14 days.

## Expenses
Meals are reimbursed up to $60 per day. Alcohol is not reimbursable.`,
    },
  },
  {
    id: "code-reviewer",
    name: "Code review assistant",
    category: "Engineering",
    description:
      "Reviews a diff for correctness, security and readability, and labels each finding by severity.",
    instructions:
      "You are a senior code reviewer. Review the provided diff or code snippet. Report findings as: severity (blocker, major, minor), file or symbol, what is wrong, and a concrete fix. Prioritize correctness and security over style. If the code is correct, say so and list residual risks. Do not invent line numbers that are not present.",
    icon: <Code20Regular />,
    prompts: [
      "Review this function for SQL injection.",
      "What is wrong with this React effect?",
      "Is this retry loop safe under concurrency?",
    ],
    tools: [],
  },
  {
    id: "meeting-notes",
    name: "Meeting notes summarizer",
    category: "Productivity",
    description:
      "Turns a transcript into decisions, owners and follow-ups without adding facts that were not said.",
    instructions:
      "You summarize meeting transcripts. Produce: a two-sentence summary, a list of decisions, a table of action items with owner and due date when stated, and open questions. Only use information present in the transcript. If an owner or date is not stated, write 'unassigned' or 'not stated'.",
    icon: <Sparkle20Regular />,
    prompts: [
      "Summarize this transcript and list action items.",
      "What decisions were made about the launch date?",
    ],
    tools: [],
  },
  {
    id: "research-brief",
    name: "Research brief writer",
    category: "Research",
    description:
      "Searches the web for a question and produces a short brief with sources and uncertainty called out.",
    instructions:
      "You write concise research briefs. When web search results are provided, use them and cite each source with its [W1], [W2] label. Distinguish verified facts from speculation. If sources conflict, say so. Keep the brief under 400 words with a short 'What we do not know' section.",
    icon: <Sparkle20Regular />,
    prompts: [
      "Brief me on the current state of local LLM runtimes.",
      "Compare two approaches to on-device embeddings.",
    ],
    tools: ["web-search"],
  },
];

export default function DiscoverAgentsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: modelData } = useModels(30000);
  const { data: agentData, refresh } = useApi<{ agents: Agent[] }>("/api/agents");
  const models = modelData?.models ?? [];
  const agents = agentData?.agents ?? [];

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [template, setTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [withKnowledge, setWithKnowledge] = useState(true);
  const [busy, setBusy] = useState(false);

  const chatModels = useMemo(
    () => models.filter((model) => model.task === "chat" || model.task === "vision"),
    [models]
  );
  const categories = ["All", ...new Set(TEMPLATES.map((item) => item.category))];

  const filtered = TEMPLATES.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    if (
      query &&
      !item.name.toLowerCase().includes(query.toLowerCase()) &&
      !item.description.toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const open = (item: Template) => {
    setTemplate(item);
    setName(item.id);
    setWithKnowledge(Boolean(item.seed));
    const preferred =
      chatModels.find((model) => model.loaded) ||
      chatModels.find((model) => model.cached) ||
      chatModels[0];
    setModelKey(preferred?.key || "");
  };

  const create = async () => {
    if (!template || !name.trim()) return;
    const model: LocalModel | undefined =
      chatModels.find((item) => item.key === modelKey) || chatModels[0];
    if (!model) {
      toast("No chat model is available. Deploy one first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          description: template.description,
          instructions: template.instructions,
          model: model.id,
          provider: model.provider,
          tools: template.tools,
          guardrail: "Default",
        }),
      });
      const json = (await res.json()) as { agent?: Agent; error?: string };
      if (!res.ok || !json.agent) throw new Error(json.error || "Could not create the agent");

      if (withKnowledge && template.seed) {
        const kbRes = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            name: `${name}-knowledge`,
            description: `Starter knowledge for ${name}`,
          }),
        });
        const kbJson = (await kbRes.json()) as {
          knowledgeBase?: { id: string };
          error?: string;
        };
        if (kbJson.knowledgeBase) {
          await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "addText",
              id: kbJson.knowledgeBase.id,
              name: template.seed.name,
              text: template.seed.text,
            }),
          });
          await fetch(`/api/agents/${encodeURIComponent(json.agent.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              knowledgeBaseIds: [kbJson.knowledgeBase.id],
              tools: template.tools.includes("file-search")
                ? template.tools
                : [...template.tools, "file-search"],
            }),
          });
        }
      }

      toast(`${template.name} created from template`, "success");
      setTemplate(null);
      refresh();
      router.push(`/build/agents/${encodeURIComponent(json.agent.id)}/build`);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Agents</h1>
          <p className="page-subtitle">
            Start from a working template. Templates create a real agent on this
            computer — nothing is provisioned.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/agents" className="btn btn-secondary">
            <PeopleTeam20Regular /> Your agents ({agents.length})
          </Link>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search agent templates"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <Select
          className="select"
          style={{ width: 220 }}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          aria-label="Category"
        >
          {categories.map((item) => (
            <option key={item}>{item}</option>
          ))}
        </Select>
        <span className="grow" />
        <span className="muted text-12 row" style={{ gap: 6 }}>
          <Filter20Regular /> {filtered.length} templates
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
              <span className="badge gray">Prompt agent</span>
            </div>
            <p className="text-12 muted" style={{ lineHeight: "18px", minHeight: 54 }}>
              {item.description}
            </p>
            <div className="template-prompts">
              {item.prompts.slice(0, 3).map((prompt) => (
                <span key={prompt} className="template-prompt">
                  {prompt}
                </span>
              ))}
            </div>
            <div className="row between">
              <span className="row" style={{ gap: 4 }}>
                {item.tools.map((tool) => (
                  <span className="badge gray" key={tool}>
                    {tool}
                  </span>
                ))}
                {item.seed && <span className="badge gray">starter knowledge</span>}
              </span>
              <button className="btn btn-sm btn-primary" onClick={() => open(item)}>
                Use template <ArrowRight20Regular />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="operate-card muted" style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center" }}>
            No templates match that search.
          </div>
        )}
      </div>

      {agents.length > 0 && (
        <>
          <div className="discover-section-head" style={{ marginTop: 28 }}>
            <h2 className="discover-section-title">Your agents</h2>
            <Link href="/build/agents" className="btn btn-sm btn-secondary">
              Manage all
            </Link>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th style={{ width: 130 }}>Version</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th style={{ width: 160 }}>Tools</th>
                  <th style={{ width: 200 }}>Model</th>
                  <th style={{ width: 100 }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id}>
                    <td className="cell-strong">{agent.name}</td>
                    <td>{agent.version}</td>
                    <td>
                      <StatusBadge status={agent.status} />
                    </td>
                    <td className="truncate" style={{ maxWidth: 160 }}>
                      {agent.tools.length ? agent.tools.join(", ") : "—"}
                    </td>
                    <td className="truncate" style={{ maxWidth: 200 }}>
                      {agent.model}
                    </td>
                    <td>
                      <Link
                        href={`/build/agents/${encodeURIComponent(agent.id)}/build`}
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

      {template && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setTemplate(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Create agent from template">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Use {template.name}</h2>
                <p className="dialog-sub">
                  Creates an agent with the template instructions on a local model.
                </p>
              </div>
              <button className="icon-button" onClick={() => setTemplate(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Model</span>
                <Select
                  className="select"
                  value={modelKey}
                  onChange={(event) => setModelKey(event.target.value)}
                >
                  {chatModels.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.displayName} · {model.providerLabel}
                      {model.cached ? " · downloaded" : " · download on first use"}
                    </option>
                  ))}
                  {chatModels.length === 0 && <option value="">No chat models available</option>}
                </Select>
              </label>
              {template.seed && (
                <label className="switch-row">
                  <input
                    type="checkbox"
                    checked={withKnowledge}
                    onChange={(event) => setWithKnowledge(event.target.checked)}
                  />
                  <span>
                    Create and attach starter knowledge (“{template.seed.name}”)
                  </span>
                </label>
              )}
              <div className="banner">
                <Sparkle20Regular />
                <span>
                  Tools: {template.tools.length ? template.tools.join(", ") : "none"}.
                  Instructions are editable in the builder after creation.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setTemplate(null)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={create}
                disabled={busy || !name.trim() || !modelKey}
              >
                {busy ? <Spinner /> : <Add20Regular />} Create agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
