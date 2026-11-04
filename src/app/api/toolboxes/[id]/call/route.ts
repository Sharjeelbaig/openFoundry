// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { getToolboxes } from "@/lib/store";
import { resolveToolbox } from "@/lib/toolboxes";
import { searchWeb, tryCalculate } from "@/lib/websearch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const BUILTIN_DEFINITIONS: Record<
  string,
  {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  }
> = {
  "web-search": {
    name: "web_search",
    description: "Search the public web and return the top results.",
    parameters: {
      type: "object",
      properties: { query: { type: "string", description: "Search query" } },
      required: ["query"],
    },
  },
  calculator: {
    name: "calculator",
    description: "Evaluate an arithmetic expression locally.",
    parameters: {
      type: "object",
      properties: {
        expression: { type: "string", description: "Arithmetic expression" },
      },
      required: ["expression"],
    },
  },
  "file-search": {
    name: "file_search",
    description:
      "Retrieve grounded chunks from a knowledge base. Call it through an agent that has knowledge bases attached.",
    parameters: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  },
};

function argumentString(
  args: Record<string, unknown>,
  ...keys: string[]
): string {
  for (const key of keys) {
    const value = args[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const toolboxes = await getToolboxes();
  const toolbox = toolboxes.find((item) => item.id === id);
  if (!toolbox)
    return NextResponse.json({ error: "Toolbox not found" }, { status: 404 });
  const resolution = await resolveToolbox(id, "");
  const builtins = resolution.builtins.map((builtin) => ({
    id: builtin,
    ...(BUILTIN_DEFINITIONS[builtin] || {
      name: builtin,
      description: builtin,
      parameters: { type: "object", properties: {} },
    }),
    kind: "builtin",
    callable: builtin !== "file-search",
  }));
  const functionTools = resolution.functionTools.map((tool) => ({
    id: tool.id,
    ...tool.definition.function,
    kind: "function",
    callable: true,
  }));
  return NextResponse.json({
    toolbox: {
      id: toolbox.id,
      name: toolbox.name,
      version: toolbox.version || 1,
      toolSearch: toolbox.toolSearch,
      toolIds: toolbox.toolIds,
    },
    tools: [...builtins, ...functionTools],
    skills: resolution.skillIds,
    missing: resolution.missing,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    name?: string;
    tool?: string;
    arguments?: Record<string, unknown>;
  };
  const name = (body.name || body.tool || "").trim();
  if (!name)
    return NextResponse.json(
      { error: 'Provide the tool name in "name" or "tool".' },
      { status: 400 }
    );
  const args =
    body.arguments && typeof body.arguments === "object" && !Array.isArray(body.arguments)
      ? body.arguments
      : {};

  const resolution = await resolveToolbox(id, "");
  if (resolution.missing.length && !resolution.functionTools.length && !resolution.builtins.length)
    return NextResponse.json(
      { error: `Toolbox not found or empty: ${id}` },
      { status: 404 }
    );

  if (resolution.builtins.includes("web-search") && name === "web_search") {
    const query = argumentString(args, "query", "input", "q");
    if (!query)
      return NextResponse.json({ error: "query is required" }, { status: 400 });
    const results = await searchWeb(query);
    return NextResponse.json({
      tool: name,
      isError: false,
      text: JSON.stringify(results, null, 2),
    });
  }
  if (resolution.builtins.includes("calculator") && name === "calculator") {
    const expression = argumentString(args, "expression", "input", "query");
    if (!expression)
      return NextResponse.json(
        { error: "expression is required" },
        { status: 400 }
      );
    const result = tryCalculate(expression);
    return NextResponse.json({
      tool: name,
      isError: !result,
      text: result || "No arithmetic expression found.",
    });
  }
  if (resolution.builtins.includes("file-search") && name === "file_search") {
    return NextResponse.json(
      {
        tool: name,
        isError: true,
        text: "file_search needs an agent with knowledge bases. Use the agent chat endpoint instead.",
      },
      { status: 200 }
    );
  }

  const resolved = resolution.functionTools.find(
    (tool) => tool.functionName === name || tool.id === name
  );
  if (!resolved)
    return NextResponse.json(
      { error: `Tool "${name}" is not part of this toolbox.` },
      { status: 404 }
    );

  try {
    const result = await resolved.execute(args);
    return NextResponse.json({
      tool: name,
      isError: result.isError,
      text: result.text,
    });
  } catch (error) {
    return NextResponse.json(
      {
        tool: name,
        isError: true,
        text: error instanceof Error ? error.message : "Tool call failed.",
      },
      { status: 500 }
    );
  }
}
