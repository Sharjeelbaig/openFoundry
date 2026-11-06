// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { completeChat } from "./chat";
import { resolveLanguageModel } from "./language";
import { extractStructured } from "./structured";
import { newId, nowIso, readJson, writeJson } from "./store";

/**
 * Custom extraction models.
 *
 * A model is a field schema plus labeled examples. Extraction is example-driven
 * through the local chat deployment; it is not a trained neural network. Metrics
 * are leave-one-out checks against the same extractor, so they are reproducible
 * rather than guessed.
 */

const FILE = "extraction-models.json";

export type ExtractionFieldType = "string" | "number" | "date" | "boolean";

export interface ExtractionField {
  name: string;
  type: ExtractionFieldType;
  description?: string;
  required?: boolean;
}

export interface ExtractionExample {
  id: string;
  text: string;
  expected: Record<string, unknown>;
  createdAt: string;
}

export interface ExtractionMetrics {
  examples: number;
  fields: number;
  matched: number;
  accuracy: number;
  evaluatedAt: string;
}

/**
 * A small trainable feature model. One hidden layer with tanh, one logistic
 * output, trained locally with SGD. This is a genuine neural layer over
 * document candidates, not a fine-tuned foundation model.
 */
export interface NeuralFieldModel {
  inputSize: number;
  hiddenSize: number;
  weightsHidden: number[][];
  biasHidden: number[];
  weightsOutput: number[];
  biasOutput: number;
  threshold: number;
  positives: number;
  negatives: number;
}

export interface NeuralMetrics {
  fields: number;
  checks: number;
  correct: number;
  accuracy: number;
  evaluatedAt: string;
}

export interface NeuralExtraction {
  fields: Record<string, NeuralFieldModel>;
  metrics?: NeuralMetrics;
  trainedAt: string;
}

export interface FoundationFieldMetric {
  field: string;
  checks: number;
  baseCorrect: number;
  tunedCorrect: number;
}

export interface FoundationMetrics {
  baseModel: string;
  trainExamples: number;
  validExamples: number;
  testExamples: number;
  fields: number;
  checks: number;
  baseCorrect: number;
  tunedCorrect: number;
  baseAccuracy: number;
  tunedAccuracy: number;
  improvement: number;
  perField: FoundationFieldMetric[];
  iterations: number;
  learningRate?: number;
  numLayers?: number;
  rank?: number;
  evaluatedAt: string;
}

export interface FoundationSearchCandidate {
  id: string;
  learningRate: number;
  iterations: number;
  numLayers: number;
  rank: number;
  tunedCorrect: number;
  checks: number;
  tunedAccuracy: number;
  durationMs: number;
  adapterPath: string;
  error?: string;
}

export interface FoundationSearch {
  candidates: FoundationSearchCandidate[];
  best: string;
}

export interface FoundationFineTune {
  status: "training" | "ready" | "failed";
  baseModel: string;
  adapterPath?: string;
  modelPath?: string;
  /** True when the base checkpoint is quantized and the adapter is loaded beside it. */
  quantized?: boolean;
  dataDir?: string;
  metrics?: FoundationMetrics;
  search?: FoundationSearch;
  error?: string;
  logTail?: string;
  trainedAt?: string;
}

export interface ExtractionModelRecord {
  id: string;
  name: string;
  description: string;
  fields: ExtractionField[];
  examples: ExtractionExample[];
  instructions: string;
  model?: string;
  status: "draft" | "ready";
  metrics?: ExtractionMetrics;
  neural?: NeuralExtraction;
  foundation?: FoundationFineTune;
  createdAt: string;
  updatedAt: string;
}

export interface ExtractedFieldValue {
  value: string | number | boolean | null;
  confidence: number;
  grounded: boolean;
  engine?: "neural" | "llm" | "foundation" | "none";
  neuralScore?: number;
}

export interface CustomExtractionResult {
  modelId: string;
  fields: Record<string, ExtractedFieldValue>;
  missing: string[];
  warnings: string[];
}

const FIELD_NAME = /^[a-z][a-z0-9_]{0,39}$/;
const FIELD_TYPES = new Set<ExtractionFieldType>([
  "string",
  "number",
  "date",
  "boolean",
]);

