// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import { fileSearchTool } from "@/lib/file-search";
import type { Citation } from "@/lib/types";

const citation = (index: number): Citation => ({
  documentId: `doc-${index}`,
  documentName: `handbook-${index}.txt`,
  chunk: `passage ${index}`,
  score: 0.9 - index / 10,
});

describe("file_search tool", () => {
  it("is exposed to the model with a query argument", () => {
    const tool = fileSearchTool(async () => ({ citations: [], errors: [] }));
    expect(tool.functionName).toBe("file_search");
    expect(tool.definition.function.name).toBe("file_search");
    expect(tool.definition.function.parameters).toMatchObject({
      type: "object",
      required: ["query"],
    });
    expect(tool.approval.write).toBe(false);
    expect(tool.approval.destructive).toBe(false);
  });

  it("numbers the passages it returns", async () => {
    const tool = fileSearchTool(async (query) => {
      expect(query).toBe("launch checklist");
      return { citations: [citation(0), citation(1)], errors: [] };
    });
    const result = await tool.execute({ query: "launch checklist" });
    expect(result.isError).toBe(false);
    expect(result.text).toContain("[1] handbook-0.txt\npassage 0");
    expect(result.text).toContain("[2] handbook-1.txt\npassage 1");
  });

  it("reports retrieval errors instead of pretending to have found text", async () => {
    const tool = fileSearchTool(async () => ({
      citations: [],
      errors: ["Knowledge base is not indexed yet."],
    }));
    const result = await tool.execute({ query: "anything" });
    expect(result.text).toBe("Knowledge base is not indexed yet.");
    expect(result.isError).toBe(false);
  });

  it("rejects an empty query without searching", async () => {
    let called = false;
    const tool = fileSearchTool(async () => {
      called = true;
      return { citations: [], errors: [] };
    });
    const result = await tool.execute({});
    expect(called).toBe(false);
    expect(result.isError).toBe(true);
  });
});
