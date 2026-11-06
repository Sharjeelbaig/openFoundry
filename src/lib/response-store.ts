// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { mkdirSync } from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";
import type { ConversationItem } from "./conversations";
import { ResponseStoreQuotaError } from "./response-store-errors";
import {
  DEFAULT_TENANT_QUOTA_BYTES,
  DEFAULT_TENANT_QUOTA_RESPONSES,
  localStoreTenant,
  responseStoreConfig,
  type StoreTenantIdentity,
} from "./response-store-config";
import {
  getRetentionPolicyRemote,
  loadResponseHistoryRemote,
  pruneResponsesRemote,
  responseStoreStatsRemote,
  saveResponseHistoryRemote,
  setRetentionPolicyRemote,
} from "./response-store-http";

/**
 * Response history for the project Responses API.
 *
 * The default backend is one SQLite file (WAL, shared by processes on the same
 * install). Set OPENFOUNDRY_RESPONSE_DB_PATH to place that file on a shared
 * volume, or set OPENFOUNDRY_RESPONSE_STORE=http to use a shared store service
 * on another machine. Rows, policies and audit entries are scoped by tenant;
 * the shared store resolves the tenant from the bearer token.
 */

export interface StoredResponseHistory {
  id: string;
  items: ConversationItem[];
  createdAt: string;
  ownerId: string;
  tenantId: string;
}

export interface ResponseRetentionPolicy {
  /** Maximum retained responses per owner. */
  maxResponsesPerOwner: number;
  /** Age limit in days; 0 keeps rows until the count limit prunes them. */
  ttlDays: number;
}

export interface ResponseStoreStats {
  tenantId: string;
  total: number;
  bytes: number;
  quotaResponses: number;
  quotaBytes: number;
  owners: { ownerId: string; count: number }[];
  oldest: string | null;
  newest: string | null;
}

export interface ResponseStoreAuditEntry {
  id: number;
  tenantId: string;
  action: string;
  responseId: string | null;
  ownerId: string | null;
  bytes: number;
  at: string;
  detail: Record<string, unknown> | null;
}

export {
  ResponseStoreHttpError,
  ResponseStoreQuotaError,
} from "./response-store-errors";

interface GlobalWithResponseDbs {
  __openfoundryResponseDbs?: Map<string, DatabaseSync>;
}

const globalStore = globalThis as unknown as GlobalWithResponseDbs;
export const DEFAULT_RESPONSE_POLICY: ResponseRetentionPolicy = {
  maxResponsesPerOwner: 200,
  ttlDays: 7,
};

/** @internal Shared SQLite handle for the response store and tenant admin. */
export function openResponseStoreDatabase(): DatabaseSync {
  return open();
}

