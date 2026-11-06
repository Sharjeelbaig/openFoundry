// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, randomBytes } from "crypto";
import type { DatabaseSync } from "node:sqlite";
import {
  DEFAULT_TENANT_QUOTA_BYTES,
  DEFAULT_TENANT_QUOTA_RESPONSES,
  responseStoreConfig,
  storeTenantConfig,
  type StoreTenantIdentity,
} from "./response-store-config";
import {
  openResponseStoreDatabase,
  recordStoreAudit,
  responseStoreStatsLocal,
} from "./response-store";

/**
 * Persistent tenant registry for the shared Responses store.
 *
 * The environment token list is imported once, the first time the registry is
 * opened. After that the SQLite table is authoritative: rotating or disabling a
 * tenant in the admin UI must invalidate the old token immediately, even if it
 * is still present in the process environment.
 *
 * Only a SHA-256 hash of each token is stored. The raw token is returned once
 * on create/rotate and is never readable again.
 */

const TENANT_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const TOKEN_PREFIX = "ofst_";
const MIN_TOKEN_LENGTH = 24;
const MAX_QUOTA_RESPONSES = 1_000_000;
const MAX_QUOTA_BYTES = 1_099_511_627_776; // 1 TiB
const LAST_USED_WRITE_MS = 30_000;

export type StoreTenantStatus =
  | "active"
  | "disabled"
  | "near-quota"
  | "over-quota";

export interface StoreTenantRecord {
  tenant: string;
  tokenPrefix: string;
  quotaResponses: number;
  quotaBytes: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt: string | null;
  disabledAt: string | null;
}

export interface StoreTenantUsage extends StoreTenantRecord {
  usage: {
    total: number;
    bytes: number;
    owners: number;
    oldest: string | null;
    newest: string | null;
    responsePercent: number;
    bytePercent: number;
    status: StoreTenantStatus;
  };
}

export interface StoreTenantTotals {
  tenants: number;
  active: number;
  disabled: number;
  overQuota: number;
  responses: number;
  bytes: number;
}

export interface CreateStoreTenantInput {
  tenant: string;
  quotaResponses?: number;
  quotaBytes?: number;
  /** Optional operator-supplied token; otherwise a random token is generated. */
  token?: string;
}

export interface UpdateStoreTenantInput {
  quotaResponses?: number;
  quotaBytes?: number;
  disabled?: boolean;
  rotateToken?: boolean;
}

export interface StoreTenantMutation {
  tenant: StoreTenantUsage;
  /** Present only when a token was created or rotated. */
  token?: string;
}

export class StoreTenantError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "StoreTenantError";
    this.statusCode = statusCode;
  }
}

interface TenantRow {
  tenant_id: string;
  token_hash: string;
  token_prefix: string;
  quota_responses: number;
  quota_bytes: number;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  disabled_at: string | null;
}

function requireLocalStore(): void {
  if (responseStoreConfig().backend !== "sqlite") {
    throw new StoreTenantError(
      "This process uses a remote shared store. Manage tenants on the store host.",
      409
    );
  }
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function tokenPrefix(token: string): string {
  return token.slice(0, Math.min(12, token.length));
}

export function generateStoreToken(): string {
  return `${TOKEN_PREFIX}${randomBytes(24).toString("base64url")}`;
}

function clampQuotaResponses(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(
    Math.max(Math.floor(number), 1),
    MAX_QUOTA_RESPONSES
  );
}

function clampQuotaBytes(value: unknown, fallback: number): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(Math.max(Math.floor(number), 1024), MAX_QUOTA_BYTES);
}

function validateTenantName(value: string): string {
  const tenant = value.trim();
  if (!TENANT_NAME.test(tenant)) {
    throw new StoreTenantError(
      "Tenant names must use lowercase letters, numbers, underscores or hyphens."
    );
  }
  return tenant;
}

function validateToken(value: string): string {
  const token = value.trim();
  if (token.length < MIN_TOKEN_LENGTH) {
    throw new StoreTenantError(
      `Tenant tokens must be at least ${MIN_TOKEN_LENGTH} characters.`
    );
  }
  if (/\s/.test(token)) {
    throw new StoreTenantError("Tenant tokens cannot contain whitespace.");
  }
  return token;
}

