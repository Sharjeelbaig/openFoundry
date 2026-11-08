// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowClockwise20Regular,
  ArrowLeft20Regular,
  ArrowSync20Regular,
  Attach20Regular,
  Book20Regular,
  ChatAdd20Regular,
  Checkmark20Regular,
  CheckmarkCircle16Filled,
  ChevronDown20Regular,
  ChevronUp20Regular,
  Code20Filled,
  Code20Regular,
  Delete20Regular,
  Dismiss20Regular,
  DocumentArrowDown20Regular,
  MoreHorizontal20Regular,
  Open16Regular,
  Options20Regular,
  Play20Regular,
  Save20Regular,
  Send20Regular,
  Server20Regular,
  Settings20Regular,
  Shield20Regular,
  Sparkle20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { formatDate, formatNumber, formatVersionStamp, useApi, useDeployments, useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import ModelSelect from "@/components/ModelSelect";
import type {
  Agent,
  Citation,
  Guardrail,
  KnowledgeBase,
  LocalSkill,
  McpServer,
  ToolCatalogEntry,
  Toolbox,
  ToolApprovalRecord,
  Trace,
} from "@/lib/types";
import { ToolApprovalCard } from "@/components/ToolApprovalCard";
import { useOrigin } from "@/components/Origin";

type BuilderTab =
  | "Playground"
  | "Details"
  | "Traces"
  | "Insights"
  | "Monitor"
  | "Evaluation"
  | "Optimize";

const TABS: { id: BuilderTab; tag?: string }[] = [
  { id: "Playground" },
  { id: "Details" },
  { id: "Traces" },
  { id: "Insights", tag: "Preview" },
  { id: "Monitor" },
  { id: "Evaluation" },
  { id: "Optimize" },
];

interface ChatTurn {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  error?: string;
}

export default function AgentBuilder({ agentId }: { agentId: string }) {
  const publicOrigin = useOrigin();
  const router = useRouter();
  const { toast } = useToast();
  const { data, error, refresh } = useApi<{ agent: Agent }>(
    `/api/agents/${encodeURIComponent(agentId)}`
  );
  const { data: modelData } = useModels(30000);
  const { data: deploymentData } = useDeployments(5000);
  const { data: knowledgeData, refresh: refreshKnowledge } = useApi<{
    knowledgeBases: KnowledgeBase[];
  }>("/api/knowledge");
  const { data: memoryData } = useApi<{ stores: { id: string; name: string }[] }>(
    "/api/memory"
  );
  const { data: guardrailData } = useApi<{
    guardrails: Guardrail[];
  }>("/api/guardrails");
  const { data: mcpData } = useApi<{ servers: McpServer[] }>(
    "/api/mcp",
    15000
  );
  const { data: toolboxData } = useApi<{ toolboxes: Toolbox[] }>(
    "/api/toolboxes",
    15000
  );
  const { data: skillData } = useApi<{ tools: ToolCatalogEntry[] }>(
    "/api/tools/catalog?type=Skills"
  );
  const { data: localSkillData } = useApi<{ skills: LocalSkill[] }>(
    "/api/skills"
  );
  const tracesApi = useApi<{ traces: Trace[] }>(
    `/api/traces?agentId=${encodeURIComponent(agentId)}`,
    4000
  );

  const agent = data?.agent;
  const models = modelData?.models ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const knowledgeBases = knowledgeData?.knowledgeBases ?? [];
  const memoryStores = memoryData?.stores ?? [];
  const guardrailResources = guardrailData?.guardrails ?? [];
  const mcpServers = mcpData?.servers ?? [];
  const toolboxes = toolboxData?.toolboxes ?? [];
  const skills = skillData?.tools ?? [];
  const localSkills = localSkillData?.skills ?? [];
  const traces = tracesApi.data?.traces ?? [];

  const mcpToolEntries = useMemo(
    () =>
      mcpServers.flatMap((server) =>
        server.tools.map((tool) => ({
          id: `mcp:${server.id}:${tool.name}`,
          server,
          tool,
          label: `${server.name} · ${tool.name}`,
          description: tool.description || "Tool from an MCP server",
        }))
      ),
    [mcpServers]
  );

  const skillEntries = useMemo(
    () =>
      skills.map((skill) => ({
        id: `skill:${skill.id}`,
        label: `${skill.name} · local skill`,
        description: skill.summary.slice(0, 180),
      })),
    [skills]
  );

  const localSkillEntries = useMemo(
    () =>
      localSkills.map((skill) => ({
        id: `skill:local:${skill.id}`,
        label: `${skill.name} · local skill`,
        description: skill.description || "Local skill",
      })),
    [localSkills]
  );

  const toolboxEntries = useMemo(
    () =>
      toolboxes.map((toolbox) => ({
        id: `toolbox:${toolbox.id}`,
        label: `${toolbox.name} · toolbox`,
        description:
          toolbox.description ||
          `${toolbox.toolIds.length} tools${
            toolbox.toolSearch ? " · tool search" : ""
          }`,
      })),
    [toolboxes]
  );

  const [tab, setTab] = useState<BuilderTab>("Playground");
  const [modelKey, setModelKey] = useState("");
  const [instructions, setInstructions] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.95);
  const [maxTokens, setMaxTokens] = useState(1024);
  const [voiceMode, setVoiceMode] = useState(false);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryStoreId, setMemoryStoreId] = useState("");
  const [guardrail, setGuardrail] = useState<Agent["guardrail"]>("Default");
  const [guardrailId, setGuardrailId] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [knowledgeIds, setKnowledgeIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sections, setSections] = useState({
    instructions: true,
    tools: true,
    knowledge: false,
    memory: false,
    guardrail: false,
  });
  const [paramsOpen, setParamsOpen] = useState(false);
  const [chatParamsOpen, setChatParamsOpen] = useState(false);
  const [addToolsOpen, setAddToolsOpen] = useState(false);
  const [knowledgeOpen, setKnowledgeOpen] = useState(false);
  const [codeOpen, setCodeOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [versionOpen, setVersionOpen] = useState(false);
  const [metricsOpen, setMetricsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<"Chat" | "YAML">("Chat");
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [approvals, setApprovals] = useState<ToolApprovalRecord[]>([]);
  const [usage, setUsage] = useState<{
    promptTokens: number;
    completionTokens: number;
    latencyMs: number;
    model: string;
    embeddingModel: string;
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [version, setVersion] = useState<number | null>(null);
  const [evalRunning, setEvalRunning] = useState(false);
  const [evalResults, setEvalResults] = useState<
    { prompt: string; output: string; latencyMs: number; ok: boolean }[]
  >([]);
  const [evalPrompt, setEvalPrompt] = useState("");
  const [uploading, setUploading] = useState(false);
  const [endpointOpenFor, setEndpointOpenFor] = useState<"curl" | "python" | null>(null);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hydrated = useRef(false);
  const modelHydrated = useRef(false);

  useEffect(() => {
    if (!agent || hydrated.current) return;
    hydrated.current = true;
    setInstructions(agent.instructions);
    setTemperature(agent.temperature);
    setTopP(agent.topP);
    setMaxTokens(agent.maxTokens);
    setVoiceMode(agent.voiceMode);
    setMemoryEnabled(Boolean(agent.memoryEnabled));
    setMemoryStoreId(agent.memoryStoreId || "");
    setGuardrail(agent.guardrail || "Default");
    setGuardrailId(agent.guardrailId || "");
    setTools(agent.tools);
    setKnowledgeIds(agent.knowledgeBaseIds);
    setName(agent.name);
    setDescription(agent.description);
    setVersion(agent.version);
  }, [agent, models]);

  /*
   * Resolve the picker's value from the agent once the model list has arrived.
   * The list is fetched in parallel with the agent, so it can land a moment
   * later; resolving against an empty list would leave the control blank.
   */
  useEffect(() => {
    if (!agent || modelHydrated.current || !models.length) return;
    modelHydrated.current = true;
    setModelKey(
      models.find((m) => m.id === agent.model)?.key ||
        models.find((m) => m.provider === agent.provider)?.key ||
        `foundry:${agent.model}`
    );
  }, [agent, models]);

  useEffect(() => {
    if (!agent?.memoryEnabled) return;
    try {
      const raw = localStorage.getItem(`foundry-local:memory:${agent.id}`);
      if (raw) setMessages(JSON.parse(raw) as ChatTurn[]);
    } catch {
      // ignore
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agent?.id]);

  useEffect(() => {
    if (!agent) return;
    try {
      if (memoryEnabled && messages.length) {
        localStorage.setItem(
          `foundry-local:memory:${agent.id}`,
          JSON.stringify(messages.slice(-40))
        );
      }
    } catch {
      // ignore
    }
  }, [messages, memoryEnabled, agent]);

  useEffect(() => {
    chatBodyRef.current?.scrollTo({
      top: chatBodyRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, streaming]);

  const currentModel = useMemo(
    () => models.find((model) => model.key === modelKey),
    [models, modelKey]
  );

  const dirty = useMemo(() => {
    if (!agent) return false;
    return (
      instructions !== agent.instructions ||
      name !== agent.name ||
      description !== agent.description ||
      voiceMode !== agent.voiceMode ||
      memoryEnabled !== Boolean(agent.memoryEnabled) ||
      (memoryStoreId || "") !== (agent.memoryStoreId || "") ||
      (guardrailId || "") !== (agent.guardrailId || "") ||
      (guardrail || "Default") !== (agent.guardrail || "Default") ||
      temperature !== agent.temperature ||
      topP !== agent.topP ||
      maxTokens !== agent.maxTokens ||
      JSON.stringify(tools) !== JSON.stringify(agent.tools) ||
      JSON.stringify(knowledgeIds) !== JSON.stringify(agent.knowledgeBaseIds) ||
      Boolean(currentModel && currentModel.id !== agent.model)
    );
  }, [
    agent,
    instructions,
    name,
    description,
    voiceMode,
    memoryEnabled,
    memoryStoreId,
    guardrail,
    guardrailId,
    temperature,
    topP,
    maxTokens,
    tools,
    knowledgeIds,
    currentModel,
  ]);

  const save = useCallback(
    async (silent = false) => {
      if (!agent) return;
      setSaving(true);
      try {
        const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            description,
            instructions,
            model: currentModel?.id || agent.model,
            provider: currentModel?.provider || agent.provider,
            temperature,
            topP,
            maxTokens,
            voiceMode,
            memoryEnabled,
            memoryStoreId: memoryStoreId || undefined,
            guardrail,
            guardrailId: guardrailId || undefined,
            tools,
            knowledgeBaseIds: knowledgeIds,
          }),
        });
        if (!res.ok) throw new Error("Save failed");
        const json = (await res.json()) as { agent: Agent };
        setVersion(json.agent.version);
        refresh();
        if (!silent) toast("Agent saved", "success");
      } catch (error) {
        toast(error instanceof Error ? error.message : "Save failed", "error");
      } finally {
        setSaving(false);
      }
    },
    [
      agent,
      name,
      description,
      instructions,
      currentModel,
      temperature,
      topP,
      maxTokens,
      voiceMode,
      memoryEnabled,
      memoryStoreId,
      guardrail,
      guardrailId,
      tools,
      knowledgeIds,
      refresh,
      toast,
    ]
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        if (dirty) void save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dirty, save]);

  const publish = async (action: "publish" | "stop") => {
    if (!agent) return;
    setPublishOpen(false);
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    if (!res.ok) {
      toast("Publish failed", "error");
      return;
    }
    toast(
      action === "publish" ? "Agent published locally" : "Agent stopped",
      "success"
    );
    refresh();
  };

  const removeAgent = async () => {
    if (!agent) return;
    setMoreOpen(false);
    const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast("Delete failed", "error");
      return;
    }
    toast("Agent deleted", "success");
    router.push("/build/agents");
  };

  const send = async (override?: string, base?: ChatTurn[]) => {
    const text = (override ?? input).trim();
    if (!text || streaming || !agent) return;
    if (!currentModel) {
      toast("Pick a model first", "error");
      return;
    }
    const userTurn: ChatTurn = { role: "user", content: text };
    const next = [...(base ?? messages), userTurn];
    setMessages(next);
    if (override === undefined) setInput("");
    setApprovals([]);
    setStreaming(true);
    let assistant = "";
    let citations: Citation[] = [];
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          model: currentModel.id,
          provider: currentModel.provider,
          instructions,
          knowledgeBaseIds: knowledgeIds,
          guardrail,
          guardrailId: guardrailId || undefined,
          memoryStoreId: memoryStoreId || undefined,
          tools,
          temperature,
          topP,
          maxTokens,
          saveTrace: !dirty,
          messages: next.map((turn) => ({
            role: turn.role,
            content: turn.content,
          })),
        }),
      });
      if (!res.ok || !res.body) throw new Error("The local model did not respond");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      setMessages((current) => [...current, { role: "assistant", content: "" }]);
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) {
          const line = frame.split("\n").find((l) => l.startsWith("data:"));
          if (!line) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          const event = JSON.parse(payload) as {
            type: string;
            text?: string;
            message?: string;
            citations?: Citation[];
            promptTokens?: number;
            completionTokens?: number;
            latencyMs?: number;
            model?: string;
            embeddingModel?: string;
            approval?: ToolApprovalRecord;
            id?: string;
            status?: string;
          };
          if (event.type === "meta") {
            citations = event.citations || [];
          } else if (event.type === "approval_required" && event.approval) {
            const approval = event.approval;
            setApprovals((current) =>
              current.some((item) => item.id === approval.id)
                ? current
                : [...current, approval]
            );
          } else if (event.type === "approval_decided" && event.id) {
            setApprovals((current) =>
              current.filter((item) => item.id !== event.id)
            );
          } else if (event.type === "delta" && event.text) {
            assistant += event.text;
            setMessages((current) => {
              const copy = [...current];
              copy[copy.length - 1] = { role: "assistant", content: assistant };
              return copy;
            });
          } else if (event.type === "done") {
            setUsage({
              promptTokens: event.promptTokens || 0,
              completionTokens: event.completionTokens || 0,
              latencyMs: event.latencyMs || 0,
              model: event.model || currentModel.id,
              embeddingModel: event.embeddingModel || "none",
            });
            setMessages((current) => {
              const copy = [...current];
              copy[copy.length - 1] = {
                role: "assistant",
                content: assistant,
                citations: event.citations || citations,
              };
              return copy;
            });
            tracesApi.refresh();
          } else if (event.type === "error") {
            throw new Error(event.message || "Model request failed");
          }
        }
      }
    } catch (error) {
      setApprovals([]);
      const message = error instanceof Error ? error.message : "Model request failed";
      setMessages((current) => {
        const copy = [...current];
        if (copy[copy.length - 1]?.role === "assistant") {
          copy[copy.length - 1] = {
            role: "assistant",
            content: assistant,
            error: message,
          };
        } else {
          copy.push({ role: "assistant", content: "", error: message });
        }
        return copy;
      });
    } finally {
      setStreaming(false);
    }
  };

  /** Re-run the last user turn, dropping the reply that followed it. */
  const regenerate = () => {
    if (streaming) return;
    const lastUserIndex = [...messages]
      .map((turn, index) => ({ turn, index }))
      .reverse()
      .find((entry) => entry.turn.role === "user")?.index;
    if (lastUserIndex === undefined) return;
    const lastUser = messages[lastUserIndex];
    void send(lastUser.content, messages.slice(0, lastUserIndex));
  };

  const uploadFiles = async (files: FileList | null) => {
    if (!files || !files.length || !agent) return;
    setUploading(true);
    try {
      let kb = knowledgeBases.find((item) => knowledgeIds.includes(item.id));
      if (!kb) {
        const res = await fetch("/api/knowledge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "create",
            name: `${agent.name}-knowledge`,
            description: `Documents uploaded from the ${agent.name} agent builder.`,
          }),
        });
        const json = (await res.json()) as { knowledgeBase: KnowledgeBase };
        kb = json.knowledgeBase;
        setKnowledgeIds((current) => [...current, kb!.id]);
        refreshKnowledge();
      }
      const form = new FormData();
      form.set("knowledgeBaseId", kb.id);
      for (const file of Array.from(files)) form.append("files", file);
      const res = await fetch("/api/knowledge", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string; documents?: unknown[] };
      if (!res.ok) throw new Error(json.error || "Upload failed");
      toast(
        `Indexed ${json.documents?.length || 0} file(s) into ${kb.name}`,
        "success"
      );
      refreshKnowledge();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const runEvaluation = async () => {
    if (!agent) return;
    setEvalRunning(true);
    const prompts = [
      "Introduce yourself and explain what you can help with.",
      "What information do you have access to right now?",
      evalPrompt.trim() || "Give a short, useful answer to a typical customer question.",
    ].filter(Boolean);
    const results: typeof evalResults = [];
    for (const prompt of prompts) {
      const started = Date.now();
      let output = "";
      let ok = false;
      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agent.id,
            model: currentModel?.id || agent.model,
            provider: currentModel?.provider || agent.provider,
            instructions,
            knowledgeBaseIds: knowledgeIds,
            guardrail,
            guardrailId: guardrailId || undefined,
            memoryStoreId: memoryStoreId || undefined,
            tools,
            temperature,
            maxTokens: Math.min(maxTokens, 300),
            saveTrace: false,
            messages: [{ role: "user", content: prompt }],
          }),
        });
        if (!res.body) throw new Error("No response");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const line = frame.split("\n").find((l) => l.startsWith("data:"));
            if (!line) continue;
            const event = JSON.parse(line.slice(5).trim()) as {
              type: string;
              text?: string;
              message?: string;
            };
            if (event.type === "delta" && event.text) output += event.text;
            if (event.type === "error") throw new Error(event.message);
          }
        }
        ok = output.trim().length > 0;
      } catch (error) {
        output = error instanceof Error ? error.message : "Failed";
        ok = false;
      }
      results.push({ prompt, output, latencyMs: Date.now() - started, ok });
    }
    setEvalResults(results);
    setEvalRunning(false);
    toast("Evaluation finished on the local runtime", "success");
    tracesApi.refresh();
  };

  if (error)
    return (
      <div className="page">
        <div className="banner error">{error}</div>
        <Link href="/build/agents" className="btn btn-secondary mt-16">
          Back to agents
        </Link>
      </div>
    );

  if (!agent)
    return (
      <div className="page row" style={{ gap: 10, color: "var(--fg-3)" }}>
        <Spinner /> Loading agent…
      </div>
    );

  const yaml = [
    `name: ${name}`,
    `description: ${description || '""'}`,
    `model: ${currentModel?.id || agent.model}`,
    `provider: ${currentModel?.provider || agent.provider}`,
    "instructions: |",
    ...instructions.split("\n").map((line) => `  ${line}`),
    "parameters:",
    `  temperature: ${temperature}`,
    `  top_p: ${topP}`,
    `  max_tokens: ${maxTokens}`,
    `voice_mode: ${voiceMode}`,
    `memory: ${memoryEnabled}`,
    `guardrail: ${guardrail || "Default"}`,
    "tools:",
    ...(tools.length ? tools.map((tool) => `  - ${tool}`) : ["  []"]),
    "knowledge_bases:",
    ...(knowledgeIds.length
      ? knowledgeIds.map((id) => `  - ${id}`)
      : ["  []"]),
    `endpoint: ${publicOrigin}/api/chat`,
  ].join("\n");

  const section = (key: keyof typeof sections) =>
    setSections((current) => ({ ...current, [key]: !current[key] }));

  /** Shared model-parameter popover, reachable from the picker row and the chat header. */
  const paramsMenu = (
    <div className="menu-popover" style={{ right: 0, top: 38, width: 300 }}>
      <div className="menu-head">
        <strong>Model parameters</strong>
        <button
          className="icon-button small"
          onClick={() => {
            setParamsOpen(false);
            setChatParamsOpen(false);
          }}
          aria-label="Close"
        >
          <Dismiss20Regular />
        </button>
      </div>
      <div className="menu-body">
        <label className="field mb-12">
          <span className="field-label">Temperature · {temperature.toFixed(2)}</span>
          <input
            type="range"
            className="range"
            min={0}
            max={2}
            step={0.05}
            value={temperature}
            onChange={(e) => setTemperature(Number(e.target.value))}
          />
        </label>
        <label className="field mb-12">
          <span className="field-label">Top P · {topP.toFixed(2)}</span>
          <input
            type="range"
            className="range"
            min={0}
            max={1}
            step={0.01}
            value={topP}
            onChange={(e) => setTopP(Number(e.target.value))}
          />
        </label>
        <label className="field">
          <span className="field-label">Max tokens</span>
          <input
            className="input"
            type="number"
            min={16}
            max={8192}
            value={maxTokens}
            onChange={(e) => setMaxTokens(Number(e.target.value))}
          />
        </label>
      </div>
    </div>
  );

  const selectedGuardrail =
    guardrailResources.find((resource) => resource.id === guardrailId) ||
    guardrailResources.find((resource) => resource.name === "DefaultV2") ||
    guardrailResources.find((resource) => resource.name === "Default") ||
    guardrailResources[0];

  /** "Content harms (4), Jailbreak (1)" style summary of a guardrail's controls. */
  const guardrailRiskLine = (resource: Guardrail | undefined, withControls: boolean) => {
    const controls = (resource?.controls ?? []).filter(
      (control) => control.enabled === withControls
    );
    const groups = [...new Set(controls.map((control) => control.group))];
    if (groups.length === 0) return "None";
    return groups
      .map((group) =>
        withControls
          ? `${group} (${controls.filter((c) => c.group === group).length})`
          : group
      )
      .join(", ");
  };

  return (
    <div className="agent-builder">
      <div className="builder-head">
        <div className="builder-title-row">
          <button
            className="icon-button head-back"
            aria-label="Back"
            title="Back"
            onClick={() => router.push("/build/agents")}
          >
            <ArrowLeft20Regular />
          </button>
          <h1 className="builder-title" title={name}>
            {name}
          </h1>
          {agent.status === "Running" ? (
            <span className="head-status" role="img" aria-label="Agent running">
              <CheckmarkCircle16Filled />
            </span>
          ) : (
            <span className="status-dot muted" title={agent.status} />
          )}
        </div>
        <div className="builder-actions">
          <div style={{ position: "relative" }}>
            <button
              className="head-version"
              onClick={() => setVersionOpen(!versionOpen)}
              aria-expanded={versionOpen}
            >
              <span className="head-version-label">Version:</span>
              <span className="head-version-value">
                {version ?? agent.version} (
                {formatVersionStamp(
                  agent.history.find((h) => h.version === (version ?? agent.version))
                    ?.savedAt || agent.updatedAt
                )}
                )
                <ChevronDown20Regular className="head-version-chevron" />
              </span>
            </button>
            {versionOpen && (
              <div className="menu-popover" style={{ right: 0, top: 28, minWidth: 250 }}>
                <div className="muted text-12" style={{ padding: "6px 10px" }}>
                  VERSION HISTORY
                </div>
                {agent.history.map((entry) => (
                  <button
                    className="menu-item"
                    key={entry.version}
                    onClick={() => {
                      setVersion(entry.version);
                      setInstructions(entry.instructions);
                      const found = models.find((m) => m.id === entry.model);
                      if (found) setModelKey(found.key);
                      setVersionOpen(false);
                    }}
                  >
                    <span style={{ flex: 1 }}>Version {entry.version}</span>
                    <span className="muted text-12">{formatDate(entry.savedAt)}</span>
                    {(version ?? agent.version) === entry.version && (
                      <Checkmark20Regular />
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            className="head-btn head-btn-save"
            disabled={!dirty || saving}
            onClick={() => save()}
          >
            {saving ? <Spinner /> : null} Save
          </button>
          <button
            className="head-btn head-btn-code"
            onClick={() => setCodeOpen(true)}
          >
            <Code20Filled /> Continue in code
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="head-btn head-btn-publish"
              aria-label="Publish"
              aria-expanded={publishOpen}
              onClick={() => setPublishOpen(!publishOpen)}
            >
              Publish
              <ChevronDown20Regular className="head-publish-chevron" />
            </button>
            {publishOpen && (
              <div className="menu-popover" style={{ right: 0, top: 36, minWidth: 240 }}>
                <button className="menu-item" onClick={() => publish("publish")}>
                  <Play20Regular /> Publish new version
                </button>
                <button className="menu-item" onClick={() => setCodeOpen(true)}>
                  <Code20Regular /> View endpoint samples
                </button>
                <button className="menu-item" onClick={() => publish("stop")}>
                  <Shield20Regular /> Stop the agent
                </button>
              </div>
            )}
          </div>
          <div style={{ position: "relative" }}>
            <button
              className="icon-button head-more"
              aria-label="More actions"
              onClick={() => setMoreOpen(!moreOpen)}
            >
              <MoreHorizontal20Regular />
            </button>
            {moreOpen && (
              <div className="menu-popover" style={{ right: 0, top: 36, minWidth: 210 }}>
                <button
                  className="menu-item"
                  onClick={() => {
                    setMoreOpen(false);
                    setTab("Details");
                  }}
                >
                  <Settings20Regular /> Agent details
                </button>
                <button
                  className="menu-item"
                  onClick={async () => {
                    setMoreOpen(false);
                    const blob = new Blob([yaml], { type: "text/yaml" });
                    const url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = `${agent.name}.yaml`;
                    link.click();
                    URL.revokeObjectURL(url);
                    toast("Agent YAML downloaded", "success");
                  }}
                >
                  <DocumentArrowDown20Regular /> Download YAML
                </button>
                <div className="divider" style={{ margin: "4px 0" }} />
                <button className="menu-item" onClick={removeAgent}>
                  <Delete20Regular /> Delete agent
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="tabbar builder-tabs">
        {TABS.map((item) => (
          <button
            key={item.id}
            className={`tab${tab === item.id ? " active" : ""}`}
            onClick={() => setTab(item.id)}
          >
            {item.id}
            {item.tag && <span className="preview-tag">{item.tag}</span>}
          </button>
        ))}
      </div>

      {tab === "Playground" && (
        <div className="builder-body">
          <div className="builder-config">
            <div className="config-scroll">
              <div className="config-card config-card-top">
                <div className="model-select-row">
                  <ModelSelect
                    deployments={deployments}
                    models={models}
                    value={modelKey}
                    onChange={setModelKey}
                    onBrowseMore={() => router.push("/discover/models")}
                  />
                  <div style={{ position: "relative" }}>
                    <button
                      className="icon-button model-params"
                      aria-label="Parameters"
                      title="Parameters"
                      onClick={() => setParamsOpen(!paramsOpen)}
                    >
                      <Options20Regular />
                    </button>
                    {paramsOpen && paramsMenu}
                  </div>
                </div>

                <div className="voice-card">
                  <span className="voice-copy">
                    <span className="voice-title">Voice mode</span>
                    <span className="voice-desc">
                      Switch the agent to a voice-first experience.
                    </span>
                  </span>
                  <button
                    role="switch"
                    aria-checked={voiceMode}
                    aria-label="Voice mode"
                    className="switch"
                    onClick={() => setVoiceMode(!voiceMode)}
                  />
                </div>
              </div>

              <div className="config-card">
                <button
                  className="config-head"
                  aria-expanded={sections.instructions}
                  onClick={() => section("instructions")}
                >
                  <span>Instructions</span>
                  {sections.instructions ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                </button>
                {sections.instructions && (
                  <div className="config-body">
                    <textarea
                      className="textarea config-instructions"
                      placeholder="Write your prompt here to give your agent instructions."
                      value={instructions}
                      onChange={(event) => setInstructions(event.target.value)}
                    />
                    <button className="btn-pill" onClick={() => setTab("Optimize")}>
                      Improve instructions
                    </button>
                  </div>
                )}
              </div>

              <div className="config-card">
                <button
                  className="config-head"
                  aria-expanded={sections.tools}
                  onClick={() => section("tools")}
                >
                  <span>Tools</span>
                  {sections.tools ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                </button>
                {sections.tools && (
                  <div className="config-body stack">
                    <p className="config-desc">
                      Build a unified endpoint for invoking tools and agents, leverage tool
                      search to save input tokens.{" "}
                      <a
                        className="config-link"
                        href="https://learn.microsoft.com/azure/ai-foundry/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Learn more about toolbox <Open16Regular />
                      </a>
                    </p>
                    {tools.includes("web-search") && (
                      <div className="banner info">
                        <Shield20Regular />
                        <span>
                          Web search uses DuckDuckGo from this machine at request time. It has
                          no cloud cost, but results leave your computer to the search provider.
                        </span>
                      </div>
                    )}
                    {tools.includes("web-search") && (
                      <div className="tool-row">
                        <Wrench20Regular />
                        <span className="grow">Web search</span>
                        <span className="badge green">Enabled</span>
                        <button
                          className="icon-button small"
                          aria-label="Remove web search"
                          onClick={() => setTools(tools.filter((t) => t !== "web-search"))}
                        >
                          <Dismiss20Regular />
                        </button>
                      </div>
                    )}
                    {tools.includes("file-search") && (
                      <div className="tool-row">
                        <Book20Regular />
                        <span className="grow">Local file search</span>
                        <span className="badge green">Enabled</span>
                        <button
                          className="icon-button small"
                          aria-label="Remove file search"
                          onClick={() => setTools(tools.filter((t) => t !== "file-search"))}
                        >
                          <Dismiss20Regular />
                        </button>
                      </div>
                    )}
                    {tools.includes("file-search") && knowledgeIds.length === 0 && (
                      <p className="config-desc">
                        Add a knowledge base in the Knowledge section: file search reads
                        those indexes and has nothing to search without one.
                      </p>
                    )}
                    {tools.includes("calculator") && (
                      <div className="tool-row">
                        <Options20Regular />
                        <span className="grow">Calculator</span>
                        <span className="badge green">Enabled</span>
                        <button
                          className="icon-button small"
                          aria-label="Remove calculator"
                          onClick={() => setTools(tools.filter((t) => t !== "calculator"))}
                        >
                          <Dismiss20Regular />
                        </button>
                      </div>
                    )}
                    {tools
                      .filter((id) => id.startsWith("mcp:"))
                      .map((id) => {
                        const entry = mcpToolEntries.find((item) => item.id === id);
                        return (
                          <div className="tool-row" key={id}>
                            <Server20Regular />
                            <span className="grow">
                              {entry ? entry.label : "Unavailable MCP tool"}
                              {entry && (
                                <span className="muted text-12" style={{ display: "block" }}>
                                  {entry.description}
                                </span>
                              )}
                            </span>
                            <span className="badge green">Enabled</span>
                            <button
                              className="icon-button small"
                              aria-label={`Remove ${entry?.tool.name || id}`}
                              onClick={() => setTools(tools.filter((t) => t !== id))}
                            >
                              <Dismiss20Regular />
                            </button>
                          </div>
                        );
                      })}
                    {tools
                      .filter((id) => id.startsWith("skill:"))
                      .map((id) => {
                        const entry =
                          skillEntries.find((item) => item.id === id) ||
                          localSkillEntries.find((item) => item.id === id);
                        return (
                          <div className="tool-row" key={id}>
                            <Sparkle20Regular />
                            <span className="grow">
                              {entry ? entry.label : "Local skill"}
                              {entry && (
                                <span className="muted text-12" style={{ display: "block" }}>
                                  {entry.description}
                                </span>
                              )}
                            </span>
                            <span className="badge green">Skill</span>
                            <button
                              className="icon-button small"
                              aria-label={`Remove ${entry?.label || id}`}
                              onClick={() => setTools(tools.filter((t) => t !== id))}
                            >
                              <Dismiss20Regular />
                            </button>
                          </div>
                        );
                      })}
                      {tools
                        .filter((id) => id.startsWith("toolbox:"))
                        .map((id) => {
                          const entry = toolboxEntries.find((item) => item.id === id);
                          return (
                            <div className="tool-row" key={id}>
                              <Wrench20Regular />
                              <span className="grow">
                                {entry ? entry.label : "Toolbox"}
                                {entry && (
                                  <span className="muted text-12" style={{ display: "block" }}>
                                    {entry.description}
                                  </span>
                                )}
                              </span>
                              <span className="badge green">Toolbox</span>
                              <button
                                className="icon-button small"
                                aria-label={`Remove ${entry?.label || id}`}
                                onClick={() => setTools(tools.filter((t) => t !== id))}
                              >
                                <Dismiss20Regular />
                              </button>
                            </div>
                          );
                        })}
                    <div className="row" style={{ gap: 10, position: "relative" }}>
                      <button
                        className="btn-pill lg add-tools"
                        onClick={() => setAddToolsOpen(!addToolsOpen)}
                      >
                        Add <ChevronDown20Regular />
                      </button>
                      <button
                        className="btn-pill lg"
                        onClick={() => fileRef.current?.click()}
                      >
                        Upload files
                      </button>
                      <input
                        ref={fileRef}
                        type="file"
                        multiple
                        hidden
                        accept=".txt,.md,.csv,.json,.html,.pdf"
                        onChange={(event) => uploadFiles(event.target.files)}
                      />
                      {addToolsOpen && (
                        <div
                          className="menu-popover"
                          style={{
                            left: 0,
                            top: 38,
                            minWidth: 280,
                            maxHeight: 320,
                            overflowY: "auto",
                          }}
                        >
                          {[
                            {
                              id: "web-search",
                              label: "Web search",
                              desc: "DuckDuckGo results injected as context",
                            },
                            {
                              id: "file-search",
                              label: "Local file search",
                              desc: "Retrieve from connected knowledge bases",
                            },
                            {
                              id: "calculator",
                              label: "Calculator",
                              desc: "Evaluate arithmetic in prompts",
                            },
                            ...mcpToolEntries.map((entry) => ({
                              id: entry.id,
                              label: entry.label,
                              desc: entry.description,
                            })),
                            ...skillEntries.map((entry) => ({
                              id: entry.id,
                              label: entry.label,
                              desc: entry.description,
                            })),
                            ...localSkillEntries.map((entry) => ({
                              id: entry.id,
                              label: entry.label,
                              desc: entry.description,
                            })),
                            ...toolboxEntries.map((entry) => ({
                              id: entry.id,
                              label: entry.label,
                              desc: entry.description,
                            })),
                          ].map((tool) => (
                            <button
                              key={tool.id}
                              className="menu-item"
                              style={{ height: "auto", padding: "8px 10px", alignItems: "flex-start" }}
                              onClick={() => {
                                if (!tools.includes(tool.id)) setTools([...tools, tool.id]);
                                setAddToolsOpen(false);
                              }}
                            >
                              <span>
                                <span style={{ display: "block" }}>{tool.label}</span>
                                <span className="muted text-12" style={{ display: "block" }}>
                                  {tool.desc}
                                </span>
                              </span>
                              {tools.includes(tool.id) && <Checkmark20Regular />}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div className="config-card">
                <button
                  className="config-head"
                  aria-expanded={sections.knowledge}
                  onClick={() => section("knowledge")}
                >
                  <span>Knowledge</span>
                  {sections.knowledge ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                </button>
                {sections.knowledge && (
                  <div className="config-body stack">
                    <p className="config-desc">
                      Add knowledge bases for grounding.{" "}
                      <a
                        className="config-link"
                        href="https://learn.microsoft.com/azure/ai-foundry/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Learn more <Open16Regular />
                      </a>{" "}
                      about best practices.
                    </p>
                    {knowledgeIds.length > 0 && (
                      <div className="stack" style={{ gap: 6 }}>
                        {knowledgeIds.map((id) => {
                          const kb = knowledgeBases.find((item) => item.id === id);
                          return (
                            <div className="row between" key={id}>
                              <span className="row" style={{ gap: 8 }}>
                                <Book20Regular style={{ color: "var(--fg-3)" }} />
                                <span>
                                  <span className="text-14" style={{ display: "block" }}>
                                    {kb?.name || id}
                                  </span>
                                  <span className="text-12 muted">
                                    {kb
                                      ? `${kb.documents.length} documents · ${kb.embeddingModel}`
                                      : "Loading..."}
                                  </span>
                                </span>
                              </span>
                              <button
                                className="icon-button small"
                                aria-label="Remove knowledge base"
                                onClick={() =>
                                  setKnowledgeIds(knowledgeIds.filter((item) => item !== id))
                                }
                              >
                                <Dismiss20Regular />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <button className="btn-pill lg" onClick={() => setKnowledgeOpen(true)}>
                      Add <ChevronDown20Regular />
                    </button>
                  </div>
                )}
              </div>

              <div className="config-card">
                <button
                  className="config-head"
                  aria-expanded={sections.memory}
                  onClick={() => section("memory")}
                >
                  <span className="row" style={{ gap: 8 }}>
                    Memory <span className="preview-tag">Preview</span>
                  </span>
                  {sections.memory ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                </button>
                {sections.memory && (
                  <div className="config-body stack">
                    <p className="config-desc">
                      Memory retains context to personalize and improve interactions. A memory
                      store will be auto-created for you. It will use the model you have deployed
                      for this agent.{" "}
                      <a
                        className="config-link"
                        href="https://learn.microsoft.com/azure/ai-foundry/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Learn more <Open16Regular />
                      </a>{" "}
                      about cost.
                    </p>
                    {memoryStores.length > 0 ? (
                      <>
                        <Select
                          className="select"
                          value={memoryStoreId}
                          aria-label="Memory store"
                          onChange={(e) => {
                            setMemoryStoreId(e.target.value);
                            setMemoryEnabled(Boolean(e.target.value));
                          }}
                        >
                          <option value="">No memory store</option>
                          {memoryStores.map((store) => (
                            <option key={store.id} value={store.id}>
                              {store.name}
                            </option>
                          ))}
                        </Select>
                        <p className="text-12 muted">
                          The store extracts durable facts from each turn and recalls the most
                          relevant ones into the system prompt.
                        </p>
                      </>
                    ) : (
                      <Link className="btn-pill lg" href="/build/memory">
                        Add <ChevronDown20Regular />
                      </Link>
                    )}
                  </div>
                )}
              </div>

              <div className="config-card">
                <button
                  className="config-head"
                  aria-expanded={sections.guardrail}
                  onClick={() => section("guardrail")}
                >
                  <span className="row" style={{ gap: 8 }}>
                    Guardrail <span className="preview-tag">Preview</span>
                  </span>
                  {sections.guardrail ? <ChevronUp20Regular /> : <ChevronDown20Regular />}
                </button>
                {sections.guardrail && (
                  <div className="config-body stack">
                    <p className="config-desc">
                      Add safety and security controls to your guardrail to help reduce risks and
                      support deployments.{" "}
                      <a
                        className="config-link"
                        href="https://learn.microsoft.com/azure/ai-foundry/"
                        target="_blank"
                        rel="noreferrer"
                      >
                        Learn more <Open16Regular />
                      </a>
                    </p>
                    <div className="guardrail-summary">
                      <span>
                        Name: <strong>{selectedGuardrail?.name || "Default"}</strong>
                      </span>
                      <span>Risks with controls: {guardrailRiskLine(selectedGuardrail, true)}</span>
                      <span>
                        Risks without controls: {guardrailRiskLine(selectedGuardrail, false)}
                      </span>
                    </div>
                    <Select
                      className="select"
                      value={guardrailId}
                      aria-label="Guardrail"
                      onChange={(e) => setGuardrailId(e.target.value)}
                    >
                      <option value="">Default safety prompt</option>
                      {guardrailResources.map((resource) => (
                        <option key={resource.id} value={resource.id}>
                          {resource.name}
                        </option>
                      ))}
                    </Select>
                    {!guardrailId && (
                      <p className="text-12 muted">
                        This agent has not been assigned a guardrail. It is inheriting its
                        model&apos;s guardrail.
                      </p>
                    )}
                    {!guardrailId && (
                      <Select
                        className="select"
                        value={guardrail}
                        aria-label="Guardrail mode"
                        onChange={(e) => setGuardrail(e.target.value as Agent["guardrail"])}
                      >
                        <option value="Default">Default</option>
                        <option value="Strict">Strict</option>
                        <option value="Off">Off</option>
                      </Select>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="config-footer">
              <button className="btn-pill" onClick={() => setTab("Optimize")}>
                <Sparkle20Regular /> Optimize <ChevronDown20Regular />
              </button>
            </div>
          </div>

          <div className="builder-chat">
            <div className="chat-head">
              <div className="chat-tabs" role="tablist">
                <button
                  role="tab"
                  aria-selected={chatMode === "Chat"}
                  className={`chat-tab${chatMode === "Chat" ? " active" : ""}`}
                  onClick={() => setChatMode("Chat")}
                >
                  Chat
                </button>
                <button
                  role="tab"
                  aria-selected={chatMode === "YAML"}
                  className={`chat-tab${chatMode === "YAML" ? " active" : ""}`}
                  onClick={() => setChatMode("YAML")}
                >
                  YAML
                </button>
              </div>
              <span className="spacer" />
              <div style={{ position: "relative" }}>
                <button className="chat-head-btn" onClick={() => setMetricsOpen(!metricsOpen)}>
                  Metrics <ChevronDown20Regular />
                </button>
                {metricsOpen && (
                  <div className="menu-popover" style={{ right: 0, top: 32, width: 280 }}>
                    <div className="menu-head">
                      <strong>Last response</strong>
                      <button className="icon-button small" onClick={() => setMetricsOpen(false)} aria-label="Close">
                        <Dismiss20Regular />
                      </button>
                    </div>
                    <div className="menu-body">
                      {usage ? (
                        <div className="stack text-12" style={{ gap: 6 }}>
                          <span className="row between"><span className="muted">Model</span><span>{usage.model}</span></span>
                          <span className="row between"><span className="muted">Prompt tokens</span><span>{usage.promptTokens}</span></span>
                          <span className="row between"><span className="muted">Completion tokens</span><span>{usage.completionTokens}</span></span>
                          <span className="row between"><span className="muted">Latency</span><span>{usage.latencyMs} ms</span></span>
                          <span className="row between"><span className="muted">Embeddings</span><span className="truncate" style={{ maxWidth: 150 }}>{usage.embeddingModel}</span></span>
                        </div>
                      ) : (
                        <p className="muted text-12">Send a message to see tokens and latency.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <div style={{ position: "relative" }}>
                <button
                  className="icon-button small"
                  aria-label="Configure chat parameters"
                  title="Configure"
                  onClick={() => setChatParamsOpen(!chatParamsOpen)}
                >
                  <Settings20Regular />
                </button>
                {chatParamsOpen && paramsMenu}
              </div>
              <button
                className="icon-button small"
                aria-label="New chat"
                title="New chat"
                onClick={() => {
                  setMessages([]);
                  setUsage(null);
                  if (agent) localStorage.removeItem(`foundry-local:memory:${agent.id}`);
                }}
              >
                <ChatAdd20Regular />
              </button>
            </div>

            <div className="chat-feed" ref={chatBodyRef}>
              {chatMode === "YAML" ? (
                <pre className="yaml-view">{yaml}</pre>
              ) : messages.length === 0 ? (
                <div className="chat-empty">
                  <h2>{name}</h2>
                  <p>Send a message to start testing your agent</p>
                </div>
              ) : (
                <div className="chat-messages">
                  {messages.map((turn, index) => (
                    <div className={`chat-msg ${turn.role}`} key={index}>
                      <span className="chat-msg-label">
                        {turn.role === "user" ? "You" : name}
                      </span>
                      <div className="chat-bubble">
                        {turn.content}
                        {streaming &&
                          index === messages.length - 1 &&
                          turn.role === "assistant" && <span className="chat-streaming" />}
                      </div>
                      {turn.citations && turn.citations.length > 0 && (
                        <div className="chat-citations">
                          {turn.citations.map((citation, citationIndex) => (
                            <div className="chat-citation" key={citationIndex}>
                              [{citationIndex + 1}] {citation.documentName} ·{" "}
                              {citation.score.toFixed(3)}
                              <div className="mt-4">{citation.chunk.slice(0, 240)}...</div>
                            </div>
                          ))}
                        </div>
                      )}
                      {turn.error && <div className="banner error">{turn.error}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {chatMode === "Chat" && (
              <>
                {approvals.map((approval) => (
                  <ToolApprovalCard
                    key={approval.id}
                    approval={approval}
                    onDecision={(approvalId) =>
                      setApprovals((current) =>
                        current.filter((item) => item.id !== approvalId)
                      )
                    }
                  />
                ))}
                <div className="chat-input-wrap">
                  <textarea
                    className="chat-input"
                    placeholder="Message the agent..."
                    value={input}
                    onChange={(event) => setInput(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void send();
                      }
                    }}
                  />
                  <div className="chat-input-actions">
                    <button
                      className="icon-button small"
                      aria-label="Attach files"
                      title="Attach files"
                      onClick={() => fileRef.current?.click()}
                    >
                      <Attach20Regular />
                    </button>
                    <span className="spacer" />
                    <button
                      className="icon-button small"
                      aria-label="Regenerate the last reply"
                      title="Regenerate the last reply"
                      disabled={streaming || !messages.some((turn) => turn.role === "user")}
                      onClick={() => regenerate()}
                    >
                      <ArrowSync20Regular />
                    </button>
                    <button
                      className="icon-button send-button"
                      aria-label="Send"
                      title="Send"
                      disabled={streaming || !input.trim()}
                      onClick={() => void send()}
                    >
                      {streaming ? <Spinner /> : <Send20Regular />}
                    </button>
                  </div>
                </div>
                <div className="chat-disclaimer">AI-generated content may be incorrect</div>
              </>
            )}
          </div>
        </div>
      )}

      {tab === "Details" && (
        <div className="builder-tab-content">
          <div className="operate-grid">
            <div className="stack" style={{ gap: 16 }}>
              <div className="operate-card stack" style={{ gap: 14 }}>
                <h3>Identity</h3>
                <label className="field">
                  <span className="field-label">Agent name</span>
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
                <label className="field">
                  <span className="field-label">Description</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 64 }}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What this agent is for"
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Model</span>
                    <ModelSelect
                      deployments={deployments}
                      models={models}
                      value={modelKey}
                      onChange={setModelKey}
                      onBrowseMore={() => router.push("/discover/models")}
                    />
                  </label>
                  <label className="field">
                    <span className="field-label">Voice mode</span>
                    <span className="row" style={{ height: 32 }}>
                      <button
                        role="switch"
                        aria-checked={voiceMode}
                        aria-label="Voice mode"
                        className="switch"
                        onClick={() => setVoiceMode(!voiceMode)}
                      />
                      <span className="muted text-12">{voiceMode ? "Voice-first" : "Text"}</span>
                    </span>
                  </label>
                </div>
                <label className="field">
                  <span className="field-label">Instructions</span>
                  <textarea
                    className="textarea"
                    style={{ minHeight: 180 }}
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                  />
                </label>
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Temperature</span>
                    <input className="input" type="number" step={0.05} value={temperature} onChange={(e) => setTemperature(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Top P</span>
                    <input className="input" type="number" step={0.01} value={topP} onChange={(e) => setTopP(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Max tokens</span>
                    <input className="input" type="number" value={maxTokens} onChange={(e) => setMaxTokens(Number(e.target.value))} />
                  </label>
                  <label className="field">
                    <span className="field-label">Guardrail</span>
                    <Select className="select" value={guardrail} onChange={(e) => setGuardrail(e.target.value as Agent["guardrail"])}>
                      <option value="Default">Default</option>
                      <option value="Strict">Strict</option>
                      <option value="Off">Off</option>
                    </Select>
                  </label>
                </div>
                <div className="row">
                  <button className="btn btn-primary" disabled={!dirty || saving} onClick={() => save()}>
                    <Save20Regular /> Save changes
                  </button>
                  <Link href="/build/agents" className="btn btn-secondary">
                    Back to list
                  </Link>
                </div>
              </div>

              <div className="operate-card">
                <h3 className="mb-12">Version history</h3>
                <div className="stack">
                  {agent.history.map((entry) => (
                    <div className="history-row" key={entry.version}>
                      <span className="version-pill">{entry.version}</span>
                      <span className="grow text-13">
                        {entry.instructions.slice(0, 110)}
                      </span>
                      <span className="muted text-12">{formatDate(entry.savedAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="stack" style={{ gap: 16 }}>
              <div className="operate-card">
                <h3 className="mb-12">Deployment</h3>
                <div className="manage-layout">
                  <div>
                    <div className="manage-field-label">Status</div>
                    <StatusBadge status={agent.status} />
                  </div>
                  <div>
                    <div className="manage-field-label">Version</div>
                    <div className="manage-field-value">{agent.version}</div>
                  </div>
                  <div>
                    <div className="manage-field-label">Published</div>
                    <div className="manage-field-value">{formatDate(agent.publishedAt)}</div>
                  </div>
                  <div>
                    <div className="manage-field-label">Created</div>
                    <div className="manage-field-value">{formatDate(agent.createdAt)}</div>
                  </div>
                </div>
                <div className="mt-16">
                  <div className="manage-field-label">Endpoint</div>
                  <div className="credential-row">
                    <div className="credential-value mono">{`${publicOrigin}/api/chat`}</div>
                    <CopyButton value={`${publicOrigin}/api/chat`} label="Copy endpoint" className="credential-copy" />
                  </div>
                </div>
                <button className="btn btn-secondary mt-12" onClick={() => setCodeOpen(true)}>
                  <Code20Regular /> Get code
                </button>
              </div>
              <div className="operate-card">
                <h3 className="mb-12">Connected resources</h3>
                <div className="stack text-13">
                  <div className="row between">
                    <span className="muted">Model runtime</span>
                    <span>{currentModel?.providerLabel || agent.provider}</span>
                  </div>
                  <div className="row between">
                    <span className="muted">Model</span>
                    <span className="truncate" style={{ maxWidth: 220 }}>{currentModel?.id || agent.model}</span>
                  </div>
                  <div className="row between">
                    <span className="muted">Knowledge bases</span>
                    <span>{knowledgeIds.length}</span>
                  </div>
                  <div className="row between">
                    <span className="muted">Tools</span>
                    <span>
                      {tools.length
                        ? tools
                            .map(
                              (id) =>
                                mcpToolEntries.find((entry) => entry.id === id)
                                  ?.label ||
                                skillEntries.find((entry) => entry.id === id)?.label ||
                                localSkillEntries.find((entry) => entry.id === id)?.label ||
                                toolboxEntries.find((entry) => entry.id === id)?.label ||
                                id
                            )
                            .join(", ")
                        : "none"}
                    </span>
                  </div>
                  <div className="row between">
                    <span className="muted">Memory</span>
                    <span>{memoryEnabled ? "On" : "Off"}</span>
                  </div>
                  <div className="row between">
                    <span className="muted">Guardrail</span>
                    <span>{guardrail}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === "Traces" && (
        <div className="builder-tab-content">
          <div className="row between mb-12">
            <p className="muted">
              Every saved playground run and routine execution is recorded here.
            </p>
            <button className="btn btn-secondary btn-sm" onClick={() => tracesApi.refresh()}>
              <ArrowClockwise20Regular /> Refresh
            </button>
          </div>
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 190 }}>Time</th>
                  <th>Prompt</th>
                  <th style={{ width: 150 }}>Model</th>
                  <th style={{ width: 90 }}>Latency</th>
                  <th style={{ width: 110 }}>Tokens</th>
                  <th style={{ width: 90 }}>Citations</th>
                </tr>
              </thead>
              <tbody>
                {traces.map((trace) => (
                  <tr key={trace.id}>
                    <td className="muted">{formatDate(trace.at)}</td>
                    <td>
                      <details>
                        <summary style={{ cursor: "pointer" }}>{trace.prompt.slice(0, 90)}</summary>
                        <div className="stack mt-8" style={{ gap: 6 }}>
                          <div className="text-12 muted">Response</div>
                          <div className="chunk-preview">{trace.response}</div>
                        </div>
                      </details>
                    </td>
                    <td className="mono text-12">{trace.model}</td>
                    <td>{trace.latencyMs} ms</td>
                    <td>{formatNumber(trace.promptTokens + trace.completionTokens)}</td>
                    <td>{trace.citations.length}</td>
                  </tr>
                ))}
                {traces.length === 0 && (
                  <tr>
                    <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      No traces yet. Run a prompt in the playground or a routine.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>{traces.length} traces</span>
            <span className="muted">Stored in data/traces.json</span>
          </div>
        </div>
      )}

      {tab === "Insights" && (
        <div className="builder-tab-content">
          <div className="metric-grid">
            <Metric title="Runs" value={String(traces.length)} note="Local completions" />
            <Metric
              title="Avg latency"
              value={
                traces.length
                  ? `${Math.round(
                      traces.reduce((sum, trace) => sum + trace.latencyMs, 0) /
                        traces.length
                    )} ms`
                  : "--"
              }
              note="End-to-end model time"
            />
            <Metric
              title="Tokens"
              value={formatNumber(
                traces.reduce(
                  (sum, trace) => sum + trace.promptTokens + trace.completionTokens,
                  0
                )
              )}
              note="Prompt + completion"
            />
            <Metric
              title="Grounded answers"
              value={
                traces.length
                  ? `${Math.round(
                      (traces.filter((trace) => trace.citations.length > 0).length /
                        traces.length) *
                        100
                    )}%`
                  : "--"
              }
              note="Responses with citations"
            />
          </div>
          <div className="operate-card">
            <h3 className="mb-12">Latency by run</h3>
            <div className="row" style={{ alignItems: "flex-end", gap: 4, height: 160 }}>
              {traces
                .slice(0, 40)
                .reverse()
                .map((trace) => {
                  const max = Math.max(...traces.map((t) => t.latencyMs), 1);
                  return (
                    <span
                      key={trace.id}
                      title={`${trace.latencyMs} ms · ${formatDate(trace.at)}`}
                      style={{
                        flex: 1,
                        minWidth: 4,
                        height: `${Math.max(4, (trace.latencyMs / max) * 100)}%`,
                        background: "var(--brand-stroke)",
                        borderRadius: 2,
                        opacity: 0.75,
                      }}
                    />
                  );
                })}
              {traces.length === 0 && <span className="muted text-13">No runs yet.</span>}
            </div>
          </div>
        </div>
      )}

      {tab === "Monitor" && (
        <div className="builder-tab-content">
          <div className="operate-grid">
            <div className="operate-card">
              <div className="row between mb-12">
                <h3>Recent activity</h3>
                <span className="status">
                  <span className="status-dot" /> Live
                </span>
              </div>
              <div className="stack">
                {traces.slice(0, 12).map((trace) => (
                  <div className="history-row" key={trace.id}>
                    <span className="status-dot" />
                    <span className="grow text-13 truncate">{trace.prompt}</span>
                    <span className="muted text-12">{trace.latencyMs} ms</span>
                    <span className="muted text-12">{formatDate(trace.at)}</span>
                  </div>
                ))}
                {traces.length === 0 && <p className="muted text-13">Waiting for the first run.</p>}
              </div>
            </div>
            <div className="operate-card">
              <h3 className="mb-12">Runtime</h3>
              <RuntimeStats />
            </div>
          </div>
        </div>
      )}

      {tab === "Evaluation" && (
        <div className="builder-tab-content">
          <div className="operate-card mb-16">
            <div className="row between">
              <div>
                <h3>Smoke evaluation</h3>
                <p className="muted text-12 mt-4">
                  Runs three prompts against the current agent and reports latency
                  and whether the model produced a non-empty answer.
                </p>
              </div>
              <button className="btn btn-primary" disabled={evalRunning} onClick={runEvaluation}>
                {evalRunning ? <Spinner /> : <Play20Regular />} Run evaluation
              </button>
            </div>
            <label className="field mt-12">
              <span className="field-label">Custom test prompt (optional)</span>
              <input
                className="input"
                value={evalPrompt}
                onChange={(e) => setEvalPrompt(e.target.value)}
                placeholder="Ask the agent something representative of your users"
              />
            </label>
          </div>
          {evalResults.length > 0 ? (
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Prompt</th>
                    <th style={{ width: 90 }}>Result</th>
                    <th style={{ width: 100 }}>Latency</th>
                    <th>Response</th>
                  </tr>
                </thead>
                <tbody>
                  {evalResults.map((result, index) => (
                    <tr key={index}>
                      <td>{result.prompt}</td>
                      <td>
                        <span className={`badge ${result.ok ? "green" : ""}`}>
                          {result.ok ? "Pass" : "Fail"}
                        </span>
                      </td>
                      <td>{result.latencyMs} ms</td>
                      <td className="muted">{result.output.slice(0, 160)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="operate-card muted" style={{ textAlign: "center", padding: 48 }}>
              No evaluation results yet.
            </div>
          )}
        </div>
      )}

      {tab === "Optimize" && (
        <div className="builder-tab-content">
          <div className="operate-grid">
            <div className="stack" style={{ gap: 16 }}>
              <div className="operate-card">
                <h3 className="mb-12">Suggestions</h3>
                <div className="stack" style={{ gap: 12 }}>
                  <Suggestion
                    title="Ground answers in your documents"
                    text={
                      knowledgeIds.length
                        ? "Knowledge is connected. Answers will include citations."
                        : "Connect a knowledge base so the agent can cite real documents instead of guessing."
                    }
                    action={
                      knowledgeIds.length ? undefined : (
                        <button className="btn btn-sm btn-secondary" onClick={() => setKnowledgeOpen(true)}>
                          Connect
                        </button>
                      )
                    }
                  />
                  <Suggestion
                    title="Make the instructions specific"
                    text={
                      instructions.length < 200
                        ? "Instructions are short. Add the agent's role, audience, tone and what it must refuse."
                        : "Instructions include enough context for a local model."
                    }
                    action={
                      instructions.length < 200 ? (
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => {
                            setInstructions(
                              `${instructions}\n\nRole: expert assistant for this project.\nAudience: internal users on this computer.\nTone: concise, factual and friendly.\nAlways say when you are unsure and never invent product details.`
                            );
                            toast("Instruction template applied", "success");
                          }}
                        >
                          Apply template
                        </button>
                      ) : undefined
                    }
                  />
                  <Suggestion
                    title="Right-size the response budget"
                    text={
                      maxTokens > 2048
                        ? "Max tokens is high for a small local model and slows down replies."
                        : "The token budget is appropriate for interactive chat."
                    }
                    action={
                      maxTokens > 2048 ? (
                        <button className="btn btn-sm btn-secondary" onClick={() => setMaxTokens(1024)}>
                          Set 1024
                        </button>
                      ) : undefined
                    }
                  />
                </div>
              </div>
              <div className="operate-card">
                <h3 className="mb-12">Cached chat models</h3>
                <div className="stack">
                  {models
                    .filter((model) => model.cached && model.task === "chat")
                    .slice(0, 6)
                    .map((model) => (
                      <div className="history-row" key={model.key}>
                        <span className="grow">
                          <span className="text-14" style={{ display: "block" }}>
                            {model.displayName}
                          </span>
                          <span className="text-12 muted">
                            {model.providerLabel} · {model.publisher}
                          </span>
                        </span>
                        <button
                          className="btn btn-sm btn-secondary"
                          onClick={() => setModelKey(model.key)}
                          disabled={currentModel?.key === model.key}
                        >
                          {currentModel?.key === model.key ? "In use" : "Use model"}
                        </button>
                      </div>
                    ))}
                  {models.filter((model) => model.cached && model.task === "chat").length === 0 && (
                    <p className="muted text-13">
                      No downloaded chat models found yet.
                    </p>
                  )}
                </div>
              </div>
            </div>
            <div className="operate-card">
              <h3 className="mb-12">Current configuration</h3>
              <div className="stack text-13">
                <span className="row between"><span className="muted">Model</span><span className="truncate" style={{maxWidth:240}}>{currentModel?.displayName || agent.model}</span></span>
                <span className="row between"><span className="muted">Provider</span><span>{currentModel?.providerLabel || agent.provider}</span></span>
                <span className="row between"><span className="muted">Tools</span><span>{tools.length || 0}</span></span>
                <span className="row between"><span className="muted">Knowledge bases</span><span>{knowledgeIds.length}</span></span>
                <span className="row between"><span className="muted">Temperature</span><span>{temperature}</span></span>
                <span className="row between"><span className="muted">Max tokens</span><span>{maxTokens}</span></span>
                <span className="row between"><span className="muted">Version</span><span>{agent.version}</span></span>
              </div>
              <div className="banner info mt-16">
                <Sparkle20Regular />
                <span>
                  Optimization is local: these changes only affect how prompts are
                  sent to the model on this computer.
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {knowledgeOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setKnowledgeOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Connect knowledge">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Connect knowledge</h2>
                <p className="dialog-sub">
                  Ground this agent in documents indexed on this computer.
                </p>
              </div>
              <button className="icon-button" onClick={() => setKnowledgeOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              {knowledgeBases.length === 0 && (
                <div className="banner info">
                  <Book20Regular />
                  <span>
                    No knowledge bases yet. Create one in Knowledge, then return
                    here to connect it.
                  </span>
                </div>
              )}
              {knowledgeBases.map((kb) => {
                const checked = knowledgeIds.includes(kb.id);
                return (
                  <label className="tool-row" key={kb.id} style={{ cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      className="radio"
                      checked={checked}
                      onChange={() => {
                        setKnowledgeIds(
                          checked
                            ? knowledgeIds.filter((id) => id !== kb.id)
                            : [...knowledgeIds, kb.id]
                        );
                      }}
                    />
                    <span className="grow">
                      <span className="text-14" style={{ display: "block" }}>
                        {kb.name}
                      </span>
                      <span className="text-12 muted">
                        {kb.documents.length} documents · {kb.embeddingModel} · {kb.status}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="dialog-footer">
              <Link href="/build/knowledge/search" className="btn btn-secondary left" onClick={() => setKnowledgeOpen(false)}>
                Manage knowledge
              </Link>
              <button className="btn btn-primary" onClick={() => setKnowledgeOpen(false)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {codeOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCodeOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Continue in code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Continue in code</h2>
                <p className="dialog-sub">
                  The same agent is available over HTTP at no cloud cost.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCodeOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="subtabs">
                <button
                  className={`subtab${endpointOpenFor !== "python" ? " active" : ""}`}
                  onClick={() => setEndpointOpenFor("curl")}
                >
                  curl
                </button>
                <button
                  className={`subtab${endpointOpenFor === "python" ? " active" : ""}`}
                  onClick={() => setEndpointOpenFor("python")}
                >
                  Python
                </button>
              </div>
              <pre className="code-block">
                {endpointOpenFor === "python"
                  ? `from openai import OpenAI

client = OpenAI(
    base_url="${publicOrigin}/api/v1/agents/${agent.id}",
    api_key="${agent.apiKey}",
)

response = client.chat.completions.create(
    model="${agent.model}",
    messages=[{"role": "user", "content": "Hello!"}],
)
print(response.choices[0].message.content)`
                  : `curl ${publicOrigin}/api/v1/agents/${agent.id}/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "api-key: ${agent.apiKey}" \\
  -d '{"messages": [{"role": "user", "content": "Hello!"}]}'`}
              </pre>
              <div className="banner">
                <Code20Regular />
                <span>
                  The agent endpoint requires the agent key shown above. It returns a
                  normal chat completion by default; send{" "}
                  <span className="mono">stream: true</span> for server-sent events with
                  citations. Deployment endpoints live under{" "}
                  <span className="mono">/api/v1/deployments/&lt;name&gt;</span>.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <CopyButton
                value={
                  endpointOpenFor === "python"
                    ? `from openai import OpenAI\n\nclient = OpenAI(base_url="${publicOrigin}/api/v1/agents/${agent.id}", api_key="${agent.apiKey}")\n\nresponse = client.chat.completions.create(model="${agent.model}", messages=[{"role": "user", "content": "Hello!"}])\nprint(response.choices[0].message.content)`
                    : `curl ${publicOrigin}/api/v1/agents/${agent.id}/chat/completions -H "Content-Type: application/json" -H "api-key: ${agent.apiKey}" -d '{"messages": [{"role": "user", "content": "Hello!"}]}'`
                }
                label="Copy sample"
                className="btn btn-secondary"
              />
              <button className="btn btn-primary" onClick={() => setCodeOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="metric-card">
      <span className="metric-label">{title}</span>
      <span className="metric-value">{value}</span>
      <span className="metric-note">{note}</span>
    </div>
  );
}

function Suggestion({
  title,
  text,
  action,
}: {
  title: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="row between" style={{ alignItems: "flex-start", gap: 12 }}>
      <span>
        <span className="text-14 strong" style={{ display: "block" }}>
          {title}
        </span>
        <span className="text-12 muted">{text}</span>
      </span>
      {action}
    </div>
  );
}

function RuntimeStats() {
  const { data } = useApi<{
    stats: {
      hostname: string;
      cpuModel: string;
      cpuCount: number;
      totalMem: number;
      freeMem: number;
      platform: string;
      tokens: number;
    };
  }>("/api/system", 5000);
  const stats = data?.stats;
  if (!stats) return <p className="muted text-13">Reading system stats…</p>;
  return (
    <div className="stack text-13">
      <span className="row between"><span className="muted">Host</span><span>{stats.hostname}</span></span>
      <span className="row between"><span className="muted">Platform</span><span>{stats.platform}</span></span>
      <span className="row between"><span className="muted">CPU</span><span className="truncate" style={{maxWidth:200}}>{stats.cpuModel}</span></span>
      <span className="row between"><span className="muted">Cores</span><span>{stats.cpuCount}</span></span>
      <span className="row between"><span className="muted">Memory free</span><span>{(stats.freeMem / 1024 / 1024 / 1024).toFixed(1)} GB / {(stats.totalMem / 1024 / 1024 / 1024).toFixed(0)} GB</span></span>
      <span className="row between"><span className="muted">Deployment tokens</span><span>{stats.tokens}</span></span>
    </div>
  );
}
