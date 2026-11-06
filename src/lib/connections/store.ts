// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { randomUUID } from "crypto";
import { readJson, writeJson } from "../store";
import { seal, secretHint, unseal } from "./vault";
import {
  isConnectionProvider,
  providerSpec,
  type ConnectionAuthType,
  type ConnectionProvider,
} from "./catalog";
import type { TestResult } from "./providers";

const FILE = "connections.json";

export interface ConnectionRecord {
  id: string;
  name: string;
  provider: ConnectionProvider;
  target: string;
  authType: ConnectionAuthType;
  config: Record<string, unknown>;
  /** AES-GCM ciphertext. Never returned by the API. */
  secretCipher?: string;
  secretHint?: string;
  status: "unknown" | "ok" | "failed";
  /** OAuth connections only: a refresh token has been stored. */
  oauthConnected?: boolean;
  lastCheckedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicConnection {
  id: string;
  name: string;
  provider: ConnectionProvider;
  providerLabel: string;
  target: string;
  authType: ConnectionAuthType;
  config: Record<string, unknown>;
  secretSet: boolean;
  secretHint?: string;
  status: "unknown" | "ok" | "failed";
  oauthConnected?: boolean;
  lastCheckedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Reads the file and upgrades legacy rows. The old seeded row pointed at
 * `https://localhost.search.local` and was never a connection; it is dropped
 * rather than migrated.
 */
async function readAll(): Promise<ConnectionRecord[]> {
  const raw = await readJson<unknown[]>(FILE, []);
  if (!Array.isArray(raw)) return [];
  const out: ConnectionRecord[] = [];
  let changed = false;

  for (const item of raw) {
    if (!isRecord(item)) {
      changed = true;
      continue;
    }
    if (typeof item.secretCipher === "string" && isConnectionProvider(String(item.provider))) {
      out.push(item as unknown as ConnectionRecord);
      continue;
    }
    changed = true;
    const target = String(item.target || "");
    if (!target || /localhost\.search\.local/i.test(target)) continue;
    const kind = String(item.kind || "");
    const provider =
      kind === "Azure AI Search"
        ? "azure-ai-search"
        : kind === "Azure Blob Storage"
        ? "azure-blob"
        : null;
    if (!provider) continue;
    const now = new Date().toISOString();
    out.push({
      id: String(item.id || `conn_${randomUUID().slice(0, 12)}`),
      name: String(item.name || provider),
      provider,
      target: target.replace(/\/+$/, ""),
      authType: provider === "azure-ai-search" ? "apiKey" : "sasToken",
      config: {},
      status: "unknown",
      createdAt: String(item.createdAt || now),
      updatedAt: now,
    });
  }

  if (changed) await writeJson(FILE, out);
  return out;
}

async function writeAll(records: ConnectionRecord[]): Promise<void> {
  await writeJson(FILE, records);
}

export function toPublic(record: ConnectionRecord): PublicConnection {
  return {
    id: record.id,
    name: record.name,
    provider: record.provider,
    providerLabel: providerSpec(record.provider).label,
    target: record.target,
    authType: record.authType,
    config: record.config,
    secretSet: Boolean(record.secretCipher),
    secretHint: record.secretHint,
    status: record.status,
    oauthConnected: record.oauthConnected,
    lastCheckedAt: record.lastCheckedAt,
    lastError: record.lastError,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export async function listConnections(): Promise<PublicConnection[]> {
  return (await readAll()).map(toPublic);
}

export async function getConnection(id: string): Promise<ConnectionRecord | null> {
  return (await readAll()).find((record) => record.id === id) || null;
}

/** Decrypted secret fields. Throws when the ciphertext cannot be opened. */
export async function getConnectionSecret(id: string): Promise<Record<string, unknown>> {
  const record = await getConnection(id);
  if (!record?.secretCipher) return {};
  return unseal(record.secretCipher);
}

export interface ConnectionInput {
  name: string;
  provider: ConnectionProvider;
  target: string;
  authType: ConnectionAuthType;
  config?: Record<string, unknown>;
  secret?: Record<string, unknown>;
}

export function validateConnection(input: ConnectionInput): string | null {
  if (!input.name?.trim()) return "A connection name is required.";
  if (!isConnectionProvider(input.provider)) return "Choose a provider.";
  const spec = providerSpec(input.provider);
  if (!spec.targetFixed) {
    if (!input.target?.trim()) return "A target URL is required.";
    try {
      new URL(input.target);
    } catch {
      return "The target must be a full URL, for example https://myaccount.blob.core.windows.net.";
    }
  }
  for (const field of spec.secretFields) {
    const value = input.secret?.[field.key];
    if (field.required && (typeof value !== "string" || !value.trim())) {
      return `${field.label} is required.`;
    }
  }
  return null;
}

export async function createConnection(input: ConnectionInput): Promise<PublicConnection> {
  const error = validateConnection(input);
  if (error) throw new Error(error);
  const records = await readAll();
  if (
    records.some(
      (record) => record.name.toLowerCase() === input.name.trim().toLowerCase()
    )
  ) {
    throw new Error("A connection with that name already exists.");
  }
  const now = new Date().toISOString();
  const secret = input.secret || {};
  const spec = providerSpec(input.provider);
  const record: ConnectionRecord = {
    id: `conn_${randomUUID().slice(0, 12)}`,
    name: input.name.trim(),
    provider: input.provider,
    target: (spec.targetFixed || input.target).trim().replace(/\/+$/, ""),
    authType: input.authType,
    config: input.config || {},
    secretCipher: await seal(secret),
    secretHint: secretHint(secret),
    status: "unknown",
    createdAt: now,
    updatedAt: now,
  };
  records.push(record);
  await writeAll(records);
  return toPublic(record);
}

export async function updateConnection(
  id: string,
  patch: Partial<ConnectionInput>
): Promise<PublicConnection> {
  const records = await readAll();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error("Connection not found.");
  const current = records[index];
  const next: ConnectionRecord = {
    ...current,
    name: patch.name?.trim() || current.name,
    target: patch.target?.trim().replace(/\/+$/, "") || current.target,
    config: patch.config ? { ...current.config, ...patch.config } : current.config,
    updatedAt: new Date().toISOString(),
  };
  if (patch.secret && Object.keys(patch.secret).length > 0) {
    next.secretCipher = await seal(patch.secret);
    next.secretHint = secretHint(patch.secret);
    // A rotated credential has not been proven yet.
    next.status = "unknown";
    next.lastError = undefined;
    next.lastCheckedAt = undefined;
  }
  const error = validateConnection({
    name: next.name,
    provider: next.provider,
    target: next.target,
    authType: next.authType,
    config: next.config,
    secret: { ...(await getConnectionSecret(id)) },
  });
  if (error) throw new Error(error);
  records[index] = next;
  await writeAll(records);
  return toPublic(next);
}

/**
 * Merges fields into the sealed secret without touching the others. Used by the
 * OAuth flow, which stores a PKCE verifier and later a refresh token.
 */
export async function patchConnectionSecret(
  id: string,
  patch: Record<string, unknown>
): Promise<void> {
  const records = await readAll();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error("Connection not found.");
  const current = records[index].secretCipher
    ? await unseal(records[index].secretCipher!)
    : {};
  const next: Record<string, unknown> = { ...current };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) delete next[key];
    else next[key] = value;
  }
  records[index].secretCipher = await seal(next);
  records[index].updatedAt = new Date().toISOString();
  await writeAll(records);
}

/** Called after a successful OAuth exchange. */
export async function markOAuthConnected(id: string): Promise<PublicConnection> {
  const records = await readAll();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error("Connection not found.");
  const now = new Date().toISOString();
  records[index] = {
    ...records[index],
    oauthConnected: true,
    status: "ok",
    lastCheckedAt: now,
    lastError: undefined,
    updatedAt: now,
  };
  await writeAll(records);
  return toPublic(records[index]);
}

export async function deleteConnection(id: string): Promise<void> {
  const records = await readAll();
  await writeAll(records.filter((record) => record.id !== id));
}

export async function recordTest(id: string, result: TestResult): Promise<PublicConnection> {
  const records = await readAll();
  const index = records.findIndex((record) => record.id === id);
  if (index === -1) throw new Error("Connection not found.");
  const now = new Date().toISOString();
  records[index] = {
    ...records[index],
    status: result.ok ? "ok" : "failed",
    lastCheckedAt: now,
    lastError: result.ok ? undefined : result.detail,
    updatedAt: now,
  };
  await writeAll(records);
  return toPublic(records[index]);
}
