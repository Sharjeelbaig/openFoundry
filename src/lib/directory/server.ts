// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { findSession, SESSION_COOKIE, SESSION_TTL_MS } from "./sessions";
import { getDirectory } from "./store";
import type { Directory, Principal, SessionRecord } from "./types";

export interface CurrentSession {
  directory: Directory;
  principal: Principal;
  session: SessionRecord;
}

/** Who is making this request, from the session cookie. Used by pages. */
export async function currentSession(): Promise<CurrentSession | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;
  const directory = await getDirectory();
  const session = findSession(directory, id);
  if (!session) return null;
  const principal = directory.principals.find(
    (item) => item.id === session.principalId
  );
  if (!principal || principal.disabledAt) return null;
  return { directory, principal, session };
}

export function sessionCookie(request: NextRequest, id: string) {
  const forwarded = request.headers.get("x-forwarded-proto");
  const secure =
    request.nextUrl.protocol === "https:" ||
    forwarded === "https" ||
    request.headers.get("x-forwarded-ssl") === "on";
  return {
    name: SESSION_COOKIE,
    value: id,
    httpOnly: true,
    sameSite: "lax" as const,
    path: "/",
    secure,
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  };
}

export function clearedSessionCookie(request: NextRequest) {
  return { ...sessionCookie(request, ""), maxAge: 0 };
}

/** Best effort: the proxy header when there is one, otherwise a fixed key. */
export function requestAddress(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function isLoopbackAddress(address: string): boolean {
  return (
    address === "127.0.0.1" ||
    address === "::1" ||
    address === "::ffff:127.0.0.1"
  );
}

/**
 * The machine key is the actual control; this keeps a leaked bootstrap URL
 * from being replayed from another host when a proxy supplies the address.
 */
export function isLoopback(request: NextRequest): boolean {
  const forwarded = request.headers.get("x-forwarded-for");
  const real = request.headers.get("x-real-ip");
  const address = forwarded?.split(",")[0].trim() || real?.trim();
  if (address) return isLoopbackAddress(address);
  const host = request.headers.get("host") ?? "";
  return /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/.test(host);
}
