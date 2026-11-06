// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import { createHash } from "crypto";
import readline from "readline";
import { getMcpServers } from "./store";
import { resolveOAuthHeaders } from "./oauth";
import { ChatTool, McpServer, McpToolDefinition } from "./types";

/**
 * A small Model Context Protocol client.
 *
 * openFoundry ships no MCP runtime of its own: a server is either a local
 * process the user already trusts (stdio) or a streamable HTTP endpoint they
 * configured. Every connection is short-lived and owned by this process, so a
 * broken server cannot keep a background thread alive after the request.
 */

const PROTOCOL_VERSION = "2025-06-18";
const REQUEST_TIMEOUT_MS = 20_000;
const MAX_TOOL_TEXT = 12_000;

interface RpcError {
  code: number;
  message: string;
  data?: unknown;
}

interface RpcResponse {
  jsonrpc: "2.0";
  id: number | string;
  result?: unknown;
  error?: RpcError;
}

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : null;
}

function timeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${ms / 1000}s`)),
      ms
    );
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

class StdioSession {
  private child: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private stderr = "";
  private closed = false;

  constructor(server: McpServer) {
    if (!server.command?.trim()) throw new Error("A stdio server needs a command.");
    const env = { ...process.env, ...(server.env || {}) };
    this.child = spawn(server.command.trim(), server.args || [], {
      env,
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.child.on("error", (error) => {
      this.fail(new Error(error.message));
    });
    this.child.on("exit", (code, signal) => {
      if (!this.closed) {
        this.fail(
          new Error(
            `MCP server exited${code !== null ? ` with code ${code}` : ""}${
              signal ? ` (${signal})` : ""
            }.${this.stderr.trim() ? ` ${this.stderr.trim().slice(-1000)}` : ""}`
          )
        );
      }
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk: string) => {
      this.stderr = `${this.stderr}${chunk}`.slice(-4000);
    });

    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      let message: RpcResponse;
      try {
        message = JSON.parse(trimmed) as RpcResponse;
      } catch {
        // Some servers write diagnostics to stdout. Ignore non-JSON lines.
        return;
      }
      if (message.id === undefined || message.id === null) return;
      const numeric = typeof message.id === "number" ? message.id : Number(message.id);
      const pending = this.pending.get(numeric);
      if (!pending) return;
      this.pending.delete(numeric);
      clearTimeout(pending.timer);
      if (message.error) {
        pending.reject(
          new Error(
            `${message.error.message || "MCP request failed"}${
              message.error.code ? ` (${message.error.code})` : ""
            }`
          )
        );
      } else {
        pending.resolve(message.result);
      }
    });
  }

  private fail(error: Error) {
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  async initialize(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "openFoundry", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
  }

  request(method: string, params: JsonObject): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("MCP server is not running."));
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.child.stdin.write(`${JSON.stringify(message)}\n`);
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("Could not write to MCP server."));
      }
    });
  }

  notify(method: string, params: JsonObject): void {
    if (this.closed) return;
    try {
      this.child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    } catch {
      // A notification is best-effort; the next request reports the failure.
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("MCP connection closed."));
    }
    this.pending.clear();
    try {
      this.child.kill("SIGTERM");
    } catch {
      // already gone
    }
  }
}

interface SseEvent {
  event?: string;
  data: string;
}

function parseSseEvents(text: string): SseEvent[] {
  const events: SseEvent[] = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const event: SseEvent = { data: "" };
    const data: string[] = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith("event:")) event.event = line.slice(6).trim();
      if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
    }
    if (data.length) {
      event.data = data.join("\n");
      events.push(event);
    }
  }
  return events;
}

class HttpSession {
  private sessionId?: string;
  private nextId = 1;
  private readonly url: string;
  private readonly headers: Record<string, string>;

  constructor(server: McpServer) {
    const url = server.url?.trim();
    if (!url) throw new Error("An HTTP MCP server needs a URL.");
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("The MCP server URL is not valid.");
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("The MCP server URL must use http or https.");
    }
    this.url = parsed.toString();
    this.headers = server.headers || {};
  }

  private async post(message: JsonObject, expectedId?: number): Promise<unknown> {
    const authHeaders = await resolveOAuthHeaders(this.headers);
    const headers: Record<string, string> = {
      ...authHeaders,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": PROTOCOL_VERSION,
    };
    if (this.sessionId) headers["Mcp-Session-Id"] = this.sessionId;
    let response: Response;
    try {
      response = await fetch(this.url, {
        method: "POST",
        headers,
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(
        `Could not reach the MCP server: ${
          error instanceof Error ? error.message : "network error"
        }`
      );
    }
    const session = response.headers.get("mcp-session-id");
    if (session) this.sessionId = session;
    if (response.status === 202 || response.status === 204) return undefined;
    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `MCP server returned ${response.status}. ${body.slice(0, 500)}`.trim()
      );
    }
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      for (const event of parseSseEvents(text)) {
        if (!event.data || event.data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(event.data) as RpcResponse;
          if (
            parsed.id !== undefined &&
            (expectedId === undefined || parsed.id === expectedId)
          ) {
            return parsed;
          }
        } catch {
          // keep looking for the response frame
        }
      }
      return undefined;
    }
    return (await response.json()) as RpcResponse;
  }

  async initialize(): Promise<void> {
    const id = this.nextId++;
    await this.post(
      {
        jsonrpc: "2.0",
        id,
        method: "initialize",
        params: {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: "openFoundry", version: "0.1.0" },
        },
      },
      id
    );
    await this.post({
      jsonrpc: "2.0",
      method: "notifications/initialized",
      params: {},
    });
  }

  async request(method: string, params: JsonObject): Promise<unknown> {
    const id = this.nextId++;
    const response = (await this.post(
      {
        jsonrpc: "2.0",
        id,
        method,
        params,
      },
      id
    )) as RpcResponse | undefined;
    if (!response) throw new Error(`${method} returned no response.`);
    if (response.error) {
      throw new Error(
        `${response.error.message || "MCP request failed"}${
          response.error.code ? ` (${response.error.code})` : ""
        }`
      );
    }
    return response.result;
  }

  close(): void {
    // Stateless HTTP sessions have nothing to keep open.
  }
}

/**
 * Legacy SSE transport: a GET opens an event stream, the server sends an
 * `endpoint` event, and JSON-RPC requests are POSTed to that endpoint while
 * responses arrive on the stream. This is what Atlassian's remote MCP server
 * uses; the newer streamable HTTP transport would 404 on it.
 */
class SseSession {
  private readonly url: string;
  private readonly headers: Record<string, string>;
  private controller = new AbortController();
  private reader?: ReadableStreamDefaultReader<Uint8Array>;
  private endpoint?: string;
  private endpointWaiters: (() => void)[] = [];
  private pending = new Map<
    number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private nextId = 1;
  private closed = false;

  constructor(server: McpServer) {
    const url = server.url?.trim();
    if (!url) throw new Error("An SSE MCP server needs a URL.");
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("The MCP server URL must use http or https.");
      }
      this.url = parsed.toString();
    } catch {
      throw new Error("The MCP server URL is not valid.");
    }
    this.headers = server.headers || {};
  }

  private async start(): Promise<void> {
    if (this.reader) return;
    const authHeaders = await resolveOAuthHeaders(this.headers);
    let response: Response;
    try {
      response = await fetch(this.url, {
        headers: { ...authHeaders, Accept: "text/event-stream" },
        signal: this.controller.signal,
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(
        `Could not open the SSE stream: ${
          error instanceof Error ? error.message : "network error"
        }`
      );
    }
    if (!response.ok || !response.body) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `SSE endpoint returned ${response.status}. ${body.slice(0, 400)}`.trim()
      );
    }
    this.reader = response.body.getReader();
    void this.pump();
  }

  private async pump(): Promise<void> {
    if (!this.reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    try {
      for (;;) {
        const { done, value } = await this.reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() || "";
        for (const block of blocks) {
          let event = "message";
          const data: string[] = [];
          for (const line of block.split(/\r?\n/)) {
            if (line.startsWith("event:")) event = line.slice(6).trim();
            if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
          }
          if (data.length === 0) continue;
          const payload = data.join("\n");
          if (event === "endpoint") {
            this.endpoint = new URL(payload, this.url).toString();
            for (const notify of this.endpointWaiters.splice(0)) notify();
            continue;
          }
          try {
            const message = JSON.parse(payload) as RpcResponse;
            if (message.id === undefined || message.id === null) continue;
            const pending = this.pending.get(Number(message.id));
            if (!pending) continue;
            this.pending.delete(Number(message.id));
            clearTimeout(pending.timer);
            if (message.error) {
              pending.reject(
                new Error(
                  `${message.error.message || "MCP request failed"}${
                    message.error.code ? ` (${message.error.code})` : ""
                  }`
                )
              );
            } else {
              pending.resolve(message.result);
            }
          } catch {
            // Ignore non-JSON frames.
          }
        }
      }
    } catch {
      // The stream was aborted or closed.
    }
    this.fail(new Error("The MCP SSE stream closed."));
  }

  private fail(error: Error): void {
    if (this.closed) return;
    this.closed = true;
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }

  private waitForEndpoint(): Promise<string> {
    if (this.endpoint) return Promise.resolve(this.endpoint);
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error("The MCP server did not send an endpoint event.")),
        REQUEST_TIMEOUT_MS
      );
      this.endpointWaiters.push(() => {
        clearTimeout(timer);
        resolve(this.endpoint!);
      });
    });
  }

  private async post(message: JsonObject): Promise<void> {
    const endpoint = await this.waitForEndpoint();
    const authHeaders = await resolveOAuthHeaders(this.headers);
    let response: Response;
    try {
      response = await fetch(endpoint, {
        method: "POST",
        headers: {
          ...authHeaders,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify(message),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: "no-store",
      });
    } catch (error) {
      throw new Error(
        `Could not POST to the MCP endpoint: ${
          error instanceof Error ? error.message : "network error"
        }`
      );
    }
    if (!response.ok && response.status !== 202) {
      const body = await response.text().catch(() => "");
      throw new Error(
        `MCP endpoint returned ${response.status}. ${body.slice(0, 400)}`.trim()
      );
    }
  }

  request(method: string, params: JsonObject): Promise<unknown> {
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${REQUEST_TIMEOUT_MS / 1000}s`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.post({ jsonrpc: "2.0", id, method, params }).catch((error) => {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });
  }

  async initialize(): Promise<void> {
    await this.start();
    await this.request("initialize", {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "openFoundry", version: "0.1.0" },
    });
    await this.post({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });
  }

  close(): void {
    this.closed = true;
    this.controller.abort();
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(new Error("MCP connection closed."));
    }
    this.pending.clear();
  }
}

