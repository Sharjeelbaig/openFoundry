// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash } from "crypto";
import { spawn } from "child_process";
import { constants, promises as fs } from "fs";
import os from "os";
import path from "path";
import { dataDir } from "./store";
import {
  coerceFieldValue,
  getExtractionModel,
  normalizeForCompare,
  parseJsonObject,
  updateExtractionModel,
  type CustomExtractionResult,
  type ExtractedFieldValue,
  type ExtractionModelRecord,
  type FoundationFieldMetric,
  type FoundationMetrics,
  type FoundationFineTune,
  type FoundationSearch,
  type FoundationSearchCandidate,
} from "./extraction";

/**
 * Fine-tuning a real local foundation model for custom extraction.
 *
 * The training run uses MLX LoRA against a small open model. It is a genuine
 * adapter fine-tune, not the feature model in extraction.ts: the adapter is
 * trained on the custom model's labeled examples, fused into the base weights,
 * and evaluated on a held-out split before it is offered for extraction.
 */

export const DEFAULT_BASE_MODEL = "Qwen/Qwen2.5-0.5B-Instruct";
export const MIN_FOUNDATION_EXAMPLES = 6;
export const DEFAULT_FOUNDATION_ITERATIONS = 80;
export interface FoundationBaseModel {
  id: string;
  label: string;
  approxBytes: number;
  validated: boolean;
  /** A pre-quantized checkpoint trained with QLoRA instead of a bf16 LoRA. */
  quantized?: boolean;
  bits?: number;
  minMemoryBytes?: number;
  defaultLearningRate?: number;
  defaultIterations?: number;
}

export const FOUNDATION_BASE_MODELS: FoundationBaseModel[] = [
  {
    id: "Qwen/Qwen2.5-0.5B-Instruct",
    label: "Qwen2.5 0.5B",
    approxBytes: 1_000_000_000,
    validated: true,
  },
  {
    id: "Qwen/Qwen2.5-1.5B-Instruct",
    label: "Qwen2.5 1.5B",
    approxBytes: 3_100_000_000,
    validated: true,
  },
  {
    id: "Qwen/Qwen2.5-7B-Instruct",
    label: "Qwen2.5 7B bf16 (not supported on 8 GB)",
    approxBytes: 15_000_000_000,
    validated: false,
  },
  {
    id: "mlx-community/Qwen2.5-7B-Instruct-4bit",
    label: "Qwen2.5 7B 4-bit (QLoRA)",
    approxBytes: 4_300_000_000,
    validated: true,
    quantized: true,
    bits: 4,
    minMemoryBytes: 6_800_000_000,
    // 1e-5 diverged to NaN after ~20 iterations on the 8 GB M1; 5e-6 stays
    // stable and learns the held-out mapping.
    defaultLearningRate: 5e-6,
    defaultIterations: 40,
  },
];

export interface FoundationCandidateSpec {
  id: string;
  learningRate: number;
  iterations: number;
  numLayers: number;
  rank: number;
}

export const FOUNDATION_SEARCH_PRESETS: FoundationCandidateSpec[] = [
  { id: "lr1e-5-it60-l8-r8", learningRate: 1e-5, iterations: 60, numLayers: 8, rank: 8 },
  { id: "lr2e-5-it80-l8-r8", learningRate: 2e-5, iterations: 80, numLayers: 8, rank: 8 },
  { id: "lr1e-5-it80-l16-r8", learningRate: 1e-5, iterations: 80, numLayers: 16, rank: 8 },
];

/** Lower learning rates for a 4-bit 7B model, where 1e-5 diverged. */
export const FOUNDATION_QLORA_SEARCH_PRESETS: FoundationCandidateSpec[] = [
  { id: "lr2e-6-it30-l8-r8", learningRate: 2e-6, iterations: 30, numLayers: 8, rank: 8 },
  { id: "lr5e-6-it30-l8-r8", learningRate: 5e-6, iterations: 30, numLayers: 8, rank: 8 },
  { id: "lr5e-6-it40-l8-r8", learningRate: 5e-6, iterations: 40, numLayers: 8, rank: 8 },
];

const MAX_LOG = 6_000;
const FOUNDATION_ROOT = "foundation";

export interface FoundationRuntimeStatus {
  available: boolean;
  python: string | null;
  mlxLmVersion: string | null;
  baseModel: string;
  baseModelCached: boolean;
  models: FoundationBaseModel[];
  preflight: FoundationPreflight;
  reason?: string;
  installCommand: string;
  setupHint: string;
}

export interface FoundationHardwareSnapshot {
  freeDiskBytes: number;
  totalMemoryBytes: number;
}

