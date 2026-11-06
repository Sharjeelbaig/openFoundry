// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ensureMachineKey } from "../directory/bootstrap";

/**
 * Short-lived, signed tokens for internal calls to a base's MCP endpoint.
 *
 * The agent path must go through MCP, but it must not rotate the token a user
 * copied for an external client. These tokens are derived from the machine key,
 * scoped to one base, and expire in a minute.
 */

const PREFIX = "internal";

async function key(): Promise<Buffer> {
  const machine = await ensureMachineKey();
  return createHash("sha256")
    .update(`openfoundry-internal-mcp:${machine}`)
    .digest();
}

export async function signInternalMcpToken(
  baseId: string,
  ttlMs = 60_000
): Promise<string> {
  const payload = Buffer.from(`${baseId}.${Date.now() + ttlMs}`).toString(
    "base64url"
  );
  const signature = createHmac("sha256", await key())
    .update(payload)
    .digest("base64url");
  return `${PREFIX}.${payload}.${signature}`;
}

export async function verifyInternalMcpToken(
  token: string,
  baseId: string
): Promise<boolean> {
  if (!token.startsWith(`${PREFIX}.`)) return false;
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [, payload, signature] = parts;
  if (!payload || !signature) return false;
  const expected = createHmac("sha256", await key())
    .update(payload)
    .digest("base64url");
  if (expected.length !== signature.length) return false;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return false;
  try {
    const [id, expiry] = Buffer.from(payload, "base64url").toString("utf8").split(".");
    return id === baseId && Number(expiry) > Date.now();
  } catch {
    return false;
  }
}
