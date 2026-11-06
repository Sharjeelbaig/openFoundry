// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer, type Server, type ServerResponse } from "http";
import { mkdtempSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { AddressInfo } from "net";
import type { McpServer } from "@/lib/types";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-mcp-sse-"));
process.env.OPENFOUNDRY_DATA_DIR = dir;

type Mcp = typeof import("@/lib/mcp");
let mcp: Mcp;
let server: Server;
let origin = "";
let stream: ServerResponse | null = null;

beforeAll(async () => {
  mcp = await import("@/lib/mcp");
  server = createServer((req, res) => {
    const url = new URL(req.url || "/", "http://localhost");
    if (req.method === "GET" && url.pathname === "/sse") {
      stream = res;
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
      });
      res.write("event: endpoint\ndata: /sse?sessionId=abc\n\n");
      return;
    }
    if (req.method === "GET") {
      res.statusCode = 404;
      res.end("no sse here");
      return;
    }
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const message = JSON.parse(body) as {
        id?: number;
        method?: string;
      };
      res.statusCode = 202;
      res.end("Accepted");
      if (message.id === undefined || !stream) return;
      const result =
        message.method === "initialize"
          ? {
              protocolVersion: "2025-06-18",
              capabilities: { tools: {} },
              serverInfo: { name: "sse-stub", version: "1" },
            }
          : message.method === "tools/list"
          ? {
              tools: [
                { name: "alpha", description: "A", inputSchema: { type: "object" } },
                { name: "beta", description: "B", inputSchema: { type: "object" } },
              ],
            }
          : {};
      stream.write(
        `event: message\ndata: ${JSON.stringify({
          jsonrpc: "2.0",
          id: message.id,
          result,
        })}\n\n`
      );
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  stream?.end();
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

function serverRecord(transport: "http" | "sse", url: string): McpServer {
  return {
    id: "mcp_test",
    name: "stub",
    transport,
    url,
    headers: {},
    status: "Unknown",
    tools: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

describe("legacy SSE MCP transport", () => {
  it("initializes and lists tools over the event stream", async () => {
    const probed = await mcp.probeMcpServer(serverRecord("sse", `${origin}/sse`));
    expect(probed.status).toBe("Connected");
    expect(probed.tools.map((tool) => tool.name)).toEqual(["alpha", "beta"]);
  }, 30_000);

  it("auto-detects an /sse URL even when the transport says http", async () => {
    const probed = await mcp.probeMcpServer(serverRecord("http", `${origin}/sse`));
    expect(probed.status).toBe("Connected");
    expect(probed.tools.length).toBe(2);
  }, 30_000);

  it("stores the real failure when the endpoint is not an SSE server", async () => {
    const probed = await mcp.probeMcpServer(serverRecord("sse", `${origin}/broken`));
    expect(probed.status).toBe("Error");
    expect(probed.error).toMatch(/404|SSE/i);
  }, 30_000);
});
