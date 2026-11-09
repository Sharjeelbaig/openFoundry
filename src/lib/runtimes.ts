// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";

import { execFile, spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { createWriteStream, promises as fs } from "fs";
import net from "net";
import os from "os";
import path from "path";
import { promisify } from "util";
import { dataDir, nowIso, readJson, writeJson } from "./store";
import { getRuntimeUrls, invalidateModelCache } from "./providers";
import {
  findExecutable,
  hasFoundryInstall,
  hasLmStudioInstall,
} from "./runtime-discovery";
import type {
  LocalSettings,
  RuntimeId,
  RuntimeJob,
  RuntimeJobStage,
  RuntimeStatus,
} from "./types";

const execFileAsync = promisify(execFile);

/**
 * Desktop runtime setup.
 *
 * openFoundry already speaks to every runtime over HTTP. What setup could not
 * do until now is *install* one: a new machine had no Ollama, no LM Studio and
 * no llama-server, so every provider stayed red and the first chat had nothing
 * to talk to.
 *
 * llama.cpp is the one runtime we can install end to end without an account or
 * an admin prompt: a static archive from GitHub plus one small GGUF from
 * Hugging Face, both into the openFoundry data directory. The other runtimes
 * have real installers of their own, so setup links to those instead of
 * pretending to manage them.
 */

const LLAMA_REPO = "ggml-org/llama.cpp";
const LOOPBACK = "127.0.0.1";

/** One small, permissively licensed model so the first chat works immediately. */
export const STARTER_MODEL = {
  file: "Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
  name: "Qwen2.5 0.5B Instruct",
  url: "https://huggingface.co/bartowski/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/Qwen2.5-0.5B-Instruct-Q4_K_M.gguf",
  sizeBytes: 397808192,
  license: "Apache-2.0",
} as const;

export const RUNTIME_INSTALL_URLS: Record<RuntimeId, string> = {
  llamacpp: "https://github.com/ggml-org/llama.cpp/releases",
  ollama: "https://ollama.com/download",
  lmstudio: "https://lmstudio.ai/",
  foundry:
    "https://learn.microsoft.com/azure/ai-foundry/foundry-local/get-started",
};

interface LlamaMeta {
  tag: string;
  asset: string;
  version: string;
  installedAt: string;
}

interface ServerState {
  child: ChildProcess;
  port: number;
  model: string;
}

interface InternalJob extends RuntimeJob {
  assetUrl?: string;
}

interface RuntimeStore {
  jobs: Map<string, InternalJob>;
  server: ServerState | null;
  log: string[];
}

const root = globalThis as unknown as {
  __openFoundryRuntimes?: RuntimeStore;
};

function store(): RuntimeStore {
  if (!root.__openFoundryRuntimes) {
    root.__openFoundryRuntimes = {
      jobs: new Map(),
      server: null,
      log: [],
    };
  }
  return root.__openFoundryRuntimes;
}

function pushLog(line: string): void {
  const lines = line
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const logs = store().log;
  logs.push(...lines);
  if (logs.length > 200) logs.splice(0, logs.length - 200);
}

function runtimesRoot(): string {
  return path.join(dataDir(), "runtimes");
}

function llamaDir(): string {
  return path.join(runtimesRoot(), "llama.cpp");
}

function serverFile(): string {
  return process.platform === "win32" ? "llama-server.exe" : "llama-server";
}

function serverPath(): string {
  return path.join(llamaDir(), serverFile());
}

function modelDir(): string {
  return path.join(dataDir(), "models", "llama.cpp");
}

function modelPath(): string {
  return path.join(modelDir(), STARTER_MODEL.file);
}

function pidFile(): string {
  return path.join(dataDir(), "llama.pid");
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** The release archive that matches this machine, if llama.cpp ships one. */
function assetName(tag: string): string | null {
  const arm = os.arch() === "arm64";
  if (process.platform === "darwin") {
    return `llama-${tag}-bin-macos-${arm ? "arm64" : "x64"}.tar.gz`;
  }
  if (process.platform === "win32") {
    return `llama-${tag}-bin-win-cpu-${arm ? "arm64" : "x64"}.zip`;
  }
  if (process.platform === "linux") {
    return `llama-${tag}-bin-ubuntu-${arm ? "arm64" : "x64"}.tar.gz`;
  }
  return null;
}

export function llamaInstallable(): boolean {
  return assetName("b0") !== null;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
}

interface Release {
  tag_name: string;
  draft?: boolean;
  prerelease?: boolean;
  assets: ReleaseAsset[];
}

/**
 * `releases/latest` currently points at a `v0.9.0` release that carries no
 * binaries, so walk the release list and take the newest one that ships a build
 * for this platform.
 */
async function resolveRelease(): Promise<{
  tag: string;
  asset: ReleaseAsset;
}> {
  const response = await fetch(
    `https://api.github.com/repos/${LLAMA_REPO}/releases?per_page=20`,
    {
      headers: {
        accept: "application/vnd.github+json",
        "user-agent": "openFoundry",
      },
      signal: AbortSignal.timeout(20_000),
    }
  );
  if (!response.ok) {
    throw new Error(
      `GitHub answered ${response.status} while looking for llama.cpp.`
    );
  }
  const releases = (await response.json()) as Release[];
  for (const release of releases) {
    if (release.draft) continue;
    const name = assetName(release.tag_name);
    if (!name) continue;
    const asset = release.assets.find((item) => item.name === name);
    if (asset) return { tag: release.tag_name, asset };
  }
  throw new Error(
    `llama.cpp has no build for ${process.platform}/${os.arch()} in its recent releases.`
  );
}

async function download(
  url: string,
  destination: string,
  onProgress: (received: number, total: number) => void,
  cancelled: () => boolean
): Promise<void> {
  const response = await fetch(url, {
    redirect: "follow",
    headers: { "user-agent": "openFoundry" },
    signal: AbortSignal.timeout(2 * 60 * 60 * 1000),
  });
  if (!response.ok || !response.body) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }
  const total = Number(response.headers.get("content-length") || 0);
  await fs.mkdir(path.dirname(destination), { recursive: true });
  const output = createWriteStream(destination);
  output.on("error", () => {
    // Errors surface through the pipeline below; this only prevents an
    // unhandled 'error' event when a cancel closes the stream mid-write.
  });
  const reader = response.body.getReader();
  let received = 0;
  try {
    for (;;) {
      if (cancelled()) throw new CancelledError();
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      onProgress(received, total);
      if (!output.write(Buffer.from(value))) {
        await new Promise<void>((resolve, reject) => {
          const onDrain = () => {
            output.off("error", onError);
            resolve();
          };
          const onError = (error: Error) => {
            output.off("drain", onDrain);
            reject(error);
          };
          output.once("drain", onDrain);
          output.once("error", onError);
        });
      }
    }
  } catch (error) {
    await new Promise<void>((resolve) => output.close(() => resolve()));
    await fs.rm(destination, { force: true }).catch(() => undefined);
    throw error;
  } finally {
    if (!output.closed) {
      await new Promise<void>((resolve) =>
        output.end(() => resolve())
      ).catch(() => undefined);
    }
  }
  onProgress(received, total || received);
}

class CancelledError extends Error {
  constructor() {
    super("Install cancelled.");
    this.name = "CancelledError";
  }
}

async function extract(archive: string, destination: string): Promise<void> {
  await fs.mkdir(destination, { recursive: true });
  if (process.platform === "win32") {
    // Windows 10 1803+ ships bsdtar, which reads zip archives.
    try {
      await execFileAsync("tar", ["-xf", archive, "-C", destination], {
        timeout: 10 * 60 * 1000,
      });
      return;
    } catch {
      const quote = (value: string) => value.replace(/'/g, "''");
      await execFileAsync(
        "powershell",
        [
          "-NoProfile",
          "-NonInteractive",
          "-Command",
          `Expand-Archive -LiteralPath '${quote(archive)}' -DestinationPath '${quote(
            destination
          )}' -Force`,
        ],
        { timeout: 10 * 60 * 1000 }
      );
      return;
    }
  }
  await execFileAsync("tar", ["-xzf", archive, "-C", destination], {
    timeout: 10 * 60 * 1000,
  });
}

/** The archive wraps its files in one `llama-bNNNN/` folder; find it. */
async function findServerDir(base: string): Promise<string | null> {
  const queue = [base];
  while (queue.length) {
    const dir = queue.shift() as string;
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
    if (entries.some((entry) => entry.isFile() && entry.name === serverFile())) {
      return dir;
    }
    for (const entry of entries) {
      if (entry.isDirectory()) queue.push(path.join(dir, entry.name));
    }
  }
  return null;
}

async function chmodExecutable(dir: string): Promise<void> {
  if (process.platform === "win32") return;
  const entries = await fs.readdir(dir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter(
        (name) =>
          name === "llama-server" ||
          name.endsWith(".dylib") ||
          name.endsWith(".so")
      )
      .map((name) => fs.chmod(path.join(dir, name), 0o755).catch(() => undefined))
  );
}

async function probeOpenAi(
  base: string,
  timeoutMs = 1500
): Promise<{ online: boolean; count: number }> {
  try {
    const response = await fetch(`${base}/v1/models`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "user-agent": "openFoundry" },
    });
    if (!response.ok) return { online: false, count: 0 };
    const json = (await response.json()) as { data?: unknown };
    return {
      online: true,
      count: Array.isArray(json.data) ? json.data.length : 0,
    };
  } catch {
    return { online: false, count: 0 };
  }
}

