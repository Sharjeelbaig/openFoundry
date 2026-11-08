// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest } from "next/server";
import { afterEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/route";
import { updateBootState } from "@/lib/boot-state";

const URL = "http://127.0.0.1:31337/api/health";

function request(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(URL, {
    headers: { host: "127.0.0.1:31337", ...headers },
  });
}

afterEach(() => {
  updateBootState({ ready: false, machineKeyReady: false, error: null });
});

describe("GET /api/health", () => {
  it("answers 503 while the server is still booting", async () => {
    const res = await GET(request());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.boot.ready).toBe(false);
    expect(body.boot.error).toBeNull();
  });

  it("carries the boot error on the 503 the shell waits on", async () => {
    updateBootState({ error: "machine key creation failed" });
    const res = await GET(request());
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.boot.error).toBe("machine key creation failed");
  });

  it("answers 200 once boot is ready", async () => {
    updateBootState({ ready: true, machineKeyReady: true });
    const res = await GET(request());
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.boot.ready).toBe(true);
    expect(body.boot.machineKeyReady).toBe(true);
    expect(body.pid).toBe(process.pid);
  });

  it("refuses a request forwarded from another host", async () => {
    updateBootState({ ready: true, machineKeyReady: true });
    const res = await GET(request({ "x-forwarded-for": "203.0.113.9" }));
    expect(res.status).toBe(403);
  });

  it("refuses when the host header is not loopback", async () => {
    const res = await GET(
      new NextRequest(URL, { headers: { host: "openfoundry.example" } })
    );
    expect(res.status).toBe(403);
  });
});