function open(): DatabaseSync {
  const config = responseStoreConfig();
  const databasePath = path.resolve(config.sqlitePath);
  globalStore.__openfoundryResponseDbs ||= new Map();
  const existing = globalStore.__openfoundryResponseDbs.get(databasePath);
  if (existing) return existing;
  mkdirSync(path.dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA busy_timeout = 5000");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(
    `CREATE TABLE IF NOT EXISTS responses (
       id TEXT PRIMARY KEY,
       tenant_id TEXT NOT NULL DEFAULT 'default',
       owner_id TEXT NOT NULL DEFAULT 'project',
       items_json TEXT NOT NULL,
       created_at TEXT NOT NULL
     );
     CREATE INDEX IF NOT EXISTS idx_responses_created
       ON responses(created_at DESC);
     CREATE INDEX IF NOT EXISTS idx_responses_owner
       ON responses(owner_id, created_at DESC);
     CREATE INDEX IF NOT EXISTS idx_responses_tenant_owner
       ON responses(tenant_id, owner_id, created_at DESC);
     CREATE TABLE IF NOT EXISTS response_store_audit (
       id INTEGER PRIMARY KEY AUTOINCREMENT,
       tenant_id TEXT NOT NULL,
       action TEXT NOT NULL,
       response_id TEXT,
       owner_id TEXT,
       bytes INTEGER NOT NULL DEFAULT 0,
       at TEXT NOT NULL,
       detail_json TEXT
     );
     CREATE INDEX IF NOT EXISTS idx_audit_tenant
       ON response_store_audit(tenant_id, id DESC);
     CREATE TABLE IF NOT EXISTS response_tenants (
       tenant_id TEXT PRIMARY KEY,
       token_hash TEXT NOT NULL UNIQUE,
       token_prefix TEXT NOT NULL,
       quota_responses INTEGER NOT NULL,
       quota_bytes INTEGER NOT NULL,
       created_at TEXT NOT NULL,
       updated_at TEXT NOT NULL,
       last_used_at TEXT,
       disabled_at TEXT
     );
     CREATE UNIQUE INDEX IF NOT EXISTS idx_tenants_token_hash
       ON response_tenants(token_hash);
     CREATE TABLE IF NOT EXISTS response_store_meta (
       key TEXT PRIMARY KEY,
       value TEXT NOT NULL
     );`
  );
  const responseColumns = db.prepare("PRAGMA table_info(responses)").all() as {
    name: string;
  }[];
  if (!responseColumns.some((column) => column.name === "tenant_id")) {
    db.exec(
      "ALTER TABLE responses ADD COLUMN tenant_id TEXT NOT NULL DEFAULT 'default'"
    );
    db.exec(
      "CREATE INDEX IF NOT EXISTS idx_responses_tenant_owner ON responses(tenant_id, owner_id, created_at DESC)"
    );
  }
  const policyExists = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'response_policy'"
    )
    .get();
  if (policyExists) {
    const policyColumns = db
      .prepare("PRAGMA table_info(response_policy)")
      .all() as { name: string }[];
    if (!policyColumns.some((column) => column.name === "tenant_id")) {
      db.exec("BEGIN");
      try {
        db.exec("ALTER TABLE response_policy RENAME TO response_policy_legacy");
        db.exec(
          `CREATE TABLE response_policy (
             tenant_id TEXT PRIMARY KEY,
             max_responses_per_owner INTEGER NOT NULL,
             ttl_days INTEGER NOT NULL,
             updated_at TEXT NOT NULL
           )`
        );
        db.exec(
          `INSERT OR IGNORE INTO response_policy
             (tenant_id, max_responses_per_owner, ttl_days, updated_at)
           SELECT 'default', max_responses_per_owner, ttl_days, updated_at
           FROM response_policy_legacy WHERE id = 1`
        );
        db.exec("DROP TABLE response_policy_legacy");
        db.exec("COMMIT");
      } catch (error) {
        db.exec("ROLLBACK");
        throw error;
      }
    }
  } else {
    db.exec(
      `CREATE TABLE response_policy (
         tenant_id TEXT PRIMARY KEY,
         max_responses_per_owner INTEGER NOT NULL,
         ttl_days INTEGER NOT NULL,
         updated_at TEXT NOT NULL
       )`
    );
  }
  // Upgrade databases written before owner scoping existed.
  db.prepare(
    `INSERT OR IGNORE INTO response_policy
       (tenant_id, max_responses_per_owner, ttl_days, updated_at)
     VALUES ('default', ?, ?, ?)`
  ).run(
    DEFAULT_RESPONSE_POLICY.maxResponsesPerOwner,
    DEFAULT_RESPONSE_POLICY.ttlDays,
    new Date().toISOString()
  );
  globalStore.__openfoundryResponseDbs.set(databasePath, db);
  return db;
}

/** Closes every open SQLite handle. Tests use this to simulate a restart. */
export function closeResponseStore(): void {
  const databases = globalStore.__openfoundryResponseDbs;
  if (!databases) return;
  for (const db of databases.values()) db.close();
  databases.clear();
}

function clampPolicy(
  input: Partial<ResponseRetentionPolicy>
): ResponseRetentionPolicy {
  const max = Number(input.maxResponsesPerOwner);
  const ttl = Number(input.ttlDays);
  return {
    maxResponsesPerOwner: Number.isFinite(max)
      ? Math.min(Math.max(Math.floor(max), 1), 10_000)
      : DEFAULT_RESPONSE_POLICY.maxResponsesPerOwner,
    ttlDays: Number.isFinite(ttl)
      ? Math.min(Math.max(Math.floor(ttl), 0), 3650)
      : DEFAULT_RESPONSE_POLICY.ttlDays,
  };
}

export interface StoreAuditOptions {
  responseId?: string | null;
  ownerId?: string | null;
  bytes?: number;
  detail?: Record<string, unknown> | null;
}

