// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-l3-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
writeFileSync(path.join(dir, "deployments.json"), "[]");

// Embeddings are not what this test probes; a fixed model keeps the index
// usable without a live Ollama instance. Query embedding returns null so the
// test exercises the lexical half of L1 deterministically.
vi.mock("@/lib/knowledge/embedding", () => {
  class EmbeddingUnavailableError extends Error {}
  class EmbeddingModelMismatchError extends Error {}
  return {
    EmbeddingUnavailableError,
    EmbeddingModelMismatchError,
    embedPinned: async (texts: string[]) => ({
      vectors: texts.map(() => new Float32Array(8)),
      model: "test-embed",
      provider: "test",
      dim: 8,
    }),
    embedQuery: async () => null,
  };
});

const completeChat = vi.fn();
vi.mock("@/lib/chat", () => ({
  completeChat: (...args: unknown[]) => completeChat(...args),
}));

type Service = typeof import("@/lib/knowledge/service");
type Retrieve = typeof import("@/lib/knowledge/retrieve");
let service: Service;
let retrieve: Retrieve;

interface ChatArgs {
  messages: { role: string; content: string }[];
  signal?: AbortSignal;
}

function reply(text: string) {
  return { text, promptTokens: 12, completionTokens: 8, toolCalls: [] };
}

beforeAll(async () => {
  service = await import("@/lib/knowledge/service");
  retrieve = await import("@/lib/knowledge/retrieve");
});

async function seedBase(options: { reasoningEffort: "medium" | "low"; chatModel?: string }) {
  const base = await service.createBase({
    name: `l3-${options.reasoningEffort}-${Math.random().toString(36).slice(2, 7)}`,
    reasoningEffort: options.reasoningEffort,
    chatModel: options.chatModel,
  });
  await service.ingestUploads(base.id, [
    {
      name: "travel.md",
      mime: "text/markdown",
      buffer: Buffer.from(
        "# Travel\n\nFlights and hotels are covered by the travel policy."
      ),
    },
    {
      name: "codes.md",
      mime: "text/markdown",
      buffer: Buffer.from(
        "# Reimbursement\n\nReimbursement code ZX-4417 is required before approval."
      ),
    },
  ]);
  return base;
}