type Session = StdioSession | HttpSession | SseSession;

async function withSession<T>(
  server: McpServer,
  run: (session: Session) => Promise<T>
): Promise<T> {
  const legacySse =
    server.transport === "sse" ||
    (server.transport !== "stdio" && /\/sse(\?|$)/i.test(server.url || ""));
  const session: Session =
    server.transport === "stdio"
      ? new StdioSession(server)
      : legacySse
      ? new SseSession(server)
      : new HttpSession(server);
  try {
    await timeout(session.initialize(), REQUEST_TIMEOUT_MS * 2, "MCP initialize");
    return await timeout(run(session), REQUEST_TIMEOUT_MS * 2, "MCP tool call");
  } finally {
    session.close();
  }
}

function normalizeTool(value: unknown): McpToolDefinition | null {
  const tool = asObject(value);
  if (!tool || typeof tool.name !== "string" || !tool.name.trim()) return null;
  return {
    name: tool.name.trim(),
    description:
      typeof tool.description === "string" ? tool.description : undefined,
    inputSchema:
      asObject(tool.inputSchema) || { type: "object", properties: {} },
  };
}

export async function listMcpTools(server: McpServer): Promise<McpToolDefinition[]> {
  return withSession(server, async (session) => {
    const result = asObject(await session.request("tools/list", {}));
    const tools = Array.isArray(result?.tools) ? result.tools : [];
    return tools.map(normalizeTool).filter((tool): tool is McpToolDefinition => Boolean(tool));
  });
}

