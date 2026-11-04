// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { execFile, spawn } from "child_process";
import { promises as fs } from "fs";
import net from "net";
import os from "os";
import path from "path";
import { promisify } from "util";
import { getNodes, saveNodes, newId, nowIso, dataDir } from "./store";
import { getRuntimeUrls } from "./providers";
import { zoneForRegion, ZONE_REGION } from "./regions";
import {
  DataZone,
  Deployment,
  DeploymentScope,
  ProviderId,
  RuntimeNode,
} from "./types";

const execFileAsync = promisify(execFile);

/**
 * Runtime nodes are the layer that makes Foundry's *scope* real on one machine.
 *
 * A node is a concrete serving endpoint with a region/zone label. The default
 * runtime from settings is node "default:<provider>". openFoundry can also spawn
 * isolated Ollama daemons on free ports (same model store, separate process), so
 * "Regional" and "Data Zone" deployments are served by a genuinely separate
 * process instead of a shared bucket. Docker is used instead when configured.
 *
 * Provider limits are honest: Foundry Local, LM Studio and llama.cpp are single
 * servers, so non-Ollama deployments keep the region label but route to their
 * provider's default endpoint.
 */

export { REGIONS, ZONES, ZONE_REGION, zoneForRegion } from "./regions";

function providerLabel(provider: ProviderId): string {
  switch (provider) {
    case "foundry":
      return "Foundry Local";
    case "ollama":
      return "Ollama";
    case "lmstudio":
      return "LM Studio";
    case "llamacpp":
      return "llama.cpp";
    default:
      return "Local runtime";
  }
}

function defaultNodeId(provider: ProviderId): string {
  return `default:${provider}`;
}

/** The shared runtime endpoint from settings, as a node. */
async function defaultNodes(): Promise<RuntimeNode[]> {
  const urls = await getRuntimeUrls();
  const entries: { provider: ProviderId; baseUrl: string }[] = [
    { provider: "ollama", baseUrl: urls.ollama },
    { provider: "foundry", baseUrl: urls.foundry },
    { provider: "lmstudio", baseUrl: urls.lmstudio },
    { provider: "llamacpp", baseUrl: urls.llamacpp },
  ];
  const nodes: RuntimeNode[] = [];
  for (const entry of entries) {
    const online = await probeNode(entry.provider, entry.baseUrl);
    if (!online) continue;
    nodes.push({
      id: defaultNodeId(entry.provider),
      name: `${providerLabel(entry.provider)} (this computer)`,
      provider: entry.provider,
      baseUrl: entry.baseUrl,
      region: "On device",
      zone: "Device",
      managed: false,
      status: "Online",
      lastSeenAt: nowIso(),
    });
  }
  return nodes;
}