function audit(
  db: DatabaseSync,
  tenantId: string,
  action: string,
  options: StoreAuditOptions = {}
): void {
  db.prepare(
    `INSERT INTO response_store_audit
       (tenant_id, action, response_id, owner_id, bytes, at, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(
    tenantId,
    action,
    options.responseId ?? null,
    options.ownerId ?? null,
    options.bytes ?? 0,
    new Date().toISOString(),
    options.detail ? JSON.stringify(options.detail) : null
  );
}

/** Records an audit entry for a tenant-scoped store operation. */
export function recordStoreAudit(
  tenantId: string,
  action: string,
  options: StoreAuditOptions = {}
): void {
  audit(open(), tenantId, action, options);
}

function tenantBytes(db: DatabaseSync, tenantId: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(LENGTH(CAST(items_json AS BLOB))), 0) AS bytes
       FROM responses WHERE tenant_id = ?`
    )
    .get(tenantId) as { bytes: number };
  return Number(row.bytes);
}

// ---------------------------------------------------------------------------
// Local SQLite backend. The shared-store route calls these directly so a store
// server never recurses into its own HTTP client.
// ---------------------------------------------------------------------------

export async function getRetentionPolicyLocal(
  tenantId = "default"
): Promise<ResponseRetentionPolicy> {
  const db = open();
  db.prepare(
    `INSERT OR IGNORE INTO response_policy
       (tenant_id, max_responses_per_owner, ttl_days, updated_at)
     VALUES (?, ?, ?, ?)`
  ).run(
    tenantId,
    DEFAULT_RESPONSE_POLICY.maxResponsesPerOwner,
    DEFAULT_RESPONSE_POLICY.ttlDays,
    new Date().toISOString()
  );
  const row = db
    .prepare(
      "SELECT max_responses_per_owner, ttl_days FROM response_policy WHERE tenant_id = ?"
    )
    .get(tenantId) as
    | { max_responses_per_owner: number; ttl_days: number }
    | undefined;
  return clampPolicy({
    maxResponsesPerOwner: Number(row?.max_responses_per_owner),
    ttlDays: Number(row?.ttl_days),
  });
}

export async function setRetentionPolicyLocal(
  patch: Partial<ResponseRetentionPolicy>,
  tenantId = "default"
): Promise<ResponseRetentionPolicy> {
  const policy = clampPolicy({
    ...(await getRetentionPolicyLocal(tenantId)),
    ...patch,
  });
  const db = open();
  db.prepare(
    `INSERT INTO response_policy
       (tenant_id, max_responses_per_owner, ttl_days, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(tenant_id) DO UPDATE SET
       max_responses_per_owner = excluded.max_responses_per_owner,
       ttl_days = excluded.ttl_days,
       updated_at = excluded.updated_at`
  ).run(
    tenantId,
    policy.maxResponsesPerOwner,
    policy.ttlDays,
    new Date().toISOString()
  );
  audit(db, tenantId, "policy", { detail: { ...policy } });
  await pruneResponsesLocal(undefined, tenantId);
  return policy;
}

export async function saveResponseHistoryLocal(
  id: string,
  items: ConversationItem[],
  ownerId = "project",
  tenantId = "default",
  quota?: Pick<StoreTenantIdentity, "quotaResponses" | "quotaBytes">
): Promise<void> {
  const db = open();
  const serialized = JSON.stringify(items);
  const bytes = Buffer.byteLength(serialized, "utf8");
  const existing = db
    .prepare(
      `SELECT LENGTH(CAST(items_json AS BLOB)) AS bytes
       FROM responses WHERE id = ? AND tenant_id = ?`
    )
    .get(id, tenantId) as { bytes: number } | undefined;
  const total = db
    .prepare("SELECT COUNT(*) AS count FROM responses WHERE tenant_id = ?")
    .get(tenantId) as { count: number };
  const currentBytes = tenantBytes(db, tenantId);
  const nextCount = Number(total.count) + (existing ? 0 : 1);
  const nextBytes = currentBytes - Number(existing?.bytes ?? 0) + bytes;
  if (quota && nextCount > quota.quotaResponses) {
    throw new ResponseStoreQuotaError(
      `Tenant "${tenantId}" has reached its response quota (${quota.quotaResponses}).`,
      429
    );
  }
  if (quota && nextBytes > quota.quotaBytes) {
    throw new ResponseStoreQuotaError(
      `Tenant "${tenantId}" has reached its storage quota (${quota.quotaBytes} bytes).`,
      413
    );
  }
  db.prepare(
    `INSERT INTO responses (id, tenant_id, owner_id, items_json, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       tenant_id = excluded.tenant_id,
       owner_id = excluded.owner_id,
       items_json = excluded.items_json,
       created_at = excluded.created_at`
  ).run(id, tenantId, ownerId, serialized, new Date().toISOString());
  audit(db, tenantId, existing ? "update" : "save", {
    responseId: id,
    ownerId,
    bytes,
  });
  await pruneResponsesLocal(ownerId, tenantId);
}