/** Connect once, persist the advertised tool list, and keep the failure reason. */
export async function probeMcpServer(server: McpServer): Promise<McpServer> {
  try {
    const tools = await listMcpTools(server);
    return {
      ...server,
      status: "Connected",
      error: undefined,
      tools,
      lastConnectedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      ...server,
      status: "Error",
      error: error instanceof Error ? error.message : "MCP connection failed.",
      tools: [],
      updatedAt: new Date().toISOString(),
    };
  }
}

function textFromContent(content: unknown): string {
  if (!Array.isArray(content)) {
    if (typeof content === "string") return content;
    return content ? JSON.stringify(content) : "";
  }
  const parts: string[] = [];
  for (const entry of content) {
    const item = asObject(entry);
    if (!item) continue;
    if (item.type === "text" && typeof item.text === "string") {
      parts.push(item.text);
    } else if (item.type === "image") {
      parts.push(
        `[image${typeof item.mimeType === "string" ? `: ${item.mimeType}` : ""}]`
      );
    } else if (item.type === "audio") {
      parts.push(
        `[audio${typeof item.mimeType === "string" ? `: ${item.mimeType}` : ""}]`
      );
    } else if (item.type === "resource") {
      const resource = asObject(item.resource);
      if (resource && typeof resource.text === "string") parts.push(resource.text);
      else if (resource && typeof resource.uri === "string") {
        parts.push(`[resource: ${resource.uri}]`);
      }
    } else if (item.type === "resource_link") {
      parts.push(
        `[resource: ${typeof item.name === "string" ? item.name : "link"}${
          typeof item.uri === "string" ? ` (${item.uri})` : ""
        }]`
      );
    } else {
      parts.push(JSON.stringify(item));
    }
  }
  return parts.join("\n");
}

