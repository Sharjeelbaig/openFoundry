// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { ChildProcess, spawn } from "child_process";
import { createWriteStream, promises as fs } from "fs";
import path from "path";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { dataDir } from "./store";
import type {
  DownloadedModel,
  DownloadState,
  OnDeviceModelSpec,
  OnDeviceRuntimeStatus,
} from "./types";

/**
 * The on-device model runtime.
 *
 * openFoundry already speaks to llama.cpp over its OpenAI-compatible HTTP API.
 * On a phone there is no Ollama, LM Studio or Foundry Local to talk to: those
 * are x86-64/glibc or macOS desktop runtimes. What a phone has is Android,
 * which is Linux with a bionic C library, and llama.cpp ships native Android
 * arm64 binaries for exactly that userland.
 *
 * The Android build bundles:
 *   - `libllamaserver.so` in the app's nativeLibraryDir (the llama-server
 *     executable, renamed so Android extracts and executes it: Android 10+
 *     only runs native code from that directory), and
 *   - the llama/ggml shared objects plus the ggml CPU backends in
 *     `runtime/llama/lib` inside the app's private directory.
 *
 * This module downloads a GGUF into the data directory and starts llama-server
 * on the loopback port the llama.cpp provider already probes. Nothing else in
 * the app has to change: the Models and Providers screens light up by
 * themselves once the server answers `/v1/models`.
 */

const LOOPBACK = "127.0.0.1";

/**
 * A short, curated list of small GGUF chat models that run on a phone without a
 * GPU. All are Q4_K_M for a good size/quality tradeoff. The list is data, not
 * policy: any GGUF dropped into the models directory is also usable.
 */
export const ON_DEVICE_MODELS: OnDeviceModelSpec[] = [
  {
    file: "SmolLM2-135M-Instruct-Q4_K_M.gguf",
    name: "SmolLM2 135M Instruct",
    params: "135M",
    quantization: "Q4_K_M",
    sizeBytes: 105454432,
    url: "https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/resolve/main/SmolLM2-135M-Instruct-Q4_K_M.gguf",
    license: "Apache-2.0",
    description: "Tiny and fast. Good for trying the on-device runtime on any phone.",
    recommendedRamBytes: 1024 * 1024 * 1024,
  },
  {
    file: "qwen2.5-0.5b-instruct-q4_k_m.gguf",
    name: "Qwen2.5 0.5B Instruct",
    params: "0.5B",
    quantization: "Q4_K_M",
    sizeBytes: 491400032,
    url: "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf",
    license: "Apache-2.0",
    description: "Small but genuinely useful for chat, extraction and tool calls.",
    recommendedRamBytes: 2 * 1024 * 1024 * 1024,
  },
  {
    file: "Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    name: "Llama 3.2 1B Instruct",
    params: "1B",
    quantization: "Q4_K_M",
    sizeBytes: 807694464,
    url: "https://huggingface.co/bartowski/Llama-3.2-1B-Instruct-GGUF/resolve/main/Llama-3.2-1B-Instruct-Q4_K_M.gguf",
    license: "Llama 3.2 Community License",
    description: "Better reasoning on phones with 6 GB RAM or more.",
    recommendedRamBytes: 4 * 1024 * 1024 * 1024,
  },
];

interface Running {
  child: ChildProcess;
  model: string;
  ready: boolean;
}

const globalRuntime = globalThis as unknown as {
  __openFoundryLlama?: {
    running: Running | null;
    downloads: Map<string, DownloadState>;
    logs: string[];
  };
};

function state() {
  if (!globalRuntime.__openFoundryLlama) {
    globalRuntime.__openFoundryLlama = {
      running: null,
      downloads: new Map(),
      logs: [],
    };
  }
  return globalRuntime.__openFoundryLlama;
}

function pushLog(line: string): void {
  const store = state();
  for (const part of line.split(/\r?\n/)) {
    const clean = part.trim();
    if (!clean) continue;
    store.logs.push(clean);
  }
  if (store.logs.length > 200) store.logs.splice(0, store.logs.length - 200);
}

export function onDevicePort(): number {
  const raw = Number(process.env.OPENFOUNDRY_LLAMA_PORT || "8080");
  return Number.isFinite(raw) && raw > 0 ? raw : 8080;
}

