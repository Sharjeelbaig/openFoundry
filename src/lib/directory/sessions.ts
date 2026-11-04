// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { Directory, SessionRecord } from "./types";

export const SESSION_COOKIE = "of_session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function newSessionId(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionId(id: string): string {
  return createHash("sha256").update(id).digest("hex");
}

export interface SessionMeta {
  userAgent?: string;
  address?: string;
}

/** Adds a session to the directory object; the caller persists it. */
export function issueSession(
  directory: Directory,
  principalId: string,
  meta: SessionMeta = {}
): { id: string; record: SessionRecord } {
  const now = Date.now();
  const id = newSessionId();
  const record: SessionRecord = {
    idHash: hashSessionId(id),
    principalId,
    createdAt: new Date(now).toISOString(),
    lastSeenAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    userAgent: (meta.userAgent ?? "").slice(0, 300),
    address: meta.address ?? "",
  };
  // Keep the file from growing without bound.
  directory.sessions = directory.sessions.filter(
    (session) => Date.parse(session.expiresAt) > now
  );
  directory.sessions.push(record);
  return { id, record };
}

export function findSession(
  directory: Directory,
  id: string | undefined
): SessionRecord | undefined {
  if (!id) return undefined;
  const hash = Buffer.from(hashSessionId(id), "hex");
  for (const session of directory.sessions) {
    if (Date.parse(session.expiresAt) <= Date.now()) continue;
    const stored = Buffer.from(session.idHash, "hex");
    if (stored.length === hash.length && timingSafeEqual(stored, hash)) return session;
  }
  return undefined;
}

export function revokeSession(directory: Directory, id: string): boolean {
  const hash = hashSessionId(id);
  const before = directory.sessions.length;
  directory.sessions = directory.sessions.filter((session) => session.idHash !== hash);
  return directory.sessions.length !== before;
}

export function revokeSessionsFor(directory: Directory, principalId: string): number {
  const before = directory.sessions.length;
  directory.sessions = directory.sessions.filter(
    (session) => session.principalId !== principalId
  );
  return before - directory.sessions.length;
}
