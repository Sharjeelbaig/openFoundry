// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { clearedSessionCookie } from "@/lib/directory/server";
import { findSession, revokeSession, SESSION_COOKIE } from "@/lib/directory/sessions";
import { mutateDirectory } from "@/lib/directory/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const id = req.cookies.get(SESSION_COOKIE)?.value;
  if (id) {
    const actorId = await mutateDirectory((directory) => {
      const session = findSession(directory, id);
      revokeSession(directory, id);
      return session?.principalId ?? null;
    });
    if (actorId) {
      void appendAudit({
        actorId,
        action: "auth.sign_out",
        target: actorId,
        outcome: "allowed",
      });
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set(clearedSessionCookie(req));
  return response;
}
