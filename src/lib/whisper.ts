// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { constants, promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { createWriteStream } from "fs";

const execFileAsync = promisify(execFile);

/**
 * whisper.cpp discovery and onboarding.
 *
 * The helper never pretends STT is available: it reports the exact binary and
 * model paths it found. Installing the Homebrew formula and downloading a ggml
 * model are explicit operator actions from the Speech page.
 */

export const WHISPER_MODEL_DIR = path.join(os.homedir(), ".cache", "whisper");

export interface WhisperModelSpec {
  id: string;
  label: string;
  bytes: number;
  file: string;
  url: string;
}

export const WHISPER_MODELS: WhisperModelSpec[] = [
  {
    id: "tiny.en",
    label: "Tiny (English) · 75 MB",
    bytes: 75 * 1024 * 1024,
    file: "ggml-tiny.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin",
  },
  {
    id: "base.en",
    label: "Base (English) · 142 MB",
    bytes: 142 * 1024 * 1024,
    file: "ggml-base.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin",
  },
  {
    id: "small.en",
    label: "Small (English) · 466 MB",
    bytes: 466 * 1024 * 1024,
    file: "ggml-small.en.bin",
    url: "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.en.bin",
  },
];

const BINARY_NAMES = ["whisper-cli", "whisper-cpp", "whisper"];

async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

