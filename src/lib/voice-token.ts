// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { ensureMachineKey } from "./directory/bootstrap";

/**
 * Short-lived tokens for the Voice Live WebSocket. The socket runs on its own
 * loopback port, so it cannot read the browser session cookie; the signed token
 * carries the agent id and expires after two minutes.
 */

const PREFIX = "voice";

async function key(): Promise<Buffer> {
  const machine = await ensureMachineKey();
  return createHash("sha256")
    .update(`openfoundry-voice-ws:${machine}`)
    .digest();
}

export async function issueVoiceToken(
  agentId: string,
  ttlMs = 120_000
): Promise<string> {
  const payload = Buffer.from(`${agentId}.${Date.now() + ttlMs}`).toString(
    "base64url"
  );
  const signature = createHmac("sha256", await key())
    .update(payload)
    .digest("base64url");
  return `${PREFIX}.${payload}.${signature}`;
}

export async function verifyVoiceToken(
  token: string
): Promise<{ agentId: string } | null> {
  if (!token.startsWith(`${PREFIX}.`)) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [, payload, signature] = parts;
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", await key())
    .update(payload)
    .digest("base64url");
  if (expected.length !== signature.length) return null;
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature))) return null;
  try {
    const [agentId, expiry] = Buffer.from(payload, "base64url")
      .toString("utf8")
      .split(".");
    if (!agentId || Number(expiry) <= Date.now()) return null;
    return { agentId };
  } catch {
    return null;
  }
}
