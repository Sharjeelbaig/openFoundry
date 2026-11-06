// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import path from "path";
import type { ConversationItem } from "@/lib/conversations";
import { resolveApiRoute } from "@/lib/directory/routes";

const dir = mkdtempSync(path.join(tmpdir(), "openfoundry-tenant-admin-"));
const dbPath = path.join(dir, "responses.db");
process.env.OPENFOUNDRY_DATA_DIR = dir;
process.env.OPENFOUNDRY_RESPONSE_STORE = "sqlite";
process.env.OPENFOUNDRY_RESPONSE_DB_PATH = dbPath;

type Store = typeof import("@/lib/response-store");
type Tenants = typeof import("@/lib/response-tenants");
let store: Store;
let tenants: Tenants;

const items: ConversationItem[] = [
  {
    id: "m1",
    object: "conversation.item",
    type: "message",
    created_at: 1,
    status: "completed",
    role: "user",
    content: [{ type: "input_text", text: "remember the tenant code 4417" }],
  },
  {
    id: "m2",
    object: "conversation.item",
    type: "message",
    created_at: 2,
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text: "The tenant code is 4417." }],
  },
];

function resetDb() {
  store.closeResponseStore();
  for (const suffix of ["", "-wal", "-shm"]) {
    rmSync(`${dbPath}${suffix}`, { force: true });
  }
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_TENANT;
}

beforeAll(async () => {
  store = await import("@/lib/response-store");
  tenants = await import("@/lib/response-tenants");
});

beforeEach(() => {
  resetDb();
});

afterAll(() => {
  store.closeResponseStore();
  rmSync(dir, { recursive: true, force: true });
});

describe("admin route permissions", () => {
  it("maps every tenant admin route to a settings action", () => {
    expect(resolveApiRoute("GET", "/api/responses/tenants")).toEqual({
      visibility: "guarded",
      action: "settings.read",
    });
    expect(resolveApiRoute("POST", "/api/responses/tenants")).toEqual({
      visibility: "guarded",
      action: "settings.write",
    });
    expect(resolveApiRoute("GET", "/api/responses/tenants/audit")).toEqual({
      visibility: "guarded",
      action: "settings.read",
    });
    expect(resolveApiRoute("PATCH", "/api/responses/tenants/acme")).toEqual({
      visibility: "guarded",
      action: "settings.write",
    });
    expect(resolveApiRoute("DELETE", "/api/responses/tenants/acme")).toEqual({
      visibility: "guarded",
      action: "settings.write",
    });
  });
});

describe("tenant registry", () => {
  it("creates a tenant and returns the token only once", async () => {
    const created = await tenants.createStoreTenant({
      tenant: "acme",
      quotaResponses: 5,
      quotaBytes: 2048,
    });
    expect(created.token).toMatch(/^ofst_/);
    expect(created.token!.length).toBeGreaterThanOrEqual(24);
    const listed = await tenants.listStoreTenants();
    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      tenant: "acme",
      quotaResponses: 5,
      quotaBytes: 2048,
      tokenPrefix: created.token!.slice(0, 12),
    });
    expect("token" in listed[0]).toBe(false);
    expect(listed[0].usage.status).toBe("active");
    expect(
      await tenants.resolveStoreTenantAsync(created.token!)
    ).toEqual({
      tenant: "acme",
      quotaResponses: 5,
      quotaBytes: 2048,
    });
    expect(await tenants.resolveStoreTenantAsync("wrong-token-0123456789")).toBeNull();
    expect(existsSync(dbPath)).toBe(true);
  });

  it("rejects duplicate names and invalid tokens", async () => {
    const first = await tenants.createStoreTenant({ tenant: "acme" });
    await expect(
      tenants.createStoreTenant({ tenant: "globex", token: first.token })
    ).rejects.toThrow(/already assigned/i);
    await expect(
      tenants.createStoreTenant({ tenant: "acme" })
    ).rejects.toThrow(/already exists/i);
    await expect(
      tenants.createStoreTenant({ tenant: "Bad Name" })
    ).rejects.toThrow(/lowercase/i);
    await expect(
      tenants.createStoreTenant({ tenant: "short", token: "short" })
    ).rejects.toThrow(/at least 24/i);
  });

  it("rotates a token and invalidates the old one immediately", async () => {
    const created = await tenants.createStoreTenant({ tenant: "acme" });
    const rotated = await tenants.updateStoreTenant("acme", {
      rotateToken: true,
    });
    expect(rotated.token).toBeTruthy();
    expect(rotated.token).not.toBe(created.token);
    expect(await tenants.resolveStoreTenantAsync(created.token!)).toBeNull();
    expect(await tenants.resolveStoreTenantAsync(rotated.token!)).toMatchObject({
      tenant: "acme",
    });
  });

  it("disables and re-enables a tenant token", async () => {
    const created = await tenants.createStoreTenant({ tenant: "acme" });
    await tenants.updateStoreTenant("acme", { disabled: true });
    expect(await tenants.resolveStoreTenantAsync(created.token!)).toBeNull();
    expect((await tenants.getStoreTenant("acme"))?.usage.status).toBe(
      "disabled"
    );
    await tenants.updateStoreTenant("acme", { disabled: false });
    expect(await tenants.resolveStoreTenantAsync(created.token!)).toMatchObject({
      tenant: "acme",
    });
  });
});