async function probeOllama(base: string): Promise<{ online: boolean; count: number }> {
  try {
    const response = await fetch(`${base}/api/tags`, {
      signal: AbortSignal.timeout(1500),
      headers: { "user-agent": "openFoundry" },
    });
    if (!response.ok) return { online: false, count: 0 };
    const json = (await response.json()) as { models?: unknown };
    return {
      online: true,
      count: Array.isArray(json.models) ? json.models.length : 0,
    };
  } catch {
    return { online: false, count: 0 };
  }
}

async function hasBinary(name: "foundry" | "ollama"): Promise<boolean> {
  return Boolean(await findExecutable(name));
}

function portFromUrl(value: string, fallback = 8080): number {
  try {
    const url = new URL(value);
    if (url.port) return Number(url.port);
    return url.protocol === "https:" ? 443 : 80;
  } catch {
    return fallback;
  }
}

function isLoopback(value: string): boolean {
  try {
    const url = new URL(value);
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

async function portFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, LOOPBACK);
  });
}

async function configuredLlamaUrl(): Promise<string> {
  const settings = await readJson<Partial<LocalSettings>>("settings.json", {});
  return settings.llamaCppUrl || "http://127.0.0.1:8080";
}

async function readPid(): Promise<number | null> {
  try {
    const raw = Number((await fs.readFile(pidFile(), "utf8")).trim());
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  } catch {
    return null;
  }
}