export function modelsDir(): string {
  return path.join(dataDir(), "models");
}

function binaryPath(): string | null {
  const fromEnv = process.env.OPENFOUNDRY_LLAMA_SERVER?.trim();
  if (fromEnv) return fromEnv;
  const libDir = process.env.OPENFOUNDRY_NATIVE_LIB_DIR?.trim();
  if (libDir) return path.join(libDir, "libllamaserver.so");
  return null;
}

function libDirPath(): string | null {
  const fromEnv = process.env.OPENFOUNDRY_LLAMA_LIB_DIR?.trim();
  return fromEnv || null;
}

async function fileExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** Whether the bundled runtime payload is present and executable. */
export async function runtimeAvailable(): Promise<boolean> {
  const binary = binaryPath();
  const libDir = libDirPath();
  if (!binary || !libDir) return false;
  if (!(await fileExists(binary))) return false;
  // libggml.so and the base library must be beside the CPU backends.
  return (
    (await fileExists(path.join(libDir, "libggml.so"))) &&
    (await fileExists(path.join(libDir, "libllama.so")))
  );
}

export async function listDownloadedModels(): Promise<DownloadedModel[]> {
  const dir = modelsDir();
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const models: DownloadedModel[] = [];
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".gguf")) continue;
      const stat = await fs.stat(path.join(dir, entry.name));
      models.push({
        file: entry.name,
        sizeBytes: stat.size,
        spec: ON_DEVICE_MODELS.find((m) => m.file === entry.name),
      });
    }
    return models.sort((a, b) => a.file.localeCompare(b.file));
  } catch {
    return [];
  }
}

export async function runtimeStatus(): Promise<OnDeviceRuntimeStatus> {
  const store = state();
  const binary = binaryPath();
  const libDir = libDirPath();
  const available = await runtimeAvailable();
  const models = await listDownloadedModels();
  const mobile = process.platform === "android" || Boolean(process.env.OPENFOUNDRY_LLAMA_SERVER);
  const running = store.running;
  const alive = running && running.child.exitCode === null ? running : null;
  if (running && running.child.exitCode !== null) store.running = null;
  return {
    available,
    mobile,
    platform: process.platform,
    binary,
    libDir,
    modelsDir: modelsDir(),
    port: onDevicePort(),
    running: Boolean(alive),
    ready: Boolean(alive?.ready),
    pid: alive?.child.pid ?? null,
    model: alive?.model ?? null,
    models,
    catalog: ON_DEVICE_MODELS,
    downloads: [...store.downloads.values()],
    logs: store.logs.slice(-40),
    note: available
      ? undefined
      : "This build does not include the on-device llama.cpp runtime.",
  };
}