export async function loadResponseHistoryLocal(
  id: string,
  ownerId = "project",
  tenantId = "default"
): Promise<StoredResponseHistory | null> {
  const row = open()
    .prepare(
      `SELECT id, tenant_id, owner_id, items_json, created_at,
         LENGTH(CAST(items_json AS BLOB)) AS bytes
       FROM responses WHERE id = ? AND owner_id = ? AND tenant_id = ?`
    )
    .get(id, ownerId, tenantId) as
    | {
        id: string;
        tenant_id: string;
        owner_id: string;
        items_json: string;
        created_at: string;
        bytes: number;
      }
    | undefined;
  if (!row) return null;
  const db = open();
  audit(db, tenantId, "load", {
    responseId: String(row.id),
    ownerId: String(row.owner_id),
    bytes: Number(row.bytes),
  });
  try {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      ownerId: String(row.owner_id),
      items: JSON.parse(String(row.items_json)) as ConversationItem[],
      createdAt: String(row.created_at),
    };
  } catch {
    return null;
  }
}

export async function pruneResponsesLocal(
  ownerId?: string,
  tenantId = "default"
): Promise<void> {
  const db = open();
  const before = db
    .prepare("SELECT COUNT(*) AS count FROM responses WHERE tenant_id = ?")
    .get(tenantId) as { count: number };
  const policy = await getRetentionPolicyLocal(tenantId);
  if (policy.ttlDays > 0) {
    const cutoff = new Date(
      Date.now() - policy.ttlDays * 24 * 60 * 60 * 1000
    ).toISOString();
    if (ownerId) {
      db.prepare(
        "DELETE FROM responses WHERE tenant_id = ? AND owner_id = ? AND created_at < ?"
      ).run(tenantId, ownerId, cutoff);
    } else {
      db.prepare(
        "DELETE FROM responses WHERE tenant_id = ? AND created_at < ?"
      ).run(tenantId, cutoff);
    }
  }
  const owners = (
    ownerId
      ? [{ owner_id: ownerId }]
      : (db
          .prepare(
            "SELECT DISTINCT owner_id FROM responses WHERE tenant_id = ?"
          )
          .all(tenantId) as { owner_id: string }[])
  ).map((row) => String(row.owner_id));
  for (const owner of owners) {
    db.prepare(
      `DELETE FROM responses WHERE tenant_id = ? AND owner_id = ? AND id NOT IN (
         SELECT id FROM responses WHERE tenant_id = ? AND owner_id = ?
         ORDER BY created_at DESC, rowid DESC LIMIT ?
       )`
    ).run(
      tenantId,
      owner,
      tenantId,
      owner,
      policy.maxResponsesPerOwner
    );
  }
  const after = db
    .prepare("SELECT COUNT(*) AS count FROM responses WHERE tenant_id = ?")
    .get(tenantId) as { count: number };
  const deleted = Number(before.count) - Number(after.count);
  if (deleted > 0) {
    audit(db, tenantId, "prune", {
      ownerId: ownerId || null,
      detail: { deleted },
    });
  }
}

export async function responseStoreStatsLocal(
  tenantId = "default",
  quota: Pick<StoreTenantIdentity, "quotaResponses" | "quotaBytes"> = {
    quotaResponses: DEFAULT_TENANT_QUOTA_RESPONSES,
    quotaBytes: DEFAULT_TENANT_QUOTA_BYTES,
  }
): Promise<ResponseStoreStats> {
  const db = open();
  const total = Number(
    (
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM responses WHERE tenant_id = ?"
        )
        .get(tenantId) as { count: number }
    ).count
  );
  const bytes = tenantBytes(db, tenantId);
  const owners = (
    db
      .prepare(
        `SELECT owner_id, COUNT(*) AS count FROM responses
         WHERE tenant_id = ? GROUP BY owner_id ORDER BY count DESC`
      )
      .all(tenantId) as { owner_id: string; count: number }[]
  ).map((row) => ({
    ownerId: String(row.owner_id),
    count: Number(row.count),
  }));
  const bounds = db
    .prepare(
      `SELECT MIN(created_at) AS oldest, MAX(created_at) AS newest
       FROM responses WHERE tenant_id = ?`
    )
    .get(tenantId) as { oldest: string | null; newest: string | null };
  return {
    tenantId,
    total,
    bytes,
    quotaResponses: quota.quotaResponses,
    quotaBytes: quota.quotaBytes,
    owners,
    oldest: bounds.oldest ? String(bounds.oldest) : null,
    newest: bounds.newest ? String(bounds.newest) : null,
  };
}

