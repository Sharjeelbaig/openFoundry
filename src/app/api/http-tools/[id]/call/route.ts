import { NextRequest, NextResponse } from "next/server";
import { getHttpTools } from "@/lib/store";
import { callHttpTool } from "@/lib/http-tools";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    arguments?: unknown;
  };
  let args: Record<string, unknown> = {};
  if (typeof body.arguments === "string") {
    try {
      const parsed = JSON.parse(body.arguments);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("arguments must be a JSON object");
      args = parsed as Record<string, unknown>;
    } catch (error) {
      return NextResponse.json(
        {
          error: `Invalid JSON arguments: ${
            error instanceof Error ? error.message : "parse failed"
          }`,
        },
        { status: 400 }
      );
    }
  } else if (body.arguments && typeof body.arguments === "object") {
    if (Array.isArray(body.arguments))
      return NextResponse.json(
        { error: "arguments must be a JSON object" },
        { status: 400 }
      );
    args = body.arguments as Record<string, unknown>;
  }

  const tools = await getHttpTools();
  const tool = tools.find((item) => item.id === id);
  if (!tool)
    return NextResponse.json({ error: "HTTP tool not found" }, { status: 404 });
  try {
    return NextResponse.json(await callHttpTool(tool, args));
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "The HTTP call failed.",
      },
      { status: 502 }
    );
  }
}