async function existsReadable(file: string): Promise<boolean> {
  try {
    await fs.access(file, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function findOnPath(names: string[]): Promise<string | null> {
  const dirs = (process.env.PATH || "").split(path.delimiter).filter(Boolean);
  for (const name of names) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (await exists(candidate)) return candidate;
    }
  }
  return null;
}

export interface WhisperBinary {
  path: string;
  source: "WHISPER_CPP_BIN" | "PATH";
}

export interface WhisperModel {
  path: string;
  name: string;
  source: "WHISPER_MODEL" | "cache";
}

export async function findWhisperBinary(): Promise<WhisperBinary | null> {
  const fromEnv = process.env.WHISPER_CPP_BIN?.trim();
  if (fromEnv && (await exists(fromEnv))) {
    return { path: fromEnv, source: "WHISPER_CPP_BIN" };
  }
  const found = await findOnPath(BINARY_NAMES);
  return found ? { path: found, source: "PATH" } : null;
}

export async function findWhisperModel(
  preferred?: string
): Promise<WhisperModel | null> {
  const fromEnv = process.env.WHISPER_MODEL?.trim();
  if (fromEnv && (await existsReadable(fromEnv))) {
    return { path: fromEnv, name: path.basename(fromEnv), source: "WHISPER_MODEL" };
  }
  const names = [
    ...(preferred ? [preferred] : []),
    ...WHISPER_MODELS.map((model) => model.id),
    "base",
    "small",
    "tiny",
  ];
  for (const name of names) {
    const spec = WHISPER_MODELS.find((model) => model.id === name);
    const file = spec ? spec.file : `ggml-${name}.bin`;
    const candidate = path.join(WHISPER_MODEL_DIR, file);
    if (await existsReadable(candidate)) {
      return { path: candidate, name, source: "cache" };
    }
  }
  return null;
}

async function findBrew(): Promise<string | null> {
  const found = await findOnPath(["brew"]);
  if (found) return found;
  for (const candidate of ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"]) {
    if (await exists(candidate)) return candidate;
  }
  return null;
}

export interface WhisperSetupStatus {
  available: boolean;
  binary: WhisperBinary | null;
  model: WhisperModel | null;
  brewAvailable: boolean;
  installCommand: string;
  modelDir: string;
  models: (WhisperModelSpec & { downloaded: boolean; path: string })[];
  reason?: string;
}

export async function whisperSetupStatus(): Promise<WhisperSetupStatus> {
  const [binary, model, brew] = await Promise.all([
    findWhisperBinary(),
    findWhisperModel(),
    findBrew(),
  ]);
  const models = await Promise.all(
    WHISPER_MODELS.map(async (spec) => {
      const file = path.join(WHISPER_MODEL_DIR, spec.file);
      return {
        ...spec,
        downloaded: await existsReadable(file),
        path: file,
      };
    })
  );
  const reason = !binary
    ? brew
      ? "whisper.cpp is not installed. Run `brew install whisper.cpp` from the setup helper."
      : "whisper.cpp is not installed, and Homebrew was not found on PATH."
    : !model
    ? `whisper.cpp is installed at ${binary.path}, but no ggml model was found. Download one below or set WHISPER_MODEL.`
    : undefined;
  return {
    available: Boolean(binary && model),
    binary,
    model,
    brewAvailable: Boolean(brew),
    installCommand: "brew install whisper.cpp",
    modelDir: WHISPER_MODEL_DIR,
    models,
    reason,
  };
}

let installPromise: Promise<{
  alreadyInstalled: boolean;
  binary: WhisperBinary;
  log: string;
}> | null = null;

export async function installWhisperCpp(): Promise<{
  alreadyInstalled: boolean;
  binary: WhisperBinary;
  log: string;
}> {
  const current = await findWhisperBinary();
  if (current) {
    return { alreadyInstalled: true, binary: current, log: `Already installed: ${current.path}` };
  }
  if (installPromise) return installPromise;
  installPromise = (async () => {
    const brew = await findBrew();
    if (!brew) {
      throw new Error(
        "Homebrew is required to install whisper.cpp. Install Homebrew from https://brew.sh, then retry."
      );
    }
    let log = "";
    try {
      const result = await execFileAsync(brew, ["install", "whisper.cpp"], {
        timeout: 15 * 60 * 1000,
        maxBuffer: 16 * 1024 * 1024,
        env: {
          ...process.env,
          HOMEBREW_NO_AUTO_UPDATE: "1",
          HOMEBREW_NO_INSTALL_CLEANUP: "1",
        },
      });
      log = `${result.stdout || ""}${result.stderr || ""}`.trim();
    } catch (error) {
      const failure = error as { stdout?: string; stderr?: string; message?: string };
      log = `${failure.stdout || ""}${failure.stderr || ""}${failure.message || ""}`.trim();
      throw new Error(`brew install whisper.cpp failed. ${log.slice(-1200)}`);
    }
    const binary = await findWhisperBinary();
    if (!binary) {
      throw new Error(
        `brew finished, but no whisper-cli binary was found on PATH. ${log.slice(-1200)}`
      );
    }
    return { alreadyInstalled: false, binary, log: log.slice(-4000) };
  })().finally(() => {
    installPromise = null;
  });
  return installPromise;
}

const downloadPromises = new Map<
  string,
  Promise<{ model: WhisperModelSpec; path: string; bytes: number }>
>();

export async function downloadWhisperModel(modelId: string): Promise<{
  model: WhisperModelSpec;
  path: string;
  bytes: number;
}> {
  const spec = WHISPER_MODELS.find((model) => model.id === modelId);
  if (!spec) {
    throw new Error(
      `Unknown model "${modelId}". Choose one of: ${WHISPER_MODELS.map((m) => m.id).join(", ")}.`
    );
  }
  const target = path.join(WHISPER_MODEL_DIR, spec.file);
  if (await existsReadable(target)) {
    const stat = await fs.stat(target);
    return { model: spec, path: target, bytes: stat.size };
  }
  const pending = downloadPromises.get(spec.id);
  if (pending) return pending;

  const promise = (async () => {
    await fs.mkdir(WHISPER_MODEL_DIR, { recursive: true });
    const part = `${target}.part`;
    try {
      const response = await fetch(spec.url, {
        redirect: "follow",
        signal: AbortSignal.timeout(20 * 60 * 1000),
      });
      if (!response.ok || !response.body) {
        throw new Error(
          `The model download returned ${response.status} ${response.statusText}.`
        );
      }
      await pipeline(
        Readable.fromWeb(response.body as import("stream/web").ReadableStream),
        createWriteStream(part)
      );
      const stat = await fs.stat(part);
      if (stat.size < 1024 * 1024) {
        throw new Error("The downloaded model is too small to be a ggml model.");
      }
      await fs.rename(part, target);
      return { model: spec, path: target, bytes: stat.size };
    } catch (error) {
      await fs.unlink(part).catch(() => undefined);
      throw error;
    }
  })().finally(() => {
    downloadPromises.delete(spec.id);
  });
  downloadPromises.set(spec.id, promise);
  return promise;
}