describe("L3 iterative retrieval", () => {
  it("runs a second pass at medium effort when coverage is insufficient", async () => {
    completeChat.mockImplementation(async (args: ChatArgs) => {
      const system = args.messages[0]?.content || "";
      if (system.includes("rewrite a search question")) {
        return reply('["travel approval"]');
      }
      if (system.includes("search reranker")) {
        const user = args.messages[1]?.content || "";
        const passages = JSON.parse(user.slice(user.indexOf("["))) as {
          id: number;
          text: string;
        }[];
        return reply(
          JSON.stringify(
            passages.map((passage) => ({
              id: passage.id,
              score: passage.text.includes("ZX-4417") ? 4 : 2,
            }))
          )
        );
      }
      if (system.includes("judge whether retrieved passages")) {
        return reply(
          JSON.stringify({
            sufficient: false,
            missing: "the reimbursement code needed for approval",
            queries: ["ZX-4417 reimbursement code"],
          })
        );
      }
      throw new Error(`unexpected chat call: ${system.slice(0, 60)}`);
    });

    const base = await seedBase({ reasoningEffort: "medium", chatModel: "test:1" });
    const result = await retrieve.retrieve(base.id, {
      query: "How do I get travel approved?",
      skipRunLog: true,
    });

    // The first pass cannot see the code; the second pass retrieves it and the
    // reranker promotes it, proving the refined query reached fusion and L2.
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations.some((citation) => citation.excerpt.includes("ZX-4417"))).toBe(
      true
    );
    expect(result.citations[0].excerpt).toContain("ZX-4417");

    // Foundry reports the second planning call as another modelQueryPlanning
    // record, not a bespoke iterativeSearch activity.
    const planningEntries = result.activity.filter(
      (entry) => entry.type === "modelQueryPlanning"
    );
    expect(planningEntries).toHaveLength(2);
    const coverage = planningEntries[1];
    const secondPass = result.activity.filter(
      (entry) => entry.type === "file" && entry.id > coverage.id
    );
    expect(
      secondPass.some(
        (entry) => entry.fileArguments?.search === "ZX-4417 reimbursement code"
      )
    ).toBe(true);
    expect(
      result.activity.some((entry) => (entry.type as string) === "iterativeSearch")
    ).toBe(false);
    expect(
      result.activity.some((entry) => (entry.type as string) === "reranker")
    ).toBe(false);

    const reasoning = result.activity.find(
      (entry) => entry.type === "agenticReasoning"
    );
    expect(reasoning?.reasoningTokens).toBe(32);
    expect(reasoning?.retrievalReasoningEffort).toEqual({ kind: "medium" });
    expect(reasoning?.logicalReasoningEffort).toEqual({ kind: "medium" });

    // Extractive responses are a JSON array of {ref_id, content}, with numeric
    // ref ids, exactly as the retrieve action returns them.
    const grounded = JSON.parse(result.response[0].content[0].text) as {
      ref_id: number;
      content: string;
    }[];
    expect(Object.keys(grounded[0]).sort()).toEqual(["content", "ref_id"]);
    expect(typeof grounded[0].ref_id).toBe("number");
    expect(result.references[0]).toMatchObject({ type: "file", id: "0" });
    expect(result.references[0].docName).toBe("codes.md");
    expect(result.references[0].rerankerScore).toBeGreaterThanOrEqual(2.5);
    expect(typeof result.references[0].activitySource).toBe("number");
  }, 60_000);

  it("skips L3 honestly when no chat model is configured", async () => {
    const base = await seedBase({ reasoningEffort: "medium" });
    const result = await retrieve.retrieve(base.id, {
      query: "How do I get travel approved?",
      skipRunLog: true,
    });
    expect(result.activity.some((entry) => entry.type === "heuristicQueryPlanning")).toBe(
      true
    );
    expect(result.activity.filter((entry) => entry.type === "modelQueryPlanning")).toHaveLength(
      0
    );
    const reasoning = result.activity.find(
      (entry) => entry.type === "agenticReasoning"
    );
    expect(String(reasoning?.note)).toMatch(/no chat model/i);
    expect(reasoning?.reasoningTokens).toBe(0);
    expect(result.activity.filter((entry) => entry.type === "file")).toHaveLength(
      result.meta.plan.length
    );
  }, 60_000);

  it("does not run L3 at low effort even with a chat model", async () => {
    completeChat.mockImplementation(async (args: ChatArgs) => {
      const system = args.messages[0]?.content || "";
      if (system.includes("rewrite a search question")) return reply('["travel"]');
      if (system.includes("search reranker")) return reply('[{"id":0,"score":3}]');
      throw new Error(`unexpected chat call: ${system.slice(0, 60)}`);
    });

    const base = await seedBase({ reasoningEffort: "low", chatModel: "test:1" });
    const result = await retrieve.retrieve(base.id, {
      query: "How do I get travel approved?",
      skipRunLog: true,
    });
    expect(result.activity.filter((entry) => entry.type === "modelQueryPlanning")).toHaveLength(
      1
    );
    expect(result.activity.some((entry) => (entry.type as string) === "iterativeSearch")).toBe(
      false
    );
    expect(result.activity.filter((entry) => entry.type === "file")).toHaveLength(
      result.meta.plan.length
    );
    const reasoning = result.activity.find(
      (entry) => entry.type === "agenticReasoning"
    );
    expect(reasoning?.reasoningTokens).toBe(16);
    expect(reasoning?.retrievalReasoningEffort).toEqual({ kind: "low" });
  }, 60_000);

  it("stops at maxRuntimeInSeconds and returns a partial response", async () => {
    completeChat.mockImplementation(
      (args: ChatArgs) =>
        new Promise((_resolve, reject) => {
          if (args.signal?.aborted) {
            reject(new DOMException("Aborted", "AbortError"));
            return;
          }
          args.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          );
        })
    );

    const base = await seedBase({ reasoningEffort: "medium", chatModel: "test:1" });
    const result = await retrieve.retrieve(base.id, {
      query: "How do I get travel approved?",
      maxRuntimeInSeconds: 1,
      skipRunLog: true,
    });
    expect(result.meta.partial).toBe(true);
    expect(result.citations.length).toBeGreaterThan(0);
    const reasoning = result.activity.find(
      (entry) => entry.type === "agenticReasoning"
    );
    expect(String(reasoning?.note)).toMatch(/1-second budget/);
    expect(result.activity.some((entry) => entry.type === "modelAnswerSynthesis")).toBe(
      false
    );
  }, 30_000);

  it("warns on every source when the reranker filters all candidates", async () => {
    completeChat.mockImplementation(async (args: ChatArgs) => {
      const system = args.messages[0]?.content || "";
      if (system.includes("rewrite a search question")) return reply('["travel policy"]');
      if (system.includes("search reranker")) {
        const user = args.messages[1]?.content || "";
        const passages = JSON.parse(user.slice(user.indexOf("["))) as { id: number }[];
        return reply(
          JSON.stringify(passages.map((passage) => ({ id: passage.id, score: 0 })))
        );
      }
      if (system.includes("judge whether retrieved passages")) {
        return reply(JSON.stringify({ sufficient: true }));
      }
      throw new Error(`unexpected chat call: ${system.slice(0, 60)}`);
    });

    const base = await seedBase({ reasoningEffort: "low", chatModel: "test:1" });
    const result = await retrieve.retrieve(base.id, {
      query: "How do I get travel approved?",
      skipRunLog: true,
    });
    expect(result.meta.partial).toBe(true);
    const sources = result.activity.filter((entry) => entry.type === "file");
    expect(sources.length).toBeGreaterThan(0);
    for (const source of sources) {
      expect(source.count).toBe(0);
      expect(String(source.warning)).toMatch(/reranker score threshold/);
    }
    expect(result.citations.length).toBeGreaterThan(0);
  }, 60_000);
});
