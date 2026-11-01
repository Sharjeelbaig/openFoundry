"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent, ToolCatalogEntry } from "@/lib/types";

export default function SkillsPanel() {
  const { toast } = useToast();
  const { data: skillData, loading } = useApi<{ tools: ToolCatalogEntry[] }>(
    "/api/tools/catalog?type=Skills"
  );
  const { data: agentData, refresh: refreshAgents } = useApi<{ agents: Agent[] }>(
    "/api/agents"
  );
  const skills = skillData?.tools ?? [];
  const agents = agentData?.agents ?? [];

  const [query, setQuery] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busyId, setBusyId] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<ToolCatalogEntry | null>(null);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      `${skill.name} ${skill.summary} ${skill.tags.join(" ")}`.toLowerCase().includes(needle)
    );
  }, [skills, query]);

  const attach = async (skill: ToolCatalogEntry) => {
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) {
      toast("Create an agent first.", "error");
      return;
    }
    const id = `skill:${skill.id}`;
    if (agent.tools.includes(id)) {
      toast(`${skill.name} is already attached to ${agent.name}.`, "info");
      return;
    }
    setBusyId(skill.id);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...agent.tools, id] }),
      });
      if (!res.ok) throw new Error("Could not attach the skill.");
      toast(`${skill.name} attached to ${agent.name}`, "success");
      refreshAgents();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Attach failed.", "error");
    } finally {
      setBusyId("");
    }
  };

  const createAgent = async (skill: ToolCatalogEntry) => {
    const modelId = window.prompt("Chat model id (for example functiongemma:latest or qwen2.5-coder:1.5b-instruct)") || "";
    const provider = window.prompt("Provider (foundry, ollama, lmstudio or llamacpp)") || "";
    if (!modelId || !provider) return;
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${skill.name}-agent`,
          description: `Agent using the ${skill.name} local skill.`,
          model: modelId,
          provider,
          instructions:
            "Use the attached local skill when it is relevant. Follow the skill instructions and translate cloud-only steps to the local workspace.",
          tools: [`skill:${skill.id}`],
        }),
      });
      const json = (await res.json()) as { agent?: Agent; error?: string };
      if (!res.ok || !json.agent)
        throw new Error(json.error || "Could not create the agent.");
      toast(`Agent ${json.agent.name} created`, "success");
      window.location.assign(`/build/agents/${encodeURIComponent(json.agent.id)}/build`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Create failed.", "error");
    }
  };

  return (
    <section>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>
            Skills
          </h2>
          <p className="page-subtitle">
            Reusable local skill manifests. Attach one to an agent or create an
            agent from it.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/discover/tools" className="btn btn-secondary">
            Browse skill catalog
          </Link>
        </div>
      </div>

      <div className="catalog-toolbar">
        <div className="search-input">
          <input
            className="input"
            placeholder="Search skills"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search skills"
          />
        </div>
        <span className="grow" />
        <span className="muted text-12">{filtered.length} skills</span>
      </div>

      {loading ? (
        <div className="empty" style={{ paddingTop: 40 }}>
          <Spinner /> Loading skills…
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty" style={{ paddingTop: 40 }}>
          <Sparkle20Regular />
          <h2>No skills found</h2>
          <p>Skills are reusable instruction packs from the local catalog.</p>
          <Link href="/discover/tools" className="btn btn-secondary">
            Browse skills
          </Link>
        </div>
      ) : (
        <div className="tool-detail-grid">
          {filtered.map((skill) => (
            <div className="operate-card tool-detail-card" key={skill.id}>
              <div className="row between">
                <span className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">
                    <Sparkle20Regular />
                  </span>
                  <span>
                    <strong className="text-14">{skill.name}</strong>
                    <div className="muted text-12">Skills · Local skill</div>
                  </span>
                </span>
              </div>
              <p className="text-13 muted" style={{ lineHeight: "20px" }}>
                {skill.summary}
              </p>
              <div className="row mt-8" style={{ gap: 8, flexWrap: "wrap" }}>
                <select
                  className="select"
                  style={{ width: 190 }}
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                  aria-label="Agent"
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                    </option>
                  ))}
                  {agents.length === 0 && <option value="">No agents</option>}
                </select>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void attach(skill)}
                  disabled={busyId === skill.id || agents.length === 0}
                >
                  {busyId === skill.id ? <Spinner /> : <Add20Regular />} Attach
                </button>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void createAgent(skill)}
                >
                  Create agent
                </button>
                <Link
                  href={`/discover/tools/${skill.slug}`}
                  className="btn btn-sm btn-secondary"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
