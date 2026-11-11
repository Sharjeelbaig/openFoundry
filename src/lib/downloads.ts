// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";

import { spawn, type ChildProcess } from "child_process";
import { randomUUID } from "crypto";
import { findModel, invalidateModelCache } from "./providers";
import { augmentedPath, findExecutable } from "./runtime-discovery";
import type { DownloadJob } from "./types";

interface InternalJob extends DownloadJob {
  child?: ChildProcess;
  timer?: NodeJS.Timeout;
}

interface DownloadStore {
  jobs: Map<string, InternalJob>;
}

const root = globalThis as unknown as {
  __openFoundryDownloads?: DownloadStore;
};

function store(): DownloadStore {
  if (!root.__openFoundryDownloads) {
    root.__openFoundryDownloads = { jobs: new Map() };
  }
  return root.__openFoundryDownloads;
}

const ANSI = /\u001b\[[0-9;?]*[A-Za-z]/g;

function cleanLine(value: string): string {
  return value.replace(ANSI, "").replace(/\u0000/g, "").trim();
}

function parseBytes(value: string, unit: string): number {
  const amount = Number(value);
  const scale: Record<string, number> = {
    B: 1,
    KB: 1024,
    MB: 1024 ** 2,
    GB: 1024 ** 3,
    TB: 1024 ** 4,
  };
  return amount * (scale[unit.toUpperCase()] || 1);
}

function parseProgress(line: string, job: InternalJob): void {
  const percent = line.match(/(\d{1,3}(?:\.\d+)?)\s*%/);
  if (percent) {
    const value = Math.max(0, Math.min(99.5, Number(percent[1])));
    // Some runtimes print multiple files; never move a job's bar backwards.
    job.progress = Math.max(job.progress, value);
  }

  const sizes = line.match(
    /([\d.]+)\s*([KMGT]?B)\s*\/\s*([\d.]+)\s*([KMGT]?B)/i
  );
  if (sizes) {
    job.bytesDownloaded = parseBytes(sizes[1], sizes[2]);
    job.bytesTotal = parseBytes(sizes[3], sizes[4]);
    if (job.bytesTotal > 0) {
      job.progress = Math.max(
        job.progress,
        Math.min(99.5, (job.bytesDownloaded / job.bytesTotal) * 100)
      );
    }
  }

  if (/verifying|writing manifest|success/i.test(line)) {
    job.progress = Math.max(job.progress, 99);
  }
}

function appendOutput(job: InternalJob, chunk: Buffer): void {
  const text = chunk.toString("utf8");
  const lines = text.split(/[\r\n]+/);
  for (const raw of lines) {
    const line = cleanLine(raw);
    if (!line) continue;
    parseProgress(line, job);
    const isNoise = /^[\s▕█░▒▓.-]*$/.test(line);
    if (!isNoise) {
      job.message = line.slice(0, 240);
      job.logs = [...job.logs.slice(-79), line.slice(0, 500)];
    }
    job.updatedAt = new Date().toISOString();
  }
}

function publicJob(job: InternalJob): DownloadJob {
  const {
    child: _child,
    timer: _timer,
    ...serializable
  } = job;
  void _child;
  void _timer;
  return serializable;
}

function findActive(modelKey: string): InternalJob | undefined {
  return [...store().jobs.values()].find(
    (job) =>
      job.modelKey === modelKey &&
      (job.status === "queued" || job.status === "running")
  );
}

export function listDownloadJobs(): DownloadJob[] {
  return [...store().jobs.values()]
    .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
    .map(publicJob);
}

export function getDownloadJob(id: string): DownloadJob | undefined {
  const job = store().jobs.get(id);
  return job ? publicJob(job) : undefined;
}

export function cancelDownloadJob(id: string): DownloadJob | undefined {
  const job = store().jobs.get(id);
  if (!job) return undefined;
  if (job.status === "queued" || job.status === "running") {
    job.status = "cancelled";
    job.message = "Download cancelled.";
    job.updatedAt = new Date().toISOString();
    job.finishedAt = job.updatedAt;
    if (job.timer) clearTimeout(job.timer);
    job.child?.kill("SIGTERM");
  }
  return publicJob(job);
}

export async function startModelDownload(
  modelKey: string,
  options: { force?: boolean } = {}
): Promise<{ job: DownloadJob; cached: boolean }> {
  const model = await findModel(modelKey);
  if (!model) throw new Error("Model not found");
  if (model.provider !== "huggingface" && model.provider !== "foundry") {
    throw new Error(
      `${model.providerLabel} already serves this model. There is nothing to download.`
    );
  }
  if (model.cached && !options.force) {
    const now = new Date().toISOString();
    const job: InternalJob = {
      id: `dl_${randomUUID().slice(0, 8)}`,
      modelKey: model.key,
      modelId: model.id,
      modelName: model.displayName,
      provider: model.provider,
      providerLabel: model.providerLabel,
      publisher: model.publisher,
      status: "complete",
      progress: 100,
      message: "Already downloaded.",
      startedAt: now,
      updatedAt: now,
      finishedAt: now,
      logs: [],
    };
    store().jobs.set(job.id, job);
    return { job: publicJob(job), cached: true };
  }

  const active = findActive(model.key);
  if (active) return { job: publicJob(active), cached: false };

  const now = new Date().toISOString();
  const command: "foundry" | "ollama" =
    model.provider === "huggingface" ? "ollama" : "foundry";
  const args =
    model.provider === "huggingface"
      ? ["pull", `hf.co/${model.id}`]
      : ["model", "download", model.id];

  const job: InternalJob = {
    id: `dl_${randomUUID().slice(0, 8)}`,
    modelKey: model.key,
    modelId: model.id,
    modelName: model.displayName,
    provider: model.provider,
    providerLabel: model.providerLabel,
    publisher: model.publisher,
    status: "queued",
    progress: 0,
    message:
      model.provider === "huggingface"
        ? "Starting download through Ollama…"
        : "Starting download through Foundry Local…",
    startedAt: now,
    updatedAt: now,
    logs: [],
  };
  store().jobs.set(job.id, job);

  // A desktop launch does not inherit the shell PATH, so resolve the runtime
  // from its documented install locations and spawn the absolute binary with an
  // augmented PATH. `spawn("foundry")` alone reports ENOENT on macOS even
  // though the CLI is installed.
  const location = await findExecutable(command);
  if (!location) {
    job.status = "error";
    job.error = `${command} was not found. Install ${job.providerLabel} or add it to PATH.`;
    job.message = job.error;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
    return { job: publicJob(job), cached: false };
  }
  // Resolving the binary can take a moment. A cancel that arrived in that
  // window must win; never spawn a job the user already stopped.
  if (job.status === "cancelled") {
    return { job: publicJob(job), cached: false };
  }

  try {
    const child = spawn(location.path, args, {
      env: { ...process.env, PATH: augmentedPath() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    job.child = child;
    job.status = "running";
    job.updatedAt = new Date().toISOString();
    child.stdout?.on("data", (chunk: Buffer) => appendOutput(job, chunk));
    child.stderr?.on("data", (chunk: Buffer) => appendOutput(job, chunk));

    job.timer = setTimeout(
      () => {
        if (job.status !== "running") return;
        job.status = "error";
        job.error = "The download timed out after 30 minutes.";
        job.message = job.error;
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
        job.child?.kill("SIGTERM");
      },
      30 * 60 * 1000
    );

    child.on("error", (error) => {
      job.status = "error";
      job.error =
        error.message.includes("ENOENT")
          ? `${command} was not found. Install ${job.providerLabel} or add it to PATH.`
          : error.message;
      job.message = job.error;
      job.finishedAt = new Date().toISOString();
      job.updatedAt = job.finishedAt;
      if (job.timer) clearTimeout(job.timer);
    });

    child.on("close", (code) => {
      if (job.timer) clearTimeout(job.timer);
      if (job.status === "cancelled" || job.status === "error") return;
      if (code === 0) {
        job.status = "complete";
        job.progress = 100;
        job.message = "Download complete.";
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
        invalidateModelCache();
      } else {
        job.status = "error";
        job.error =
          job.logs.slice(-3).join(" ") ||
          `${job.providerLabel} exited with code ${code}.`;
        job.message = job.error;
        job.finishedAt = new Date().toISOString();
        job.updatedAt = job.finishedAt;
      }
    });
  } catch (error) {
    job.status = "error";
    job.error = error instanceof Error ? error.message : String(error);
    job.message = job.error;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = job.finishedAt;
  }

  return { job: publicJob(job), cached: false };
}

/**
 * Waits for a download job to finish. Used by deployment creation so a model
 * that exists only in a catalog is fetched, not left in a permanent "Creating".
 */
export async function waitForDownload(
  jobId: string,
  timeoutMs = 2 * 60 * 60 * 1000
): Promise<DownloadJob> {
  const started = Date.now();
  for (;;) {
    const job = getDownloadJob(jobId);
    if (!job) throw new Error("Download job not found.");
    if (["complete", "error", "cancelled"].includes(job.status)) return job;
    if (Date.now() - started > timeoutMs) {
      throw new Error("The model download timed out.");
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}