export interface FoundationPreflight {
  baseModel: string;
  label: string;
  quantized: boolean;
  bits?: number;
  approxBytes: number;
  requiredDiskBytes: number;
  requiredMemoryBytes: number;
  freeDiskBytes: number;
  totalMemoryBytes: number;
  fitsDisk: boolean;
  fitsMemory: boolean;
  ok: boolean;
  validated: boolean;
  warning?: string;
  reason?: string;
}

function gib(bytes: number): string {
  return `${(bytes / 1e9).toFixed(1)} GB`;
}

function baseModelInfo(baseModel: string): FoundationBaseModel | null {
  return (
    FOUNDATION_BASE_MODELS.find((model) => model.id === baseModel) ?? null
  );
}

/**
 * Hardware check for a base model. The disk requirement includes the download
 * cache, the fused model, the adapter and 1.5 GB of headroom. The memory
 * requirement is conservative: 1.6x the 4-bit weight size for QLoRA, or the
 * full weight size plus 2 GB for bf16.
 */
export async function foundationPreflight(
  baseModel: string,
  hardware: Partial<FoundationHardwareSnapshot> = {}
): Promise<FoundationPreflight> {
  const info = baseModelInfo(baseModel);
  const approxBytes = info?.approxBytes ?? 0;
  const requiredDiskBytes =
    approxBytes > 0
      ? info?.quantized
        ? approxBytes + 1_500_000_000
        : approxBytes * 2 + 1_500_000_000
      : 1_500_000_000;
  const requiredMemoryBytes =
    info?.minMemoryBytes ??
    (approxBytes > 0
      ? info?.quantized
        ? Math.round(approxBytes * 1.6)
        : approxBytes + 2_000_000_000
      : 2_000_000_000);
  let freeDiskBytes = hardware.freeDiskBytes;
  if (freeDiskBytes === undefined) {
    try {
      const stats = await fs.statfs(dataDir());
      freeDiskBytes = Number(stats.bavail) * Number(stats.bsize);
    } catch {
      freeDiskBytes = 0;
    }
  }
  const totalMemoryBytes = hardware.totalMemoryBytes ?? os.totalmem();
  const fitsDisk = freeDiskBytes > 0 && freeDiskBytes >= requiredDiskBytes;
  const fitsMemory = totalMemoryBytes >= requiredMemoryBytes;
  const reasons: string[] = [];
  if (!fitsDisk) {
    reasons.push(
      `needs ${gib(requiredDiskBytes)} free disk; ${gib(freeDiskBytes)} available`
    );
  }
  if (!fitsMemory) {
    reasons.push(
      `needs ${gib(requiredMemoryBytes)} unified memory; ${gib(totalMemoryBytes)} total`
    );
  }
  return {
    baseModel,
    label: info?.label ?? baseModel,
    quantized: info?.quantized === true,
    bits: info?.bits,
    approxBytes,
    requiredDiskBytes,
    requiredMemoryBytes,
    freeDiskBytes,
    totalMemoryBytes,
    fitsDisk,
    fitsMemory,
    ok: fitsDisk && fitsMemory,
    validated: info?.validated === true,
    warning: info
      ? undefined
      : "This model is not in the validated list; the size estimate is unknown.",
    reason: reasons.length ? `${reasons.join("; ")}.` : undefined,
  };
}

export async function assertFoundationFeasible(
  baseModel: string,
  hardware: Partial<FoundationHardwareSnapshot> = {}
): Promise<FoundationPreflight> {
  const preflight = await foundationPreflight(baseModel, hardware);
  if (!preflight.ok) {
    throw new Error(
      `${preflight.label} cannot run on this machine: ${preflight.reason}`
    );
  }
  return preflight;
}

export interface FoundationChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface FoundationPromptCase {
  id: string;
  messages: FoundationChatMessage[];
}

export interface FoundationTrainingCase extends FoundationPromptCase {
  expected: Record<string, unknown>;
}

export interface FoundationDataset {
  system: string;
  train: FoundationTrainingCase[];
  valid: FoundationTrainingCase[];
  test: FoundationTrainingCase[];
}

export interface FoundationTrainResult {
  model: ExtractionModelRecord;
  metrics: FoundationMetrics;
  logTail: string;
}

export interface FoundationSetupResult {
  status: FoundationRuntimeStatus;
  log: string;
}

interface CommandResult {
  code: number;
  stdout: string;
  stderr: string;
}

function exists(file: string): Promise<boolean> {
  return fs.access(file, constants.F_OK).then(
    () => true,
    () => false
  );
}

