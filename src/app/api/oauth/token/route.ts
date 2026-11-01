import { NextRequest, NextResponse } from "next/server";
import { oauthStatus } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const toolId = req.nextUrl.searchParams.get("toolId");
  const authMethodId = req.nextUrl.searchParams.get("authMethodId");
  if (!toolId || !authMethodId)
    return NextResponse.json(
      { error: "toolId and authMethodId are required" },
      { status: 400 }
    );
  return NextResponse.json(await oauthStatus(toolId, authMethodId));
}
