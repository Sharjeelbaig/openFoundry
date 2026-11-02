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
  Checkmark20Regular,
  Dismiss20Regular,
  Globe20Regular,
  PeopleTeam20Regular,
  Search20Regular,
  Shield20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { LocalModel } from "@/lib/types";

interface Solution {
  id: string;
  name: string;
  category: string;
  description: string;
  icon: React.ReactNode;
  agents: {
    name: string;
    instructions: string;
    tools: string[];
    useKnowledge?: boolean;
  }[];
  knowledge?: { name: string; documentName: string; text: string };
  guardrail: "Default" | "Strict";
}

const SOLUTIONS: Solution[] = [
  {
    id: "customer-support",
    name: "Customer support desk",
    category: "Customer service",
    description:
      "A triage agent plus a product advisor grounded in your catalog. Both run on the same local model and share a knowledge base.",
    icon: <PeopleTeam20Regular />,
    guardrail: "Default",
    agents: [
      {
        name: "support-triage",
        instructions:
          "You triage customer messages. Classify the issue, state urgency, draft a short reply and say whether a human must take over. Never promise refunds or delivery dates you cannot verify.",
        tools: [],
      },
      {
        name: "product-advisor",
        instructions:
          "You are a Contoso product advisor. Answer from the connected catalog only. Recommend by conditions and budget, cite sources with [1], [2], and say when a product is not in the catalog.",
        tools: ["file-search"],
        useKnowledge: true,
      },
    ],
    knowledge: {
      name: "support-catalog",
      documentName: "contoso-outdoor-catalog.md",
      text: `# Contoso Outdoor Catalog

## Tents
- Trail Lite 2P: three-season, 2.1 kg, 2 people, $189.
- Base Camp 4P: three-season, 4.4 kg, 4 people, $329.
- Alpine Storm 2P: four-season, 2.9 kg, 2 people, $449.

## Sleeping bags
- Summer Down 30: 30°F comfort, 0.8 kg, $149.
- Winter Loft 0: 0°F comfort, 1.5 kg, $289.

## Returns
30 days with tags attached. Damaged-on-arrival replacements require a photo within 7 days.`,
    },
  },
  {
    id: "internal-policy",
    name: "Internal policy assistant",
    category: "Operations",
    description:
      "A grounded policy agent and a strict compliance reviewer that checks answers for personal data exposure.",
    icon: <Shield20Regular />,
    guardrail: "Strict",
    agents: [
      {
        name: "policy-assistant",
        instructions:
          "Answer employee policy questions only from the connected handbook. Quote the clause and cite it with [1], [2]. If the handbook is silent, say so and recommend HR or Legal.",
        tools: ["file-search"],
        useKnowledge: true,
      },
      {
        name: "policy-reviewer",
        instructions:
          "Review a draft policy answer for accuracy and privacy. Flag any personal identifiers, promises that are not in policy, and missing citations. Return a short review, not a rewrite.",
        tools: [],
      },
    ],
    knowledge: {
      name: "employee-handbook",
      documentName: "employee-handbook.md",
      text: `# Employee Handbook (excerpt)

## Remote work
Up to three remote days per week with manager approval. Fully remote needs a written exception.

## Data incidents
Report suspected incidents to security@example.com within one hour. Preserve evidence.

## Travel
Managers approve up to $2,500 per trip. Above that needs director approval. Receipts due in 14 days.

## Expenses
Meals up to $60 per day. Alcohol is not reimbursable.`,
    },
  },
  {
    id: "research-desk",
    name: "Research desk",
    category: "Research",
    description:
      "A web research agent and a brief editor. The first gathers sources, the second tightens the brief and lists unknowns.",
    icon: <Globe20Regular />,
    guardrail: "Default",
    agents: [
      {
        name: "research-scout",
        instructions:
          "You research a question using the provided web results. Summarize what is supported, label sources [W1], [W2], and separate verified facts from speculation. Note conflicts between sources.",
        tools: ["web-search"],
      },
      {
        name: "brief-editor",
        instructions:
          "You edit a research brief for clarity. Keep it under 400 words, preserve source labels, and end with a 'What we do not know' section. Do not add facts that are not in the draft.",
        tools: [],
      },
    ],
  },
  {
    id: "developer-helper",
    name: "Developer helper",
    category: "Engineering",
    description:
      "A code reviewer and an API explainer grounded in a local reference for the OpenAI-compatible endpoints.",
    icon: <Briefcase20Regular />,
    guardrail: "Default",
    agents: [
      {
        name: "code-reviewer",
        instructions:
          "Review code or a diff. Report severity, symbol, what is wrong and a concrete fix. Prioritize correctness and security. Say when the code is fine instead of inventing issues.",
        tools: [],
      },
      {
        name: "api-explainer",
        instructions:
          "Explain this project's local API using the connected reference. Include request and response shapes and cite the section with [1], [2]. Say when the reference does not cover something.",
        tools: ["file-search"],
        useKnowledge: true,
      },
    ],
    knowledge: {
      name: "local-api-reference",
      documentName: "local-api-reference.md",
      text: `# Local API reference

Base URL: http://localhost:3000/api/v1

## Chat completions
POST /deployments/<name>/chat/completions
Headers: Content-Type: application/json, api-key: <deployment key>
Body: messages, temperature, max_tokens, stream

## Streaming
Server-sent events with type delta, done or error.

## Embeddings
Ollama nomic-embed-text when installed, otherwise lexical fallback.

## Errors
404 model not loaded. 429 gateway rate limit.`,
    },
  },
];

