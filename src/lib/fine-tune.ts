// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { readJson, writeJson } from "./store";
import type { FineTuneDataset, FineTuneRow } from "./types";
import { newId, nowIso } from "./store";

const FILE = "fine-tune.json";
const MAX_ROWS = 2000;

const ROLES = new Set(["system", "user", "assistant"]);

export function validateRows(input: unknown): FineTuneRow[] {
  if (!Array.isArray(input)) throw new Error("rows must be an array.");
  if (input.length === 0) throw new Error("A dataset needs at least one row.");
  if (input.length > MAX_ROWS) {
    throw new Error(`A dataset can hold at most ${MAX_ROWS} rows.`);
  }
  return input.map((row, index) => {
    if (typeof row !== "object" || row === null) {
      throw new Error(`Row ${index + 1} is not an object.`);
    }
    const messages = (row as { messages?: unknown }).messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error(`Row ${index + 1} has no messages.`);
    }
    return {
      messages: messages.map((message, messageIndex) => {
        const role = String((message as { role?: unknown })?.role || "");
        const content = (message as { content?: unknown })?.content;
        if (!ROLES.has(role)) {
          throw new Error(
            `Row ${index + 1}, message ${messageIndex + 1}: role must be system, user or assistant.`
          );
        }
        if (typeof content !== "string" || !content.trim()) {
          throw new Error(
            `Row ${index + 1}, message ${messageIndex + 1}: content must be a non-empty string.`
          );
        }
        return { role: role as "system" | "user" | "assistant", content };
      }),
    };
  });
}

export function toJsonl(dataset: FineTuneDataset): string {
  return dataset.rows.map((row) => JSON.stringify(row)).join("\n");
}

export async function listDatasets(): Promise<FineTuneDataset[]> {
  const rows = await readJson<FineTuneDataset[]>(FILE, []);
  return Array.isArray(rows) ? rows : [];
}

export async function getDataset(id: string): Promise<FineTuneDataset | null> {
  return (await listDatasets()).find((dataset) => dataset.id === id) || null;
}

export async function createDataset(input: {
  name: string;
  source: FineTuneDataset["source"];
  rows: unknown;
}): Promise<FineTuneDataset> {
  const name = input.name?.trim();
  if (!name) throw new Error("A dataset name is required.");
  if (!["traces", "agents", "custom"].includes(input.source)) {
    throw new Error("source must be traces, agents or custom.");
  }
  const rows = validateRows(input.rows);
  const datasets = await listDatasets();
  if (datasets.some((dataset) => dataset.name.toLowerCase() === name.toLowerCase())) {
    throw new Error("A dataset with that name already exists.");
  }
  const dataset: FineTuneDataset = {
    id: newId("ds"),
    name,
    source: input.source,
    rows,
    rowCount: rows.length,
    characters: rows.reduce(
      (sum, row) =>
        sum + row.messages.reduce((inner, message) => inner + message.content.length, 0),
      0
    ),
    createdAt: nowIso(),
  };
  datasets.unshift(dataset);
  await writeJson(FILE, datasets.slice(0, 100));
  return dataset;
}

export async function deleteDataset(id: string): Promise<void> {
  const datasets = await listDatasets();
  await writeJson(
    FILE,
    datasets.filter((dataset) => dataset.id !== id)
  );
}
