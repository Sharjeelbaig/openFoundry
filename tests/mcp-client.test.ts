// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { AddressInfo } from "net";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-mcp-client-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Client = typeof import("@/lib/knowledge/mcp-client");
let client: Client;
let server: Server;
let origin = "";
const seenAuth: string[] = [];

function reply(
  chunks: { ref_id: number; content: string }[],
  references: { ref_id: number; title: string }[],
  embeddingModel = "nomic"
): Record<string, unknown> {
  return {
    jsonrpc: "2.0",
    id: 1,
    result: {
      content: [
        { type: "text", text: JSON.stringify(chunks) },
        ...references.map((reference) => ({
          type: "text",
          text: JSON.stringify({
            kind: "reference",
            ref_id: reference.ref_id,
            uri: "https://example.test/doc",
            mimeType: "application/json",
            sourceData: {
              uid: `uid-${reference.ref_id}`,
              snippet: "",
              metadata_storage_path: reference.title,
            },
          }),
        })),
      ],
      _meta: { agenticReasoningTokens: 12, embeddingModel },
    },
  };
}

beforeAll(async () => {
  client = await import("@/lib/knowledge/mcp-client");
  server = createServer((req, res) => {
    seenAuth.push(String(req.headers.authorization || ""));
    res.setHeader("content-type", "application/json");
    if (req.url?.includes("kb_fail")) {
      res.statusCode = 500;
      res.end(JSON.stringify({ error: "boom" }));
      return;
    }
    res.end(
      JSON.stringify(
        reply(
          [
            { ref_id: 0, content: "low score" },
            { ref_id: 1, content: "high score" },
          ],
          [
            { ref_id: 0, title: "Low" },
            { ref_id: 1, title: "High" },
          ]
        )
      )
    );
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("agent retrieval via MCP", () => {
  it("calls the base endpoint with an internal bearer token and maps citations", async () => {
    const result = await client.retrieveViaMcp(
      origin,
      ["kb_1"],
      "what is the code?",
      4
    );
    expect(seenAuth[0]).toMatch(/^Bearer internal\./);
    expect(result.embeddingModel).toBe("nomic");
    expect(result.errors).toEqual([]);
    expect(result.citations).toEqual([
      {
        documentId: "kb_1:0",
        documentName: "Low",
        chunk: "low score",
        score: 2,
      },
      {
        documentId: "kb_1:1",
        documentName: "High",
        chunk: "high score",
        score: 1,
      },
    ]);
  });

  it("honours topK across bases", async () => {
    const result = await client.retrieveViaMcp(
      origin,
      ["kb_1", "kb_2"],
      "q",
      3
    );
    expect(result.citations).toHaveLength(3);
  });

  it("reports a failed base without discarding the other", async () => {
    const result = await client.retrieveViaMcp(
      origin,
      ["kb_fail", "kb_1"],
      "q",
      4
    );
    expect(result.citations).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("500");
  });
});
