// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { readFileSync, readdirSync, statSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { resolveApiRoute } from "@/lib/directory/routes";

const API_ROOT = path.resolve(process.cwd(), "src/app/api");
const METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

function routePaths(): { file: string; url: string; methods: string[] }[] {
  return walk(API_ROOT)
    .filter((file) => file.endsWith("/route.ts"))
    .map((file) => {
      const relative = path.relative(path.resolve(process.cwd(), "src/app"), file);
      const url = `/${relative.replace(/\/route\.ts$/, "").replace(/\[[^\]]+\]/g, "sample")}`;
      const source = readFileSync(file, "utf8");
      const methods = METHODS.filter((method) =>
        new RegExp(`^export (async )?function ${method}\\b`, "m").test(source)
      );
      return { file, url, methods };
    });
}

describe("route table", () => {
  const routes = routePaths();

  it("found the route files", () => {
    expect(routes.length).toBeGreaterThan(40);
  });

  it("maps every route method, or marks it public on purpose", () => {
    const missing: string[] = [];
    for (const route of routes) {
      for (const method of route.methods) {
        const decision = resolveApiRoute(method, route.url);
        if (decision.visibility === "unmapped") {
          missing.push(`${method} ${route.url}`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it("denies anything it does not know", () => {
    expect(resolveApiRoute("GET", "/api/whatever").visibility).toBe("unmapped");
    expect(resolveApiRoute("POST", "/api/models").visibility).toBe("unmapped");
  });

  it("does not let a read method through as a write", () => {
    const read = resolveApiRoute("GET", "/api/deployments");
    const write = resolveApiRoute("POST", "/api/deployments");
    expect(read).toEqual({ visibility: "guarded", action: "models.read" });
    expect(write).toEqual({ visibility: "guarded", action: "models.deploy" });
  });

  it("keeps the API-key surfaces out of the session check", () => {
    expect(resolveApiRoute("POST", "/api/v1/chat/completions").visibility).toBe("public");
    expect(resolveApiRoute("GET", "/api/v1/models").visibility).toBe("public");
    expect(
      resolveApiRoute("POST", "/api/projects/sample/openai/v1/chat/completions")
        .visibility
    ).toBe("public");
    // The Azure AI Projects SDK authenticates agent versions with the project
    // key, not a browser session.
    expect(
      resolveApiRoute("POST", "/api/projects/sample/agents/demo/versions")
        .visibility
    ).toBe("public");
    expect(
      resolveApiRoute("GET", "/api/projects/sample/agents/demo/versions/1")
        .visibility
    ).toBe("public");
    expect(resolveApiRoute("POST", "/api/auth/sign-in").visibility).toBe("public");
  });

  it("guards the directory itself", () => {
    expect(resolveApiRoute("GET", "/api/directory/assignments")).toEqual({
      visibility: "guarded",
      action: "directory.read",
    });
    expect(resolveApiRoute("POST", "/api/directory/assignments")).toEqual({
      visibility: "guarded",
      action: "directory.write",
    });
  });
});
