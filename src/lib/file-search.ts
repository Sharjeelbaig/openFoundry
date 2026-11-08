// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import type { Citation } from "./types";
import type { ResolvedTool } from "./toolboxes";
import { retrieveViaMcp } from "./knowledge/mcp-client";

export interface FileSearchHit {
  citations: Citation[];
  errors: string[];
}

export type FileSearchRetrieve = (query: string) => Promise<FileSearchHit>;

/**
 * `file-search` in an agent's tool list is a real function the model can call,
 * not a decorative badge: it queries the attached knowledge bases and returns
 * numbered passages. The automatic context injection before the call stays in
 * place, so a model that never calls tools is still grounded; this gives a
 * model that does call tools a way to ask a second, narrower question.
 */
export function fileSearchTool(retrieve: FileSearchRetrieve): ResolvedTool {
  return {
    id: "file-search",
    functionName: "file_search",
    definition: {
      type: "function",
      function: {
        name: "file_search",
        description:
          "Search the agent's attached knowledge bases for passages that answer the question. Use it when the context already provided is not enough.",
        parameters: {
          type: "object",
          properties: {
            query: {
              type: "string",
              description: "What to look for in the knowledge bases.",
            },
          },
          required: ["query"],
        },
      },
    },
    description: "Search the agent's attached knowledge bases",
    approval: {
      write: false,
      destructive: false,
      reason: "Reads local knowledge indexes and returns text only.",
    },
    execute: async (args: Record<string, unknown>) => {
      const query = String(args.query || "").trim();
      if (!query) return { text: "No query was supplied.", isError: true };
      const found = await retrieve(query);
      if (!found.citations.length) {
        return {
          text: found.errors.length
            ? found.errors.join("; ")
            : "No matching passages were found.",
          isError: false,
        };
      }
      return {
        text: found.citations
          .map(
            (citation, index) =>
              `[${index + 1}] ${citation.documentName}\n${citation.chunk}`
          )
          .join("\n\n"),
        isError: false,
      };
    },
  };
}

/** The same tool wired to the project's knowledge MCP endpoint. */
export function knowledgeFileSearchTool(
  origin: string,
  knowledgeBaseIds: string[]
): ResolvedTool {
  return fileSearchTool(async (query) => {
    const found = await retrieveViaMcp(origin, knowledgeBaseIds, query, 6);
    return { citations: found.citations, errors: found.errors };
  });
}
