// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { Citation } from "../types";
import { signInternalMcpToken } from "./mcp-token";

/**
 * Calls each knowledge base through its MCP endpoint, exactly as an external
 * agent would. This is the agent path: no in-process shortcut.
 */

export interface McpRetrieval {
  citations: Citation[];
  embeddingModel: string;
  errors: string[];
}

interface Chunk {
  ref_id: string | number;
  title?: string;
  content?: string;
  score?: number;
}

interface ReferenceBlock {
  kind?: string;
  ref_id: string | number;
  uri?: string | null;
  sourceData?: {
    uid?: string;
    snippet?: string;
    metadata_storage_path?: string;
    title?: string;
    [key: string]: unknown;
  } | null;
}

export async function retrieveViaMcp(
  origin: string,
  baseIds: string[],
  query: string,
  topK = 4
): Promise<McpRetrieval> {
  const citations: Citation[] = [];
  const errors: string[] = [];
  let embeddingModel = "none";

  for (const baseId of baseIds) {
    try {
      const token = await signInternalMcpToken(baseId);
      const res = await fetch(
        `${origin}/api/knowledge/${encodeURIComponent(baseId)}/mcp`,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "knowledge_base_retrieve",
              arguments: { query_variants: [query.slice(0, 150)] },
            },
          }),
          signal: AbortSignal.timeout(60_000),
        }
      );
      if (!res.ok) {
        throw new Error(`MCP endpoint returned ${res.status}`);
      }
      const json = (await res.json()) as {
        result?: {
          isError?: boolean;
          content?: { text?: string }[];
          _meta?: { embeddingModel?: string };
        };
        error?: { message?: string };
      };
      if (json.error) throw new Error(json.error.message || "MCP error");
      if (json.result?.isError) {
        throw new Error(json.result.content?.[0]?.text || "MCP tool error");
      }
      if (json.result?._meta?.embeddingModel) {
        embeddingModel = json.result._meta.embeddingModel;
      }
      // Foundry's MCP result is a content array: item 0 holds the extractive
      // passages, items 1..n hold one JSON reference block each.
      const parsed = (json.result?.content || []).map((block) => {
        try {
          return JSON.parse(block.text || "null") as unknown;
        } catch {
          return null;
        }
      });
      const chunks = Array.isArray(parsed[0]) ? (parsed[0] as Chunk[]) : [];
      if (chunks.length === 0 && typeof parsed[0] === "string" && parsed[0].trim()) {
        // Answer-synthesis bases return the answer text rather than a passage
        // array. Preserve it as the agent's single grounding item.
        citations.push({
          documentId: `${baseId}:answer`,
          documentName: "Knowledge base answer",
          chunk: parsed[0],
          score: 1,
        });
      }
      const references = new Map<string, ReferenceBlock>();
      for (const block of parsed.slice(1)) {
        if (
          block &&
          typeof block === "object" &&
          (block as ReferenceBlock).kind === "reference"
        ) {
          const reference = block as ReferenceBlock;
          references.set(String(reference.ref_id), reference);
        }
      }
      for (const [index, chunk] of chunks.entries()) {
        const reference = references.get(String(chunk.ref_id));
        const sourceData = reference?.sourceData || null;
        citations.push({
          documentId: `${baseId}:${chunk.ref_id}`,
          documentName:
            chunk.title ||
            (sourceData?.title as string | undefined) ||
            sourceData?.metadata_storage_path ||
            "Source",
          chunk: chunk.content || sourceData?.snippet || "",
          score: Number(chunk.score ?? chunks.length - index),
        });
      }
    } catch (error) {
      errors.push(
        `${baseId}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  citations.sort((a, b) => b.score - a.score);
  return { citations: citations.slice(0, topK), embeddingModel, errors };
}