async function writePid(pid: number): Promise<void> {
  await fs.writeFile(pidFile(), String(pid), { mode: 0o600 }).catch(() => undefined);
}

async function clearPid(pid?: number): Promise<void> {
  if (pid !== undefined) {
    const current = await readPid();
    if (current !== pid) return;
  }
  await fs.rm(pidFile(), { force: true }).catch(() => undefined);
}

async function waitForExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!alive(pid)) return true;
    await delay(100);
  }
  return !alive(pid);
}

/**
 * Prove that a PID from an earlier run still belongs to llama-server. A PID can
 * be recycled after a reboot, and a stop button must never signal a stranger.
 */
async function looksLikeLlamaServer(pid: number): Promise<boolean> {
  try {
    if (process.platform === "linux") {
      const cmdline = await fs.readFile(`/proc/${pid}/cmdline`, "utf8");
      return cmdline.includes("llama-server");
    }
    if (process.platform === "darwin") {
      const { stdout } = await execFileAsync(
        "ps",
        ["-p", String(pid), "-o", "command="],
        { timeout: 3000 }
      );
      return stdout.includes("llama-server");
    }
    if (process.platform === "win32") {
      const { stdout } = await execFileAsync(
        "tasklist",
        ["/FI", `PID eq ${pid}`, "/FO", "CSV", "/NH"],
        { timeout: 5000 }
      );
      return /llama-server\.exe/i.test(stdout);
    }
  } catch {
    return false;
  }
  return false;
}

function publicJob(job: InternalJob): RuntimeJob {
  const { assetUrl: _assetUrl, ...serializable } = job;
  void _assetUrl;
  return serializable;
}

export function listRuntimeJobs(): RuntimeJob[] {
  return [...store().jobs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicJob);
}

export function getRuntimeJob(id: string): RuntimeJob | undefined {
  const job = store().jobs.get(id);
  return job ? publicJob(job) : undefined;
}

function activeJob(runtime: RuntimeId): InternalJob | undefined {
  return [...store().jobs.values()].find(
    (job) =>
      job.runtime === runtime &&
      (job.status === "queued" || job.status === "running")
  );
}

export function cancelRuntimeJob(id: string): RuntimeJob | undefined {
  const job = store().jobs.get(id);
  if (!job) return undefined;
  if (job.status === "queued" || job.status === "running") {
    job.status = "cancelled";
    job.message = "Install cancelled.";
    job.updatedAt = nowIso();
    job.finishedAt = job.updatedAt;
  }
  return publicJob(job);
}

