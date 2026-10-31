import "server-only";
import { newId, readJson, writeJson } from "./store";

/**
 * Agent versions created through the Foundry agent API
 * (`project_client.agents.create_version(...)`).
 *
 * These are distinct from the agents in `agents.json`: those are the app's own
 * prompt agents with their own keys, while these hold the definition the
 * azure-ai-projects SDK posts — model, instructions and function tools — so a
 * later `responses.create({ agent_reference })` can run against it.
 */
export interface StoredAgentVersion {
  id: string;
  object: "agent.version";
  name: string;
  version: string;
  created_at: number;
  metadata: Record<string, string>;
  description?: string;
  definition: Record<string, unknown>;
  draft: boolean;
  status: "active";
}

const FILE = "agent-versions.json";

export async function listAgentVersions(): Promise<StoredAgentVersion[]> {
  return readJson<StoredAgentVersion[]>(FILE, []);
}

export async function versionsFor(name: string): Promise<StoredAgentVersion[]> {
  const all = await listAgentVersions();
  return all
    .filter((entry) => entry.name === name)
    .sort((a, b) => Number(a.version) - Number(b.version));
}

export async function getAgentVersion(
  name: string,
  version?: string
): Promise<StoredAgentVersion | undefined> {
  const versions = await versionsFor(name);
  if (!versions.length) return undefined;
  if (!version || version === "latest")
    return versions[versions.length - 1];
  return versions.find((entry) => entry.version === version);
}

export async function createAgentVersion(
  name: string,
  input: {
    definition?: Record<string, unknown>;
    metadata?: Record<string, string>;
    description?: string;
    draft?: boolean;
  }
): Promise<StoredAgentVersion> {
  const all = await listAgentVersions();
  const existing = all.filter((entry) => entry.name === name);
  const nextVersion = String(
    existing.reduce((max, entry) => Math.max(max, Number(entry.version) || 0), 0) + 1
  );
  const created: StoredAgentVersion = {
    id: newId("agentver"),
    object: "agent.version",
    name,
    version: nextVersion,
    created_at: Math.floor(Date.now() / 1000),
    metadata: input.metadata || {},
    description: input.description,
    definition: input.definition || {},
    draft: Boolean(input.draft),
    status: "active",
  };
  all.push(created);
  await writeJson(FILE, all);
  return created;
}

export async function deleteAgentVersion(
  name: string,
  version: string
): Promise<boolean> {
  const all = await listAgentVersions();
  const next = all.filter(
    (entry) => !(entry.name === name && entry.version === version)
  );
  if (next.length === all.length) return false;
  await writeJson(FILE, next);
  return true;
}