describe("tenant usage and quotas", () => {
  it("reports response count, bytes and owners per tenant", async () => {
    const created = await tenants.createStoreTenant({
      tenant: "acme",
      quotaResponses: 10,
      quotaBytes: 100_000,
    });
    await store.saveResponseHistoryLocal(
      "resp_acme",
      items,
      "project",
      "acme",
      { quotaResponses: 10, quotaBytes: 100_000 }
    );
    const record = await tenants.getStoreTenant("acme");
    expect(record?.usage.total).toBe(1);
    expect(record?.usage.bytes).toBeGreaterThan(0);
    expect(record?.usage.owners).toBe(1);
    expect(record?.usage.status).toBe("active");
    expect(created.tenant.usage.total).toBe(0);
  });

  it("enforces a per-tenant response quota and lets an admin raise it", async () => {
    const created = await tenants.createStoreTenant({
      tenant: "tight",
      quotaResponses: 1,
      quotaBytes: 100_000,
    });
    await store.saveResponseHistoryLocal("resp_1", items, "project", "tight", {
      quotaResponses: 1,
      quotaBytes: 100_000,
    });
    await expect(
      store.saveResponseHistoryLocal("resp_2", items, "project", "tight", {
        quotaResponses: 1,
        quotaBytes: 100_000,
      })
    ).rejects.toThrow(/quota/i);
    const updated = await tenants.updateStoreTenant("tight", {
      quotaResponses: 2,
    });
    expect(updated.tenant.quotaResponses).toBe(2);
    await store.saveResponseHistoryLocal("resp_2", items, "project", "tight", {
      quotaResponses: 2,
      quotaBytes: 100_000,
    });
    expect((await tenants.getStoreTenant("tight"))?.usage.total).toBe(2);
    expect(created.token).toBeTruthy();
  });

  it("totals every tenant for the billing view", async () => {
    await tenants.createStoreTenant({ tenant: "acme" });
    await tenants.createStoreTenant({ tenant: "globex" });
    await store.saveResponseHistoryLocal("resp_a", items, "project", "acme", {
      quotaResponses: 10_000,
      quotaBytes: 100_000,
    });
    const list = await tenants.listStoreTenants();
    const totals = tenants.storeTenantTotals(list);
    expect(totals.tenants).toBe(2);
    expect(totals.responses).toBe(1);
    expect(totals.bytes).toBeGreaterThan(0);
  });
});

describe("tenant audit", () => {
  it("records admin actions and isolates each tenant's stream", async () => {
    const acme = await tenants.createStoreTenant({ tenant: "acme" });
    await tenants.createStoreTenant({ tenant: "globex" });
    await tenants.updateStoreTenant("acme", {
      rotateToken: true,
      quotaResponses: 7,
    });
    await tenants.updateStoreTenant("acme", { disabled: true });

    const acmeAudit = await store.responseStoreAuditAll(100, "acme");
    expect(acmeAudit.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "tenant.create",
        "tenant.update",
        "tenant.rotate",
        "tenant.disable",
      ])
    );
    expect(acmeAudit.every((entry) => entry.tenantId === "acme")).toBe(true);
    expect(acme.token).toBeTruthy();

    const globexAudit = await store.responseStoreAuditAll(100, "globex");
    expect(globexAudit.map((entry) => entry.action)).toEqual(["tenant.create"]);
  });
});

describe("tenant deletion", () => {
  it("refuses to delete a tenant with history unless purged", async () => {
    await tenants.createStoreTenant({ tenant: "acme" });
    await store.saveResponseHistoryLocal("resp_a", items, "project", "acme", {
      quotaResponses: 10_000,
      quotaBytes: 100_000,
    });
    await expect(tenants.deleteStoreTenant("acme")).rejects.toThrow(
      /still has 1 responses/i
    );
    const deleted = await tenants.deleteStoreTenant("acme", true);
    expect(deleted).toMatchObject({ purged: true, responses: 1 });
    expect(await tenants.getStoreTenant("acme")).toBeNull();
    const stats = await store.responseStoreStatsLocal("acme", {
      quotaResponses: 10_000,
      quotaBytes: 100_000,
    });
    expect(stats.total).toBe(0);
    const audit = await store.responseStoreAuditAll(20, "acme");
    expect(audit[0].action).toBe("tenant.delete");
    expect(audit[0].detail).toMatchObject({ purged: true, responses: 1 });
  });
});

describe("environment import", () => {
  it("imports env tenants once and lets the registry override them", async () => {
    resetDb();
    const envToken = "legacy-token-0123456789abcdef";
    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS = JSON.stringify([
      {
        token: envToken,
        tenant: "legacy",
        quotaResponses: 3,
        quotaBytes: 4096,
      },
    ]);
    tenants.ensureTenantRegistry();
    expect(
      (await tenants.listStoreTenants()).map((tenant) => tenant.tenant)
    ).toEqual(["legacy"]);
    expect(await tenants.resolveStoreTenantAsync(envToken)).toMatchObject({
      tenant: "legacy",
      quotaResponses: 3,
    });

    const rotated = await tenants.updateStoreTenant("legacy", {
      rotateToken: true,
    });
    expect(await tenants.resolveStoreTenantAsync(envToken)).toBeNull();
    expect(await tenants.resolveStoreTenantAsync(rotated.token!)).toMatchObject({
      tenant: "legacy",
    });
    delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS;
  });
});