function setStage(
  job: InternalJob,
  stage: RuntimeJobStage,
  message: string,
  progress: number
): void {
  job.stage = stage;
  job.message = message;
  job.progress = Math.max(job.progress, Math.min(100, progress));
  job.updatedAt = nowIso();
}

function cancelled(job: InternalJob): boolean {
  return job.status === "cancelled";
}

async function installLlama(job: InternalJob): Promise<void> {
  setStage(job, "runtime", "Looking for the latest llama.cpp build…", 1);
  const release = await resolveRelease();
  job.assetUrl = release.asset.browser_download_url;

  const cache = path.join(runtimesRoot(), ".cache");
  const archive = path.join(cache, release.asset.name);
  const expected = release.asset.size;
  const cached = await fs.stat(archive).catch(() => null);

  if (!cached || (expected > 0 && cached.size !== expected)) {
    setStage(
      job,
      "runtime",
      `Downloading llama.cpp ${release.tag}…`,
      2
    );
    await download(
      release.asset.browser_download_url,
      archive,
      (received, total) => {
        const size = total || expected;
        job.bytesDownloaded = received;
        job.bytesTotal = size;
        job.progress = Math.max(
          job.progress,
          size > 0 ? 2 + (received / size) * 55 : 2
        );
        job.message = `Downloading llama.cpp ${release.tag} · ${formatBytes(
          received
        )} of ${formatBytes(size)}`;
        job.updatedAt = nowIso();
      },
      () => cancelled(job)
    );
  }
  if (cancelled(job)) throw new CancelledError();

  setStage(job, "extract", "Unpacking llama.cpp…", 58);
  const staging = path.join(runtimesRoot(), ".staging", job.id);
  await fs.rm(staging, { recursive: true, force: true });
  await extract(archive, staging);
  const found = await findServerDir(staging);
  if (!found) {
    throw new Error("The llama.cpp archive did not contain llama-server.");
  }
  // Windows keeps a running executable locked, so stop before replacing it.
  await stopLlamaServer().catch(() => undefined);
  await fs.rm(llamaDir(), { recursive: true, force: true });
  await fs.mkdir(path.dirname(llamaDir()), { recursive: true });
  if (path.resolve(found) === path.resolve(staging)) {
    await fs.rename(staging, llamaDir());
  } else {
    await fs.rename(found, llamaDir());
    await fs.rm(staging, { recursive: true, force: true });
  }
  await chmodExecutable(llamaDir());
  await fs.rm(archive, { force: true }).catch(() => undefined);

  const meta: LlamaMeta = {
    tag: release.tag,
    asset: release.asset.name,
    version: release.tag.replace(/^b/, ""),
    installedAt: nowIso(),
  };
  await writeJson("llama-runtime.json", meta);

  if (cancelled(job)) throw new CancelledError();

  setStage(job, "model", `Downloading ${STARTER_MODEL.name}…`, 65);
  const target = modelPath();
  const existing = await fs.stat(target).catch(() => null);
  if (!existing || existing.size < STARTER_MODEL.sizeBytes * 0.99) {
    await fs.mkdir(modelDir(), { recursive: true });
    await download(
      STARTER_MODEL.url,
      target,
      (received, total) => {
        const size = total || STARTER_MODEL.sizeBytes;
        job.bytesDownloaded = received;
        job.bytesTotal = size;
        job.progress = Math.max(
          job.progress,
          size > 0 ? 65 + (received / size) * 30 : 65
        );
        job.message = `Downloading ${STARTER_MODEL.name} · ${formatBytes(
          received
        )} of ${formatBytes(size)}`;
        job.updatedAt = nowIso();
      },
      () => cancelled(job)
    );
  }
  if (cancelled(job)) throw new CancelledError();

  setStage(job, "start", "Starting llama-server…", 96);
  await startLlamaServer();

  setStage(job, "done", "llama.cpp is running.", 100);
  job.status = "complete";
  job.finishedAt = nowIso();
  job.updatedAt = job.finishedAt;
  invalidateModelCache();
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 MB";
  const mb = value / (1024 * 1024);
  if (mb < 1000) return `${mb.toFixed(0)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

export async function startLlamaInstall(): Promise<RuntimeJob> {
  if (!llamaInstallable()) {
    throw new Error(
      `llama.cpp has no prebuilt server for ${process.platform}/${os.arch()}. Install it from ${RUNTIME_INSTALL_URLS.llamacpp}.`
    );
  }
  const active = activeJob("llamacpp");
  if (active) return publicJob(active);

  const job: InternalJob = {
    id: `rt_${randomUUID().slice(0, 8)}`,
    runtime: "llamacpp",
    status: "running",
    stage: "runtime",
    progress: 0,
    message: "Preparing the install…",
    bytesDownloaded: 0,
    bytesTotal: 0,
    startedAt: nowIso(),
    updatedAt: nowIso(),
  };
  store().jobs.set(job.id, job);

  void installLlama(job).catch((error) => {
    if (job.status === "cancelled") return;
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = job.error;
    job.finishedAt = nowIso();
    job.updatedAt = job.finishedAt;
  });

  return publicJob(job);
}

/** Start the managed server, or adopt one that already answers on the port. */
export async function startLlamaServer(): Promise<{
  started: boolean;
  detail: string;
}> {
  const configured = await configuredLlamaUrl();
  if (!isLoopback(configured)) {
    throw new Error(
      `llama.cpp runs on this machine, but Providers points at ${configured}. Set a loopback URL (127.0.0.1) to let openFoundry manage the server.`
    );
  }
  const port = portFromUrl(configured);

  if ((await probeOpenAi(`http://127.0.0.1:${port}`)).online) {
    return { started: false, detail: "llama-server is already running." };
  }

  const binary = serverPath();
  if (!(await fileExists(binary))) {
    throw new Error("llama.cpp is not installed yet.");
  }
  if (!(await fileExists(modelPath()))) {
    throw new Error(`The model ${STARTER_MODEL.name} is missing.`);
  }
  if (!(await portFree(port))) {
    throw new Error(
      `Port ${port} is already in use by another program. Change the llama.cpp URL in Providers and try again.`
    );
  }

  const child = spawn(
    binary,
    [
      "--model",
      modelPath(),
      "--alias",
      "qwen2.5-0.5b-instruct",
      "--host",
      LOOPBACK,
      "--port",
      String(port),
      "--ctx-size",
      "4096",
      "--n-gpu-layers",
      "99",
      "--jinja",
    ],
    {
      cwd: llamaDir(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env },
    }
  );

  store().server = { child, port, model: STARTER_MODEL.file };
  if (child.pid) await writePid(child.pid);

  const collect = (chunk: Buffer) => {
    const text = chunk.toString("utf8");
    pushLog(text);
    const lines = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    const last = lines[lines.length - 1];
    if (last) {
      const job = activeJob("llamacpp");
      if (job) {
        job.message = `Starting llama-server · ${last.slice(0, 160)}`;
        job.updatedAt = nowIso();
      }
    }
  };
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);

  const exitState: { done: boolean; code: number | null } = {
    done: false,
    code: null,
  };
  child.once("exit", (code) => {
    exitState.done = true;
    exitState.code = code;
    if (store().server?.child === child) store().server = null;
    void clearPid(child.pid);
  });

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (exitState.done) {
      const tail = store().log.slice(-3).join(" ");
      throw new Error(
        `llama-server exited with code ${exitState.code}.${tail ? ` ${tail}` : ""}`
      );
    }
    if ((await probeOpenAi(`http://127.0.0.1:${port}`, 1000)).online) {
      invalidateModelCache();
      return {
        started: true,
        detail: `llama-server is listening on http://127.0.0.1:${port}.`,
      };
    }
    await delay(500);
  }

  child.kill("SIGTERM");
  throw new Error(
    "llama-server did not answer within two minutes. Check the log and try again."
  );
}

