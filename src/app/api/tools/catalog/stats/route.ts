import { NextResponse } from "next/server";
import catalog from "@/data/tool-catalog.json";
import type { ToolCatalogEntry } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TOP_K = 8;

function tokenEstimate(entry: ToolCatalogEntry): number {
  const text = [
    entry.name,
    entry.summary,
    entry.description,
    ...(entry.tags || []),
  ].join("\n");
  return Math.ceil(text.length / 4);
}

const tools = catalog as ToolCatalogEntry[];
const catalogTokens = tools.reduce((sum, entry) => sum + tokenEstimate(entry), 0);
const averageTokens = tools.length
  ? Math.max(1, Math.round(catalogTokens / tools.length))
  : 0;
const toolSearchTokens = averageTokens * TOP_K;
const reductionPercent = catalogTokens
  ? Math.max(0, Math.round((1 - toolSearchTokens / catalogTokens) * 100))
  : 0;

export async function GET() {
  return NextResponse.json({
    catalogTools: tools.length,
    catalogTokens,
    toolSearchTopK: TOP_K,
    toolSearchTokens,
    reductionPercent,
    skillCount: tools.filter((entry) => entry.type === "Skills").length,
    remoteMcpCount: tools.filter((entry) => entry.type === "Remote MCP").length,
    localMcpCount: tools.filter((entry) => entry.type === "Local MCP").length,
    customCount: tools.filter((entry) => entry.type === "Custom").length,
    estimateNote:
      "Token counts are estimated from local catalog text at about four characters per token. Tool-selection accuracy is not measured locally.",
  });
}
