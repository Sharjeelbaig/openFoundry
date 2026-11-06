// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, verifyState } from "@/lib/connections/google";
import { markOAuthConnected } from "@/lib/connections/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Google redirects the browser here. The state is HMAC-signed and short-lived,
 * so this endpoint does not rely on the session cookie surviving the consent
 * screen. It is public by design and validates the signature instead.
 */
export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (query: string) =>
    NextResponse.redirect(`${origin}/build/knowledge/connections?${query}`);

  const error = req.nextUrl.searchParams.get("error");
  if (error) return back(`error=${encodeURIComponent(error)}`);

  const code = req.nextUrl.searchParams.get("code");
  const stateValue = req.nextUrl.searchParams.get("state");
  if (!code || !stateValue) return back("error=missing_code");

  const state = await verifyState(stateValue);
  if (!state) return back("error=invalid_state");

  try {
    await exchangeCode(state.connectionId, code);
    await markOAuthConnected(state.connectionId);
    return back(`connected=${encodeURIComponent(state.connectionId)}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return back(`error=${encodeURIComponent(message.slice(0, 180))}`);
  }
}
