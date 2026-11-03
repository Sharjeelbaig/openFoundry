/**
 * The role vocabulary and the actions it grants.
 *
 * A role is a name plus a list of actions. Everything the product claims about
 * a role is derived from that list, so the words in the UI cannot drift from
 * what the guard checks.
 */

import type { RoleDefinition } from "./types";

/** Every resource, and the actions that can be taken on it. */
export const ACTION_CATALOGUE: Record<string, string[]> = {
  project: ["project.read"],
  models: ["models.read", "models.download", "models.deploy", "models.delete", "models.invoke"],
  agents: ["agents.read", "agents.write", "agents.invoke"],
  knowledge: ["knowledge.read", "knowledge.write"],
  tools: ["tools.read", "tools.write", "tools.invoke"],
  workflows: ["workflows.read", "workflows.write"],
  routines: ["routines.read", "routines.write"],
  evaluations: ["evaluations.read", "evaluations.write"],
  guardrails: ["guardrails.read", "guardrails.write"],
  memory: ["memory.read", "memory.write"],
  gateway: ["gateway.read", "gateway.write"],
  connections: ["connections.read", "connections.write"],
  runtimes: ["runtimes.read", "runtimes.write"],
  quota: ["quota.read", "quota.write"],
  skills: ["skills.read", "skills.write"],
  traces: ["traces.read"],
  export: ["export.write"],
  system: ["system.read"],
  chat: ["chat.use"],
  settings: ["settings.read", "settings.write"],
  directory: ["directory.read", "directory.write"],
};

export const ALL_ACTIONS: string[] = Object.values(ACTION_CATALOGUE).flat();

export const ROLE_OWNER = "role_owner";
export const ROLE_CONTRIBUTOR = "role_contributor";
export const ROLE_FOUNDRY_USER = "role_foundry_user";
export const ROLE_READER = "role_reader";

/** Highest privilege first. Used when a person holds more than one role. */
export const ROLE_ORDER = [
  ROLE_OWNER,
  ROLE_CONTRIBUTOR,
  ROLE_FOUNDRY_USER,
  ROLE_READER,
] as const;

const CONTRIBUTOR_ACTIONS = ALL_ACTIONS.filter(
  (action) => !action.startsWith("directory.") && action !== "settings.write"
);

const FOUNDRY_USER_ACTIONS = [
  "*.read",
  "models.invoke",
  "agents.invoke",
  "tools.invoke",
  "chat.use",
];

export const ROLES: RoleDefinition[] = [
  {
    id: ROLE_OWNER,
    name: "Owner",
    description:
      "Full access to this install, including people, access codes and role assignments.",
    actions: ["*"],
    builtIn: true,
  },
  {
    id: ROLE_CONTRIBUTOR,
    name: "Contributor",
    description:
      "Create and manage models, agents, knowledge, tools and connections. Cannot change access or project identity.",
    actions: CONTRIBUTOR_ACTIONS,
    builtIn: true,
  },
  {
    id: ROLE_FOUNDRY_USER,
    name: "Foundry User",
    description:
      "Use models and agents and read the project. Cannot create or change anything.",
    actions: FOUNDRY_USER_ACTIONS,
    builtIn: true,
  },
  {
    id: ROLE_READER,
    name: "Reader",
    description: "View the project and its resources. Cannot run models or agents.",
    actions: ["*.read"],
    builtIn: true,
  },
];

export function roleById(id: string): RoleDefinition | undefined {
  return ROLES.find((role) => role.id === id);
}

export function roleByName(name: string): RoleDefinition | undefined {
  return ROLES.find((role) => role.name.toLowerCase() === name.toLowerCase());
}

export function rankOf(roleId: string): number {
  const index = ROLE_ORDER.indexOf(roleId as (typeof ROLE_ORDER)[number]);
  return index === -1 ? -1 : ROLE_ORDER.length - index;
}

/** Does an action list grant this exact action? Handles `*`, `*.read`, `models.*`. */
export function grants(actions: Iterable<string>, action: string): boolean {
  const dot = action.indexOf(".");
  const resource = dot === -1 ? action : action.slice(0, dot);
  for (const granted of actions) {
    if (granted === "*" || granted === action) return true;
    if (granted.endsWith(".*") && granted.slice(0, -2) === resource) return true;
    if (granted.startsWith("*.") && action.endsWith(granted.slice(1))) return true;
  }
  return false;
}

/**
 * A human sentence for an effective action set. Computed, never authored per
 * role — `My permission` must follow the guard, not the other way round.
 */
export function describeAccess(actions: Iterable<string>): string {
  const set = new Set(actions);
  const granted = ALL_ACTIONS.filter((action) => grants(set, action));
  if (granted.length === 0) return "No access";
  if (granted.length === ALL_ACTIONS.length) return "Full access";
  const denied = ALL_ACTIONS.filter((action) => !grants(set, action));
  if (
    denied.every(
      (action) => action.startsWith("directory.") || action === "settings.write"
    )
  )
    return "Full access except access control";
  if (granted.every((action) => action.endsWith(".read"))) return "Read-only access";
  const canChange = granted.some((action) =>
    /\.(write|deploy|download|delete)$/.test(action)
  );
  if (!canChange) return "Read and use";
  return "Custom access";
}

/** Resource name and its actions, for the role detail pane. */
export function actionsByResource(actions: Iterable<string>): { resource: string; actions: string[] }[] {
  const set = new Set(actions);
  return Object.entries(ACTION_CATALOGUE)
    .map(([resource, list]) => ({
      resource,
      actions: list.filter((action) => grants(set, action)),
    }))
    .filter((entry) => entry.actions.length > 0);
}
