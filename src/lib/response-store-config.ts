// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createHash, timingSafeEqual } from "crypto";
import path from "path";
import { dataDir } from "./store";

/**
 * Responses can stay in the install's local SQLite file or use a shared store
 * served by another openFoundry process.
 *
 * - sqlite (default): one local file. Set OPENFOUNDRY_RESPONSE_DB_PATH to put it
 *   on a shared volume that both machines mount.
 * - http: every save/load/policy call goes to a shared store endpoint guarded by
 *   a bearer token. This is the cross-machine path that does not require a
 *   network filesystem.
 *
 * When the process is the store server, OPENFOUNDRY_RESPONSE_STORE_TOKENS holds
 * one entry per tenant. Each entry has its own token and quotas, and the store
 * scopes every row, policy and audit entry by the tenant the token resolves to.
 */

export type ResponseStoreBackend = "sqlite" | "http";

export interface ResponseStoreConfig {
  backend: ResponseStoreBackend;
  sqlitePath: string;
  httpUrl: string | null;
  httpToken: string | null;
}

export interface StoreTenantIdentity {
  tenant: string;
  quotaResponses: number;
  quotaBytes: number;
}

export interface StoreTenantConfig extends StoreTenantIdentity {
  token: string;
}

export const DEFAULT_TENANT_QUOTA_RESPONSES = 10_000;
export const DEFAULT_TENANT_QUOTA_BYTES = 100 * 1024 * 1024;
const TENANT_NAME = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function positiveInteger(value: unknown, fallback: number, minimum = 1): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.floor(number));
}

function validateTenant(value: unknown, label: string): StoreTenantConfig {
  if (!value || typeof value !== "object") {
    throw new Error(`${label} must be an object.`);
  }
  const entry = value as Record<string, unknown>;
  const token = String(entry.token || "").trim();
  const tenant = String(entry.tenant || "").trim();
  if (!token) throw new Error(`${label} is missing a token.`);
  if (!TENANT_NAME.test(tenant)) {
    throw new Error(
      `${label} has an invalid tenant name. Use lowercase letters, numbers, underscores or hyphens.`
    );
  }
  return {
    token,
    tenant,
    quotaResponses: positiveInteger(
      entry.quotaResponses,
      DEFAULT_TENANT_QUOTA_RESPONSES
    ),
    quotaBytes: positiveInteger(
      entry.quotaBytes,
      DEFAULT_TENANT_QUOTA_BYTES,
      1024
    ),
  };
}

export function responseStoreConfig(): ResponseStoreConfig {
  const requested = (process.env.OPENFOUNDRY_RESPONSE_STORE || "sqlite").trim();
  const backend: ResponseStoreBackend = requested === "http" ? "http" : "sqlite";
  const sqlitePath = (
    process.env.OPENFOUNDRY_RESPONSE_DB_PATH?.trim() ||
    path.join(dataDir(), "responses.db")
  ).trim();
  const httpUrl =
    process.env.OPENFOUNDRY_RESPONSE_STORE_URL?.trim().replace(/\/+$/, "") ||
    null;
  const httpToken = process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN?.trim() || null;
  if (backend === "http" && (!httpUrl || !httpToken)) {
    throw new Error(
      "OPENFOUNDRY_RESPONSE_STORE=http requires OPENFOUNDRY_RESPONSE_STORE_URL and OPENFOUNDRY_RESPONSE_STORE_TOKEN."
    );
  }
  return { backend, sqlitePath, httpUrl, httpToken };
}

/**
 * The list of tenants this process accepts as a shared store. An empty list
 * means the store route is not configured for shared use.
 */
export function storeTenantConfig(): StoreTenantConfig[] {
  const tenants: StoreTenantConfig[] = [];
  const raw = process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS?.trim();
  if (raw) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      throw new Error(
        "OPENFOUNDRY_RESPONSE_STORE_TOKENS must be valid JSON."
      );
    }
    if (!Array.isArray(parsed)) {
      throw new Error("OPENFOUNDRY_RESPONSE_STORE_TOKENS must be an array.");
    }
    parsed.forEach((entry, index) => {
      tenants.push(validateTenant(entry, `Tenant entry ${index + 1}`));
    });
  }
  // The legacy single token is only a fallback when no tenant token array is
  // configured. This also lets a client process use a tenant token in the same
  // environment without it being re-registered as a fallback tenant.
  const legacyToken = raw
    ? undefined
    : process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN?.trim();
  if (legacyToken) {
    const tenant =
      process.env.OPENFOUNDRY_RESPONSE_STORE_TENANT?.trim() || "default";
    // A JSON tenant with the same name wins; otherwise the legacy single-token
    // configuration keeps working as the default tenant.
    if (!tenants.some((entry) => entry.tenant === tenant)) {
      tenants.push({
        token: legacyToken,
        tenant,
        quotaResponses: positiveInteger(
          process.env.OPENFOUNDRY_RESPONSE_TENANT_QUOTA_RESPONSES,
          DEFAULT_TENANT_QUOTA_RESPONSES
        ),
        quotaBytes: positiveInteger(
          process.env.OPENFOUNDRY_RESPONSE_TENANT_QUOTA_BYTES,
          DEFAULT_TENANT_QUOTA_BYTES,
          1024
        ),
      });
    }
  }
  const tokens = new Set<string>();
  const names = new Set<string>();
  for (const entry of tenants) {
    if (tokens.has(entry.token)) {
      throw new Error(`Duplicate response-store token for tenant "${entry.tenant}".`);
    }
    if (names.has(entry.tenant)) {
      throw new Error(`Duplicate response-store tenant "${entry.tenant}".`);
    }
    tokens.add(entry.token);
    names.add(entry.tenant);
  }
  return tenants;
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

export function resolveStoreTenant(
  token: string
): StoreTenantIdentity | null {
  if (!token) return null;
  const given = digest(token);
  for (const entry of storeTenantConfig()) {
    if (timingSafeEqual(given, digest(entry.token))) {
      return {
        tenant: entry.tenant,
        quotaResponses: entry.quotaResponses,
        quotaBytes: entry.quotaBytes,
      };
    }
  }
  return null;
}

/** Identity used by local SQLite mode, which has no bearer token. */
export function localStoreTenant(): StoreTenantIdentity {
  const tenant =
    process.env.OPENFOUNDRY_RESPONSE_TENANT?.trim() || "default";
  if (!TENANT_NAME.test(tenant)) {
    throw new Error(
      "OPENFOUNDRY_RESPONSE_TENANT must use lowercase letters, numbers, underscores or hyphens."
    );
  }
  return {
    tenant,
    quotaResponses: positiveInteger(
      process.env.OPENFOUNDRY_RESPONSE_TENANT_QUOTA_RESPONSES,
      DEFAULT_TENANT_QUOTA_RESPONSES
    ),
    quotaBytes: positiveInteger(
      process.env.OPENFOUNDRY_RESPONSE_TENANT_QUOTA_BYTES,
      DEFAULT_TENANT_QUOTA_BYTES,
      1024
    ),
  };
}