export async function stopLlamaServer(): Promise<{
  stopped: boolean;
  detail: string;
}> {
  const server = store().server;
  let pid: number | null = server?.child.pid ?? (await readPid());

  // A PID file survives reboots, and PIDs are recycled. Trust it only while it
  // still names a llama-server, unless this process started the child itself.
  if (pid && !server && !(await looksLikeLlamaServer(pid))) {
    await clearPid();
    pid = null;
  }

  if (!pid || !alive(pid)) {
    await clearPid();
    if ((await probeOpenAi(await configuredLlamaUrl())).online) {
      return {
        stopped: false,
        detail:
          "A llama-server is answering, but it was started outside openFoundry. Stop it from the terminal that launched it.",
      };
    }
    return { stopped: false, detail: "llama-server is not running." };
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch (error) {
    return {
      stopped: false,
      detail: `Could not stop llama-server: ${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
  if (!(await waitForExit(pid, 5000))) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
    await waitForExit(pid, 2000);
  }
  if (store().server?.child.pid === pid) store().server = null;
  await clearPid(pid);
  invalidateModelCache();
  return { stopped: true, detail: "llama-server stopped." };
}

export async function uninstallLlama(): Promise<void> {
  await stopLlamaServer().catch(() => undefined);
  await fs.rm(llamaDir(), { recursive: true, force: true });
  // Remove the starter model only. A GGUF the user added by hand stays.
  await fs.rm(modelPath(), { force: true });
  await fs.rmdir(modelDir()).catch(() => undefined);
  await fs.rm(path.join(dataDir(), "llama-runtime.json"), { force: true });
  invalidateModelCache();
}

export async function runtimeStatuses(): Promise<RuntimeStatus[]> {
  const urls = await getRuntimeUrls();
  const [llama, ollama, lmstudio, foundry] = await Promise.all([
    probeOpenAi(urls.llamacpp),
    probeOllama(urls.ollama),
    probeOpenAi(urls.lmstudio),
    probeOpenAi(urls.foundry),
  ]);

  const meta = await readJson<LlamaMeta | null>("llama-runtime.json", null);
  const [managedLlama, llamaBinary, ollamaPresent, foundryPresent, lmstudioPresent] =
    await Promise.all([
      fileExists(serverPath()),
      findExecutable("llama-server"),
      hasBinary("ollama"),
      hasFoundryInstall(),
      hasLmStudioInstall(),
    ]);
  const installed = managedLlama || Boolean(llamaBinary);
  const ollamaInstalled = ollama.online || ollamaPresent;
  const foundryInstalled = foundry.online || foundryPresent;
  const lmstudioInstalled = lmstudio.online || lmstudioPresent;
  const job = activeJob("llamacpp");

  const llamaState: RuntimeStatus = {
    id: "llamacpp",
    label: "llama.cpp",
    state: job
      ? "installing"
      : llama.online
      ? "running"
      : installed
      ? "stopped"
      : "missing",
    managed: managedLlama,
    url: urls.llamacpp,
    detail: llama.online
      ? `${llama.count} model${llama.count === 1 ? "" : "s"} at ${urls.llamacpp}`
      : managedLlama
      ? "Installed. The server is not running."
      : llamaBinary
      ? `Installed at ${llamaBinary.path}. Start llama-server to serve models.`
      : "Not installed on this machine.",
    modelCount: llama.count,
    installable: llamaInstallable(),
    installUrl: RUNTIME_INSTALL_URLS.llamacpp,
    version: meta?.tag,
    jobId: job?.id,
  };

  return [
    llamaState,
    {
      id: "ollama",
      label: "Ollama",
      state: ollama.online ? "running" : ollamaInstalled ? "stopped" : "missing",
      managed: false,
      url: urls.ollama,
      detail: ollama.online
        ? `${ollama.count} model${ollama.count === 1 ? "" : "s"} at ${urls.ollama}`
        : ollamaInstalled
        ? "Installed. Start the Ollama app to serve models."
        : "Not installed on this machine.",
      modelCount: ollama.count,
      installable: false,
      installUrl: RUNTIME_INSTALL_URLS.ollama,
    },
    {
      id: "lmstudio",
      label: "LM Studio",
      state: lmstudio.online
        ? "running"
        : lmstudioInstalled
        ? "stopped"
        : "missing",
      managed: false,
      url: urls.lmstudio,
      detail: lmstudio.online
        ? `${lmstudio.count} model${lmstudio.count === 1 ? "" : "s"} at ${urls.lmstudio}`
        : lmstudioInstalled
        ? "Installed. Start the local server in LM Studio."
        : "Not installed on this machine.",
      modelCount: lmstudio.count,
      installable: false,
      installUrl: RUNTIME_INSTALL_URLS.lmstudio,
    },
    {
      id: "foundry",
      label: "Foundry Local",
      state: foundry.online
        ? "running"
        : foundryInstalled
        ? "stopped"
        : "missing",
      managed: false,
      url: urls.foundry,
      detail: foundry.online
        ? `${foundry.count} model${foundry.count === 1 ? "" : "s"} at ${urls.foundry}`
        : foundryInstalled
        ? "Installed. Start it with `foundry server start`."
        : "Not installed on this machine.",
      modelCount: foundry.count,
      installable: false,
      installUrl: RUNTIME_INSTALL_URLS.foundry,
    },
  ];
}
