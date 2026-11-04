// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import catalog from "@/data/tool-catalog.json";
import { ToolCatalogEntry } from "./types";

const entries = catalog as ToolCatalogEntry[];

export function allCatalogEntries(): ToolCatalogEntry[] {
  return entries;
}

export function findCatalogEntry(id: string): ToolCatalogEntry | undefined {
  return entries.find((entry) => entry.id === id);
}

/** Skill ids are stored on agents as `skill:<catalog id>`. */
export function parseSkillId(id: string): string | null {
  return id.startsWith("skill:") ? id.slice(6) : null;
}

export function skillInstructions(entry: ToolCatalogEntry): string {
  return [
    `Local skill: ${entry.name}`,
    entry.instructions || entry.description,
    "This skill runs as local instructions in this desktop workspace. Never claim a cloud resource exists. If the instructions mention an Azure-only command or resource, translate the task to the local equivalent (local files, local runtimes, local deployments, local knowledge or the local tool catalog) and say when a step cannot be performed locally.",
  ].join("\n\n");
}
