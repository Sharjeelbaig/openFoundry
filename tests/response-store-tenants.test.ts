// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync } from "fs";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import path from "path";
import type { ConversationItem } from "@/lib/conversations";

const clientDir = mkdtempSync(path.join(tmpdir(), "openfoundry-tenant-client-"));
const sharedDir = mkdtempSync(path.join(tmpdir(), "openfoundry-tenant-shared-"));
const sharedPath = path.join(sharedDir, "responses.db");
process.env.OPENFOUNDRY_DATA_DIR = clientDir;
process.env.OPENFOUNDRY_RESPONSE_DB_PATH = sharedPath;
process.env.OPENFOUNDRY_RESPONSE_STORE = "sqlite";
delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN;
delete process.env.OPENFOUNDRY_RESPONSE_STORE_TENANT;
process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS = JSON.stringify([
  { token: "acme-token", tenant: "acme", quotaResponses: 2, quotaBytes: 100_000 },
  { token: "globex-token", tenant: "globex", quotaResponses: 10, quotaBytes: 100_000 },
  { token: "quota-token", tenant: "quota", quotaResponses: 2, quotaBytes: 100_000 },
]);

type Store = typeof import("@/lib/response-store");
type Config = typeof import("@/lib/response-store-config");
let store: Store;
let config: Config;
let server: Server;
let origin = "";

const items: ConversationItem[] = [
  {
    id: "m1",
    object: "conversation.item",
    type: "message",
    created_at: 1,
    status: "completed",
    role: "user",
    content: [{ type: "input_text", text: "tenant-scoped message" }],
  },
];

async function readBody(req: import("http").IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<
    string,
    unknown
  >;
}

function reply(
  res: import("http").ServerResponse,
  status: number,
  body: unknown
) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

