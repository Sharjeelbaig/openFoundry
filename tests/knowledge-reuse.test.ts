// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-reuse-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;
writeFileSync(path.join(dir, "deployments.json"), "[]");

vi.mock("@/lib/knowledge/embedding", () => {
  class EmbeddingUnavailableError extends Error {}
  class EmbeddingModelMismatchError extends Error {}
  return {
    EmbeddingUnavailableError,
    EmbeddingModelMismatchError,
    embedPinned: async (texts: string[]) => ({
      vectors: texts.map((_, index) => {
        const vector = new Float32Array(8);
        vector[index % vector.length] = 1;
        return vector;
      }),
      model: "test-embed",
      provider: "test",
      dim: 8,
    }),
    embedQuery: async () => null,
  };
});

type Service = typeof import("@/lib/knowledge/service");
type Retrieve = typeof import("@/lib/knowledge/retrieve");
let service: Service;
let retrieve: Retrieve;

beforeAll(async () => {
  service = await import("@/lib/knowledge/service");
  retrieve = await import("@/lib/knowledge/retrieve");
});

describe("existing-source reuse", () => {
  it("clones an indexed source and retrieves it without reconfiguration", async () => {
    const sourceBase = await service.createBase({
      name: "reuse-source-base",
      reasoningEffort: "minimal",
    });
    await service.ingestUploads(sourceBase.id, [
      {
        name: "policy.md",
        mime: "text/markdown",
        buffer: Buffer.from(
          "# Expense policy\n\nThe expense cap is 42 dollars per day. Reimbursement code ZX-4417 is required."
        ),
      },
    ]);
    const origin = (await service.listSourceRecords(sourceBase.id)).find(
      (source) => source.kind === "file"
    );
    expect(origin).toBeTruthy();

    const reusable = await service.listReusableSources();
    const listed = reusable.find((source) => source.id === origin!.id);
    expect(listed).toMatchObject({
      baseId: sourceBase.id,
      baseName: "reuse-source-base",
      kind: "file",
      mode: "indexed",
      documentCount: 1,
    });

    const targetBase = await service.createBase({
      name: "reuse-target-base",
      reasoningEffort: "minimal",
    });
    const clone = await service.cloneSourceIntoBase(targetBase.id, origin!.id);
    expect(clone).toMatchObject({
      baseId: targetBase.id,
      kind: "file",
      mode: "indexed",
      status: "ready",
    });
    expect(clone.id).not.toBe(origin!.id);

    const copied = await service.listDocumentsWithChunks(targetBase.id);
    expect(copied).toHaveLength(1);
    expect(copied[0].chunks[0].text).toContain("ZX-4417");

    const refreshed = await service.getBaseRecord(targetBase.id);
    expect(refreshed?.embeddingModel).toBe("test-embed");

    const result = await retrieve.retrieve(targetBase.id, {
      query: "What is the expense cap and reimbursement code?",
      skipRunLog: true,
    });
    expect(result.citations.length).toBeGreaterThan(0);
    expect(result.citations[0].excerpt).toContain("42 dollars");
    expect(result.citations[0].excerpt).toContain("ZX-4417");
    expect(result.meta.embeddingModel).toBe("test-embed");

    const activity = result.activity.find((entry) => entry.type === "file");
    expect(activity?.knowledgeSourceName).toBe("Files");

    await expect(
      service.cloneSourceIntoBase(targetBase.id, origin!.id)
    ).rejects.toThrow(/already attached/i);
  }, 60_000);

  it("exposes only non-secret config and copies it to the new source", async () => {
    const sourceBase = await service.createBase({
      name: "config-source-base",
      reasoningEffort: "minimal",
    });
    const origin = await service.addSource({
      baseId: sourceBase.id,
      kind: "web",
      name: "Web docs",
      config: {
        urls: "https://example.test/docs",
        maxPages: 5,
        apiKey: "must-not-leak",
        password: "must-not-leak",
      },
    });

    const listed = (await service.listReusableSources()).find(
      (source) => source.id === origin.id
    );
    expect(listed?.config).toMatchObject({
      urls: "https://example.test/docs",
      maxPages: 5,
    });
    expect(listed?.config).not.toHaveProperty("apiKey");
    expect(listed?.config).not.toHaveProperty("password");

    const targetBase = await service.createBase({
      name: "config-target-base",
      reasoningEffort: "minimal",
    });
    const clone = await service.cloneSourceIntoBase(targetBase.id, origin.id);
    expect(clone.config).toMatchObject({
      urls: "https://example.test/docs",
      maxPages: 5,
    });
    expect(clone.config).not.toHaveProperty("apiKey");
    expect(clone.config).not.toHaveProperty("password");
  }, 60_000);
});
