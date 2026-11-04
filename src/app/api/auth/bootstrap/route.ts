// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { claimBootstrapToken, hasOwner } from "@/lib/directory/bootstrap";
import { ROOT_SCOPE } from "@/lib/directory/can";
import {
  generateAccessCode,
  hashSecret,
  newSalt,
  normalizeCode,
} from "@/lib/directory/codes";
import { rateLimit } from "@/lib/directory/rate-limit";
import { ROLE_OWNER } from "@/lib/directory/roles";
import { requestAddress, sessionCookie } from "@/lib/directory/server";
import { issueSession } from "@/lib/directory/sessions";
import { getDirectory, mutateDirectory } from "@/lib/directory/store";
import type { Principal } from "@/lib/directory/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+$/;

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    token?: string;
    name?: string;
    email?: string;
  };
  const address = requestAddress(req);
  const limit = rateLimit(`bootstrap:${address}`, 5, 60_000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Wait a minute and try again." },
      { status: 429, headers: { "retry-after": String(limit.retryAfter) } }
    );
  }

  const directory = await getDirectory();
  if (hasOwner(directory)) {
    return NextResponse.json(
      { error: "This install already has an owner." },
      { status: 409 }
    );
  }

  const name = body.name?.trim() ?? "";
  const email = body.email?.trim().toLowerCase() ?? "";
  if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
  if (!EMAIL.test(email)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }
  if (!normalizeCode(body.token ?? "")) {
    return NextResponse.json({ error: "Enter the setup token." }, { status: 400 });
  }

  if (!(await claimBootstrapToken(body.token ?? ""))) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    void appendAudit({
      actorId: null,
      action: "auth.bootstrap",
      target: address,
      outcome: "failed",
      detail: "invalid token",
    });
    return NextResponse.json(
      { error: "That token is not valid or has expired." },
      { status: 403 }
    );
  }

  const accessCode = generateAccessCode();
  const salt = newSalt();
  let sessionId = "";
  const principal = await mutateDirectory((current): Principal | null => {
    if (hasOwner(current)) return null;
    const created: Principal = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      kind: "user",
      name,
      email,
      initials: initialsFor(name),
      createdAt: new Date().toISOString(),
    };
    current.principals.push(created);
    current.credentials.push({
      id: `cred_${randomUUID().slice(0, 8)}`,
      principalId: created.id,
      kind: "access_code",
      lookup: normalizeCode(accessCode).slice(0, 4),
      salt,
      hash: hashSecret(normalizeCode(accessCode), salt),
      createdAt: new Date().toISOString(),
    });
    current.assignments.push({
      id: `asg_${randomUUID().slice(0, 8)}`,
      principalId: created.id,
      roleId: ROLE_OWNER,
      scope: ROOT_SCOPE,
      createdAt: new Date().toISOString(),
      createdBy: created.id,
      description: "Owner of this install, claimed with the setup token.",
    });
    sessionId = issueSession(current, created.id, {
      userAgent: req.headers.get("user-agent") ?? "",
      address,
    }).id;
    return created;
  });

  if (!principal) {
    return NextResponse.json(
      { error: "This install already has an owner." },
      { status: 409 }
    );
  }

  void appendAudit({
    actorId: principal.id,
    action: "auth.bootstrap",
    target: principal.email,
    outcome: "allowed",
  });

  const response = NextResponse.json({
    ok: true,
    accessCode,
    principal: {
      id: principal.id,
      name: principal.name,
      email: principal.email,
      initials: principal.initials,
      role: "Owner",
    },
  });
  response.cookies.set(sessionCookie(req, sessionId));
  return response;
}