beforeAll(async () => {
  store = await import("@/lib/response-store");
  config = await import("@/lib/response-store-config");
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      const header = req.headers.authorization || "";
      const token = header.toLowerCase().startsWith("bearer ")
        ? header.slice(7).trim()
        : "";
      const tenant = config.resolveStoreTenant(token);
      if (!tenant) {
        reply(res, 401, { error: "Unauthorized" });
        return;
      }
      if (req.method === "POST" && url.pathname === "/save") {
        const body = await readBody(req);
        try {
          await store.saveResponseHistoryLocal(
            String(body.id),
            body.items as ConversationItem[],
            String(body.ownerId || "project"),
            tenant.tenant,
            tenant
          );
          reply(res, 200, { ok: true, tenant: tenant.tenant });
        } catch (error) {
          const status =
            error instanceof store.ResponseStoreQuotaError
              ? error.statusCode
              : 500;
          reply(res, status, {
            error: error instanceof Error ? error.message : String(error),
            code: "quota_exceeded",
          });
        }
        return;
      }
      if (req.method === "POST" && url.pathname === "/prune") {
        const body = await readBody(req);
        await store.pruneResponsesLocal(
          body.ownerId ? String(body.ownerId) : undefined,
          tenant.tenant
        );
        reply(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/load") {
        reply(res, 200, {
          response: await store.loadResponseHistoryLocal(
            url.searchParams.get("id") || "",
            url.searchParams.get("ownerId") || "project",
            tenant.tenant
          ),
        });
        return;
      }
      if (req.method === "GET" && url.pathname === "/stats") {
        reply(res, 200, await store.responseStoreStatsLocal(tenant.tenant, tenant));
        return;
      }
      if (req.method === "GET" && url.pathname === "/policy") {
        reply(res, 200, await store.getRetentionPolicyLocal(tenant.tenant));
        return;
      }
      if (req.method === "POST" && url.pathname === "/policy") {
        const body = await readBody(req);
        reply(
          res,
          200,
          await store.setRetentionPolicyLocal(
            {
              maxResponsesPerOwner: body.maxResponsesPerOwner as number,
              ttlDays: body.ttlDays as number,
            },
            tenant.tenant
          )
        );
        return;
      }
      if (req.method === "GET" && url.pathname === "/audit") {
        const limit = Number(url.searchParams.get("limit") || 50);
        reply(res, 200, {
          entries: await store.responseStoreAuditLocal(tenant.tenant, limit),
        });
        return;
      }
      reply(res, 404, { error: "Unknown action" });
    })().catch((error) => {
      reply(res, 500, { error: error instanceof Error ? error.message : String(error) });
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

beforeEach(() => {
  process.env.OPENFOUNDRY_RESPONSE_STORE = "http";
  process.env.OPENFOUNDRY_RESPONSE_STORE_URL = origin;
  process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "acme-token";
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.closeResponseStore();
  delete process.env.OPENFOUNDRY_RESPONSE_STORE;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_URL;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS;
});

describe("per-tenant shared response store", () => {
  it("resolves tokens to tenants with independent quotas", () => {
    expect(config.resolveStoreTenant("acme-token")).toEqual({
      tenant: "acme",
      quotaResponses: 2,
      quotaBytes: 100_000,
    });
    expect(config.resolveStoreTenant("globex-token")).toMatchObject({
      tenant: "globex",
      quotaResponses: 10,
    });
    expect(config.resolveStoreTenant("unknown-token")).toBeNull();
  });

  it("isolates rows, stats and owner lookups by tenant", async () => {
    await store.saveResponseHistory("resp_acme", items, "project");
    expect((await store.loadResponseHistory("resp_acme", "project"))?.tenantId).toBe(
      "acme"
    );
    expect(await store.responseStoreStats()).toMatchObject({
      tenantId: "acme",
      total: 1,
    });

    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "globex-token";
    expect(await store.loadResponseHistory("resp_acme", "project")).toBeNull();
    expect(await store.responseStoreStats()).toMatchObject({
      tenantId: "globex",
      total: 0,
    });
  });

  it("keeps retention policy per tenant", async () => {
    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "acme-token";
    expect(
      await store.setRetentionPolicy({ maxResponsesPerOwner: 1, ttlDays: 30 })
    ).toEqual({ maxResponsesPerOwner: 1, ttlDays: 30 });
    expect(await store.getRetentionPolicy()).toEqual({
      maxResponsesPerOwner: 1,
      ttlDays: 30,
    });

    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "globex-token";
    expect(await store.getRetentionPolicy()).toEqual({
      maxResponsesPerOwner: 200,
      ttlDays: 7,
    });
  });

  it("enforces a per-tenant response quota without affecting another tenant", async () => {
    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "quota-token";
    await store.saveResponseHistory("resp_quota1", items, "project");
    await store.saveResponseHistory("resp_quota2", items, "project");
    await expect(
      store.saveResponseHistory("resp_quota3", items, "project")
    ).rejects.toThrow(/quota/i);
    expect(await store.responseStoreStats()).toMatchObject({
      tenantId: "quota",
      total: 2,
      quotaResponses: 2,
    });

    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "globex-token";
    await store.saveResponseHistory("resp_globex_quota", items, "project");
    expect(await store.responseStoreStats()).toMatchObject({
      tenantId: "globex",
      total: 1,
    });
  });

  it("returns audit entries only for the requesting tenant", async () => {
    const acme = (await fetch(`${origin}/audit?limit=50`, {
      headers: { Authorization: "Bearer acme-token" },
    }).then((response) => response.json())) as {
      entries: { tenantId: string; action: string }[];
    };
    expect(acme.entries.length).toBeGreaterThan(0);
    expect(acme.entries.every((entry) => entry.tenantId === "acme")).toBe(true);
    expect(acme.entries.some((entry) => entry.action === "save")).toBe(true);

    const globex = (await fetch(`${origin}/audit?limit=50`, {
      headers: { Authorization: "Bearer globex-token" },
    }).then((response) => response.json())) as {
      entries: { tenantId: string }[];
    };
    expect(globex.entries.every((entry) => entry.tenantId === "globex")).toBe(
      true
    );
    expect(globex.entries.some((entry) => entry.tenantId === "acme")).toBe(false);
  });

  it("keeps the legacy single-token configuration working", () => {
    const tokens = process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS;
    delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS;
    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "legacy-token";
    process.env.OPENFOUNDRY_RESPONSE_STORE_TENANT = "legacy";
    expect(config.resolveStoreTenant("legacy-token")).toMatchObject({
      tenant: "legacy",
      quotaResponses: 10_000,
    });
    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKENS = tokens;
    delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN;
    delete process.env.OPENFOUNDRY_RESPONSE_STORE_TENANT;
  });
});
