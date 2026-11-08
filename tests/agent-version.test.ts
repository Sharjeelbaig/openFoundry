// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  VERSIONED_FIELDS,
  snapshotVersion,
  versionChanged,
  versionedContent,
} from "../src/lib/agent-version";
import type { Agent } from "../src/lib/types";

function agent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent_1",
    name: "Clinic triage",
    description: "",
    model: "gemma4:31b-cloud",
    provider: "ollama",
    instructions: "You triage incoming patients.",
    temperature: 0.7,
    topP: 0.95,
    maxTokens: 1024,
    voiceMode: false,
    memoryEnabled: false,
    guardrail: "Default",
    tools: [],
    knowledgeBaseIds: [],
    status: "Draft",
    version: 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastViewedAt: "2026-01-01T00:00:00.000Z",
    endpoint: "http://localhost/api/chat",
    apiKey: "local-key",
    history: [],
    ...overrides,
  };
}

describe("VERSIONED_FIELDS", () => {
  it("covers tools, knowledge, memory and guardrails (the OS-25 gap)", () => {
    for (const field of [
      "tools",
      "knowledgeBaseIds",
      "memoryEnabled",
      "memoryStoreId",
      "guardrail",
      "guardrailId",
    ]) {
      expect(VERSIONED_FIELDS).toContain(field as never);
    }
  });
});

describe("versionChanged", () => {
  it("is false for an identical configuration", () => {
    expect(versionChanged(agent(), agent())).toBe(false);
  });

  it("detects tool, knowledge, memory and guardrail edits", () => {
    expect(
      versionChanged(
        agent(),
        agent({ tools: ["toolbox:tbx_1", "skill:local:lskill_1"] })
      )
    ).toBe(true);
    expect(
      versionChanged(agent(), agent({ knowledgeBaseIds: ["kb_1"] }))
    ).toBe(true);
    expect(
      versionChanged(agent(), agent({ memoryEnabled: true, memoryStoreId: "mem_1" }))
    ).toBe(true);
    expect(
      versionChanged(agent(), agent({ guardrail: "Strict" }))
    ).toBe(true);
    expect(
      versionChanged(agent(), agent({ guardrailId: "gr_1" }))
    ).toBe(true);
  });

  it("detects prompt/model/sampling edits", () => {
    expect(versionChanged(agent(), agent({ instructions: "New prompt" }))).toBe(true);
    expect(versionChanged(agent(), agent({ model: "qwen2.5-coder" }))).toBe(true);
    expect(versionChanged(agent(), agent({ temperature: 0.1 }))).toBe(true);
  });

  it("ignores cosmetic fields that are not versioned", () => {
    expect(versionChanged(agent(), agent({ name: "Renamed" }))).toBe(false);
    expect(versionChanged(agent(), agent({ description: "Notes" }))).toBe(false);
  });

  it("compares array contents, not just the reference", () => {
    const a = agent({ tools: ["toolbox:tbx_1"] });
    const b = agent({ tools: ["toolbox:tbx_1"] });
    const c = agent({ tools: ["toolbox:tbx_1", "skill:local:lskill_1"] });
    expect(versionChanged(a, b)).toBe(false);
    expect(versionChanged(a, c)).toBe(true);
  });

  it("treats an old snapshot without the new fields as its own state", () => {
    const legacy = { version: 1, savedAt: "", model: "", instructions: "hi" };
    expect(versionChanged(legacy, { ...legacy })).toBe(false);
    expect(versionChanged(legacy, agent({ instructions: "hi" }))).toBe(true);
  });
});

describe("snapshotVersion", () => {
  it("captures the full configuration", () => {
    const source = agent({
      tools: ["toolbox:tbx_1"],
      knowledgeBaseIds: ["kb_1"],
      memoryEnabled: true,
      memoryStoreId: "mem_1",
      guardrail: "Strict",
      guardrailId: "gr_1",
    });
    const snap = snapshotVersion(source, "2026-02-02T00:00:00.000Z", 4);
    expect(snap).toMatchObject({
      version: 4,
      savedAt: "2026-02-02T00:00:00.000Z",
      instructions: source.instructions,
      model: source.model,
      tools: ["toolbox:tbx_1"],
      knowledgeBaseIds: ["kb_1"],
      memoryEnabled: true,
      memoryStoreId: "mem_1",
      guardrail: "Strict",
      guardrailId: "gr_1",
    });
  });

  it("copies arrays so later edits cannot mutate the snapshot", () => {
    const source = agent({ tools: ["toolbox:tbx_1"] });
    const snap = snapshotVersion(source, "now", 1);
    source.tools.push("skill:local:lskill_1");
    expect(snap.tools).toEqual(["toolbox:tbx_1"]);
  });

  it("round-trips: a snapshot equals the agent it came from", () => {
    const source = agent({ tools: ["toolbox:tbx_1"] });
    expect(versionedContent(snapshotVersion(source, "now", 1))).toBe(
      versionedContent(source)
    );
  });
});
