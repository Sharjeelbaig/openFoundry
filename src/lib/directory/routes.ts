// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";

/**
 * Route → action. One table, checked before any handler runs.
 *
 * The default is deny: a `/api` path that is not listed here is refused. That
 * is deliberate — forgetting to add a route closes it rather than opening it,
 * which is the opposite of what a per-file guard does.
 */

export type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export type RouteDecision =
  | { visibility: "public"; reason: string }
  | { visibility: "unmapped" }
  | { visibility: "guarded"; action: string };

interface Rule {
  pattern: RegExp;
  public?: string;
  /** Method → action. A method missing from the map is denied. */
  actions?: Partial<Record<Method, string>>;
}

const RULES: Rule[] = [
  // Authenticated by something other than a browser session.
  { pattern: /^\/api\/auth(\/.*)?$/, public: "auth endpoints authenticate themselves" },
  { pattern: /^\/api\/v1(\/.*)?$/, public: "project API key" },
  { pattern: /^\/api\/projects\/[^/]+\/openai(\/.*)?$/, public: "project API key" },
  { pattern: /^\/api\/gateway\/v1(\/.*)?$/, public: "deployment API key" },
  { pattern: /^\/api\/oauth\/callback$/, public: "provider redirect" },
  { pattern: /^\/api\/routine-events\/[^/]+$/, public: "per-routine token" },

  // Project surface.
  { pattern: /^\/api\/agents(\/[^/]+)?$/, actions: { GET: "agents.read", POST: "agents.write", PATCH: "agents.write", DELETE: "agents.write" } },
  { pattern: /^\/api\/projects\/[^/]+\/agents\/[^/]+\/versions(\/[^/]+)?$/, actions: { GET: "agents.read", POST: "agents.write", DELETE: "agents.write" } },
  { pattern: /^\/api\/batch$/, actions: { GET: "chat.use", POST: "chat.use", PATCH: "chat.use" } },
  { pattern: /^\/api\/chat$/, actions: { POST: "chat.use" } },
  { pattern: /^\/api\/connections$/, actions: { GET: "connections.read" } },
  { pattern: /^\/api\/deployments$/, actions: { GET: "models.read", POST: "models.deploy", PATCH: "models.deploy", DELETE: "models.delete" } },
  { pattern: /^\/api\/evaluations$/, actions: { GET: "evaluations.read", POST: "evaluations.write", PATCH: "evaluations.write" } },
  { pattern: /^\/api\/export$/, actions: { GET: "export.write" } },
  { pattern: /^\/api\/gateway$/, actions: { GET: "gateway.read", PATCH: "gateway.write" } },
  { pattern: /^\/api\/guardrails(\/[^/]+)?$/, actions: { GET: "guardrails.read", POST: "guardrails.write", PATCH: "guardrails.write", DELETE: "guardrails.write" } },
  { pattern: /^\/api\/http-tools(\/[^/]+)?\/call$/, actions: { POST: "tools.invoke" } },
  { pattern: /^\/api\/http-tools(\/[^/]+)?$/, actions: { GET: "tools.read", POST: "tools.write", PATCH: "tools.write", DELETE: "tools.write" } },
  { pattern: /^\/api\/mcp(\/[^/]+)?\/call$/, actions: { POST: "tools.invoke" } },
  { pattern: /^\/api\/mcp(\/[^/]+)?$/, actions: { GET: "tools.read", POST: "tools.write", PATCH: "tools.write", DELETE: "tools.write" } },
  { pattern: /^\/api\/knowledge$/, actions: { GET: "knowledge.read", POST: "knowledge.write" } },
  { pattern: /^\/api\/knowledge\/search$/, actions: { POST: "knowledge.read" } },
  { pattern: /^\/api\/memory$/, actions: { GET: "memory.read", POST: "memory.write" } },
  { pattern: /^\/api\/models$/, actions: { GET: "models.read" } },
  { pattern: /^\/api\/models\/download$/, actions: { GET: "models.read", POST: "models.download" } },
  { pattern: /^\/api\/models\/download\/[^/]+$/, actions: { GET: "models.read", DELETE: "models.download" } },
  { pattern: /^\/api\/nodes$/, actions: { GET: "runtimes.read", POST: "runtimes.write", DELETE: "runtimes.write" } },
  { pattern: /^\/api\/oauth\/start$/, actions: { POST: "connections.write" } },
  { pattern: /^\/api\/oauth\/token$/, actions: { GET: "connections.read" } },
  { pattern: /^\/api\/quota-requests$/, actions: { GET: "quota.read", POST: "quota.write", PATCH: "quota.write" } },
  { pattern: /^\/api\/routines(\/.*)?$/, actions: { GET: "routines.read", POST: "routines.write", PATCH: "routines.write", DELETE: "routines.write" } },
  { pattern: /^\/api\/settings$/, actions: { GET: "settings.read", PATCH: "settings.write" } },
  { pattern: /^\/api\/skills(\/[^/]+)?$/, actions: { GET: "skills.read", POST: "skills.write", PATCH: "skills.write", DELETE: "skills.write" } },
  { pattern: /^\/api\/system$/, actions: { GET: "system.read" } },
  { pattern: /^\/api\/toolboxes(\/[^/]+)?\/call$/, actions: { GET: "tools.invoke", POST: "tools.invoke" } },
  { pattern: /^\/api\/toolboxes(\/[^/]+)?$/, actions: { GET: "tools.read", POST: "tools.write", PATCH: "tools.write", DELETE: "tools.write" } },
  { pattern: /^\/api\/tools\/catalog(\/.*)?$/, actions: { GET: "tools.read" } },
  { pattern: /^\/api\/tools\/test$/, actions: { POST: "tools.invoke" } },
  { pattern: /^\/api\/traces$/, actions: { GET: "traces.read" } },
  { pattern: /^\/api\/workflows(\/.*)?$/, actions: { GET: "workflows.read", POST: "workflows.write", PATCH: "workflows.write", DELETE: "workflows.write" } },
  { pattern: /^\/api\/directory(\/.*)?$/, actions: { GET: "directory.read", POST: "directory.write", PATCH: "directory.write", DELETE: "directory.write" } },
];

export function resolveApiRoute(method: string, pathname: string): RouteDecision {
  const upper = method.toUpperCase() as Method;
  if (upper === ("OPTIONS" as Method)) {
    return { visibility: "public", reason: "preflight" };
  }
  for (const rule of RULES) {
    if (!rule.pattern.test(pathname)) continue;
    if (rule.public) return { visibility: "public", reason: rule.public };
    const action = rule.actions?.[upper];
    if (!action) return { visibility: "unmapped" };
    return { visibility: "guarded", action };
  }
  return { visibility: "unmapped" };
}

export const ROUTE_RULES = RULES;
