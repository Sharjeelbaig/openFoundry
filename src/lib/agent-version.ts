// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import type { Agent, AgentVersion } from "./types";

/**
 * The configuration fields whose change makes a new agent version. These are
 * the ones that change how the agent behaves: prompt, model, sampling, memory,
 * guardrail, tools and knowledge. Cosmetic fields (name, description) are saved
 * but do not by themselves cut a version.
 *
 * Before OS-25 only instructions/model/temperature were compared, so attaching
 * a toolbox, a skill, a knowledge base, a memory store or a guardrail changed
 * the agent without ever producing a version.
 */
export const VERSIONED_FIELDS = [
  "instructions",
  "model",
  "provider",
  "temperature",
  "topP",
  "maxTokens",
  "voiceMode",
  "memoryEnabled",
  "memoryStoreId",
  "guardrail",
  "guardrailId",
  "tools",
  "knowledgeBaseIds",
] as const;

export type VersionedField = (typeof VERSIONED_FIELDS)[number];

/**
 * Stable, comparable rendering of an agent's behavioural configuration. Two
 * configurations are the same version when this string is equal, so array order
 * is significant and missing optionals normalise to `null`.
 */
export function versionedContent(source: Agent | AgentVersion): string {
  const record = source as Agent & AgentVersion;
  return JSON.stringify(
    VERSIONED_FIELDS.map((field) => record[field] ?? null)
  );
}

/** True when the two configurations differ in any versioned field. */
export function versionChanged(
  before: Agent | AgentVersion,
  after: Agent | AgentVersion
): boolean {
  return versionedContent(before) !== versionedContent(after);
}

/**
 * Snapshot the full configuration so a stored version can be rolled back to its
 * tools, knowledge, memory and guardrail as well as its prompt. Arrays are
 * copied so a later in-place edit of the agent cannot mutate the snapshot.
 */
export function snapshotVersion(
  agent: Agent,
  savedAt: string,
  version: number
): AgentVersion {
  return {
    version,
    savedAt,
    model: agent.model,
    instructions: agent.instructions,
    provider: agent.provider,
    temperature: agent.temperature,
    topP: agent.topP,
    maxTokens: agent.maxTokens,
    voiceMode: agent.voiceMode,
    memoryEnabled: agent.memoryEnabled,
    memoryStoreId: agent.memoryStoreId,
    guardrail: agent.guardrail,
    guardrailId: agent.guardrailId,
    tools: [...agent.tools],
    knowledgeBaseIds: [...agent.knowledgeBaseIds],
  };
}