function hash(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

/**
 * The system prompt is shared by training and inference, so the fused model
 * sees exactly the instruction format it learned.
 */
export function foundationSystemPrompt(model: ExtractionModelRecord): string {
  const fields = model.fields
    .map(
      (field) =>
        `- ${field.name} (${field.type}${field.required ? ", required" : ""})${
          field.description ? `: ${field.description}` : ""
        }`
    )
    .join("\n");
  return [
    "You extract structured fields from documents.",
    "Return only one JSON object with exactly these keys:",
    fields,
    "Use null when a field is absent. Do not include markdown fences, explanations, or extra keys.",
    model.instructions ? `Additional instructions: ${model.instructions}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function expectedObject(
  model: ExtractionModelRecord,
  expected: Record<string, unknown>
): Record<string, unknown> {
  const output: Record<string, unknown> = {};
  for (const field of model.fields) {
    const value = expected[field.name];
    output[field.name] = value === undefined || value === "" ? null : value;
  }
  return output;
}

export function foundationPromptMessages(
  model: ExtractionModelRecord,
  text: string
): FoundationChatMessage[] {
  return [
    { role: "system", content: foundationSystemPrompt(model) },
    { role: "user", content: `Document:\n${text.trim()}` },
  ];
}

function trainingMessages(
  model: ExtractionModelRecord,
  text: string,
  expected: Record<string, unknown>
): FoundationChatMessage[] {
  return [
    ...foundationPromptMessages(model, text),
    {
      role: "assistant",
      content: JSON.stringify(expectedObject(model, expected)),
    },
  ];
}

/**
 * Deterministic split: shuffle by example id, hold out up to 25% for the test
 * set (at least one and at most five), then 20% of the remainder for validation.
 * The test rows never appear in training.
 */
export function buildFoundationDataset(
  model: ExtractionModelRecord
): FoundationDataset {
  if (!model.fields.length) throw new Error("Add at least one field.");
  if (model.examples.length < MIN_FOUNDATION_EXAMPLES) {
    throw new Error(
      `A foundation fine-tune needs at least ${MIN_FOUNDATION_EXAMPLES} labeled examples. Add ${MIN_FOUNDATION_EXAMPLES - model.examples.length} more.`
    );
  }
  const ordered = [...model.examples].sort((a, b) =>
    hash(a.id).localeCompare(hash(b.id))
  );
  const testCount = Math.max(1, Math.min(5, Math.floor(ordered.length * 0.25)));
  const test = ordered.slice(0, testCount);
  const rest = ordered.slice(testCount);
  const validCount = Math.max(1, Math.floor(rest.length * 0.2));
  const valid = rest.slice(0, validCount);
  const train = rest.slice(validCount);
  if (train.length < 3) {
    throw new Error(
      "A foundation fine-tune needs at least three training examples after the held-out split."
    );
  }
  const toCase = (example: (typeof ordered)[number]): FoundationTrainingCase => ({
    id: example.id,
    messages: trainingMessages(model, example.text, example.expected),
    expected: expectedObject(model, example.expected),
  });
  return {
    system: foundationSystemPrompt(model),
    train: train.map(toCase),
    valid: valid.map(toCase),
    test: test.map(toCase),
  };
}

function jsonl(cases: FoundationTrainingCase[]): string {
  return (
    cases
      .map((item) => JSON.stringify({ messages: item.messages }))
      .join("\n") + "\n"
  );
}

async function writeFoundationDataset(
  directory: string,
  dataset: FoundationDataset
): Promise<void> {
  await fs.mkdir(directory, { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(directory, "train.jsonl"), jsonl(dataset.train)),
    fs.writeFile(path.join(directory, "valid.jsonl"), jsonl(dataset.valid)),
    fs.writeFile(path.join(directory, "test.jsonl"), jsonl(dataset.test)),
    fs.writeFile(
      path.join(directory, "meta.json"),
      JSON.stringify(
        {
          system: dataset.system,
          train: dataset.train.length,
          valid: dataset.valid.length,
          test: dataset.test.length,
        },
        null,
        2
      )
    ),
  ]);
}

function runCommand(
  command: string,
  args: string[],
  options: { timeout: number; onLog?: (chunk: string) => void }
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(
        new Error(
          `Command timed out after ${Math.round(options.timeout / 1000)}s: ${command} ${args.join(" ")}`
        )
      );
    }, options.timeout);
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stdout += text;
      options.onLog?.(text);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      options.onLog?.(text);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

function runPythonJson<T>(
  python: string,
  script: string,
  payload: unknown,
  timeout: number
): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`Python helper timed out after ${Math.round(timeout / 1000)}s.`));
    }, timeout);
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const lines = stdout
        .trim()
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        try {
          const parsed = JSON.parse(lines[index]) as T & { error?: string };
          if (parsed && typeof parsed === "object" && parsed.error) {
            reject(new Error(parsed.error));
            return;
          }
          resolve(parsed);
          return;
        } catch {
          // Try the previous line.
        }
      }
      reject(
        new Error(
          `The Python helper returned no JSON (exit ${code}). ${stderr.slice(-1500)}`
        )
      );
    });
    child.stdin.write(JSON.stringify(payload));
    child.stdin.end();
  });
}

function scriptPath(name: string): string {
  return path.join(process.cwd(), "sdk", "python", "openfoundry_finetune", name);
}

async function checkPython(
  candidate: string
): Promise<{ python: string; version: string } | null> {
  try {
    const result = await runCommand(
      candidate,
      [
        "-c",
        "import mlx_lm, sys; print(getattr(mlx_lm, '__version__', 'unknown'))",
      ],
      { timeout: 20_000 }
    );
    if (result.code !== 0) return null;
    return { python: candidate, version: result.stdout.trim() || "unknown" };
  } catch {
    return null;
  }
}

let cachedStatus:
  | { at: number; value: FoundationRuntimeStatus }
  | null = null;

function baseModelCacheCandidates(baseModel: string): string[] {
  const home = os.homedir();
  const cacheName = baseModel.replace(/\//g, "--");
  return [
    path.join(home, ".cache", "huggingface", "hub", `models--${cacheName}`),
    path.join(home, ".cache", "mlx", cacheName),
  ];
}

export async function foundationStatus(
  force = false,
  baseModelOverride?: string
): Promise<FoundationRuntimeStatus> {
  if (
    !baseModelOverride &&
    !force &&
    cachedStatus &&
    Date.now() - cachedStatus.at < 30_000
  ) {
    return cachedStatus.value;
  }
  const candidates = [
    process.env.OPENFOUNDRY_MLX_PYTHON,
    path.join(dataDir(), FOUNDATION_ROOT, "venv", "bin", "python"),
    "/tmp/mlx-venv313/bin/python",
    process.env.OPENFOUNDRY_PYTHON,
    "/opt/homebrew/bin/python3.13",
    "python3.13",
    "python3",
  ].filter(Boolean) as string[];
  let found: { python: string; version: string } | null = null;
  for (const candidate of candidates) {
    found = await checkPython(candidate);
    if (found) break;
  }
  const baseModel =
    baseModelOverride?.trim() ||
    process.env.OPENFOUNDRY_FOUNDATION_BASE_MODEL ||
    DEFAULT_BASE_MODEL;
  const cached = (
    await Promise.all(baseModelCacheCandidates(baseModel).map(exists))
  ).some(Boolean);
  const preflight = await foundationPreflight(baseModel);
  const installCommand =
    "python3.13 -m venv data/foundation/venv && data/foundation/venv/bin/pip install mlx-lm";
  const value: FoundationRuntimeStatus = found
    ? {
        available: true,
        python: found.python,
        mlxLmVersion: found.version,
        baseModel,
        baseModelCached: cached,
        models: FOUNDATION_BASE_MODELS,
        preflight,
        installCommand,
        setupHint:
          "MLX LoRA runs locally. The base model downloads once on first training; inference stays on this computer.",
      }
    : {
        available: false,
        python: null,
        mlxLmVersion: null,
        baseModel,
        baseModelCached: cached,
        models: FOUNDATION_BASE_MODELS,
        preflight,
        reason:
          "MLX-LM was not found. Install it in a local venv with the setup button, or set OPENFOUNDRY_MLX_PYTHON to a Python that imports mlx_lm.",
        installCommand,
        setupHint:
          "Requires macOS on Apple silicon. Training runs on the local GPU through MLX.",
      };
  if (!baseModelOverride) {
    cachedStatus = { at: Date.now(), value };
  }
  return value;
}

async function findBasePython(): Promise<string> {
  const candidates = [
    process.env.OPENFOUNDRY_BASE_PYTHON,
    "/opt/homebrew/bin/python3.13",
    "python3.13",
    "python3",
  ].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const result = await runCommand(
        candidate,
        ["-c", "import sys; assert sys.version_info >= (3, 10)"],
        { timeout: 20_000 }
      );
      if (result.code === 0) return candidate;
    } catch {
      // Try the next candidate.
    }
  }
  throw new Error(
    "Python 3.10 or newer is required to create the MLX environment."
  );
}

let setupPromise: Promise<FoundationSetupResult> | null = null;

export async function installFoundationRuntime(): Promise<FoundationSetupResult> {
  if (setupPromise) return setupPromise;
  setupPromise = (async () => {
    const existing = await foundationStatus(true);
    if (existing.available) {
      return { status: existing, log: "MLX-LM is already available." };
    }
    const base = await findBasePython();
    const venv = path.join(dataDir(), FOUNDATION_ROOT, "venv");
    let log = "";
    const create = await runCommand(base, ["-m", "venv", venv], {
      timeout: 120_000,
      onLog: (chunk) => {
        log += chunk;
      },
    });
    if (create.code !== 0) {
      throw new Error(
        `Could not create the Python environment. ${(create.stderr || create.stdout).slice(-2000)}`
      );
    }
    const pip = path.join(venv, "bin", "pip");
    const install = await runCommand(pip, ["install", "mlx-lm"], {
      timeout: 30 * 60 * 1000,
      onLog: (chunk) => {
        log += chunk;
      },
    });
    if (install.code !== 0) {
      throw new Error(
        `pip install mlx-lm failed. ${(install.stderr || install.stdout).slice(-3000)}`
      );
    }
    const status = await foundationStatus(true);
    return { status, log: log.slice(-MAX_LOG) };
  })().finally(() => {
    setupPromise = null;
  });
  return setupPromise;
}

function clampIterations(value: number | undefined): number {
  const iterations = Number(value ?? DEFAULT_FOUNDATION_ITERATIONS);
  if (!Number.isFinite(iterations)) return DEFAULT_FOUNDATION_ITERATIONS;
  return Math.min(Math.max(Math.floor(iterations), 20), 1_000);
}

function clampLearningRate(value: number | undefined): number {
  const rate = Number(value ?? 1e-5);
  if (!Number.isFinite(rate)) return 1e-5;
  return Math.min(Math.max(rate, 1e-6), 1e-4);
}

function clampLayers(value: number | undefined): number {
  const layers = Number(value ?? 8);
  if (!Number.isFinite(layers)) return 8;
  return Math.min(Math.max(Math.floor(layers), 1), 48);
}

function safeCandidateId(value: string, index: number): string {
  const clean = value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return clean || `candidate-${index + 1}`;
}

export interface FoundationTrainOptions {
  baseModel?: string;
  iterations?: number;
  learningRate?: number;
  numLayers?: number;
  /** Run a small preset search instead of one training run. */
  search?: boolean;
  /** Optional custom candidate grid; only used when search is on. */
  candidates?: Partial<FoundationCandidateSpec>[];
  onLog?: (chunk: string) => void;
}

/**
 * Builds the candidate grid. Rank stays at 8 because the MLX CLI's default LoRA
 * rank is 8; the search varies learning rate, iterations and adapted layers.
 */
export function buildCandidateSpecs(
  options: FoundationTrainOptions = {}
): FoundationCandidateSpec[] {
  const info = options.baseModel ? baseModelInfo(options.baseModel) : null;
  const defaultLearningRate = info?.defaultLearningRate ?? 1e-5;
  const defaultIterations =
    info?.defaultIterations ?? DEFAULT_FOUNDATION_ITERATIONS;
  const custom = options.candidates?.filter(Boolean) || [];
  const searching = Boolean(options.search || custom.length);
  const presets = info?.quantized
    ? FOUNDATION_QLORA_SEARCH_PRESETS
    : FOUNDATION_SEARCH_PRESETS;
  const source = searching
    ? custom.length
      ? custom
      : presets
    : [
        {
          id: "single",
          learningRate: options.learningRate ?? defaultLearningRate,
          iterations: options.iterations ?? defaultIterations,
          numLayers: options.numLayers ?? 8,
          rank: 8,
        },
      ];
  if (source.length > 8) {
    throw new Error("At most 8 hyperparameter candidates can run in one search.");
  }
  const seen = new Set<string>();
  return source.map((entry, index) => {
    const id = safeCandidateId(String(entry.id || "candidate"), index);
    let unique = id;
    let suffix = 2;
    while (seen.has(unique)) unique = `${id}-${suffix++}`;
    seen.add(unique);
    return {
      id: unique,
      learningRate: clampLearningRate(entry.learningRate),
      iterations: clampIterations(entry.iterations),
      numLayers: clampLayers(entry.numLayers),
      rank: 8,
    };
  });
}

export function pickBestCandidate(
  candidates: FoundationSearchCandidate[]
): FoundationSearchCandidate | null {
  const successful = candidates.filter((candidate) => !candidate.error);
  if (!successful.length) return null;
  return [...successful].sort(
    (a, b) =>
      b.tunedAccuracy - a.tunedAccuracy ||
      b.tunedCorrect - a.tunedCorrect ||
      a.durationMs - b.durationMs
  )[0];
}

interface CandidateRun {
  candidate: FoundationSearchCandidate;
  metrics: FoundationMetrics;
}

async function trainAndEvaluateCandidate(input: {
  python: string;
  baseModel: string;
  datasetDir: string;
  adapterDir: string;
  spec: FoundationCandidateSpec;
  model: ExtractionModelRecord;
  dataset: FoundationDataset;
  cases: { id: string; messages: FoundationChatMessage[] }[];
  baseResults: { id: string; text: string }[];
  onLog: (chunk: string) => void;
}): Promise<CandidateRun> {
  const started = Date.now();
  await fs.rm(input.adapterDir, { recursive: true, force: true });
  const modelInfo = baseModelInfo(input.baseModel);
  const extraArgs = modelInfo?.quantized ? ["--grad-checkpoint"] : [];
  const lora = await runCommand(
    input.python,
    [
      "-m",
      "mlx_lm",
      "lora",
      "--model",
      input.baseModel,
      "--train",
      "--data",
      input.datasetDir,
      "--iters",
      String(input.spec.iterations),
      "--batch-size",
      "1",
      "--num-layers",
      String(input.spec.numLayers),
      "--learning-rate",
      String(input.spec.learningRate),
      "--adapter-path",
      input.adapterDir,
      "--val-batches",
      "1",
      "--steps-per-eval",
      String(Math.max(20, Math.floor(input.spec.iterations / 2))),
      "--save-every",
      String(Math.max(40, input.spec.iterations)),
      "--max-seq-length",
      "512",
      "--seed",
      "7",
      ...extraArgs,
    ],
    { timeout: 30 * 60 * 1000, onLog: input.onLog }
  );
  if (lora.code !== 0) {
    throw new Error(
      `MLX LoRA training failed for ${input.spec.id}. ${(lora.stderr || lora.stdout).slice(-2000)}`
    );
  }
  const evaluation = await runPythonJson<{
    results: { id: string; text: string }[];
  }>(
    input.python,
    scriptPath("evaluate.py"),
    {
      model_path: input.baseModel,
      adapter_path: input.adapterDir,
      cases: input.cases,
      max_tokens: 280,
    },
    10 * 60 * 1000
  );
  const metrics = scoreFoundationResults(
    input.model,
    input.dataset.test,
    input.baseResults,
    evaluation.results,
    input.baseModel,
    input.spec.iterations
  );
  metrics.trainExamples = input.dataset.train.length;
  metrics.validExamples = input.dataset.valid.length;
  metrics.learningRate = input.spec.learningRate;
  metrics.numLayers = input.spec.numLayers;
  metrics.rank = input.spec.rank;
  return {
    candidate: {
      ...input.spec,
      tunedCorrect: metrics.tunedCorrect,
      checks: metrics.checks,
      tunedAccuracy: metrics.tunedAccuracy,
      durationMs: Date.now() - started,
      adapterPath: input.adapterDir,
    },
    metrics,
  };
}

const trainingJobs = new Set<string>();
let activeTrainingJob: string | null = null;

export async function trainFoundationModel(
  id: string,
  options: FoundationTrainOptions = {}
): Promise<FoundationTrainResult> {
  if (trainingJobs.has(id)) {
    throw new Error("A foundation fine-tune is already running for this model.");
  }
  if (activeTrainingJob) {
    throw new Error(
      `Another foundation fine-tune is already running (${activeTrainingJob}). Wait for it to finish.`
    );
  }
  trainingJobs.add(id);
  activeTrainingJob = id;
  try {
    const model = await getExtractionModel(id);
    if (!model) throw new Error("Model not found.");
    const runtime = await foundationStatus();
    if (!runtime.available || !runtime.python) {
      throw new Error(runtime.reason || "MLX-LM is not available.");
    }
    const baseModel =
      options.baseModel?.trim() || runtime.baseModel || DEFAULT_BASE_MODEL;
    await assertFoundationFeasible(baseModel);
    const specs = buildCandidateSpecs(options);
    const dataset = buildFoundationDataset(model);
    const root = path.join(dataDir(), FOUNDATION_ROOT, id);
    const datasetDir = path.join(root, "data");
    const fusedDir = path.join(root, "fused");
    await fs.rm(fusedDir, { recursive: true, force: true });
    await writeFoundationDataset(datasetDir, dataset);

    const training: FoundationFineTune = {
      status: "training",
      baseModel,
      dataDir: datasetDir,
    };
    await updateExtractionModel(id, { foundation: training });

    let log = "";
    const onLog = (chunk: string) => {
      log += chunk;
      options.onLog?.(chunk);
    };
    const cases = dataset.test.map((item) => ({
      id: item.id,
      messages: item.messages.slice(0, 2),
    }));

    // The base model is evaluated once and reused for every candidate.
    const baseEvaluation = await runPythonJson<{
      results: { id: string; text: string }[];
    }>(
      runtime.python,
      scriptPath("evaluate.py"),
      {
        model_path: baseModel,
        cases,
        max_tokens: 280,
      },
      10 * 60 * 1000
    );

    const candidates: FoundationSearchCandidate[] = [];
    let best: CandidateRun | null = null;
    for (const spec of specs) {
      const adapterDir = path.join(root, `adapter-${spec.id}`);
      onLog(
        `\n=== Candidate ${spec.id}: lr=${spec.learningRate}, iters=${spec.iterations}, layers=${spec.numLayers} ===\n`
      );
      try {
        const run = await trainAndEvaluateCandidate({
          python: runtime.python,
          baseModel,
          datasetDir,
          adapterDir,
          spec,
          model,
          dataset,
          cases,
          baseResults: baseEvaluation.results,
          onLog,
        });
        candidates.push(run.candidate);
        if (
          !best ||
          run.candidate.tunedAccuracy > best.candidate.tunedAccuracy ||
          (run.candidate.tunedAccuracy === best.candidate.tunedAccuracy &&
            run.candidate.tunedCorrect > best.candidate.tunedCorrect) ||
          (run.candidate.tunedAccuracy === best.candidate.tunedAccuracy &&
            run.candidate.tunedCorrect === best.candidate.tunedCorrect &&
            run.candidate.durationMs < best.candidate.durationMs)
        ) {
          best = run;
        }
      } catch (error) {
        candidates.push({
          ...spec,
          tunedCorrect: 0,
          checks: 0,
          tunedAccuracy: 0,
          durationMs: 0,
          adapterPath: adapterDir,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    if (!best) {
      const error = `All foundation candidates failed. ${candidates
        .map((candidate) => `${candidate.id}: ${candidate.error}`)
        .join(" | ")
        .slice(-3000)}`;
      await updateExtractionModel(id, {
        foundation: {
          ...training,
          status: "failed",
          error,
          logTail: log.slice(-MAX_LOG),
        },
      });
      throw new Error(error);
    }

    const modelInfo = baseModelInfo(baseModel);
    const qlora = modelInfo?.quantized === true;
    if (!qlora) {
      const fuse = await runCommand(
        runtime.python,
        [
          "-m",
          "mlx_lm",
          "fuse",
          "--model",
          baseModel,
          "--adapter-path",
          best.candidate.adapterPath,
          "--save-path",
          fusedDir,
        ],
        { timeout: 10 * 60 * 1000, onLog }
      );
      if (fuse.code !== 0) {
        const error = `MLX fuse failed. ${(fuse.stderr || fuse.stdout).slice(-2000)}`;
        await updateExtractionModel(id, {
          foundation: {
            ...training,
            status: "failed",
            error,
            search: { candidates, best: best.candidate.id },
            logTail: log.slice(-MAX_LOG),
          },
        });
        throw new Error(error);
      }
    }

    // Fusing a LoRA adapter into a pre-quantized checkpoint does not reliably
    // preserve the adapter on MLX. Keep the base checkpoint and load the
    // adapter beside it for QLoRA, which is also how the adapter was evaluated.
    const tunedEvaluation = await runPythonJson<{
      results: { id: string; text: string }[];
    }>(
      runtime.python,
      scriptPath("evaluate.py"),
      {
        model_path: qlora ? baseModel : fusedDir,
        ...(qlora ? { adapter_path: best.candidate.adapterPath } : {}),
        cases,
        max_tokens: 280,
      },
      10 * 60 * 1000
    );
    const metrics = scoreFoundationResults(
      model,
      dataset.test,
      baseEvaluation.results,
      tunedEvaluation.results,
      baseModel,
      best.candidate.iterations
    );
    metrics.trainExamples = dataset.train.length;
    metrics.validExamples = dataset.valid.length;
    metrics.learningRate = best.candidate.learningRate;
    metrics.numLayers = best.candidate.numLayers;
    metrics.rank = best.candidate.rank;
    const search: FoundationSearch | undefined = options.search || options.candidates?.length
      ? { candidates, best: best.candidate.id }
      : undefined;
    const foundation: FoundationFineTune = {
      status: "ready",
      baseModel,
      adapterPath: best.candidate.adapterPath,
      modelPath: qlora ? baseModel : fusedDir,
      quantized: qlora,
      dataDir: datasetDir,
      metrics,
      ...(search ? { search } : {}),
      trainedAt: new Date().toISOString(),
      logTail: log.slice(-MAX_LOG),
    };
    const updated = await updateExtractionModel(id, { foundation });
    return { model: updated, metrics, logTail: foundation.logTail || "" };
  } finally {
    trainingJobs.delete(id);
    activeTrainingJob = null;
  }
}

export function scoreFoundationResults(
  model: ExtractionModelRecord,
  test: FoundationTrainingCase[],
  baseResults: { id: string; text: string }[],
  tunedResults: { id: string; text: string }[],
  baseModel: string,
  iterations: number
): FoundationMetrics {
  const baseById = new Map(baseResults.map((item) => [item.id, item.text]));
  const tunedById = new Map(tunedResults.map((item) => [item.id, item.text]));
  const perField: FoundationFieldMetric[] = model.fields.map((field) => ({
    field: field.name,
    checks: 0,
    baseCorrect: 0,
    tunedCorrect: 0,
  }));
  const byField = new Map(perField.map((item) => [item.field, item]));
  let checks = 0;
  let baseCorrect = 0;
  let tunedCorrect = 0;

  for (const testCase of test) {
    const expected = testCase.expected;
    const baseJson = parseJsonObject(baseById.get(testCase.id) || "");
    const tunedJson = parseJsonObject(tunedById.get(testCase.id) || "");
    for (const field of model.fields) {
      const expectedValue = normalizeForCompare(field.type, expected[field.name]);
      const baseValue = normalizeForCompare(
        field.type,
        baseJson?.[field.name]
      );
      const tunedValue = normalizeForCompare(
        field.type,
        tunedJson?.[field.name]
      );
      const metric = byField.get(field.name)!;
      metric.checks += 1;
      checks += 1;
      if (baseValue === expectedValue) {
        metric.baseCorrect += 1;
        baseCorrect += 1;
      }
      if (tunedValue === expectedValue) {
        metric.tunedCorrect += 1;
        tunedCorrect += 1;
      }
    }
  }

  const baseAccuracy = checks ? baseCorrect / checks : 0;
  const tunedAccuracy = checks ? tunedCorrect / checks : 0;
  return {
    baseModel,
    trainExamples: 0,
    validExamples: 0,
    testExamples: test.length,
    fields: model.fields.length,
    checks,
    baseCorrect,
    tunedCorrect,
    baseAccuracy,
    tunedAccuracy,
    improvement: tunedAccuracy - baseAccuracy,
    perField,
    iterations,
    evaluatedAt: new Date().toISOString(),
  };
}

/** Removes the adapter, fused model and dataset for a deleted custom model. */
export async function removeFoundationArtifacts(id: string): Promise<void> {
  await fs.rm(path.join(dataDir(), FOUNDATION_ROOT, id), {
    recursive: true,
    force: true,
  });
}

export async function extractWithFoundationModel(
  id: string,
  text: string
): Promise<CustomExtractionResult> {
  const model = await getExtractionModel(id);
  if (!model) throw new Error("Model not found.");
  const foundation = model.foundation;
  if (!foundation || foundation.status !== "ready" || !foundation.modelPath) {
    throw new Error("Train the foundation adapter before using foundation extraction.");
  }
  if (!text.trim()) throw new Error("Document text is required.");
  const runtime = await foundationStatus();
  if (!runtime.available || !runtime.python) {
    throw new Error(runtime.reason || "MLX-LM is not available.");
  }
  const result = await runPythonJson<{ text: string }>(
    runtime.python,
    scriptPath("extract.py"),
    {
      model_path: foundation.modelPath,
      ...(foundation.quantized && foundation.adapterPath
        ? { adapter_path: foundation.adapterPath }
        : {}),
      messages: foundationPromptMessages(model, text),
      max_tokens: 280,
    },
    5 * 60 * 1000
  );
  const parsed = parseJsonObject(result.text || "");
  const haystack = text.toLowerCase();
  const fields: Record<string, ExtractedFieldValue> = {};
  for (const field of model.fields) {
    const raw = parsed?.[field.name];
    const value = coerceFieldValue(field, raw);
    const lookup = String(value ?? "").toLowerCase();
    const grounded = Boolean(value !== null && lookup && haystack.includes(lookup));
    fields[field.name] = {
      value,
      confidence: value === null ? 0 : grounded ? 0.95 : 0.7,
      grounded,
      engine: "foundation",
    };
  }
  return {
    modelId: model.id,
    fields,
    missing: model.fields
      .filter((field) => fields[field.name]?.value === null)
      .map((field) => field.name),
    warnings: parsed
      ? []
      : ["The fine-tuned model did not return a valid JSON object."],
  };
}