function validateFields(fields: ExtractionField[]): ExtractionField[] {
  if (!fields.length) throw new Error("Add at least one field.");
  if (fields.length > 40) throw new Error("A model can have at most 40 fields.");
  const seen = new Set<string>();
  return fields.map((field) => {
    const name = String(field.name || "").trim();
    if (!FIELD_NAME.test(name)) {
      throw new Error(
        `Field "${name}" must start with a letter and use lowercase letters, numbers or underscores.`
      );
    }
    if (seen.has(name)) throw new Error(`Field "${name}" is duplicated.`);
    seen.add(name);
    const type = String(field.type || "string") as ExtractionFieldType;
    if (!FIELD_TYPES.has(type)) {
      throw new Error(`Field "${name}" has an unknown type.`);
    }
    return {
      name,
      type,
      description: field.description?.trim() || undefined,
      required: Boolean(field.required),
    };
  });
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  const direct = text.trim();
  const attempt = (value: string) => {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  return (
    attempt(direct) ||
    (() => {
      const match = /\{[\s\S]*\}/.exec(direct);
      return match ? attempt(match[0]) : null;
    })()
  );
}

async function allModels(): Promise<ExtractionModelRecord[]> {
  return readJson<ExtractionModelRecord[]>(FILE, []);
}

async function saveModels(models: ExtractionModelRecord[]): Promise<void> {
  await writeJson(FILE, models);
}

export async function listExtractionModels(): Promise<ExtractionModelRecord[]> {
  return allModels();
}

export async function getExtractionModel(
  id: string
): Promise<ExtractionModelRecord | null> {
  return (await allModels()).find((model) => model.id === id) || null;
}

export async function createExtractionModel(input: {
  name: string;
  description?: string;
  fields: ExtractionField[];
  instructions?: string;
  model?: string;
}): Promise<ExtractionModelRecord> {
  const models = await allModels();
  const name = input.name.trim();
  if (!name) throw new Error("A model name is required.");
  if (models.some((model) => model.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A custom extraction model with that name already exists.");
  }
  const now = nowIso();
  const created: ExtractionModelRecord = {
    id: newId("xmdl"),
    name,
    description: input.description?.trim() || "",
    fields: validateFields(input.fields),
    examples: [],
    instructions: input.instructions?.trim() || "",
    model: input.model?.trim() || undefined,
    status: "draft",
    createdAt: now,
    updatedAt: now,
  };
  models.push(created);
  await saveModels(models);
  return created;
}

export async function deleteExtractionModel(id: string): Promise<void> {
  const models = await allModels();
  const next = models.filter((model) => model.id !== id);
  if (next.length === models.length) throw new Error("Model not found.");
  await saveModels(next);
}

export async function updateExtractionModel(
  id: string,
  patch: Partial<ExtractionModelRecord>
): Promise<ExtractionModelRecord> {
  const models = await allModels();
  const index = models.findIndex((item) => item.id === id);
  if (index === -1) throw new Error("Model not found.");
  models[index] = {
    ...models[index],
    ...patch,
    id: models[index].id,
    createdAt: models[index].createdAt,
    updatedAt: nowIso(),
  };
  await saveModels(models);
  return models[index];
}

export async function addExtractionExample(
  id: string,
  input: { text: string; expected: Record<string, unknown> }
): Promise<ExtractionModelRecord> {
  const models = await allModels();
  const model = models.find((item) => item.id === id);
  if (!model) throw new Error("Model not found.");
  const text = input.text.trim();
  if (!text) throw new Error("Example text is required.");
  if (text.length > 50_000) throw new Error("Example text is limited to 50000 characters.");
  if (model.examples.length >= 50) {
    throw new Error("A model can have at most 50 labeled examples.");
  }
  const expected: Record<string, unknown> = {};
  for (const field of model.fields) {
    const value = input.expected?.[field.name];
    if (value !== null && value !== undefined && value !== "") {
      expected[field.name] = value;
    } else if (field.required) {
      throw new Error(`Example is missing required field "${field.name}".`);
    }
  }
  model.examples.push({
    id: newId("xex"),
    text,
    expected,
    createdAt: nowIso(),
  });
  model.status = "draft";
  model.metrics = undefined;
  model.neural = undefined;
  model.foundation = undefined;
  model.updatedAt = nowIso();
  await saveModels(models);
  return model;
}

function exampleBlock(example: ExtractionExample): string {
  return `EXAMPLE\n${example.text.slice(0, 4000)}\nEXPECTED\n${JSON.stringify(
    example.expected
  )}`;
}

function schemaBlock(model: ExtractionModelRecord): string {
  return model.fields
    .map(
      (field) =>
        `- ${field.name} (${field.type}${field.required ? ", required" : ""})${
          field.description ? `: ${field.description}` : ""
        }`
    )
    .join("\n");
}

export function coerceFieldValue(
  field: ExtractionField,
  raw: unknown
): string | number | boolean | null {
  if (raw === null || raw === undefined || raw === "") return null;
  if (field.type === "number") {
    const number = Number(String(raw).replace(/,/g, "").replace(/[$€£]/g, ""));
    return Number.isFinite(number) ? number : null;
  }
  if (field.type === "boolean") {
    const text = String(raw).toLowerCase();
    if (raw === true || text === "true" || text === "yes") return true;
    if (raw === false || text === "false" || text === "no") return false;
    return null;
  }
  return String(raw).trim() || null;
}

interface Candidate {
  value: string;
  label: string;
  kind: "keyValue" | "table";
  line: number;
  page: number;
}

function candidatesFor(text: string): Candidate[] {
  const structured = extractStructured(text, "text");
  const candidates: Candidate[] = [];
  const seen = new Set<string>();
  const add = (value: string, label: string, kind: Candidate["kind"], line: number, page: number) => {
    const clean = value.trim();
    const cleanLabel = label.trim();
    if (!clean) return;
    const key = `${cleanLabel.toLowerCase()}\u0000${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ value: clean, label: cleanLabel, kind, line, page });
  };
  for (const pair of structured.keyValues) {
    add(pair.value, pair.key, "keyValue", pair.line, pair.page);
  }
  for (const table of structured.tables) {
    table.rows.forEach((row, rowIndex) => {
      row.forEach((cell, cellIndex) => {
        add(
          cell,
          table.columns[cellIndex] || "",
          "table",
          table.lineStart + rowIndex,
          table.page
        );
      });
    });
  }
  return candidates;
}

function tokens(value: string): Set<string> {
  return new Set(
    value
      .toLowerCase()
      .match(/[a-z0-9]+/g)
      ?.filter((token) => token.length > 1) || []
  );
}

function trigrams(value: string): Set<string> {
  const text = value.toLowerCase().replace(/\s+/g, " ").trim();
  const grams = new Set<string>();
  for (let index = 0; index + 3 <= text.length; index += 1) {
    grams.add(text.slice(index, index + 3));
  }
  return grams;
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let intersection = 0;
  for (const item of a) if (b.has(item)) intersection += 1;
  return intersection / (a.size + b.size - intersection);
}

function typeMatch(field: ExtractionField, value: string): number {
  const trimmed = value.trim();
  const numeric = /^[$€£]?\s*-?[\d,]+(?:\.\d+)?%?$/.test(trimmed);
  const date = /^\d{1,4}[-/]\d{1,2}[-/]\d{1,4}$/.test(trimmed);
  const boolean = /^(true|false|yes|no)$/i.test(trimmed);
  if (field.type === "number") return numeric ? 1 : 0;
  if (field.type === "date") return date ? 1 : 0;
  if (field.type === "boolean") return boolean ? 1 : 0;
  return numeric || date || boolean ? 0.25 : 1;
}

function candidateFeatures(candidate: Candidate, field: ExtractionField): number[] {
  const fieldText = `${field.name.replace(/_/g, " ")} ${field.description || ""}`.trim();
  const labelTokens = tokens(candidate.label);
  const fieldTokens = tokens(fieldText);
  const value = candidate.value;
  const digits = (value.match(/\d/g) || []).length;
  const uppers = (value.match(/[A-Z]/g) || []).length;
  const letters = (value.match(/[A-Za-z]/g) || []).length;
  const exactToken = [...fieldTokens].some((token) => labelTokens.has(token)) ? 1 : 0;
  return [
    jaccard(labelTokens, fieldTokens),
    jaccard(trigrams(candidate.label), trigrams(fieldText)),
    exactToken,
    typeMatch(field, value),
    Math.min(1, Math.log(1 + value.length) / 6),
    value.length ? digits / value.length : 0,
    value.length ? uppers / Math.max(1, letters) : 0,
    /[$€£]/.test(value) ? 1 : 0,
    candidate.kind === "table" ? 1 : 0,
    Math.min(1, candidate.label.length / 40),
    1,
  ];
}

function normalizeValue(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[$,€£]/g, "")
    .replace(/\u2010|\u2011/g, "-")
    .trim();
}

interface NeuralSample {
  x: number[];
  y: number;
}

function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sigmoid(value: number): number {
  if (value >= 0) return 1 / (1 + Math.exp(-value));
  const exp = Math.exp(value);
  return exp / (1 + exp);
}

function trainNetwork(
  samples: NeuralSample[],
  seed: number,
  hiddenSize = 8
): NeuralFieldModel | null {
  if (!samples.length) return null;
  const positives = samples.filter((sample) => sample.y === 1).length;
  const negatives = samples.length - positives;
  if (positives === 0 || negatives === 0) return null;
  const inputSize = samples[0].x.length;
  const random = seeded(seed);
  const weightsHidden = Array.from({ length: hiddenSize }, () =>
    Array.from({ length: inputSize }, () => (random() - 0.5) * 0.8)
  );
  const biasHidden = Array.from({ length: hiddenSize }, () => (random() - 0.5) * 0.2);
  const weightsOutput = Array.from({ length: hiddenSize }, () => (random() - 0.5) * 0.8);
  let biasOutput = (random() - 0.5) * 0.2;
  const positiveWeight = Math.min(6, negatives / positives);
  const learningRate = 0.08;
  const l2 = 0.0005;

  for (let epoch = 0; epoch < 450; epoch += 1) {
    const order = samples.map((_, index) => index);
    for (let index = order.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(random() * (index + 1));
      [order[index], order[swap]] = [order[swap], order[index]];
    }
    for (const sampleIndex of order) {
      const sample = samples[sampleIndex];
      const hidden = weightsHidden.map((weights, index) =>
        Math.tanh(weights.reduce((sum, weight, feature) => sum + weight * sample.x[feature], 0) + biasHidden[index])
      );
      const output = sigmoid(weightsOutput.reduce((sum, weight, index) => sum + weight * hidden[index], 0) + biasOutput);
      const weight = sample.y === 1 ? positiveWeight : 1;
      const delta = (output - sample.y) * weight;
      for (let index = 0; index < hiddenSize; index += 1) {
        const gradient = delta * hidden[index];
        weightsOutput[index] -= learningRate * (gradient + l2 * weightsOutput[index]);
      }
      biasOutput -= learningRate * delta;
      for (let index = 0; index < hiddenSize; index += 1) {
        const hiddenDelta = delta * weightsOutput[index] * (1 - hidden[index] * hidden[index]);
        for (let feature = 0; feature < inputSize; feature += 1) {
          weightsHidden[index][feature] -=
            learningRate * (hiddenDelta * sample.x[feature] + l2 * weightsHidden[index][feature]);
        }
        biasHidden[index] -= learningRate * hiddenDelta;
      }
    }
  }
  return {
    inputSize,
    hiddenSize,
    weightsHidden,
    biasHidden,
    weightsOutput,
    biasOutput,
    threshold: 0.5,
    positives,
    negatives,
  };
}

function scoreCandidate(network: NeuralFieldModel, x: number[]): number {
  const hidden = network.weightsHidden.map((weights, index) =>
    Math.tanh(
      weights.reduce((sum, weight, feature) => sum + weight * x[feature], 0) +
        network.biasHidden[index]
    )
  );
  return sigmoid(
    network.weightsOutput.reduce((sum, weight, index) => sum + weight * hidden[index], 0) +
      network.biasOutput
  );
}

function samplesForField(
  examples: ExtractionExample[],
  field: ExtractionField
): NeuralSample[] {
  const samples: NeuralSample[] = [];
  for (const example of examples) {
    const expected = normalizeForCompare(field.type, example.expected[field.name]);
    for (const candidate of candidatesFor(example.text)) {
      const comparable = normalizeForCompare(field.type, candidate.value);
      samples.push({
        x: candidateFeatures(candidate, field),
        y: expected !== null && comparable === expected ? 1 : 0,
      });
    }
  }
  return samples;
}

function trainNeuralLayer(model: ExtractionModelRecord): NeuralExtraction | null {
  if (model.examples.length < 2) return null;
  const fields: Record<string, NeuralFieldModel> = {};
  let checks = 0;
  let correct = 0;

  for (const field of model.fields) {
    // Leave-one-out metrics: train without each example, test on it.
    for (let index = 0; index < model.examples.length; index += 1) {
      const training = model.examples.filter((_, item) => item !== index);
      const samples = samplesForField(training, field);
      if (!samples.length) continue;
      const network = trainNetwork(samples, hashSeed(`${model.id}:${field.name}:${index}`));
      if (!network) continue;
      const example = model.examples[index];
      const expected = normalizeValue(example.expected[field.name]);
      const candidates = candidatesFor(example.text);
      let best: { candidate: Candidate; score: number } | null = null;
      for (const candidate of candidates) {
        const score = scoreCandidate(network, candidateFeatures(candidate, field));
        if (!best || score > best.score) best = { candidate, score };
      }
      checks += 1;
      if (best && best.score >= network.threshold) {
        const predicted = normalizeValue(coerceFieldValue(field, best.candidate.value));
        if (predicted === expected) correct += 1;
      }
    }

    const samples = samplesForField(model.examples, field);
    const network = trainNetwork(samples, hashSeed(`${model.id}:${field.name}:final`));
    if (network) fields[field.name] = network;
  }

  if (!Object.keys(fields).length) return null;
  return {
    fields,
    trainedAt: nowIso(),
    metrics: {
      fields: Object.keys(fields).length,
      checks,
      correct,
      accuracy: checks ? correct / checks : 0,
      evaluatedAt: nowIso(),
    },
  };
}

export async function extractWithNeuralModel(
  id: string,
  text: string
): Promise<CustomExtractionResult> {
  const model = await getExtractionModel(id);
  if (!model) throw new Error("Model not found.");
  if (!model.neural) throw new Error("Train the custom model before neural extraction.");
  if (!text.trim()) throw new Error("Document text is required.");
  const candidates = candidatesFor(text);
  const fields: Record<string, ExtractedFieldValue> = {};
  for (const field of model.fields) {
    const network = model.neural.fields[field.name];
    if (!network) {
      fields[field.name] = { value: null, confidence: 0, grounded: false, engine: "none" };
      continue;
    }
    let best: { candidate: Candidate; score: number } | null = null;
    for (const candidate of candidates) {
      const score = scoreCandidate(network, candidateFeatures(candidate, field));
      if (!best || score > best.score) best = { candidate, score };
    }
    if (best && best.score >= network.threshold) {
      const value = coerceFieldValue(field, best.candidate.value);
      fields[field.name] = {
        value,
        confidence: best.score,
        grounded: value !== null,
        engine: "neural",
        neuralScore: best.score,
      };
    } else {
      fields[field.name] = { value: null, confidence: 0, grounded: false, engine: "none" };
    }
  }
  return {
    modelId: model.id,
    fields,
    missing: model.fields
      .filter((field) => fields[field.name]?.value === null)
      .map((field) => field.name),
    warnings: [],
  };
}

async function runExtraction(
  model: ExtractionModelRecord,
  text: string,
  examples: ExtractionExample[]
): Promise<{ fields: Record<string, ExtractedFieldValue>; warning?: string }> {
  const chat = await resolveLanguageModel(model.model);
  const prompt = [
    "You extract structured fields from a document.",
    "Return only a JSON object with exactly the requested field names.",
    "Use null when a field is absent. Do not invent values.",
    "Fields:",
    schemaBlock(model),
    model.instructions ? `Instructions: ${model.instructions}` : "",
    examples.length
      ? `Labeled examples:\n\n${examples.map(exampleBlock).join("\n\n")}`
      : "",
    `DOCUMENT\n${text.slice(0, 16_000)}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const response = await completeChat({
    model: chat.model,
    provider: chat.provider,
    temperature: 0,
    maxTokens: 900,
    messages: [
      {
        role: "system",
        content:
          "You are a precise document field extractor. Return JSON only, with no markdown fences.",
      },
      { role: "user", content: prompt },
    ],
  });

  const parsed = parseJsonObject(response.text);
  const fields: Record<string, ExtractedFieldValue> = {};
  const haystack = text.toLowerCase();
  for (const field of model.fields) {
    const raw = parsed?.[field.name];
    let value: string | number | boolean | null = null;
    if (raw !== null && raw !== undefined && raw !== "") {
      if (field.type === "number") {
        const number = Number(String(raw).replace(/,/g, "").replace(/[$€£]/g, ""));
        value = Number.isFinite(number) ? number : null;
      } else if (field.type === "boolean") {
        value =
          raw === true ||
          String(raw).toLowerCase() === "true" ||
          String(raw).toLowerCase() === "yes"
            ? true
            : raw === false || String(raw).toLowerCase() === "false"
            ? false
            : null;
      } else {
        value = String(raw).trim() || null;
      }
    }
    const lookup = String(value ?? "").toLowerCase();
    const grounded = Boolean(value !== null && lookup && haystack.includes(lookup));
    fields[field.name] = {
      value,
      confidence: value === null ? 0 : grounded ? 0.95 : 0.6,
      grounded,
    };
  }
  return {
    fields,
    warning: parsed ? undefined : "The model did not return a valid JSON object.",
  };
}

export async function extractWithCustomModel(
  id: string,
  text: string,
  options: { neuralOnly?: boolean } = {}
): Promise<CustomExtractionResult> {
  const model = await getExtractionModel(id);
  if (!model) throw new Error("Model not found.");
  if (!text.trim()) throw new Error("Document text is required.");
  if (!model.examples.length) {
    throw new Error("Add at least one labeled example before extracting.");
  }
  if (options.neuralOnly && !model.neural) {
    throw new Error("Train the custom model before neural extraction.");
  }
  const neural = model.neural ? await extractWithNeuralModel(id, text) : null;
  if (options.neuralOnly) return neural!;

  const unresolved = model.fields.filter(
    (field) => neural?.fields[field.name]?.value == null
  );
  const llm = unresolved.length
    ? await runExtraction(model, text, model.examples)
    : { fields: {} as Record<string, ExtractedFieldValue>, warning: undefined };
  const fields: Record<string, ExtractedFieldValue> = {};
  for (const field of model.fields) {
    const neuralValue = neural?.fields[field.name];
    if (neuralValue && neuralValue.value !== null) {
      fields[field.name] = { ...neuralValue, engine: "neural" };
    } else {
      fields[field.name] = {
        ...(llm.fields[field.name] || {
          value: null,
          confidence: 0,
          grounded: false,
        }),
        engine: "llm",
      };
    }
  }
  const missing = model.fields
    .filter((field) => fields[field.name]?.value === null)
    .map((field) => field.name);
  const warnings: string[] = [];
  if (llm.warning) warnings.push(llm.warning);
  return {
    modelId: model.id,
    fields,
    missing,
    warnings,
  };
}

export function normalizeForCompare(
  type: ExtractionFieldType,
  value: unknown
): string | number | boolean | null {
  if (value === null || value === undefined || value === "") return null;
  if (type === "number") {
    const number = Number(String(value).replace(/,/g, "").replace(/[$€£]/g, ""));
    return Number.isFinite(number) ? number : null;
  }
  if (type === "boolean") {
    const text = String(value).toLowerCase();
    if (text === "true" || text === "yes") return true;
    if (text === "false" || text === "no") return false;
    return null;
  }
  return String(value).trim().toLowerCase();
}

export async function trainExtractionModel(
  id: string
): Promise<ExtractionModelRecord> {
  const models = await allModels();
  const model = models.find((item) => item.id === id);
  if (!model) throw new Error("Model not found.");
  if (model.examples.length < 2) {
    throw new Error("Add at least two labeled examples before training.");
  }

  let matched = 0;
  let total = 0;
  for (let index = 0; index < model.examples.length; index += 1) {
    const example = model.examples[index];
    const others = model.examples.filter((_, itemIndex) => itemIndex !== index);
    const result = await runExtraction(model, example.text, others);
    for (const field of model.fields) {
      const expected = normalizeForCompare(
        field.type,
        example.expected[field.name]
      );
      const actual = normalizeForCompare(
        field.type,
        result.fields[field.name]?.value
      );
      total += 1;
      if (expected === actual) matched += 1;
    }
  }
  model.neural = trainNeuralLayer(model) || undefined;
  model.metrics = {
    examples: model.examples.length,
    fields: total,
    matched,
    accuracy: total ? matched / total : 0,
    evaluatedAt: nowIso(),
  };
  model.status = "ready";
  model.updatedAt = nowIso();
  await saveModels(models);
  return model;
}
