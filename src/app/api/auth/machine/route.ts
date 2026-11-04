// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { randomUUID } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { appendAudit } from "@/lib/directory/audit";
import { hasOwner, localPrincipal, readMachineKey } from "@/lib/directory/bootstrap";
import { ROOT_SCOPE } from "@/lib/directory/can";
import { ROLE_OWNER } from "@/lib/directory/roles";
import { isLoopback, sessionCookie } from "@/lib/directory/server";
import { issueSession } from "@/lib/directory/sessions";
import { getDirectory, mutateDirectory } from "@/lib/directory/store";
import type { Principal } from "@/lib/directory/types";
import { getSettings } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function deny(message: string) {
  return NextResponse.json(
    { error: { message, type: "authentication_error", code: "machine_denied" } },
    { status: 403 }
  );
}

function equal(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) {
    diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return diff === 0;
}

/**
 * The desktop shell opens this URL once, at launch, from loopback. It proves
 * the caller can read the data directory as the OS user. No prompt follows.
 */
export async function GET(req: NextRequest) {
  if (!isLoopback(req)) return deny("This endpoint is only available on this computer.");
  const presented = req.nextUrl.searchParams.get("key") ?? "";
  const stored = await readMachineKey();
  if (!stored || !presented || !equal(presented, stored)) {
    return deny("The machine credential is missing or does not match.");
  }

  const settings = await getSettings();
  const directory = await getDirectory();
  let principal =
    !hasOwner(directory) ? undefined : localPrincipal(directory, settings.userEmail);

  if (!principal) {
    const name = settings.userName?.trim() || "Owner";
    const email = (settings.userEmail?.trim() || "owner@localhost").toLowerCase();
    principal =
      (await mutateDirectory((current): Principal | null => {
        if (hasOwner(current)) return null;
        const created: Principal = {
          id: `usr_${randomUUID().slice(0, 8)}`,
          kind: "user",
          name,
          email,
          initials: settings.userInitials || name.slice(0, 2).toUpperCase(),
          createdAt: new Date().toISOString(),
        };
        current.principals.push(created);
        current.assignments.push({
          id: `asg_${randomUUID().slice(0, 8)}`,
          principalId: created.id,
          roleId: ROLE_OWNER,
          scope: ROOT_SCOPE,
          createdAt: new Date().toISOString(),
          createdBy: created.id,
          description: "Owner of this install, signed in by this computer.",
        });
        return created;
      })) ?? undefined;
  }

  if (!principal) return deny("This install has no owner to sign in as.");

  const sessionId = await mutateDirectory((current) =>
    issueSession(current, principal!.id, {
      userAgent: req.headers.get("user-agent") ?? "",
      address: "machine",
    }).id
  );

  void appendAudit({
    actorId: principal.id,
    action: "auth.machine",
    target: principal.email,
    outcome: "allowed",
  });

  const response = NextResponse.redirect(new URL("/", req.url));
  response.cookies.set(sessionCookie(req, sessionId));
  return response;
}