export default function SolutionTemplatesPage() {
  const { toast } = useToast();
  const { data: modelData } = useModels(30000);
  const models = modelData?.models ?? [];

  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("All");
  const [solution, setSolution] = useState<Solution | null>(null);
  const [prefix, setPrefix] = useState("");
  const [modelKey, setModelKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string[]>([]);

  const chatModels = useMemo(
    () => models.filter((model) => model.task === "chat" || model.task === "vision"),
    [models]
  );
  const categories = ["All", ...new Set(SOLUTIONS.map((item) => item.category))];
  const filtered = SOLUTIONS.filter((item) => {
    if (category !== "All" && item.category !== category) return false;
    if (
      query &&
      !item.name.toLowerCase().includes(query.toLowerCase()) &&
      !item.description.toLowerCase().includes(query.toLowerCase())
    )
      return false;
    return true;
  });

  const open = (item: Solution) => {
    setSolution(item);
    setPrefix("");
    setCreated([]);
    const preferred =
      chatModels.find((model) => model.loaded) ||
      chatModels.find((model) => model.cached) ||
      chatModels[0];
    setModelKey(preferred?.key || "");
  };

  const deploy = async () => {
    if (!solution) return;
    const model: LocalModel | undefined =
      chatModels.find((item) => item.key === modelKey) || chatModels[0];
    if (!model) {
      toast("No chat model is available. Deploy one first.", "error");
      return;
    }
    setBusy(true);
    try {
      let knowledgeId = "";
      if (solution.knowledge) {
        const kbRes = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            name: prefix ? `${prefix}-${solution.knowledge.name}` : solution.knowledge.name,
            description: solution.description,
          }),
        });
        const kbJson = (await kbRes.json()) as { knowledgeBase?: { id: string } };
        if (kbJson.knowledgeBase) {
          knowledgeId = kbJson.knowledgeBase.id;
          await fetch("/api/knowledge", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "addText",
              id: knowledgeId,
              name: solution.knowledge.documentName,
              text: solution.knowledge.text,
            }),
          });
        }
      }

      const ids: string[] = [];
      for (const agent of solution.agents) {
        const res = await fetch("/api/agents", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: prefix ? `${prefix}-${agent.name}` : agent.name,
            description: solution.description,
            instructions: agent.instructions,
            model: model.id,
            provider: model.provider,
            tools: agent.tools,
            guardrail: solution.guardrail,
          }),
        });
        const json = (await res.json()) as { agent?: { id: string }; error?: string };
        if (!res.ok || !json.agent)
          throw new Error(json.error || `Could not create ${agent.name}`);
        ids.push(json.agent.id);
        if (agent.useKnowledge && knowledgeId) {
          await fetch(`/api/agents/${encodeURIComponent(json.agent.id)}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              knowledgeBaseIds: [knowledgeId],
              tools: agent.tools.includes("file-search")
                ? agent.tools
                : [...agent.tools, "file-search"],
            }),
          });
        }
      }
      setCreated(ids);
      toast(`${solution.name} created with ${ids.length} agents`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Deploy failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 6 }}>
        <div>
          <h1 className="page-title">Solution templates</h1>
          <p className="page-subtitle">
            Multi-agent starting points that create real agents and knowledge bases on
            this computer.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/agents" className="btn btn-secondary">
            <PeopleTeam20Regular /> Your agents
          </Link>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search solutions"
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
        <span className="muted text-12">{filtered.length} solutions</span>
      </div>

      <div className="solution-grid">
        {filtered.map((item) => (
          <div className="operate-card solution-card" key={item.id}>
            <div className="row between">
              <span className="row" style={{ gap: 10 }}>
                <span className="kb-icon">{item.icon}</span>
                <span>
                  <strong className="text-14">{item.name}</strong>
                  <div className="muted text-12">{item.category}</div>
                </span>
              </span>
              <span className="badge gray">{item.agents.length} agents</span>
            </div>
            <p className="text-12 muted" style={{ lineHeight: "18px", minHeight: 54 }}>
              {item.description}
            </p>
            <div className="solution-steps">
              {item.agents.map((agent) => (
                <div className="solution-step" key={agent.name}>
                  <PeopleTeam20Regular />
                  <span className="mono text-12">{agent.name}</span>
                  <span className="badge gray">{agent.tools[0] || "no tools"}</span>
                </div>
              ))}
              {item.knowledge && (
                <div className="solution-step">
                  <Book20Regular />
                  <span className="mono text-12">{item.knowledge.name}</span>
                  <span className="badge gray">indexed</span>
                </div>
              )}
            </div>
            <div className="row between">
              <span className={`badge ${item.guardrail === "Strict" ? "green" : "gray"}`}>
                <Shield20Regular /> {item.guardrail}
              </span>
              <button className="btn btn-sm btn-primary" onClick={() => open(item)}>
                Use solution <ArrowRight20Regular />
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="operate-card muted" style={{ gridColumn: "1 / -1", padding: 40, textAlign: "center" }}>
            No solutions match that search.
          </div>
        )}
      </div>

      <div className="banner mt-16">
        <Sparkle20Regular />
        <span>
          Creating a solution writes agents to <span className="mono">data/agents.json</span>{" "}
          and, when included, a knowledge base to{" "}
          <span className="mono">data/knowledge.json</span>. You can edit or delete
          everything afterwards.
        </span>
      </div>

      {solution && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSolution(null);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Deploy solution">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Deploy {solution.name}</h2>
                <p className="dialog-sub">
                  Creates {solution.agents.length} agents
                  {solution.knowledge ? " and one indexed knowledge base" : ""} on a
                  local model.
                </p>
              </div>
              <button className="icon-button" onClick={() => setSolution(null)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Name prefix (optional)</span>
                  <input
                    className="input"
                    placeholder="my-project"
                    value={prefix}
                    onChange={(event) => setPrefix(event.target.value)}
                  />
                  <span className="field-hint">
                    Prevents name collisions with existing agents.
                  </span>
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
                      </option>
                    ))}
                  </Select>
                </label>
              </div>

              <div className="field-label">Will be created</div>
              <div className="solution-steps">
                {solution.agents.map((agent) => (
                  <div className="solution-step" key={agent.name}>
                    <PeopleTeam20Regular />
                    <span className="mono text-12">
                      {prefix ? `${prefix}-${agent.name}` : agent.name}
                    </span>
                    <span className="badge gray">
                      {agent.useKnowledge ? "grounded" : agent.tools[0] || "prompt"}
                    </span>
                  </div>
                ))}
                {solution.knowledge && (
                  <div className="solution-step">
                    <Book20Regular />
                    <span className="mono text-12">
                      {prefix ? `${prefix}-${solution.knowledge.name}` : solution.knowledge.name}
                    </span>
                    <span className="badge gray">{solution.knowledge.documentName}</span>
                  </div>
                )}
              </div>

              {created.length > 0 && (
                <div className="banner">
                  <Checkmark20Regular />
                  <span>
                    Created {created.length} agents. They are ready to open and test.
                  </span>
                </div>
              )}
            </div>
            <div className="dialog-footer">
              {created.length > 0 ? (
                <>
                  <button className="btn btn-secondary" onClick={() => setSolution(null)}>
                    Close
                  </button>
                  <Link href="/build/agents" className="btn btn-primary">
                    Open agents
                  </Link>
                </>
              ) : (
                <>
                  <button className="btn btn-secondary" onClick={() => setSolution(null)}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={deploy}
                    disabled={busy || !modelKey}
                  >
                    {busy ? <Spinner /> : <Add20Regular />} Create solution
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
