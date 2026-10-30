import "server-only";
import { execFile } from "child_process";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { promisify } from "util";
import {
  LocalModel,
  LocalSettings,
  ModelTask,
  ProviderId,
  ProviderStatus,
} from "./types";
import { readJson } from "./store";

const execFileAsync = promisify(execFile);

export const FOUNDRY_URL =
  process.env.FOUNDRY_LOCAL_URL || "http://127.0.0.1:50414";
export const OLLAMA_URL =
  process.env.OLLAMA_URL || "http://127.0.0.1:11434";

/** Runtime endpoints can be changed in Manage → Project details. */
export async function getRuntimeUrls(): Promise<{
  foundry: string;
  ollama: string;
  lmstudio: string;
  llamacpp: string;
  huggingface: string;
}> {
  const settings = await readJson<Partial<LocalSettings>>("settings.json", {});
  return {
    foundry: (settings.foundryUrl || FOUNDRY_URL).replace(/\/+$/, ""),
    ollama: (settings.ollamaUrl || OLLAMA_URL).replace(/\/+$/, ""),
    lmstudio: (settings.lmStudioUrl || "http://127.0.0.1:1234").replace(/\/+$/, ""),
    llamacpp: (settings.llamaCppUrl || "http://127.0.0.1:8080").replace(/\/+$/, ""),
    huggingface: expandTilde(
      settings.huggingFacePath?.trim() ||
        path.join(os.homedir(), ".cache", "huggingface", "hub")
    ),
  };
}

export function expandTilde(value: string): string {
  if (value === "~") return os.homedir();
  if (value.startsWith("~/")) return path.join(os.homedir(), value.slice(2));
  return value;
}

function openAiRoot(base: string): string {
  const clean = base.replace(/\/+$/, "");
  return clean.endsWith("/v1") ? clean : `${clean}/v1`;
}

interface CacheEntry<T> {
  at: number;
  value: T;
}

const cacheStore = new Map<string, CacheEntry<unknown>>();

async function cached<T>(
  key: string,
  ttlMs: number,
  load: () => Promise<T>
): Promise<T> {
  const hit = cacheStore.get(key);
  if (hit && Date.now() - hit.at < ttlMs) return hit.value as T;
  const value = await load();
  cacheStore.set(key, { at: Date.now(), value });
  return value;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit = {},
  timeoutMs = 2500
): Promise<T> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export function humanizeFoundryId(id: string): string {
  return id
    .replace(/-generic-(gpu|cpu).*$/i, "")
    .replace(/:.*$/, "")
    .replace(/-instruct$/i, "")
    .replace(/-generic$/i, "")
    .replace(/-q4.*$/i, "");
}

