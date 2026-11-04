// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { createOAuthStart } from "@/lib/oauth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    toolId?: string;
    authMethodId?: string;
    clientId?: string;
    clientSecret?: string;
    scopes?: string[] | string;
    extraAuthParams?: Record<string, string>;
  };
  if (!body.toolId || !body.authMethodId)
    return NextResponse.json(
      { error: "toolId and authMethodId are required" },
      { status: 400 }
    );
  const scopes = Array.isArray(body.scopes)
    ? body.scopes
    : typeof body.scopes === "string"
    ? body.scopes.split(/[\s,]+/)
    : undefined;
  try {
    const result = await createOAuthStart({
      toolId: body.toolId,
      authMethodId: body.authMethodId,
      clientId: body.clientId || "",
      clientSecret: body.clientSecret,
      scopes,
      origin: req.nextUrl.origin,
      extraAuthParams: body.extraAuthParams,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not start the OAuth flow.",
      },
      { status: 400 }
    );
  }
}
