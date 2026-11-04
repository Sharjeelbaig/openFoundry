// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { buildTemplate } from "@/lib/workflows/templates";

describe("workflow templates", () => {
  for (const template of [
    "blank",
    "sequential",
    "human-in-loop",
    "group-chat",
  ] as const) {
    it(`builds a connected ${template} graph`, () => {
      const definition = buildTemplate(template);
      const ids = new Set(definition.nodes.map((node) => node.id));
      expect(ids.has("start")).toBe(true);
      for (const edge of definition.edges) {
        expect(ids.has(edge.source)).toBe(true);
        expect(ids.has(edge.target)).toBe(true);
      }
    });
  }

  it("human-in-loop contains a question and a branch", () => {
    const definition = buildTemplate("human-in-loop");
    expect(definition.nodes.some((node) => node.type === "askQuestion")).toBe(true);
    expect(definition.nodes.some((node) => node.type === "ifElse")).toBe(true);
    expect(definition.edges.some((edge) => edge.sourceHandle === "else")).toBe(true);
  });
});
