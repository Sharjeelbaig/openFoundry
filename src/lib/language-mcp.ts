// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { analyzeText, translateText, type LanguageTask } from "./language";
import type {
  LocalMcpToolDefinition,
  LocalMcpToolResult,
} from "./local-mcp";

const TASKS: LanguageTask[] = ["sentiment", "entities", "keyphrases", "pii"];

export const languageMcpTools: LocalMcpToolDefinition[] = [
  {
    name: "analyze_text",
    description:
      "Analyze text for sentiment, named entities, key phrases or PII redaction. " +
      "This is a model-assisted local equivalent of Azure Language, not a trained NLP service; PII output is best-effort.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          maxLength: 20_000,
          description: "Text to analyze (maximum 20000 characters).",
        },
        task: {
          type: "string",
          enum: TASKS,
          description:
            "sentiment returns a label and confidence; entities returns named entities; keyphrases returns phrases; pii returns redactedText.",
        },
        model: {
          type: "string",
          description:
            "Optional chat deployment name or provider:model id. Defaults to the first running deployment.",
        },
      },
      required: ["text", "task"],
      additionalProperties: false,
    },
    execution: { taskSupport: "optional" },
  },
  {
    name: "translate_text",
    description:
      "Translate text into a target language with the local chat deployment. " +
      "Names, numbers and formatting are preserved by the prompt, but this is a model-assisted local equivalent of Azure Translator.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          maxLength: 10_000,
          description: "Text to translate (maximum 10000 characters).",
        },
        target: {
          type: "string",
          description: "Target language name or code, e.g. Urdu, fr, Japanese.",
        },
        model: {
          type: "string",
          description: "Optional chat deployment name or provider:model id.",
        },
      },
      required: ["text", "target"],
      additionalProperties: false,
    },
    execution: { taskSupport: "optional" },
  },
];

function textContent(value: string, structured?: unknown): LocalMcpToolResult {
  return {
    content: [{ type: "text", text: value }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  };
}

export async function callLanguageTool(
  name: string,
  args: Record<string, unknown>
): Promise<LocalMcpToolResult> {
  if (name === "analyze_text") {
    const task = String(args.task || "").trim() as LanguageTask;
    if (!TASKS.includes(task)) {
      throw new Error(
        `"task" must be one of: ${TASKS.join(", ")}.`
      );
    }
    const result = await analyzeText({
      text: String(args.text || ""),
      task,
      model: args.model ? String(args.model) : undefined,
    });
    const payload =
      result.result === null || result.result === undefined
        ? result.raw || ""
        : typeof result.result === "string"
        ? result.result
        : JSON.stringify(result.result, null, 2);
    return textContent(payload, result);
  }

  if (name === "translate_text") {
    const result = await translateText({
      text: String(args.text || ""),
      target: String(args.target || ""),
      model: args.model ? String(args.model) : undefined,
    });
    return textContent(result.translation, result);
  }

  throw new Error(`Unknown language tool "${name}".`);
}
