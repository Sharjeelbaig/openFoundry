// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { readJson, writeJson } from "./store";

/**
 * Bearer credentials for the local language and speech MCP servers.
 *
 * One token per service. Issuing a new token replaces the old one, so rotating
 * invalidates a copied endpoint. Only the SHA-256 hash is stored on disk.
 */

export type ServiceMcpName = "language" | "speech" | "a2a";

const FILE = "service-mcp-tokens.json";

interface TokenRecord {
  hash: string;
  createdAt: string;
}

type TokenFile = Partial<Record<ServiceMcpName, TokenRecord>>;

export async function issueServiceMcpToken(
  service: ServiceMcpName
): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const data = await readJson<TokenFile>(FILE, {});
  data[service] = {
    hash: createHash("sha256").update(token).digest("hex"),
    createdAt: new Date().toISOString(),
  };
  await writeJson(FILE, data);
  return token;
}

export async function verifyServiceMcpToken(
  service: ServiceMcpName,
  token: string
): Promise<boolean> {
  if (!token) return false;
  const data = await readJson<TokenFile>(FILE, {});
  const record = data[service];
  if (!record?.hash) return false;
  const stored = Buffer.from(record.hash, "hex");
  const given = Buffer.from(createHash("sha256").update(token).digest("hex"), "hex");
  return (
    stored.length === given.length && timingSafeEqual(stored, given)
  );
}
