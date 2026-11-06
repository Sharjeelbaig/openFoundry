// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash } from "crypto";
import { getMcpServers } from "../store";
import { callMcpTool } from "../mcp";
import type { SourceRecord } from "./types";

/**
 * Remote knowledge sources are queried at retrieval time and never ingested.
 * Azure AI Search is the first one: the source points at an index, the
 * connection holds the service URL and key.
 */

export interface RemoteHit {
  id: string;
  title: string;
  excerpt: string;
  uri?: string;
  score: number;
  rerankerScore?: number;
}

function pick(doc: Record<string, unknown>, names: string[]): string {
  for (const name of names) {
    const value = doc[name];
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

export async function searchAzureIndex(
  config: Record<string, unknown>,
  query: string,
  topK = 20,
  signal?: AbortSignal
): Promise<RemoteHit[]> {
  const target = String(config.target || "").replace(/\/+$/, "");
  const index = String(config.index || "").trim();
  const apiKey = String(config.apiKey || "");
  if (!target) throw new Error("The connection has no service URL.");
  if (!index) throw new Error("This source has no index name.");
  if (!apiKey) throw new Error("The connection has no API key.");
  const apiVersion = String(config.apiVersion || "2024-07-01");
  const contentField = String(config.contentField || "").trim();
  const titleField = String(config.titleField || "").trim();
  const uriField = String(config.uriField || "").trim();
  const semanticConfiguration = String(config.semanticConfiguration || "").trim();

  const body: Record<string, unknown> = {
    search: query,
    top: Math.min(Math.max(topK, 1), 50),
  };
  if (semanticConfiguration) {
    body.queryType = "semantic";
    body.semanticConfiguration = semanticConfiguration;
    body.captions = "extractive";
  }

  const res = await fetch(
    `${target}/indexes/${encodeURIComponent(index)}/docs/search?api-version=${encodeURIComponent(apiVersion)}`,
    {
      method: "POST",
      headers: { "content-type": "application/json", "api-key": apiKey },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
        : AbortSignal.timeout(30_000),
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    value?: Record<string, unknown>[];
    error?: { message?: string };
  };
  if (!res.ok) {
    throw new Error(
      `Azure AI Search returned ${res.status}: ${json.error?.message || "request failed"}`
    );
  }

  return (json.value || []).map((doc, index_) => {
    const content = contentField
      ? pick(doc, [contentField])
      : pick(doc, ["content", "chunk", "text", "merged_content"]);
    const title =
      (titleField ? pick(doc, [titleField]) : "") ||
      pick(doc, ["title", "metadata_storage_name", "document_title", "name"]) ||
      `Result ${index_ + 1}`;
    const uri =
      (uriField ? pick(doc, [uriField]) : "") ||
      pick(doc, ["metadata_storage_path", "uri", "url", "source_url"]);
    const id =
      pick(doc, ["id", "chunk_id", "metadata_storage_path"]) ||
      `${index}-${index_}`;
    const captions = doc["@search.captions"];
    const caption =
      Array.isArray(captions) && captions[0] && typeof captions[0] === "object"
        ? String((captions[0] as { text?: unknown }).text || "")
        : "";
    const excerpt = (caption || content || title).slice(0, 4000);
    return {
      id,
      title,
      excerpt,
      uri: uri || undefined,
      score: Number(doc["@search.score"] ?? 0),
      rerankerScore:
        doc["@search.rerankerScore"] == null
          ? undefined
          : Number(doc["@search.rerankerScore"]),
    };
  });
}

/**
 * MCP knowledge source: calls one configured tool on one saved MCP server and
 * turns the tool's textual result into passages. The tool call is real; a
 * server error or a tool error is reported, never converted into a fake hit.
 */
export async function searchMcpSource(
  config: Record<string, unknown>,
  query: string,
  signal?: AbortSignal
): Promise<RemoteHit[]> {
  const serverId = String(config.serverId || "").trim();
  const toolName = String(config.tool || "").trim();
  if (!serverId) throw new Error("This source has no MCP server selected.");
  if (!toolName) throw new Error("This source has no MCP tool selected.");
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");

  const server = (await getMcpServers()).find((item) => item.id === serverId);
  if (!server) {
    throw new Error("The MCP server configured for this source no longer exists.");
  }
  const argumentName =
    String(config.queryArgument || "query").trim() || "query";
  const toolArguments =
    String(config.queryFormat || "string") === "query_variants"
      ? { [argumentName]: [query] }
      : { [argumentName]: query };
  const result = await callMcpTool(server, toolName, toolArguments);
  if (result.isError) {
    throw new Error(`MCP tool "${toolName}" failed: ${result.text}`);
  }

  return mcpToolPassages(result.raw, result.text)
    .slice(0, 8)
    .map((passage, index) => ({
      id: `${server.id}:${toolName}:${createHash("sha1")
        .update(`${index}:${passage.text}`)
        .digest("hex")
        .slice(0, 12)}`,
      title: passage.title || `${server.name} · ${toolName}`,
      excerpt: passage.text.slice(0, 4000),
      uri: passage.uri || server.url,
      score: 1 / (index + 1),
    }));
}

interface McpPassage {
  text: string;
  title?: string;
  uri?: string;
}

/**
 * MCP tools may return one text block, or the Foundry knowledge-tool shape:
 * item 0 is a JSON array of passages and items 1..n are JSON reference blocks.
 * Parse that shape when present; otherwise split plain text on blank lines.
 */
function mcpToolPassages(raw: unknown, fallbackText: string): McpPassage[] {
  const content =
    raw && typeof raw === "object" && Array.isArray((raw as { content?: unknown }).content)
      ? ((raw as { content: unknown[] }).content as Record<string, unknown>[])
      : [];
  const references = new Map<string, Record<string, unknown>>();
  for (const item of content.slice(1)) {
    if (!item || item.type !== "text" || typeof item.text !== "string") continue;
    try {
      const parsed = JSON.parse(item.text) as Record<string, unknown>;
      if (parsed?.kind === "reference") {
        references.set(String(parsed.ref_id), parsed);
      }
    } catch {
      // Not a reference block.
    }
  }
  const first = content.find(
    (item) => item.type === "text" && typeof item.text === "string"
  );
  if (first) {
    try {
      const parsed = JSON.parse(String(first.text)) as unknown;
      if (Array.isArray(parsed)) {
        const passages = parsed.flatMap((entry, index): McpPassage[] => {
          if (typeof entry === "string" && entry.trim()) {
            return [{ text: entry }];
          }
          if (
            entry &&
            typeof entry === "object" &&
            typeof (entry as { content?: unknown }).content === "string"
          ) {
            const passage = entry as { ref_id?: number | string; content: string };
            const reference = references.get(String(passage.ref_id ?? index));
            const sourceData =
              reference && typeof reference.sourceData === "object"
                ? (reference.sourceData as Record<string, unknown>)
                : null;
            return [
              {
                text: passage.content,
                title:
                  (typeof sourceData?.metadata_storage_path === "string" &&
                    sourceData.metadata_storage_path) ||
                  (typeof sourceData?.title === "string" && sourceData.title) ||
                  undefined,
                uri:
                  typeof reference?.uri === "string" ? reference.uri : undefined,
              },
            ];
          }
          return [];
        });
        if (passages.length) return passages;
      }
    } catch {
      // Not JSON; fall through to paragraph splitting.
    }
  }
  const paragraphs = fallbackText
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean);
  return (paragraphs.length ? paragraphs : [fallbackText]).map((text) => ({ text }));
}

/** The remote source kinds this build can query today. */
export function isRemoteQueryable(source: SourceRecord): boolean {
  return (
    source.mode === "remote" &&
    (source.kind === "azure-ai-search" || source.kind === "mcp")
  );
}
