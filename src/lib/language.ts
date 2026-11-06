// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { completeChat } from "./chat";
import { getDeployments } from "./store";
import type { ProviderId } from "./types";

/**
 * Language tasks backed by whatever local chat model is deployed.
 *
 * This is a model-assisted equivalent of Azure Language, not a trained NLP
 * service. Entity and PII output are best-effort and labelled as such; they are
 * not a compliance control.
 */

export type LanguageTask = "sentiment" | "entities" | "keyphrases" | "pii";

export interface LanguageModel {
  model: string;
  provider: ProviderId;
  label: string;
}

export async function resolveLanguageModel(
  requested?: string
): Promise<LanguageModel> {
  const deployments = await getDeployments();
  if (requested?.trim()) {
    const match = deployments.find(
      (deployment) =>
        deployment.name === requested ||
        deployment.modelId === requested ||
        deployment.modelName === requested
    );
    if (match) {
      return { model: match.modelId, provider: match.provider, label: match.name };
    }
    if (requested.includes(":")) {
      return { model: requested, provider: "ollama", label: requested };
    }
  }
  const running = deployments.find((deployment) => deployment.status === "Running");
  if (!running) {
    throw new Error(
      "No running chat deployment. Deploy a model in Build → Models, or pass a model id."
    );
  }
  return { model: running.modelId, provider: running.provider, label: running.name };
}

function parseJson(text: string): unknown {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {
    const object = /\[[\s\S]*\]|\{[\s\S]*\}/.exec(direct);
    if (!object) return null;
    try {
      return JSON.parse(object[0]);
    } catch {
      return null;
    }
  }
}

async function run(
  model: LanguageModel,
  system: string,
  user: string
): Promise<string> {
  const result = await completeChat({
    model: model.model,
    provider: model.provider,
    temperature: 0,
    maxTokens: 700,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
  });
  return result.text.trim();
}

export interface AnalyzeResult {
  task: LanguageTask;
  model: string;
  /** Parsed JSON when the model returned valid JSON. */
  result: unknown;
  /** Raw text when parsing failed, so the caller can see what happened. */
  raw?: string;
  note?: string;
}

export async function analyzeText(input: {
  text: string;
  task: LanguageTask;
  model?: string;
}): Promise<AnalyzeResult> {
  const text = input.text?.trim();
  if (!text) throw new Error("Text is required.");
  if (text.length > 20_000) throw new Error("Text is limited to 20000 characters.");
  const model = await resolveLanguageModel(input.model);

  const prompts: Record<LanguageTask, { system: string; note?: string }> = {
    sentiment: {
      system:
        'Classify the sentiment. Return only JSON: {"sentiment":"positive|neutral|negative","confidence":0-1,"reason":"short"}.',
    },
    entities: {
      system:
        'Extract named entities. Return only a JSON array: [{"text":"...","category":"person|organization|location|date|other"}].',
    },
    keyphrases: {
      system:
        'Extract the main key phrases. Return only a JSON array of strings, at most 10.',
    },
    pii: {
      system:
        'Redact personal data. Return only JSON: {"redactedText":"...","entities":[{"text":"...","category":"name|email|phone|address|account|other"}]}.',
      note: "Model-assisted redaction is best-effort and is not a compliance control.",
    },
  };

  const spec = prompts[input.task];
  if (!spec) throw new Error(`Unknown task "${input.task}".`);
  const raw = await run(model, spec.system, text);
  const parsed = parseJson(raw);
  return {
    task: input.task,
    model: model.label,
    result: parsed,
    raw: parsed == null ? raw : undefined,
    note: spec.note,
  };
}

export async function translateText(input: {
  text: string;
  target: string;
  model?: string;
}): Promise<{ translation: string; model: string; target: string }> {
  const text = input.text?.trim();
  const target = input.target?.trim();
  if (!text) throw new Error("Text is required.");
  if (!target) throw new Error("A target language is required.");
  if (text.length > 10_000) throw new Error("Text is limited to 10000 characters.");
  const model = await resolveLanguageModel(input.model);
  const translation = await run(
    model,
    `Translate the user's text into ${target}. Preserve names, numbers and formatting. Return only the translation.`,
    text
  );
  return { translation, model: model.label, target };
}