function titleCase(value: string): string {
  return value
    .split(/[-_/]/)
    .filter(Boolean)
    .map((part) =>
      part.length <= 3 && part === part.toLowerCase()
        ? part.toUpperCase()
        : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(" ");
}

export function publisherFor(name: string): string {
  const n = name.toLowerCase();
  // Check derivative/distilled families before the base family in their name.
  if (n.includes("deepseek")) return "DeepSeek";
  if (n.includes("claude")) return "Anthropic";
  if (n.includes("grok")) return "xAI";
  if (n.includes("qwen")) return "Qwen";
  if (n.includes("glm")) return "Zhipu AI";
  if (n.includes("kimi") || n.includes("moonshot")) return "Moonshot AI";
  if (n.includes("minimax")) return "MiniMax";
  if (n.includes("phi")) return "Phi";
  if (/(^|[-_/])mai[-_]/.test(n)) return "MAI";
  if (n.includes("mistral") || n.includes("ministral")) return "Mistral AI";
  if (n.includes("llama") || n.includes("meta")) return "Meta";
  if (n.includes("gemma") || n.includes("functiongemma")) return "Google";
  if (n.includes("gpt") || n.includes("whisper") || n.includes("parakeet") || n.includes("moonshine"))
    return "OpenAI";
  if (n.includes("nemotron") || n.includes("nvidia")) return "NVIDIA";
  if (n.includes("nomic")) return "Nomic AI";
  if (n.includes("bge")) return "BAAI";
  if (n.includes("lfm") || n.includes("liquid")) return "Liquid AI";
  if (n.includes("mlx")) return "mlx-community";
  return "Community";
}

export function taskFor(name: string): ModelTask {
  const n = name.toLowerCase();
  if (n.includes("embed")) return "embedding";
  if (
    n.includes("whisper") ||
    n.includes("speech") ||
    n.includes("asr") ||
    n.includes("tts") ||
    n.includes("parakeet") ||
    n.includes("moonshine")
  )
    return "speech";
  if (
    n.includes("vision") ||
    n.includes("vl-") ||
    n.includes("multimodal") ||
    n.includes("image") ||
    n.includes("sam") ||
    n.includes("florence")
  )
    return "vision";
  return "chat";
}

interface FoundryCacheModel {
  alias?: string;
  id: string;
  displayName?: string;
  type?: string;
  device?: string;
  fileSizeMb?: number;
  cached?: boolean;
  loaded?: boolean;
  license?: string;
  supportsToolCalling?: boolean;
}

/**
 * `foundry model list` is the CLI's full public catalog. It includes models that
 * are not downloaded yet, their licenses and real sizes, which is exactly what
 * Discover needs. The cache-only command used previously hid most of the CLI.
 */
async function foundryCatalog(): Promise<Map<string, FoundryCacheModel>> {
  try {
    const { stdout } = await execFileAsync(
      "foundry",
      ["model", "list", "--output", "json"],
      { timeout: 6000, maxBuffer: 4 * 1024 * 1024 }
    );
    const parsed = JSON.parse(stdout) as { models?: FoundryCacheModel[] };
    const map = new Map<string, FoundryCacheModel>();
    for (const model of parsed.models || []) {
      map.set(model.id, model);
    }
    return map;
  } catch {
    return new Map();
  }
}

function foundryMeta(
  id: string,
  alias: string,
  catalog: Map<string, FoundryCacheModel>
): FoundryCacheModel | undefined {
  return (
    catalog.get(id) ||
    [...catalog.values()].find((entry) => entry.alias === alias)
  );
}

interface FoundryModelList {
  data: { id: string; created?: number; owned_by?: string }[];
}

function bestFoundryVariants(
  ids: string[],
  catalog: Map<string, FoundryCacheModel>
): LocalModel[] {
  const groups = new Map<string, { id: string; cache?: FoundryCacheModel }[]>();
  for (const id of ids) {
    const alias = humanizeFoundryId(id);
    const list = groups.get(alias) || [];
    list.push({ id, cache: foundryMeta(id, alias, catalog) });
    groups.set(alias, list);
  }
  const models: LocalModel[] = [];
  for (const [alias, variants] of groups) {
    variants.sort((a, b) => {
      const score = (v: { id: string; cache?: FoundryCacheModel }) =>
        (v.cache?.loaded ? 4 : 0) +
        (v.cache?.cached ? 2 : 0) +
        (v.id.includes("gpu") ? 1 : 0);
      return score(b) - score(a);
    });
    const chosen = variants[0];
    const cachedEntry = chosen.cache;
    const task =
      cachedEntry?.type === "Speech"
        ? "speech"
        : cachedEntry?.type === "Embedding"
        ? "embedding"
        : cachedEntry?.type === "Vision"
        ? "vision"
        : taskFor(alias);
    models.push({
      key: `foundry:${chosen.id}`,
      id: chosen.id,
      name: alias,
      displayName: titleCase(alias),
      provider: "foundry",
      providerLabel: "Foundry Local",
      publisher: publisherFor(alias),
      task,
      contextWindow: contextForAlias(alias),
      sizeBytes: cachedEntry?.fileSizeMb
        ? cachedEntry.fileSizeMb * 1024 * 1024
        : estimateSize(alias),
      cached: Boolean(cachedEntry?.cached),
      loaded: Boolean(cachedEntry?.loaded),
      license: cachedEntry?.license,
      version: chosen.id.includes(":")
        ? chosen.id.split(":").pop()
        : undefined,
      description: cachedEntry?.cached
        ? `Run ${titleCase(
            alias
          )} entirely on this computer through Foundry Local. Same OpenAI-compatible API, zero cloud cost.`
        : `${titleCase(
            alias
          )} is available in the Foundry Local catalog. Download it once, then run it entirely on this computer.`,
      tags: [
        "Local",
        cachedEntry?.cached ? "Downloaded" : "Download required",
        chosen.id.includes("gpu") ? "GPU" : "CPU",
      ],
    });
  }
  return models;
}

function contextForAlias(alias: string): number {
  if (alias.includes("qwen3-14b")) return 32768;
  if (alias.includes("qwen2.5-14b")) return 32768;
  if (alias.includes("deepseek-r1")) return 131072;
  if (alias.includes("gpt-oss")) return 131072;
  if (alias.includes("phi-4")) return 16384;
  if (alias.includes("embedding")) return 512;
  if (alias.includes("1.5b") || alias.includes("3b") || alias.includes("7b"))
    return 32768;
  return 4096;
}

function estimateSize(alias: string): number {
  const match = alias.match(/(\d+(?:\.\d+)?)\s*b/);
  const billions = match ? Number(match[1]) : 1;
  return Math.round(billions * 0.65 * 1024 * 1024 * 1024);
}

interface OllamaTag {
  name: string;
  model: string;
  size?: number;
  digest?: string;
  modified_at?: string;
  details?: {
    family?: string;
    parameter_size?: string;
    quantization_level?: string;
    context_length?: number;
  };
}

async function ollamaModels(): Promise<LocalModel[]> {
  try {
    const { ollama: ollamaUrl } = await getRuntimeUrls();
    const parsed = await fetchJson<{ models?: OllamaTag[] }>(
      `${ollamaUrl}/api/tags`,
      {},
      1800
    );
    return (parsed.models || []).map((tag) => {
      const name = tag.name.replace(/:latest$/, "");
      const id = tag.name;
      const task = taskFor(name);
      return {
        key: `ollama:${id}`,
        id,
        name,
        displayName: titleCase(name.replace(/^hf\.co\//, "").replace(/--/g, "/")),
        provider: "ollama" as const,
        providerLabel: "Ollama",
        publisher: name.startsWith("hf.co/")
          ? publisherFor(name.split("/").slice(-2)[0] || name)
          : publisherFor(name),
        task,
        contextWindow: tag.details?.context_length || contextForAlias(name),
        sizeBytes: tag.size,
        cached: true,
        loaded: false,
        version: tag.details?.quantization_level,
        license: "See model card",
        description: `Served locally by Ollama (${tag.details?.parameter_size || "local"} ${
          tag.details?.quantization_level || ""
        }). No data leaves this computer.`,
        tags: ["Local", "Downloaded", "Ollama"],
      };
    });
  } catch {
    return [];
  }
}

async function openAiModels(
  base: string,
  provider: ProviderId,
  providerLabel: string
): Promise<LocalModel[]> {
  try {
    const parsed = await fetchJson<FoundryModelList>(
      `${openAiRoot(base)}/models`,
      {},
      1800
    );
    return parsed.data.map((entry) => ({
      key: `${provider}:${entry.id}`,
      id: entry.id,
      name: entry.id,
      displayName: titleCase(entry.id.replace(/^.*\//, "").replace(/:latest$/, "")),
      provider,
      providerLabel,
      publisher: publisherFor(entry.id),
      task: taskFor(entry.id),
      cached: true,
      loaded: true,
      description: `Served by ${providerLabel} at ${base}.`,
      tags: ["Local", providerLabel],
    }));
  } catch {
    return [];
  }
}

async function huggingFaceModels(): Promise<LocalModel[]> {
  const { huggingface: hub } = await getRuntimeUrls();
  try {
    const entries = await fs.readdir(hub, { withFileTypes: true });
    const models: LocalModel[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!entry.name.startsWith("models--")) continue;
      const raw = entry.name.replace(/^models--/, "");
      const parts = raw.split("--");
      if (parts.length < 2) continue;
      const org = parts[0];
      const repo = parts.slice(1).join("--");
      const id = `${org}/${repo}`;
      const name = repo;
      let size = 0;
      try {
        const snapshots = path.join(hub, entry.name, "snapshots");
        const snapDirs = await fs.readdir(snapshots);
        for (const snap of snapDirs.slice(0, 1)) {
          const files = await fs.readdir(path.join(snapshots, snap));
          for (const file of files) {
            try {
              const stat = await fs.stat(path.join(snapshots, snap, file));
              if (stat.isFile()) size += stat.size;
            } catch {
              // ignore
            }
          }
        }
      } catch {
        // ignore
      }
      models.push({
        key: `huggingface:${id}`,
        id,
        name,
        displayName: titleCase(repo.replace(/-GGUF.*$/i, "").replace(/-MLX.*$/i, "")),
        provider: "huggingface",
        providerLabel: "Hugging Face cache",
        publisher: org,
        task: taskFor(name),
        sizeBytes: size || undefined,
        cached: true,
        loaded: false,
        version: name.match(/Q\d[^:]*/i)?.[0],
        description: `Found in your local Hugging Face cache (~/.cache/huggingface/hub). Deploy it through Foundry Local or Ollama to serve chat completions.`,
        tags: ["Local files", "Hugging Face"],
      });
    }
    return models;
  } catch {
    return [];
  }
}

interface HfApiModel {
  id: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  tags?: string[];
  gated?: boolean | string;
}

async function huggingFaceCatalog(): Promise<LocalModel[]> {
  try {
    const response = await fetch(
      "https://huggingface.co/api/models?filter=gguf&sort=downloads&direction=-1&limit=36",
      {
        headers: { Accept: "application/json", "User-Agent": "openFoundry/0.1" },
        signal: AbortSignal.timeout(4500),
        cache: "no-store",
      }
    );
    if (!response.ok) return [];
    const entries = (await response.json()) as HfApiModel[];
    return entries.map((entry) => ({
      key: `huggingface:${entry.id}`,
      id: entry.id,
      name: entry.id.split("/").pop() || entry.id,
      displayName: titleCase(
        (entry.id.split("/").pop() || entry.id)
          .replace(/-GGUF.*$/i, "")
          .replace(/-MLX.*$/i, "")
      ),
      provider: "huggingface",
      providerLabel: "Hugging Face",
      publisher: publisherFor(entry.id.split("/")[0] || entry.id),
      task: taskFor(entry.id),
      cached: false,
      loaded: false,
      license: entry.tags?.find((tag) => tag.startsWith("license:"))?.split(":")[1],
      description: `Downloadable from Hugging Face (${entry.downloads?.toLocaleString() || 0} downloads). Download through Ollama to run it on this computer.`,
      tags: ["Hugging Face", "Downloadable", ...(entry.gated ? ["Gated"] : [])],
    }));
  } catch {
    return [];
  }
}

export function invalidateModelCache(): void {
  cacheStore.clear();
}

export async function discoverModels(): Promise<LocalModel[]> {
  return cached("models", 8000, async () => {
    const urls = await getRuntimeUrls();
    const [foundryEndpoint, ollama, hf, hfCatalog, lmstudio, llamacpp, catalog] = await Promise.all([
      (async () => {
        try {
          const parsed = await fetchJson<FoundryModelList>(
            `${urls.foundry}/v1/models`,
            {},
            1800
          );
          return parsed.data.map((m) => m.id);
        } catch {
          return [] as string[];
        }
      })(),
      ollamaModels(),
      huggingFaceModels(),
      huggingFaceCatalog(),
      openAiModels(urls.lmstudio, "lmstudio", "LM Studio"),
      openAiModels(urls.llamacpp, "llamacpp", "llama.cpp"),
      foundryCatalog(),
    ]);
    const seenFoundry = new Set<string>();
    const foundryIds: string[] = [];
    for (const id of [
      ...foundryEndpoint,
      ...[...catalog.values()].map((entry) => entry.id),
    ]) {
      const alias = humanizeFoundryId(id);
      const key = alias.toLowerCase();
      if (seenFoundry.has(key)) continue;
      seenFoundry.add(key);
      foundryIds.push(id);
    }
    const foundryModels = bestFoundryVariants(foundryIds, catalog);
    const combined = [...foundryModels, ...ollama, ...lmstudio, ...llamacpp, ...hf, ...hfCatalog];
    const seen = new Set<string>();
    return combined.filter((model) => {
      if (seen.has(model.key)) return false;
      seen.add(model.key);
      return true;
    });
  });
}

export async function findModel(
  keyOrId: string
): Promise<LocalModel | undefined> {
  const models = await discoverModels();
  return (
    models.find((m) => m.key === keyOrId) ||
    models.find((m) => m.id === keyOrId) ||
    models.find((m) => m.key === `foundry:${keyOrId}`) ||
    models.find((m) => m.key === `ollama:${keyOrId}`) ||
    models.find((m) => m.key === `lmstudio:${keyOrId}`) ||
    models.find((m) => m.key === `llamacpp:${keyOrId}`) ||
    models.find((m) => m.key === `huggingface:${keyOrId}`)
  );
}

export async function getProviders(): Promise<ProviderStatus[]> {
  const models = await discoverModels();
  const urls = await getRuntimeUrls();
  const foundry = models.filter((m) => m.provider === "foundry");
  const ollama = models.filter((m) => m.provider === "ollama");
  const lmstudio = models.filter((m) => m.provider === "lmstudio");
  const llamacpp = models.filter((m) => m.provider === "llamacpp");
  const hf = models.filter((m) => m.provider === "huggingface");
  return [
    {
      id: "foundry",
      label: "Foundry Local",
      online: foundry.length > 0,
      url: urls.foundry,
      detail:
        foundry.length > 0
          ? `OpenAI-compatible endpoint at ${urls.foundry}`
          : "Start it with `foundry server start`",
      modelCount: foundry.length,
      cachedCount: foundry.filter((m) => m.cached).length,
    },
    {
      id: "ollama",
      label: "Ollama",
      online: ollama.length > 0,
      url: urls.ollama,
      detail:
        ollama.length > 0
          ? `Ollama daemon at ${urls.ollama}`
          : "Install from ollama.com and start the app",
      modelCount: ollama.length,
      cachedCount: ollama.length,
    },
    {
      id: "lmstudio",
      label: "LM Studio",
      online: lmstudio.length > 0,
      url: urls.lmstudio,
      detail:
        lmstudio.length > 0
          ? `OpenAI-compatible endpoint at ${urls.lmstudio}`
          : "Start the LM Studio local server",
      modelCount: lmstudio.length,
      cachedCount: lmstudio.length,
    },
    {
      id: "llamacpp",
      label: "llama.cpp",
      online: llamacpp.length > 0,
      url: urls.llamacpp,
      detail:
        llamacpp.length > 0
          ? `llama.cpp server at ${urls.llamacpp}`
          : "Start llama-server on port 8080",
      modelCount: llamacpp.length,
      cachedCount: llamacpp.length,
    },
    {
      id: "huggingface",
      label: "Hugging Face cache",
      online: hf.length > 0,
      url: urls.huggingface,
      detail: hf.length
        ? `${hf.length} repos already downloaded on this Mac`
        : "No cached repositories found",
      modelCount: hf.length,
      cachedCount: hf.length,
    },
  ];
}

export async function isFoundryCached(modelId: string): Promise<boolean> {
  const cache = await foundryCatalog();
  return Boolean(cache.get(modelId)?.cached);
}

export async function loadFoundryModel(modelId: string): Promise<void> {
  await execFileAsync("foundry", ["model", "load", modelId], {
    timeout: 120000,
    maxBuffer: 4 * 1024 * 1024,
  });
  cacheStore.delete("models");
}

export async function pullOllamaModel(modelId: string): Promise<void> {
  await execFileAsync("ollama", ["pull", modelId], {
    timeout: 30 * 60 * 1000,
    maxBuffer: 16 * 1024 * 1024,
  });
  cacheStore.delete("models");
}

export async function downloadFoundryModel(modelId: string): Promise<void> {
  await execFileAsync("foundry", ["model", "download", modelId], {
    timeout: 30 * 60 * 1000,
    maxBuffer: 8 * 1024 * 1024,
  });
  cacheStore.delete("models");
}

export async function unloadFoundryModel(modelId: string): Promise<void> {
  try {
    await execFileAsync("foundry", ["model", "unload", modelId], {
      timeout: 20000,
    });
  } catch {
    // best effort
  }
  cacheStore.delete("models");
}

export async function warmOllama(modelId: string): Promise<void> {
  try {
    const { ollama } = await getRuntimeUrls();
    await fetch(`${ollama}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: modelId,
        messages: [{ role: "user", content: "hi" }],
        stream: false,
        keep_alive: "10m",
        options: { num_predict: 1 },
      }),
      signal: AbortSignal.timeout(20000),
    });
  } catch {
    // best effort
  }
}

export async function unloadOllama(modelId: string): Promise<void> {
  try {
    const { ollama } = await getRuntimeUrls();
    await fetch(`${ollama}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelId, keep_alive: 0 }),
      signal: AbortSignal.timeout(10000),
    });
  } catch {
    // best effort
  }
}

export async function embedTexts(
  texts: string[]
): Promise<{
  vectors: number[][];
  model: string;
  provider: ProviderId | "lexical";
} | null> {
  if (texts.length === 0) return null;
  const urls = await getRuntimeUrls();
  // Ollama is the most reliable local embedding runtime on this machine.
  try {
    const tags = await fetchJson<{ models?: OllamaTag[] }>(
      `${urls.ollama}/api/tags`,
      {},
      1500
    );
    const preferred =
      (tags.models || []).find((m) => /nomic-embed/i.test(m.name)) ||
      (tags.models || []).find((m) => /embed/i.test(m.name));
    if (preferred) {
      const res = await fetch(`${urls.ollama}/api/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: preferred.name, input: texts }),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) {
        const data = (await res.json()) as { embeddings?: number[][] };
        if (data.embeddings?.length === texts.length) {
          return {
            vectors: data.embeddings,
            model: preferred.name,
            provider: "ollama",
          };
        }
      }
      // Older Ollama versions expose /api/embeddings with a single prompt.
      const vectors: number[][] = [];
      for (const text of texts) {
        const one = await fetch(`${urls.ollama}/api/embeddings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model: preferred.name, prompt: text }),
          signal: AbortSignal.timeout(60000),
        });
        if (!one.ok) throw new Error("embedding failed");
        const data = (await one.json()) as { embedding?: number[] };
        if (!data.embedding) throw new Error("embedding failed");
        vectors.push(data.embedding);
      }
      return {
        vectors,
        model: preferred.name,
        provider: "ollama",
      };
    }
  } catch {
    // fall through to Foundry Local
  }

  try {
    const embeddingModel = "qwen3-embedding-0.6b-generic-gpu:1";
    if (await isFoundryCached(embeddingModel)) {
      const res = await fetch(`${urls.foundry}/v1/embeddings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: embeddingModel, input: texts }),
        signal: AbortSignal.timeout(120000),
      });
      if (res.ok) {
        const data = (await res.json()) as {
          data?: { embedding: number[]; index: number }[];
        };
        if (data.data?.length === texts.length) {
          return {
            vectors: data.data
              .sort((a, b) => a.index - b.index)
              .map((d) => d.embedding),
            model: embeddingModel,
            provider: "foundry",
          };
        }
      }
    }
  } catch {
    // lexical fallback below
  }

  return null;
}

export function lexicalScore(query: string, text: string): number {
  const tokens = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
  if (tokens.length === 0) return 0;
  const haystack = text.toLowerCase();
  let score = 0;
  for (const token of tokens) {
    const matches = haystack.split(token).length - 1;
    if (matches > 0) score += 1 + Math.min(matches, 5) * 0.15;
  }
  return score / tokens.length;
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
