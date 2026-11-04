// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash } from "crypto";
import { getHttpTools } from "./store";
import { resolveOAuthHeaders } from "./oauth";
import { ChatTool, HttpTool } from "./types";

const MAX_TEXT = 12_000;
const TIMEOUT_MS = 20_000;

function placeholder(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

function render(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) =>
    placeholder(args[key])
  );
}

function encodeUrl(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) =>
    encodeURIComponent(placeholder(args[key]))
  );
}

function jsonEscape(value: string): string {
  return JSON.stringify(value).slice(1, -1);
}

function renderBody(template: string, args: Record<string, unknown>): string {
  return template.replace(/\{\{\s*([a-zA-Z0-9_-]+)\s*\}\}/g, (_, key: string) =>
    jsonEscape(placeholder(args[key]))
  );
}

export interface HttpToolResult {
  text: string;
  isError: boolean;
  status: number;
  latencyMs: number;
}

export async function callHttpTool(
  tool: HttpTool,
  args: Record<string, unknown>
): Promise<HttpToolResult> {
  const started = Date.now();
  const url = encodeUrl(tool.url, args);
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new Error("Only http and https endpoints are allowed.");
    }
  } catch (error) {
    throw new Error(
      `The HTTP tool URL is not valid: ${
        error instanceof Error ? error.message : "parse failed"
      }`
    );
  }

  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(tool.headers || {})) {
    headers[key] = render(value, args);
  }
  let body: string | undefined;
  if (tool.bodyTemplate && tool.method !== "GET" && tool.method !== "DELETE") {
    body = renderBody(tool.bodyTemplate, args);
    if (!Object.keys(headers).some((key) => key.toLowerCase() === "content-type")) {
      headers["Content-Type"] = "application/json";
    }
  }

  const resolvedHeaders = await resolveOAuthHeaders(headers);
  let response: Response;
  try {
    response = await fetch(url, {
      method: tool.method,
      headers: resolvedHeaders,
      body,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Could not reach the HTTP tool: ${
        error instanceof Error ? error.message : "network error"
      }`
    );
  }
  const text = (await response.text().catch(() => "")).slice(0, MAX_TEXT);
  return {
    text: text || `HTTP ${response.status} ${response.statusText}`,
    isError: !response.ok,
    status: response.status,
    latencyMs: Date.now() - started,
  };
}

export function httpToolId(id: string): string {
  return `http:${id}`;
}

export function parseHttpToolId(id: string): string | null {
  return id.startsWith("http:") ? id.slice(5) : null;
}

export function httpFunctionName(tool: HttpTool): string {
  const base = `http_${tool.id}_${tool.name}`.replace(/[^a-zA-Z0-9_-]/g, "_");
  if (base.length <= 64) return base;
  const digest = createHash("sha1").update(base).digest("hex").slice(0, 8);
  return `${base.slice(0, 55)}_${digest}`;
}

export interface ResolvedHttpTool {
  id: string;
  tool: HttpTool;
  functionName: string;
  definition: ChatTool;
}

export async function resolveHttpTools(toolIds: string[]): Promise<{
  tools: ResolvedHttpTool[];
  missing: string[];
}> {
  const ids = toolIds
    .map(parseHttpToolId)
    .filter((id): id is string => Boolean(id));
  if (ids.length === 0) return { tools: [], missing: [] };
  const saved = await getHttpTools();
  const resolved: ResolvedHttpTool[] = [];
  const missing: string[] = [];
  const used = new Set<string>();
  for (const id of ids) {
    const tool = saved.find((item) => item.id === id);
    if (!tool) {
      missing.push(`http:${id}`);
      continue;
    }
    let functionName = httpFunctionName(tool);
    let suffix = 2;
    while (used.has(functionName)) {
      functionName = `${httpFunctionName(tool).slice(0, 58)}_${suffix++}`;
    }
    used.add(functionName);
    resolved.push({
      id: `http:${id}`,
      tool,
      functionName,
      definition: {
        type: "function",
        function: {
          name: functionName,
          description: tool.description,
          parameters:
            tool.inputSchema ||
            ({ type: "object", properties: {} } as Record<string, unknown>),
        },
      },
    });
  }
  return { tools: resolved, missing };
}
