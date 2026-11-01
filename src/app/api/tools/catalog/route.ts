import { NextRequest, NextResponse } from "next/server";
import catalog from "@/data/tool-catalog.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The local tool catalog mirrors the public reference catalog's metadata.
 * Availability is decided by the entry's `availability` field, not by the
 * presence of a cloud endpoint:
 *
 *   local-skill  attach instructions to an agent
 *   mcp          connect a remote MCP endpoint
 *   mcp-local    point the local MCP client at a local server
 *   http         create a generic local HTTP tool
 */
export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  const tools = type ? catalog.filter((entry) => entry.type === type) : catalog;
  return NextResponse.json({
    tools,
    total: tools.length,
    source: "local-catalog",
  });
}