export interface McpToolResult {
  text: string;
  isError: boolean;
  raw?: unknown;
}

export async function callMcpTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>
): Promise<McpToolResult> {
  return withSession(server, async (session) => {
    const result = asObject(
      await session.request("tools/call", {
        name: toolName,
        arguments: args,
      })
    );
    if (!result) return { text: "The MCP server returned an empty result.", isError: true };
    const text =
      textFromContent(result.content) ||
      (result.structuredContent ? JSON.stringify(result.structuredContent, null, 2) : "");
    return {
      text: (text || "The tool returned no textual content.").slice(0, MAX_TOOL_TEXT),
      isError: result.isError === true,
      raw: result,
    };
  });
}

export function mcpToolId(serverId: string, toolName: string): string {
  return `mcp:${serverId}:${toolName}`;
}

export function parseMcpToolId(
  id: string
): { serverId: string; toolName: string } | null {
  if (!id.startsWith("mcp:")) return null;
  const parts = id.split(":");
  if (parts.length < 3) return null;
  const serverId = parts[1];
  const toolName = parts.slice(2).join(":");
  if (!serverId || !toolName) return null;
  return { serverId, toolName };
}

/** OpenAI function names are limited to 64 characters. */
export function mcpFunctionName(serverId: string, toolName: string): string {
  const base = `mcp_${serverId}_${toolName}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (base.length <= 64) return base;
  const digest = createHash("sha1").update(base).digest("hex").slice(0, 8);
  return `${base.slice(0, 55)}_${digest}`;
}

export interface ResolvedMcpTool {
  id: string;
  server: McpServer;
  tool: McpToolDefinition;
  functionName: string;
  definition: ChatTool;
}

/**
 * Resolve the `mcp:<server>:<tool>` ids stored on an agent into model tool
 * definitions. Unknown servers and tools are reported, not silently invented.
 */
export async function resolveMcpTools(toolIds: string[]): Promise<{
  tools: ResolvedMcpTool[];
  missing: string[];
}> {
  const ids = toolIds.filter((id) => id.startsWith("mcp:"));
  if (ids.length === 0) return { tools: [], missing: [] };
  const servers = await getMcpServers();
  const resolved: ResolvedMcpTool[] = [];
  const missing: string[] = [];
  const usedNames = new Set<string>();
  for (const id of ids) {
    const parsed = parseMcpToolId(id);
    if (!parsed) {
      missing.push(id);
      continue;
    }
    const server = servers.find((item) => item.id === parsed.serverId);
    const tool = server?.tools.find((item) => item.name === parsed.toolName);
    if (!server || !tool) {
      missing.push(id);
      continue;
    }
    let functionName = mcpFunctionName(server.id, tool.name);
    let suffix = 2;
    while (usedNames.has(functionName)) {
      const base = mcpFunctionName(server.id, tool.name).slice(0, 58);
      functionName = `${base}_${suffix++}`;
    }
    usedNames.add(functionName);
    resolved.push({
      id,
      server,
      tool,
      functionName,
      definition: {
        type: "function",
        function: {
          name: functionName,
          description:
            tool.description ||
            `${tool.name} from the ${server.name} MCP server.`,
          parameters: tool.inputSchema,
        },
      },
    });
  }
  return { tools: resolved, missing };
}