async function probeNode(
  provider: ProviderId,
  baseUrl: string,
  timeoutMs = 1500
): Promise<boolean> {
  try {
    const clean = baseUrl.replace(/\/+$/, "");
    const url =
      provider === "ollama"
        ? `${clean}/api/tags`
        : `${clean.endsWith("/v1") ? clean : `${clean}/v1`}/models`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(timeoutMs),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

let cache: { at: number; nodes: RuntimeNode[] } | null = null;

/** Every known runtime node: the settings default plus any managed nodes. */
export async function listNodes(force = false): Promise<RuntimeNode[]> {
  if (!force && cache && Date.now() - cache.at < 4000) return cache.nodes;
  const [defaults, managed] = await Promise.all([defaultNodes(), getNodes()]);
  let changed = false;
  const probed: RuntimeNode[] = [];
  for (const node of managed) {
    const online = await probeNode(node.provider, node.baseUrl);
    const status = online ? "Online" : "Offline";
    if (node.status !== status) changed = true;
    probed.push({
      ...node,
      status,
      lastSeenAt: online ? nowIso() : node.lastSeenAt,
    });
  }
  if (changed) await saveNodes(probed);
  const nodes = [...defaults, ...probed];
  cache = { at: Date.now(), nodes };
  return nodes;
}

export function invalidateNodeCache(): void {
  cache = null;
}

async function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start = 11451, end = 11499): Promise<number> {
  for (let port = start; port <= end; port += 1) {
    if (await portFree(port)) return port;
  }
  throw new Error("No free port is available for a new runtime node.");
}

async function resolveBinary(name: string): Promise<string | null> {
  const candidates = [
    name,
    `/usr/local/bin/${name}`,
    `/opt/homebrew/bin/${name}`,
    path.join(os.homedir(), ".local", "bin", name),
    "/Applications/Docker.app/Contents/Resources/bin/docker",
  ];
  for (const candidate of candidates) {
    try {
      await execFileAsync(candidate, ["--version"], { timeout: 4000 });
      return candidate;
    } catch {
      // try the next candidate
    }
  }
  return null;
}

async function waitForNode(
  provider: ProviderId,
  baseUrl: string,
  timeoutMs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probeNode(provider, baseUrl, 1500)) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

export interface NodeRequest {
  /** Data zone for a Data Zone deployment. */
  zone?: DataZone;
  /** Azure region for a Region deployment. */
  region?: string;
}

/**
 * Return an online node for the requested region/zone, spawning an isolated
 * Ollama daemon when none exists. Returns null when the provider cannot be
 * isolated (the caller then keeps the label but uses the default endpoint).
 */
export async function ensureNode(
  provider: ProviderId,
  request: NodeRequest
): Promise<RuntimeNode | null> {
  const region = request.region || (request.zone ? ZONE_REGION[request.zone] : "East US");
  const zone = request.zone || (zoneForRegion(region) as DataZone);
  const nodes = await listNodes(true);
  const existing = nodes.find(
    (node) => node.managed && node.provider === provider && node.region === region
  );
  if (existing) {
    if (existing.status === "Online") return existing;
    // A previous daemon died; start a fresh one for the same region.
    await removeNodeRecord(existing.id);
  }
  if (provider !== "ollama") return null;

  const binary = await resolveBinary("ollama");
  if (!binary) return null;

  const port = await findFreePort();
  const id = newId("node");
  const dir = path.join(dataDir(), "nodes");
  await fs.mkdir(dir, { recursive: true });
  const log = await fs.open(path.join(dir, `${id}.log`), "a");
  let child;
  try {
    child = spawn(binary, ["serve"], {
      detached: true,
      stdio: ["ignore", log.fd, log.fd],
      env: { ...process.env, OLLAMA_HOST: `127.0.0.1:${port}` },
    });
  } catch {
    await log.close();
    return null;
  }
  child.unref();
  await log.close();

  const node: RuntimeNode = {
    id,
    name: `Ollama · ${region}`,
    provider,
    baseUrl: `http://127.0.0.1:${port}`,
    region,
    zone,
    managed: true,
    status: "Starting",
    pid: child.pid,
    lastSeenAt: nowIso(),
  };
  const managedNodes = await getNodes();
  managedNodes.push(node);
  await saveNodes(managedNodes);

  const online = await waitForNode(provider, node.baseUrl, 20000);
  node.status = online ? "Online" : "Offline";
  await persistNode(node);
  invalidateNodeCache();
  return online ? node : null;
}

async function persistNode(node: RuntimeNode): Promise<void> {
  const nodes = await getNodes();
  const index = nodes.findIndex((item) => item.id === node.id);
  if (index >= 0) nodes[index] = node;
  else nodes.push(node);
  await saveNodes(nodes);
}

async function removeNodeRecord(id: string): Promise<void> {
  const nodes = await getNodes();
  await saveNodes(nodes.filter((item) => item.id !== id));
  invalidateNodeCache();
}

export async function stopNode(id: string): Promise<void> {
  const nodes = await getNodes();
  const node = nodes.find((item) => item.id === id);
  if (node?.pid) {
    try {
      process.kill(node.pid, "SIGTERM");
    } catch {
      // already gone
    }
  }
  await removeNodeRecord(id);
}

/** Node that should serve a request for this deployment, if a specific one applies. */
export async function nodeForDeployment(
  deployment: Deployment
): Promise<RuntimeNode | null> {
  const nodes = await listNodes();
  if (deployment.nodeId) {
    const pinned = nodes.find(
      (node) => node.id === deployment.nodeId && node.status === "Online"
    );
    if (pinned) return pinned;
  }
  if (deployment.scope === "Global") {
    // Real fan-out: round-robin across every online node that can serve the
    // provider. All Ollama nodes share the model store, so the choice is safe.
    const candidates = nodes.filter(
      (node) => node.provider === deployment.provider && node.status === "Online"
    );
    if (candidates.length <= 1) return candidates[0] || null;
    const index = globalCursor % candidates.length;
    globalCursor = (globalCursor + 1) % candidates.length;
    return candidates[index];
  }
  const preferred = nodes.find(
    (node) =>
      node.provider === deployment.provider &&
      node.status === "Online" &&
      (deployment.scope === "Device"
        ? node.zone === "Device"
        : deployment.scope === "Data Zone"
        ? node.zone === deployment.zone
        : node.region === deployment.region)
  );
  if (preferred) return preferred;
  return (
    nodes.find(
      (node) => node.provider === deployment.provider && node.status === "Online"
    ) || null
  );
}

let globalCursor = 0;

/** Human-readable description of where a deployment runs. */
export function scopeLabel(scope: DeploymentScope | undefined, zone?: string, region?: string): string {
  switch (scope) {
    case "Global":
      return "Global (any node)";
    case "Data Zone":
      return `Data Zone · ${zone || "US"}`;
    case "Region":
      return region || "Region";
    case "Device":
      return "On device";
    default:
      return "On device";
  }
}