/** Creates the registry and imports environment tenants exactly once. */
export function ensureTenantRegistry(): void {
  requireLocalStore();
  const db = openResponseStoreDatabase();
  const seeded = db
    .prepare(
      "SELECT value FROM response_store_meta WHERE key = 'tenants_seeded'"
    )
    .get() as { value: string } | undefined;
  if (seeded) return;
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM response_tenants")
    .get() as { count: number };
  const now = new Date().toISOString();
  if (Number(count.count) === 0) {
    const envTenants = storeTenantConfig();
    const insert = db.prepare(
      `INSERT INTO response_tenants
         (tenant_id, token_hash, token_prefix, quota_responses, quota_bytes,
          created_at, updated_at, last_used_at, disabled_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
    );
    db.exec("BEGIN");
    try {
      for (const tenant of envTenants) {
        insert.run(
          tenant.tenant,
          hashToken(tenant.token),
          tokenPrefix(tenant.token),
          tenant.quotaResponses,
          tenant.quotaBytes,
          now,
          now
        );
      }
      db.prepare(
        `INSERT INTO response_store_meta (key, value) VALUES ('tenants_seeded', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`
      ).run(now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  } else {
    db.prepare(
      `INSERT INTO response_store_meta (key, value) VALUES ('tenants_seeded', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(now);
  }
}

function rowToRecord(row: TenantRow): StoreTenantRecord {
  return {
    tenant: String(row.tenant_id),
    tokenPrefix: String(row.token_prefix),
    quotaResponses: Number(row.quota_responses),
    quotaBytes: Number(row.quota_bytes),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
    disabledAt: row.disabled_at ? String(row.disabled_at) : null,
  };
}

function getTenantRecord(db: DatabaseSync, tenant: string): TenantRow | null {
  const row = db
    .prepare("SELECT * FROM response_tenants WHERE tenant_id = ?")
    .get(tenant) as TenantRow | undefined;
  return row ?? null;
}

function statusFor(
  record: StoreTenantRecord,
  total: number,
  bytes: number
): StoreTenantStatus {
  if (record.disabledAt) return "disabled";
  const responsePercent = (total / record.quotaResponses) * 100;
  const bytePercent = (bytes / record.quotaBytes) * 100;
  if (responsePercent > 100 || bytePercent > 100) return "over-quota";
  if (responsePercent >= 80 || bytePercent >= 80) return "near-quota";
  return "active";
}

async function usageFor(record: StoreTenantRecord): Promise<StoreTenantUsage> {
  const stats = await responseStoreStatsLocal(record.tenant, {
    quotaResponses: record.quotaResponses,
    quotaBytes: record.quotaBytes,
  });
  const total = Number(stats.total);
  const bytes = Number(stats.bytes);
  return {
    ...record,
    usage: {
      total,
      bytes,
      owners: stats.owners.length,
      oldest: stats.oldest,
      newest: stats.newest,
      responsePercent:
        Math.round((total / Math.max(1, record.quotaResponses)) * 1000) / 10,
      bytePercent:
        Math.round((bytes / Math.max(1, record.quotaBytes)) * 1000) / 10,
      status: statusFor(record, total, bytes),
    },
  };
}

export async function listStoreTenants(): Promise<StoreTenantUsage[]> {
  ensureTenantRegistry();
  const rows = openResponseStoreDatabase()
    .prepare(
      "SELECT * FROM response_tenants ORDER BY tenant_id COLLATE NOCASE"
    )
    .all() as unknown as TenantRow[];
  return Promise.all(rows.map((row) => usageFor(rowToRecord(row))));
}

export async function getStoreTenant(
  tenant: string
): Promise<StoreTenantUsage | null> {
  ensureTenantRegistry();
  const row = getTenantRecord(openResponseStoreDatabase(), tenant);
  return row ? usageFor(rowToRecord(row)) : null;
}

export function storeTenantTotals(
  tenants: StoreTenantUsage[]
): StoreTenantTotals {
  return tenants.reduce<StoreTenantTotals>(
    (totals, tenant) => {
      totals.tenants += 1;
      totals.responses += tenant.usage.total;
      totals.bytes += tenant.usage.bytes;
      if (tenant.usage.status === "disabled") totals.disabled += 1;
      else totals.active += 1;
      if (tenant.usage.status === "over-quota") totals.overQuota += 1;
      return totals;
    },
    {
      tenants: 0,
      active: 0,
      disabled: 0,
      overQuota: 0,
      responses: 0,
      bytes: 0,
    }
  );
}

export async function createStoreTenant(
  input: CreateStoreTenantInput
): Promise<StoreTenantMutation> {
  ensureTenantRegistry();
  const tenant = validateTenantName(input.tenant);
  const db = openResponseStoreDatabase();
  if (getTenantRecord(db, tenant)) {
    throw new StoreTenantError(`Tenant "${tenant}" already exists.`, 409);
  }
  const token = input.token ? validateToken(input.token) : generateStoreToken();
  const tokenHash = hashToken(token);
  const duplicate = db
    .prepare("SELECT tenant_id FROM response_tenants WHERE token_hash = ?")
    .get(tokenHash) as { tenant_id: string } | undefined;
  if (duplicate) {
    throw new StoreTenantError(
      `That token is already assigned to tenant "${duplicate.tenant_id}".`,
      409
    );
  }
  const quotaResponses = clampQuotaResponses(
    input.quotaResponses,
    DEFAULT_TENANT_QUOTA_RESPONSES
  );
  const quotaBytes = clampQuotaBytes(
    input.quotaBytes,
    DEFAULT_TENANT_QUOTA_BYTES
  );
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO response_tenants
       (tenant_id, token_hash, token_prefix, quota_responses, quota_bytes,
        created_at, updated_at, last_used_at, disabled_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL)`
  ).run(
    tenant,
    tokenHash,
    tokenPrefix(token),
    quotaResponses,
    quotaBytes,
    now,
    now
  );
  recordStoreAudit(tenant, "tenant.create", {
    detail: {
      quotaResponses,
      quotaBytes,
      tokenPrefix: tokenPrefix(token),
    },
  });
  return {
    tenant: (await getStoreTenant(tenant))!,
    token,
  };
}

export async function updateStoreTenant(
  tenantInput: string,
  patch: UpdateStoreTenantInput
): Promise<StoreTenantMutation> {
  ensureTenantRegistry();
  const tenant = validateTenantName(tenantInput);
  const db = openResponseStoreDatabase();
  const existing = getTenantRecord(db, tenant);
  if (!existing) {
    throw new StoreTenantError(`Tenant "${tenant}" was not found.`, 404);
  }
  const record = rowToRecord(existing);
  const quotaResponses =
    patch.quotaResponses === undefined
      ? record.quotaResponses
      : clampQuotaResponses(patch.quotaResponses, record.quotaResponses);
  const quotaBytes =
    patch.quotaBytes === undefined
      ? record.quotaBytes
      : clampQuotaBytes(patch.quotaBytes, record.quotaBytes);
  const disabledAt =
    patch.disabled === undefined
      ? record.disabledAt
      : patch.disabled
        ? record.disabledAt || new Date().toISOString()
        : null;
  const rotate = patch.rotateToken === true;
  const token = rotate ? generateStoreToken() : undefined;
  const tokenHash = token ? hashToken(token) : existing.token_hash;
  const prefix = token ? tokenPrefix(token) : existing.token_prefix;
  const updatedAt = new Date().toISOString();
  db.prepare(
    `UPDATE response_tenants
     SET quota_responses = ?, quota_bytes = ?, token_hash = ?, token_prefix = ?,
         updated_at = ?, disabled_at = ?
     WHERE tenant_id = ?`
  ).run(
    quotaResponses,
    quotaBytes,
    tokenHash,
    prefix,
    updatedAt,
    disabledAt,
    tenant
  );

  if (
    quotaResponses !== record.quotaResponses ||
    quotaBytes !== record.quotaBytes
  ) {
    recordStoreAudit(tenant, "tenant.update", {
      detail: { quotaResponses, quotaBytes },
    });
  }
  if (patch.disabled !== undefined && Boolean(disabledAt) !== Boolean(record.disabledAt)) {
    recordStoreAudit(tenant, disabledAt ? "tenant.disable" : "tenant.enable");
  }
  if (token) {
    recordStoreAudit(tenant, "tenant.rotate", {
      detail: { tokenPrefix: prefix },
    });
  }
  return {
    tenant: (await getStoreTenant(tenant))!,
    ...(token ? { token } : {}),
  };
}

export async function deleteStoreTenant(
  tenantInput: string,
  purge = false
): Promise<{ tenant: string; purged: boolean; responses: number }> {
  ensureTenantRegistry();
  const tenant = validateTenantName(tenantInput);
  const db = openResponseStoreDatabase();
  const existing = getTenantRecord(db, tenant);
  if (!existing) {
    throw new StoreTenantError(`Tenant "${tenant}" was not found.`, 404);
  }
  const stats = await responseStoreStatsLocal(tenant, {
    quotaResponses: Number(existing.quota_responses),
    quotaBytes: Number(existing.quota_bytes),
  });
  if (Number(stats.total) > 0 && !purge) {
    throw new StoreTenantError(
      `Tenant "${tenant}" still has ${stats.total} responses. Disable it, or delete with purge=true.`,
      409
    );
  }
  if (purge) {
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM responses WHERE tenant_id = ?").run(tenant);
      db.prepare("DELETE FROM response_policy WHERE tenant_id = ?").run(tenant);
      db.prepare("DELETE FROM response_store_audit WHERE tenant_id = ?").run(
        tenant
      );
      db.prepare("DELETE FROM response_tenants WHERE tenant_id = ?").run(tenant);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    recordStoreAudit(tenant, "tenant.delete", {
      bytes: Number(stats.bytes),
      detail: {
        purged: true,
        responses: Number(stats.total),
      },
    });
  } else {
    recordStoreAudit(tenant, "tenant.delete", {
      detail: { purged: false },
    });
    db.prepare("DELETE FROM response_policy WHERE tenant_id = ?").run(tenant);
    db.prepare("DELETE FROM response_tenants WHERE tenant_id = ?").run(tenant);
  }
  return {
    tenant,
    purged: purge,
    responses: Number(stats.total),
  };
}

/**
 * Resolves a bearer token against the persistent registry first. When the
 * registry is empty, falls back to the environment token list so a fresh store
 * can start without the admin UI.
 */
export async function resolveStoreTenantAsync(
  token: string
): Promise<StoreTenantIdentity | null> {
  ensureTenantRegistry();
  if (!token) return null;
  const db = openResponseStoreDatabase();
  const row = db
    .prepare("SELECT * FROM response_tenants WHERE token_hash = ?")
    .get(hashToken(token)) as TenantRow | undefined;
  if (row) {
    if (row.disabled_at) return null;
    const last = row.last_used_at ? Date.parse(row.last_used_at) : 0;
    if (!Number.isFinite(last) || Date.now() - last > LAST_USED_WRITE_MS) {
      db.prepare(
        "UPDATE response_tenants SET last_used_at = ? WHERE tenant_id = ?"
      ).run(new Date().toISOString(), row.tenant_id);
    }
    return {
      tenant: String(row.tenant_id),
      quotaResponses: Number(row.quota_responses),
      quotaBytes: Number(row.quota_bytes),
    };
  }
  const count = db
    .prepare("SELECT COUNT(*) AS count FROM response_tenants")
    .get() as { count: number };
  if (Number(count.count) > 0) return null;
  return null;
}

/** True when the store should be treated as configured for shared use. */
export function hasStoreTenantRegistry(): boolean {
  if (responseStoreConfig().backend !== "sqlite") return false;
  ensureTenantRegistry();
  const count = openResponseStoreDatabase()
    .prepare("SELECT COUNT(*) AS count FROM response_tenants")
    .get() as { count: number };
  return Number(count.count) > 0;
}