async function isReady(): Promise<boolean> {
  try {
    const res = await fetch(`http://${LOOPBACK}:${onDevicePort()}/health`, {
      signal: AbortSignal.timeout(1500),
      cache: "no-store",
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function stopOnDeviceRuntime(): Promise<void> {
  const store = state();
  const running = store.running;
  if (!running) return;
  store.running = null;
  const child = running.child;
  try {
    child.kill("SIGTERM");
  } catch {
    // already gone
  }
  await new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      try {
        child.kill("SIGKILL");
      } catch {
        // already gone
      }
      resolve();
    }, 4000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

export async function startOnDeviceRuntime(
  file: string,
  opts: { contextSize?: number } = {}
): Promise<{ ok: boolean; error?: string }> {
  const store = state();
  const modelPath = path.join(modelsDir(), file);

  if (!(await fileExists(modelPath))) {
    return { ok: false, error: `Model "${file}" is not downloaded.` };
  }
  const binary = binaryPath();
  const libDir = libDirPath();
  if (!binary || !libDir || !(await runtimeAvailable())) {
    return { ok: false, error: "The on-device llama.cpp runtime is not available in this build." };
  }

  const current = store.running;
  if (current && current.child.exitCode === null) {
    if (current.model === file && (await isReady())) return { ok: true };
    await stopOnDeviceRuntime();
  }

  const port = onDevicePort();
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH
      ? `${libDir}:${process.env.LD_LIBRARY_PATH}`
      : libDir,
  };

  const args = [
    "-m",
    modelPath,
    "--host",
    LOOPBACK,
    "--port",
    String(port),
    "-c",
    String(opts.contextSize ?? 4096),
    "--no-webui",
  ];

  pushLog(`Starting llama-server for ${file} on ${LOOPBACK}:${port}`);
  const child = spawn(binary, args, { env, stdio: ["ignore", "pipe", "pipe"] });
  const running: Running = { child, model: file, ready: false };
  store.running = running;
  child.stdout?.on("data", (buf: Buffer) => pushLog(buf.toString()));
  child.stderr?.on("data", (buf: Buffer) => pushLog(buf.toString()));
  child.on("exit", (code) => {
    pushLog(`llama-server exited with code ${code ?? "null"}`);
    if (store.running?.child === child) store.running = null;
  });
  child.on("error", (error) => pushLog(`llama-server failed to start: ${error.message}`));

  // Wait for the health endpoint so callers can chat immediately.
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const tail = store.logs.slice(-4).join(" | ");
      return { ok: false, error: `llama-server exited early. ${tail}` };
    }
    if (await isReady()) {
      running.ready = true;
      pushLog(`llama-server is ready on ${LOOPBACK}:${port}`);
      return { ok: true };
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return { ok: false, error: "llama-server did not become ready within 60 seconds." };
}

/**
 * Start the runtime with any downloaded model, preferring the smallest. Used at
 * boot so an already-provisioned phone serves models without a first visit to
 * the settings screen.
 */
export async function autoStartOnDeviceRuntime(): Promise<void> {
  if (!(await runtimeAvailable())) return;
  if (await isReady()) return;
  const models = await listDownloadedModels();
  if (models.length === 0) return;
  const preferred =
    models.find((m) => m.spec && m.spec.params === "0.5B") ||
    models.sort((a, b) => a.sizeBytes - b.sizeBytes)[0];
  await startOnDeviceRuntime(preferred.file);
}

export async function downloadOnDeviceModel(
  file: string
): Promise<{ ok: boolean; error?: string }> {
  const spec = ON_DEVICE_MODELS.find((m) => m.file === file);
  if (!spec) return { ok: false, error: `Unknown model "${file}".` };
  const store = state();
  if (store.downloads.has(file)) return { ok: false, error: "That model is already downloading." };

  const dir = modelsDir();
  await fs.mkdir(dir, { recursive: true });
  const target = path.join(dir, file);
  if (await fileExists(target)) return { ok: true };

  const temp = `${target}.part`;
  const progress: DownloadState = { file, received: 0, total: spec.sizeBytes };
  store.downloads.set(file, progress);
  pushLog(`Downloading ${spec.name} (${(spec.sizeBytes / 1e6).toFixed(0)} MB)`);

  try {
    const res = await fetch(spec.url, { redirect: "follow" });
    if (!res.ok || !res.body) throw new Error(`Download failed: HTTP ${res.status}`);
    const total = Number(res.headers.get("content-length")) || spec.sizeBytes;
    progress.total = total;

    const source = Readable.fromWeb(res.body as Parameters<typeof Readable.fromWeb>[0]);
    source.on("data", (chunk: Buffer) => {
      progress.received += chunk.length;
    });
    await pipeline(source, createWriteStream(temp));
    if (progress.received < total * 0.99) {
      throw new Error("Download ended early. Check the connection and try again.");
    }
    await fs.rename(temp, target);
    pushLog(`Downloaded ${spec.name}`);
    return { ok: true };
  } catch (error) {
    await fs.rm(temp, { force: true });
    const message = error instanceof Error ? error.message : "download failed";
    progress.error = message;
    pushLog(`Download failed for ${spec.name}: ${message}`);
    return { ok: false, error: message };
  } finally {
    // Keep the final state briefly so the UI can show 100% or the error.
    setTimeout(() => store.downloads.delete(file), 15000).unref?.();
  }
}

export async function deleteOnDeviceModel(file: string): Promise<boolean> {
  if (state().running?.model === file) await stopOnDeviceRuntime();
  try {
    await fs.rm(path.join(modelsDir(), path.basename(file)), { force: true });
    return true;
  } catch {
    return false;
  }
}