interface AuditRow {
  id: number;
  tenant_id: string;
  action: string;
  response_id: string | null;
  owner_id: string | null;
  bytes: number;
  at: string;
  detail_json: string | null;
}

function mapAuditRows(rows: AuditRow[]): ResponseStoreAuditEntry[] {
  return rows.map((row) => {
    let detail: Record<string, unknown> | null = null;
    try {
      detail = row.detail_json
        ? (JSON.parse(row.detail_json) as Record<string, unknown>)
        : null;
    } catch {
      detail = null;
    }
    return {
      id: Number(row.id),
      tenantId: String(row.tenant_id),
      action: String(row.action),
      responseId: row.response_id ? String(row.response_id) : null,
      ownerId: row.owner_id ? String(row.owner_id) : null,
      bytes: Number(row.bytes),
      at: String(row.at),
      detail,
    };
  });
}

export async function responseStoreAuditLocal(
  tenantId = "default",
  limit = 50
): Promise<ResponseStoreAuditEntry[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 500)
    : 50;
  const rows = open()
    .prepare(
      `SELECT id, tenant_id, action, response_id, owner_id, bytes, at, detail_json
       FROM response_store_audit WHERE tenant_id = ?
       ORDER BY id DESC LIMIT ?`
    )
    .all(tenantId, boundedLimit) as unknown as AuditRow[];
  return mapAuditRows(rows);
}

/** Admin view: recent audit entries across every tenant. */
export async function responseStoreAuditAll(
  limit = 100,
  tenantId?: string
): Promise<ResponseStoreAuditEntry[]> {
  const boundedLimit = Number.isFinite(limit)
    ? Math.min(Math.max(Math.floor(limit), 1), 500)
    : 100;
  const db = open();
  const rows = (
    tenantId
      ? db
          .prepare(
            `SELECT id, tenant_id, action, response_id, owner_id, bytes, at, detail_json
             FROM response_store_audit WHERE tenant_id = ?
             ORDER BY id DESC LIMIT ?`
          )
          .all(tenantId, boundedLimit)
      : db
          .prepare(
            `SELECT id, tenant_id, action, response_id, owner_id, bytes, at, detail_json
             FROM response_store_audit ORDER BY id DESC LIMIT ?`
          )
          .all(boundedLimit)
  ) as unknown as AuditRow[];
  return mapAuditRows(rows);
}

// ---------------------------------------------------------------------------
// Public backend-neutral API.
// ---------------------------------------------------------------------------

export async function getRetentionPolicy(): Promise<ResponseRetentionPolicy> {
  if (responseStoreConfig().backend === "http") {
    return getRetentionPolicyRemote();
  }
  return getRetentionPolicyLocal(localStoreTenant().tenant);
}

export async function setRetentionPolicy(
  patch: Partial<ResponseRetentionPolicy>
): Promise<ResponseRetentionPolicy> {
  if (responseStoreConfig().backend === "http") {
    return setRetentionPolicyRemote(patch);
  }
  return setRetentionPolicyLocal(patch, localStoreTenant().tenant);
}

export async function saveResponseHistory(
  id: string,
  items: ConversationItem[],
  ownerId = "project"
): Promise<void> {
  if (responseStoreConfig().backend === "http") {
    return saveResponseHistoryRemote(id, items, ownerId);
  }
  const local = localStoreTenant();
  return saveResponseHistoryLocal(id, items, ownerId, local.tenant, local);
}

export async function loadResponseHistory(
  id: string,
  ownerId = "project"
): Promise<StoredResponseHistory | null> {
  if (responseStoreConfig().backend === "http") {
    return loadResponseHistoryRemote(id, ownerId);
  }
  return loadResponseHistoryLocal(id, ownerId, localStoreTenant().tenant);
}

export async function pruneResponses(ownerId?: string): Promise<void> {
  if (responseStoreConfig().backend === "http") {
    return pruneResponsesRemote(ownerId);
  }
  return pruneResponsesLocal(ownerId, localStoreTenant().tenant);
}

export async function responseStoreStats(): Promise<ResponseStoreStats> {
  if (responseStoreConfig().backend === "http") {
    return responseStoreStatsRemote();
  }
  const local = localStoreTenant();
  return responseStoreStatsLocal(local.tenant, local);
}
