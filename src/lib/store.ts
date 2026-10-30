import "server-only";
import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import {
  Agent,
  Deployment,
  KnowledgeBase,
  LocalSettings,
  Trace,
} from "./types";

const DATA_DIR =
  process.env.OPENFOUNDRY_DATA_DIR?.trim() ||
  path.join(process.cwd(), "data");

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

export async function getDeployments(): Promise<Deployment[]> {
  return readJson<Deployment[]>("deployments.json", []);
}

export async function saveDeployments(items: Deployment[]): Promise<void> {
  await writeJson("deployments.json", items);
}

export async function getKnowledgeBases(): Promise<KnowledgeBase[]> {
  return readJson<KnowledgeBase[]>("knowledge.json", []);
}

export async function saveKnowledgeBases(items: KnowledgeBase[]): Promise<void> {
  await writeJson("knowledge.json", items);
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
