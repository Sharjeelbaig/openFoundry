// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import {
  generateAccessCode,
  hashSecret,
  newSalt,
  normalizeCode,
} from "@/lib/directory/codes";
import { currentSession } from "@/lib/directory/server";
import { revokeSessionsFor } from "@/lib/directory/sessions";
import { mutateDirectory } from "@/lib/directory/store";
import { nowIso } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue a new code. The previous one is revoked on the same write. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { principalId?: string };
  if (!body.principalId) {
    return NextResponse.json({ error: "principalId is required" }, { status: 400 });
  }
  const actorId = (await currentSession())?.principal.id ?? "system";
  const accessCode = generateAccessCode();
  const salt = newSalt();
  const now = nowIso();

  const result = await mutateDirectory((directory) => {
    const principal = directory.principals.find(
      (item) => item.id === body.principalId
    );
    if (!principal || principal.disabledAt) return null;
    for (const credential of directory.credentials) {
      if (
        credential.principalId === principal.id &&
        credential.kind === "access_code" &&
        !credential.revokedAt
      ) {
        credential.revokedAt = now;
      }
    }
    directory.credentials.push({
      id: `cred_${randomUUID().slice(0, 8)}`,
      principalId: principal.id,
      kind: "access_code",
      lookup: normalizeCode(accessCode).slice(0, 4),
      salt,
      hash: hashSecret(normalizeCode(accessCode), salt),
      createdAt: now,
    });
    return principal;
  });

  if (!result) {
    return NextResponse.json({ error: "Person not found." }, { status: 404 });
  }

  void appendAudit({
    actorId,
    action: "credential.issue",
    target: result.id,
    outcome: "allowed",
    detail: result.email,
  });

  return NextResponse.json({ accessCode });
}

/** Revoke every code and every session for this person. */
export async function DELETE(req: NextRequest) {
  const principalId = new URL(req.url).searchParams.get("principalId");
  if (!principalId) {
    return NextResponse.json({ error: "principalId is required" }, { status: 400 });
  }
  const actorId = (await currentSession())?.principal.id ?? "system";
  const now = nowIso();

  const result = await mutateDirectory((directory) => {
    const principal = directory.principals.find((item) => item.id === principalId);
    if (!principal) return null;
    let revoked = 0;
    for (const credential of directory.credentials) {
      if (
        credential.principalId === principal.id &&
        credential.kind === "access_code" &&
        !credential.revokedAt
      ) {
        credential.revokedAt = now;
        revoked += 1;
      }
    }
    const sessions = revokeSessionsFor(directory, principal.id);
    return { principal, revoked, sessions };
  });

  if (!result) {
    return NextResponse.json({ error: "Person not found." }, { status: 404 });
  }

  void appendAudit({
    actorId,
    action: "credential.revoke",
    target: result.principal.id,
    outcome: "allowed",
    detail: `${result.revoked} code(s), ${result.sessions} session(s)`,
  });

  return NextResponse.json({ ok: true, revoked: result.revoked, sessions: result.sessions });
}
