// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import {
  Agent,
  Blocklist,
  Deployment,
  Guardrail,
  GuardrailControl,
  HttpTool,
  KnowledgeBase,
  LocalSettings,
  LocalSkill,
  McpServer,
  MemoryItem,
  MemoryStore,
  OAuthPending,
  OAuthTokenRecord,
  RuntimeNode,
  Toolbox,
  Trace,
} from "./types";
import { deploymentTypeFor } from "./deployment-types";

const DATA_DIR =
  process.env.OPENFOUNDRY_DATA_DIR?.trim() ||
  path.join(process.cwd(), "data");

/** Absolute path of the JSON data directory (settings, deployments, nodes...). */
export function dataDir(): string {
  return DATA_DIR;
}

const FOUNDRY_URL =
  process.env.FOUNDRY_LOCAL_URL || "http://127.0.0.1:50414";
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

export async function readJson<T>(file: string, fallback: T): Promise<T> {
  await ensureDir();
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, file), "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function writeJson<T>(file: string, value: T): Promise<void> {
  await ensureDir();
  const target = path.join(DATA_DIR, file);
  // Unique temp names keep concurrent writers from renaming each other's file.
  const tmp = `${target}.${process.pid}.${Date.now().toString(36)}.${Math.random()
    .toString(36)
    .slice(2, 8)}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), "utf8");
  await fs.rename(tmp, target);
}

export function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

export async function getAgents(): Promise<Agent[]> {
  return readJson<Agent[]>("agents.json", []);
}

export async function saveAgents(agents: Agent[]): Promise<void> {
  await writeJson("agents.json", agents);
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  const agents = await getAgents();
  return agents.find((a) => a.id === id);
}

/**
 * Older builds stored an invented kind ("Serverless" for a managed-compute SKU)
 * and labels such as "Local managed compute". Derive the section, the real
 * serving mode and the routing scope from the SKU so tables, tabs, detail
 * panels and the request router all agree with Foundry.
 */
function normalizeDeployment(deployment: Deployment): Deployment {
  const type = deploymentTypeFor(deployment.sku);
  const kind = deployment.kind === "Adapter" ? "Adapter" : type.kind;
  const servingMode = deployment.servingMode || type.servingMode;
  const scope = deployment.scope || type.scope;
  const zone = deployment.zone ?? (scope === "Data Zone" ? "US" : undefined);
  const region =
    deployment.region ||
    (scope === "Region"
      ? "East US"
      : scope === "Device"
      ? "On device"
      : undefined);
  const tpm =
    deployment.tpm ??
    (servingMode === "Standard"
      ? 240000
      : servingMode === "Developer"
      ? 50000
      : undefined);
  const reservedSlots =
    deployment.reservedSlots ??
    (type.reserved || servingMode === "Dedicated"
      ? Math.max(1, deployment.capacity)
      : undefined);
  return {
    ...deployment,
    sku: type.label,
    kind,
    servingMode,
    scope,
    zone,
    region,
    tpm,
    reservedSlots,
  };
}

export async function getDeployments(): Promise<Deployment[]> {
  const deployments = await readJson<Deployment[]>("deployments.json", []);
  return deployments.map(normalizeDeployment);
}

export async function saveDeployments(items: Deployment[]): Promise<void> {
  await writeJson("deployments.json", items);
}

export async function getMcpServers(): Promise<McpServer[]> {
  return readJson<McpServer[]>("mcp-servers.json", []);
}

export async function saveMcpServers(items: McpServer[]): Promise<void> {
  await writeJson("mcp-servers.json", items);
}

export async function getHttpTools(): Promise<HttpTool[]> {
  return readJson<HttpTool[]>("http-tools.json", []);
}

export async function saveHttpTools(items: HttpTool[]): Promise<void> {
  await writeJson("http-tools.json", items);
}

export async function getToolboxes(): Promise<Toolbox[]> {
  return readJson<Toolbox[]>("toolboxes.json", []);
}

export async function saveToolboxes(items: Toolbox[]): Promise<void> {
  await writeJson("toolboxes.json", items);
}

export async function getLocalSkills(): Promise<LocalSkill[]> {
  return readJson<LocalSkill[]>("local-skills.json", []);
}

export async function saveLocalSkills(items: LocalSkill[]): Promise<void> {
  await writeJson("local-skills.json", items);
}

export async function getOAuthPending(): Promise<OAuthPending[]> {
  return readJson<OAuthPending[]>("oauth-pending.json", []);
}

export async function saveOAuthPending(items: OAuthPending[]): Promise<void> {
  await writeJson("oauth-pending.json", items);
}

export async function getOAuthTokens(): Promise<OAuthTokenRecord[]> {
  return readJson<OAuthTokenRecord[]>("oauth-tokens.json", []);
}

export async function saveOAuthTokens(
  items: OAuthTokenRecord[]
): Promise<void> {
  await writeJson("oauth-tokens.json", items);
}

export async function getNodes(): Promise<RuntimeNode[]> {
  return readJson<RuntimeNode[]>("nodes.json", []);
}

export async function saveNodes(items: RuntimeNode[]): Promise<void> {
  await writeJson("nodes.json", items);
}

export async function getKnowledgeBases(): Promise<KnowledgeBase[]> {
  return readJson<KnowledgeBase[]>("knowledge.json", []);
}

export async function saveKnowledgeBases(items: KnowledgeBase[]): Promise<void> {
  await writeJson("knowledge.json", items);
}

export async function getMemoryStores(): Promise<MemoryStore[]> {
  return readJson<MemoryStore[]>("memory.json", []);
}

export async function saveMemoryStores(items: MemoryStore[]): Promise<void> {
  await writeJson("memory.json", items);
}

export async function getMemoryItems(): Promise<MemoryItem[]> {
  return readJson<MemoryItem[]>("memory-items.json", []);
}

export async function saveMemoryItems(items: MemoryItem[]): Promise<void> {
  await writeJson("memory-items.json", items);
}

export async function getGuardrails(): Promise<Guardrail[]> {
  const existing = await readJson<Guardrail[] | null>("guardrails.json", null);
  if (existing) return existing;
  const seeded = defaultGuardrails();
  await writeJson("guardrails.json", seeded);
  return seeded;
}

export async function saveGuardrails(items: Guardrail[]): Promise<void> {
  await writeJson("guardrails.json", items);
}

export async function getBlocklists(): Promise<Blocklist[]> {
  const existing = await readJson<Blocklist[] | null>("blocklists.json", null);
  if (existing) return existing;
  const seeded: Blocklist[] = [
    {
      id: "blocklist-profanity",
      name: "Profanity",
      terms: [
        "damn",
        "hell",
        "crap",
        "bastard",
        "idiot",
        "stupid",
      ],
      createdAt: nowIso(),
      builtIn: true,
    },
  ];
  await writeJson("blocklists.json", seeded);
  return seeded;
}

export async function saveBlocklists(items: Blocklist[]): Promise<void> {
  await writeJson("blocklists.json", items);
}

/**
 * The guardrails Foundry seeds into every project. Structure matches the live
 * portal; names are local so no Microsoft branding ships with the build.
 */
export function defaultGuardrails(): Guardrail[] {
  const controls: GuardrailControl[] = [
    {
      id: "jailbreak",
      group: "Jailbreak",
      riskType: "Jailbreak",
      intervention: "User input",
      action: "Block",
      defaulted: true,
      enabled: true,
      description:
        "Detects and blocks attempts to override the agent's instructions or safety rules through jailbreak prompts.",
    },
    {
      id: "egress-rules",
      group: "Network",
      riskType: "Egress rules",
      intervention: "Outbound requests",
      action: "Deny",
      defaulted: true,
      enabled: true,
      description:
        "Restricts which outbound network destinations a hosted agent may call.",
    },
    {
      id: "indirect-prompt-injection",
      group: "Indirect prompt injections",
      riskType: "Indirect prompt injections",
      intervention: "User input, Tool response",
      action: "Block",
      defaulted: true,
      enabled: true,
      description:
        "Blocks instructions smuggled in through tool output or retrieved documents.",
    },
    {
      id: "spotlighting",
      group: "Indirect prompt injections",
      riskType: "Spotlighting",
      intervention: "User input",
      action: "On",
      defaulted: true,
      enabled: true,
      description:
        "Marks untrusted retrieved content so the model treats it as data, not instructions.",
    },
    {
      id: "hate",
      group: "Content harms",
      riskType: "Hate",
      severity: "Medium blocking",
      intervention: "User input, Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description:
        "Blocks content that attacks or dehumanises people based on protected characteristics.",
    },
    {
      id: "sexual",
      group: "Content harms",
      riskType: "Sexual",
      severity: "Medium blocking",
      intervention: "User input, Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description: "Blocks sexually explicit content.",
    },
    {
      id: "self-harm",
      group: "Content harms",
      riskType: "Self-harm",
      severity: "Medium blocking",
      intervention: "User input, Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description:
        "Blocks content promoting or instructing self-harm or suicide.",
    },
    {
      id: "violence",
      group: "Content harms",
      riskType: "Violence",
      severity: "Medium blocking",
      intervention: "User input, Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description: "Blocks content promoting or depicting violence.",
    },
    {
      id: "blocklists",
      group: "Content harms",
      riskType: "Blocklists",
      intervention: "User input, Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description: "Blocks the custom terms configured in the project blocklists.",
    },
    {
      id: "protected-material-code",
      group: "Protected materials",
      riskType: "Protected material for code",
      intervention: "Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description: "Blocks output that reproduces licensed source code.",
    },
    {
      id: "protected-material-text",
      group: "Protected materials",
      riskType: "Protected material for text",
      intervention: "Output",
      action: "Block",
      defaulted: true,
      enabled: true,
      description: "Blocks output that reproduces copyrighted text.",
    },
    {
      id: "pii",
      group: "Sensitive data leakage",
      riskType: "PII",
      intervention: "User input, Tool call, Tool response, Output",
      action: "Redact",
      strategy: "redact",
      defaulted: false,
      enabled: false,
      description:
        "Detects personal data and credentials such as emails, phone numbers, card numbers, API keys and private keys. Choose Block, Redact, Mask or Hash.",
    },
    {
      id: "task-adherence",
      group: "Task drift",
      riskType: "Task adherence",
      intervention: "Tool call",
      action: "Block",
      defaulted: false,
      enabled: false,
      description:
        "Blocks tool calls that drift away from the user's stated task.",
    },
  ];
  const now = nowIso();
  return [
    {
      id: "guardrail-default",
      name: "Default",
      streamingMode: "Default",
      controls: controls.map((control) => ({ ...control })),
      agents: [],
      deployments: [],
      builtIn: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "guardrail-default-v2",
      name: "DefaultV2",
      streamingMode: "Default",
      controls: controls.map((control) => ({
        ...control,
        enabled: control.defaulted,
      })),
      agents: [],
      deployments: [],
      builtIn: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: "guardrail-mai-default",
      name: "MAIDefault",
      streamingMode: "Default",
      controls: controls.map((control) => ({ ...control })),
      agents: [],
      deployments: [],
      builtIn: true,
      createdAt: now,
      updatedAt: now,
    },
  ];
}

export async function getTraces(): Promise<Trace[]> {
  return readJson<Trace[]>("traces.json", []);
}

export async function appendTrace(trace: Trace): Promise<void> {
  const traces = await getTraces();
  traces.unshift(trace);
  await writeJson("traces.json", traces.slice(0, 500));
}

function localIdentity(): { name: string; email: string; initials: string } {
  const username = os.userInfo().username || "local-user";
  const name = username
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .trim() || "Local User";
  const parts = name.split(/\s+/).filter(Boolean);
  const initials = (parts.length > 1
    ? parts[0][0] + parts[parts.length - 1][0]
    : name.slice(0, 2)
  ).toUpperCase();
  return { name, email: `${username}@localhost`, initials };
}

export function buildDefaultSettings(): LocalSettings {
  const now = nowIso();
  const identity = localIdentity();
  const machine = hostName();
  return {
    disclaimerDismissed: false,
    onboarded: false,
    termsAccepted: false,
    initialized: true,
    projectName: `${machine.toLowerCase().replace(/[^a-z0-9-]+/g, "-")}-project`,
    userName: identity.name,
    userEmail: identity.email,
    userInitials: identity.initials,
    region: "On device",
    createdAt: now,
    projectId: randomUUID(),
    tenantId: randomUUID(),
    subscriptionId: randomUUID(),
    subscriptionName: "Local subscription",
    resourceName: `${machine}-foundry`,
    resourceGroup: "local-rg",
    location: "On device",
    resourceCreatedAt: now,
    apiKey: `fl-${randomUUID().replace(/-/g, "")}`,
    users: [
      {
        id: `user_${randomUUID().slice(0, 8)}`,
        name: identity.name,
        email: identity.email,
        role: "Owner",
        accessType: "Direct access",
        addedAt: now,
      },
    ],
    foundryUrl: FOUNDRY_URL,
    ollamaUrl: OLLAMA_URL,
    lmStudioUrl: "http://127.0.0.1:1234",
    llamaCppUrl: "http://127.0.0.1:8080",
    huggingFacePath: "",
    imageProvider: "auto",
    imageUrl: "",
    imageApiKey: "",
    imageModel: "",
    defaultProviderId: "",
    defaultModel: "",
  };
}

export async function getSettings(): Promise<LocalSettings> {
  const existing = await readJson<Partial<LocalSettings> | null>("settings.json", null);
  const defaults = buildDefaultSettings();
  if (!existing) {
    await writeJson("settings.json", defaults);
    return defaults;
  }
  const merged: LocalSettings = {
    ...defaults,
    ...existing,
    initialized: existing.initialized ?? true,
    users: existing.users?.length
      ? existing.users
      : defaults.users.map((user) => ({
          ...user,
          name: existing.userName || user.name,
          email: existing.userEmail || user.email,
        })),
    imageProvider: existing.imageProvider || defaults.imageProvider,
    imageUrl: existing.imageUrl ?? defaults.imageUrl,
    imageApiKey: existing.imageApiKey ?? defaults.imageApiKey,
    imageModel: existing.imageModel ?? defaults.imageModel,
    foundryUrl: existing.foundryUrl || defaults.foundryUrl,
    ollamaUrl: existing.ollamaUrl || defaults.ollamaUrl,
    lmStudioUrl: existing.lmStudioUrl || defaults.lmStudioUrl,
    llamaCppUrl: existing.llamaCppUrl || defaults.llamaCppUrl,
    huggingFacePath: existing.huggingFacePath ?? defaults.huggingFacePath,
    defaultProviderId: existing.defaultProviderId || "",
    defaultModel: existing.defaultModel || "",
  };
  if (
    !existing.projectId ||
    !existing.apiKey ||
    !existing.tenantId ||
    !existing.subscriptionId ||
    !existing.resourceName
  ) {
    await writeJson("settings.json", merged);
  }
  return merged;
}

export async function saveSettings(settings: LocalSettings): Promise<void> {
  await writeJson("settings.json", settings);
}

export function publicBaseUrl(): string {
  const configured =
    process.env.OPENFOUNDRY_PUBLIC_URL?.trim() ||
    (process.env.PORT ? `http://localhost:${process.env.PORT}` : "");
  return (configured || "http://localhost:3000").replace(/\/+$/, "");
}

export function projectEndpoint(): string {
  return `${publicBaseUrl()}/api/v1`;
}

export function hostName(): string {
  return os.hostname().replace(/\.local$/, "");
}
