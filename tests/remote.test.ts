// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server } from "http";
import { mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { AddressInfo } from "net";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-remote-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Remote = typeof import("@/lib/knowledge/remote");
type Service = typeof import("@/lib/knowledge/service");
type Retrieve = typeof import("@/lib/knowledge/retrieve");
type ConnStore = typeof import("@/lib/connections/store");

let remote: Remote;
let service: Service;
let retrieve: Retrieve;
let connections: ConnStore;
let server: Server;
let baseUrl = "";
let lastBody: Record<string, unknown> | null = null;
let lastUrl = "";

beforeAll(async () => {
  writeFileSync(path.join(dir, "deployments.json"), "[]");
  remote = await import("@/lib/knowledge/remote");
  service = await import("@/lib/knowledge/service");
  retrieve = await import("@/lib/knowledge/retrieve");
  connections = await import("@/lib/connections/store");

  server = createServer((req, res) => {
    lastUrl = req.url || "";
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      lastBody = body ? (JSON.parse(body) as Record<string, unknown>) : null;
      res.setHeader("content-type", "application/json");
      if (lastUrl.startsWith("/mcp")) {
        const message = lastBody || {};
        if (message.method === "notifications/initialized") {
          res.statusCode = 202;
          res.end();
          return;
        }
        if (message.method === "initialize") {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                protocolVersion: "2025-06-18",
                capabilities: { tools: { listChanged: false } },
                serverInfo: { name: "stub-mcp", version: "1.0.0" },
              },
            })
          );
          return;
        }
        if (message.method === "tools/call") {
          res.end(
            JSON.stringify({
              jsonrpc: "2.0",
              id: message.id,
              result: {
                content: [
                  {
                    type: "text",
                    text: "MCP passage one.\n\nMCP passage two.",
                  },
                ],
              },
            })
          );
          return;
        }
      }
      if (lastUrl.includes("forbidden")) {
        res.statusCode = 403;
        res.end(JSON.stringify({ error: { message: "Access denied" } }));
        return;
      }
      res.end(
        JSON.stringify({
          value: [
            {
              id: "doc1",
              content: "The vault code is 4417.",
              title: "Vault policy",
              metadata_storage_path: "https://example.test/vault",
              "@search.score": 3.2,
              "@search.rerankerScore": 2.9,
            },
          ],
        })
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

describe("Azure AI Search remote source", () => {
  it("maps a search response to remote hits", async () => {
    const hits = await remote.searchAzureIndex(
      { target: baseUrl, index: "policies", apiKey: "key" },
      "vault code"
    );
    expect(lastUrl).toContain("/indexes/policies/docs/search");
    expect(lastUrl).toContain("api-version=2024-07-01");
    expect(lastBody).toMatchObject({ search: "vault code", top: 20 });
    expect(hits[0]).toMatchObject({
      id: "doc1",
      title: "Vault policy",
      excerpt: "The vault code is 4417.",
      uri: "https://example.test/vault",
      score: 3.2,
      rerankerScore: 2.9,
    });
  });

  it("uses a semantic configuration when provided", async () => {
    await remote.searchAzureIndex(
      {
        target: baseUrl,
        index: "policies",
        apiKey: "key",
        semanticConfiguration: "default",
      },
      "vault"
    );
    expect(lastBody).toMatchObject({
      queryType: "semantic",
      semanticConfiguration: "default",
      captions: "extractive",
    });
  });

  it("surfaces the provider error", async () => {
    await expect(
      remote.searchAzureIndex(
        { target: `${baseUrl}/forbidden`, index: "policies", apiKey: "key" },
        "x"
      )
    ).rejects.toThrow(/403|Access denied/i);
  });

  it("returns a citation from a live remote source inside retrieve()", async () => {
    const base = await service.createBase({
      name: "remote-base",
      reasoningEffort: "minimal",
    });
    const connection = await connections.createConnection({
      name: "search-conn",
      provider: "azure-ai-search",
      target: baseUrl,
      authType: "apiKey",
      config: { apiVersion: "2024-07-01" },
      secret: { apiKey: "key" },
    });
    const source = await service.addSource({
      baseId: base.id,
      kind: "azure-ai-search",
      name: "Policies",
      config: { index: "policies" },
      connectionId: connection.id,
    });
    expect(source.status).toBe("remote");

    const result = await retrieve.retrieve(base.id, {
      query: "vault code",
      skipRunLog: true,
    });
    expect(result.citations.length).toBe(1);
    expect(result.citations[0]).toMatchObject({
      sourceName: "Policies",
      sourceKind: "azure-ai-search",
      title: "Vault policy",
      excerpt: "The vault code is 4417.",
      uri: "https://example.test/vault",
    });
    const remoteActivity = result.activity.find(
      (entry) =>
        entry.knowledgeSourceName === "Policies" && entry.type === "searchIndex"
    );
    expect(remoteActivity).toMatchObject({
      type: "searchIndex",
      count: 1,
      searchIndexArguments: {
        search: "vault code",
        filter: null,
        sourceDataFields: [],
        searchFields: [],
      },
    });
    expect(result.references[0]).toMatchObject({
      type: "searchIndex",
      id: "0",
      docKey: "doc1",
      sourceData: null,
    });
  });

  it("queries a saved MCP server as a remote knowledge source", async () => {
    const store = await import("@/lib/store");
    const now = new Date().toISOString();
    await store.saveMcpServers([
      {
        id: "mcp_stub",
        name: "Stub",
        transport: "http",
        url: `${baseUrl}/mcp`,
        status: "Connected",
        tools: [
          {
            name: "search",
            description: "Search the stub",
            inputSchema: { type: "object", properties: {} },
          },
        ],
        createdAt: now,
        updatedAt: now,
      },
    ]);
    const base = await service.createBase({
      name: "mcp-base",
      reasoningEffort: "minimal",
    });
    const source = await service.addSource({
      baseId: base.id,
      kind: "mcp",
      name: "MCP docs",
      config: { serverId: "mcp_stub", tool: "search", queryArgument: "query" },
    });
    expect(source.status).toBe("remote");

    const result = await retrieve.retrieve(base.id, {
      query: "vault code",
      skipRunLog: true,
    });
    expect(result.citations.length).toBe(2);
    expect(result.citations[0].excerpt).toContain("MCP passage one");
    const activity = result.activity.find((entry) => entry.type === "mcpServer");
    expect(activity).toMatchObject({
      knowledgeSourceName: "MCP docs",
      count: 2,
      mcpServerArguments: {
        toolName: "search",
        toolArguments: { query: "vault code" },
      },
    });
    expect(result.references[0]).toMatchObject({
      type: "mcpServer",
      title: "Stub · search",
      toolName: "search",
      sourceData: null,
    });
  });
});
