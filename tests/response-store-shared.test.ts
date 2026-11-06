// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync } from "fs";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import path from "path";
import type { ConversationItem } from "@/lib/conversations";

const clientDir = mkdtempSync(path.join(tmpdir(), "openfoundry-store-client-"));
const sharedDir = mkdtempSync(path.join(tmpdir(), "openfoundry-store-shared-"));
const sharedPath = path.join(sharedDir, "shared-responses.db");
process.env.OPENFOUNDRY_DATA_DIR = clientDir;
process.env.OPENFOUNDRY_RESPONSE_DB_PATH = sharedPath;
process.env.OPENFOUNDRY_RESPONSE_STORE = "sqlite";

type Store = typeof import("@/lib/response-store");
let store: Store;
let server: Server;
let origin = "";
const token = "shared-store-test-token";

const items: ConversationItem[] = [
  {
    id: "m1",
    object: "conversation.item",
    type: "message",
    created_at: 1,
    status: "completed",
    role: "user",
    content: [{ type: "input_text", text: "remember the shared code 4417" }],
  },
  {
    id: "m2",
    object: "conversation.item",
    type: "message",
    created_at: 2,
    status: "completed",
    role: "assistant",
    content: [{ type: "output_text", text: "The shared code is 4417." }],
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
  server = createServer((req, res) => {
    void (async () => {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if ((req.headers.authorization || "") !== `Bearer ${token}`) {
        reply(res, 401, { error: "Unauthorized" });
        return;
      }
      if (req.method === "POST" && url.pathname === "/save") {
        const body = await readBody(req);
        if (String(body.id) === "resp_quota") {
          reply(res, 429, {
            error: "Tenant quota exceeded",
            code: "quota_exceeded",
          });
          return;
        }
        await store.saveResponseHistoryLocal(
          String(body.id),
          body.items as ConversationItem[],
          String(body.ownerId || "project")
        );
        reply(res, 200, { ok: true });
        return;
      }
      if (req.method === "POST" && url.pathname === "/prune") {
        const body = await readBody(req);
        await store.pruneResponsesLocal(
          body.ownerId ? String(body.ownerId) : undefined
        );
        reply(res, 200, { ok: true });
        return;
      }
      if (req.method === "GET" && url.pathname === "/load") {
        const response = await store.loadResponseHistoryLocal(
          url.searchParams.get("id") || "",
          url.searchParams.get("ownerId") || "project"
        );
        reply(res, 200, { response });
        return;
      }
      if (req.method === "GET" && url.pathname === "/stats") {
        reply(res, 200, await store.responseStoreStatsLocal());
        return;
      }
      if (req.method === "GET" && url.pathname === "/policy") {
        reply(res, 200, await store.getRetentionPolicyLocal());
        return;
      }
      if (req.method === "POST" && url.pathname === "/policy") {
        const body = await readBody(req);
        reply(
          res,
          200,
          await store.setRetentionPolicyLocal({
            maxResponsesPerOwner: body.maxResponsesPerOwner as number,
            ttlDays: body.ttlDays as number,
          })
        );
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
  process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = token;
  process.env.OPENFOUNDRY_RESPONSE_DB_PATH = sharedPath;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  store.closeResponseStore();
  delete process.env.OPENFOUNDRY_RESPONSE_STORE;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_URL;
  delete process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN;
});

describe("shared response store", () => {
  it("stores and loads history through the remote backend, not the client data dir", async () => {
    await store.saveResponseHistory("resp_shared", items, "user_a");
    expect(await store.loadResponseHistory("resp_shared", "user_a")).toMatchObject({
      id: "resp_shared",
      ownerId: "user_a",
      items,
    });
    expect(await store.loadResponseHistory("resp_shared", "user_b")).toBeNull();
    expect(existsSync(path.join(clientDir, "responses.db"))).toBe(false);
    expect(existsSync(sharedPath)).toBe(true);
  });

  it("shares the retention policy and prunes per owner", async () => {
    const policy = await store.setRetentionPolicy({
      maxResponsesPerOwner: 1,
      ttlDays: 30,
    });
    expect(policy).toEqual({ maxResponsesPerOwner: 1, ttlDays: 30 });
    await store.saveResponseHistory("resp_newer", items, "tenant_c");
    await store.saveResponseHistory("resp_newest", items, "tenant_c");
    await store.pruneResponses("tenant_c");
    const stats = await store.responseStoreStats();
    expect(stats.owners.find((owner) => owner.ownerId === "tenant_c")?.count).toBe(1);
    expect(await store.loadResponseHistory("resp_newest", "tenant_c")).not.toBeNull();
    expect(await store.getRetentionPolicy()).toEqual({
      maxResponsesPerOwner: 1,
      ttlDays: 30,
    });
  });

  it("preserves a quota status from the shared store", async () => {
    await expect(
      store.saveResponseHistory("resp_quota", items, "user_a")
    ).rejects.toMatchObject({
      name: "ResponseStoreQuotaError",
      statusCode: 429,
    });
  });

  it("rejects a wrong bearer token and preserves the HTTP status", async () => {
    process.env.OPENFOUNDRY_RESPONSE_STORE_TOKEN = "wrong-token";
    await expect(
      store.loadResponseHistory("resp_shared", "user_a")
    ).rejects.toMatchObject({
      name: "ResponseStoreHttpError",
      statusCode: 401,
    });
  });

  it("fails loudly when the shared URL or token is missing", async () => {
    delete process.env.OPENFOUNDRY_RESPONSE_STORE_URL;
    await expect(
      store.saveResponseHistory("resp_missing_config", items, "user_a")
    ).rejects.toThrow(/OPENFOUNDRY_RESPONSE_STORE_URL/);
  });

  it("uses a configured SQLite file outside the data directory", async () => {
    process.env.OPENFOUNDRY_RESPONSE_STORE = "sqlite";
    await store.saveResponseHistory("resp_sqlite", items, "user_sqlite");
    store.closeResponseStore();
    expect(existsSync(path.join(clientDir, "responses.db"))).toBe(false);
    expect(await store.loadResponseHistory("resp_sqlite", "user_sqlite")).toMatchObject({
      id: "resp_sqlite",
      ownerId: "user_sqlite",
    });
  });
});
