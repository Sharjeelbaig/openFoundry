// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { getToolboxes } from "./store";
import { ChatTool, HttpTool, McpToolDefinition } from "./types";
import { resolveMcpTools, callMcpTool } from "./mcp";
import { resolveHttpTools, callHttpTool } from "./http-tools";
import { cosine, embedTexts } from "./providers";

/** Enough for the approval layer to decide without guessing from the name. */
export interface ToolApprovalMetadata {
  write: boolean;
  destructive: boolean;
  reason: string;
}

export interface ResolvedTool {
  id: string;
  functionName: string;
  definition: ChatTool;
  description: string;
  approval: ToolApprovalMetadata;
  execute: (args: Record<string, unknown>) => Promise<{
    text: string;
    isError: boolean;
  }>;
}

export function mcpToolApproval(tool: McpToolDefinition): ToolApprovalMetadata {
  const readOnly = tool.annotations?.readOnlyHint === true;
  const destructive = tool.annotations?.destructiveHint === true;
  return {
    write: !readOnly,
    destructive,
    reason: destructive
      ? "The MCP server marks this tool as destructive."
      : readOnly
      ? "The MCP server marks this tool read-only."
      : "This MCP tool is not marked read-only and may change external state.",
  };
}

export function httpToolApproval(tool: HttpTool): ToolApprovalMetadata {
  const method = tool.method.toUpperCase();
  const write = !["GET", "HEAD", "OPTIONS"].includes(method);
  return {
    write,
    destructive: write,
    reason: write
      ? `The HTTP tool uses ${method} and may change remote state.`
      : "The HTTP tool only reads remote state.",
  };
}

export interface ToolboxResolution {
  builtins: string[];
  functionTools: ResolvedTool[];
  skillIds: string[];
  missing: string[];
  toolSearchApplied: boolean;
}

async function resolveToolIds(toolIds: string[]): Promise<{
  builtins: string[];
  functionTools: ResolvedTool[];
  skillIds: string[];
  missing: string[];
}> {
  const builtins: string[] = [];
  const skillIds: string[] = [];
  const missing: string[] = [];
  const functionTools: ResolvedTool[] = [];

  for (const id of toolIds) {
    if (["web-search", "file-search", "calculator"].includes(id)) {
      builtins.push(id);
      continue;
    }
    if (id.startsWith("skill:")) {
      skillIds.push(id.slice(6));
      continue;
    }
    if (id.startsWith("toolbox:")) {
      missing.push(`${id} (nested toolboxes are not supported)`);
      continue;
    }
  }

  const mcp = await resolveMcpTools(toolIds);
  const http = await resolveHttpTools(toolIds);
  missing.push(...mcp.missing, ...http.missing);
  for (const resolved of mcp.tools) {
    functionTools.push({
      id: resolved.id,
      functionName: resolved.functionName,
      definition: resolved.definition,
      description:
        resolved.tool.description ||
        resolved.definition.function.description ||
        resolved.tool.name,
      approval: mcpToolApproval(resolved.tool),
      execute: async (args) => callMcpTool(resolved.server, resolved.tool.name, args),
    });
  }
  for (const resolved of http.tools) {
    functionTools.push({
      id: resolved.id,
      functionName: resolved.functionName,
      definition: resolved.definition,
      description:
        resolved.tool.description ||
        resolved.definition.function.description ||
        resolved.tool.name,
      approval: httpToolApproval(resolved.tool),
      execute: async (args) => callHttpTool(resolved.tool, args),
    });
  }
  return { builtins, functionTools, skillIds, missing };
}

export async function resolveToolbox(
  toolboxId: string,
  userQuery: string
): Promise<ToolboxResolution> {
  const id = toolboxId.startsWith("toolbox:")
    ? toolboxId.slice("toolbox:".length)
    : toolboxId;
  const toolboxes = await getToolboxes();
  const toolbox = toolboxes.find((item) => item.id === id);
  if (!toolbox) {
    return {
      builtins: [],
      functionTools: [],
      skillIds: [],
      missing: [`toolbox:${id}`],
      toolSearchApplied: false,
    };
  }

  const direct = await resolveToolIds(toolbox.toolIds);
  let functionTools = direct.functionTools;
  let applied = false;

  if (toolbox.toolSearch && functionTools.length > 8 && userQuery.trim()) {
    const embeddings = await embedTexts([
      userQuery,
      ...functionTools.map((tool) => tool.description),
    ]);
    if (embeddings && embeddings.vectors.length === functionTools.length + 1) {
      const queryVector = embeddings.vectors[0];
      const scored = functionTools.map((tool, index) => ({
        tool,
        score: cosine(embeddings.vectors[index + 1], queryVector),
      }));
      scored.sort((a, b) => b.score - a.score);
      functionTools = scored.slice(0, 8).map((item) => item.tool);
      applied = true;
    }
  }

  return {
    builtins: direct.builtins,
    functionTools,
    skillIds: direct.skillIds,
    missing: direct.missing,
    toolSearchApplied: applied,
  };
}

export async function resolveToolboxes(
  toolboxIds: string[],
  userQuery: string
): Promise<{
  builtins: string[];
  functionTools: ResolvedTool[];
  skillIds: string[];
  missing: string[];
  applied: boolean;
}> {
  const builtins: string[] = [];
  const functionTools: ResolvedTool[] = [];
  const skillIds: string[] = [];
  const missing: string[] = [];
  let applied = false;
  for (const toolboxId of toolboxIds) {
    const resolution = await resolveToolbox(toolboxId, userQuery);
    builtins.push(...resolution.builtins);
    functionTools.push(...resolution.functionTools);
    skillIds.push(...resolution.skillIds);
    missing.push(...resolution.missing);
    applied = applied || resolution.toolSearchApplied;
  }
  return { builtins, functionTools, skillIds, missing, applied };
}