/**
 * Authorization: can this principal take this action at this scope?
 *
 * The whole rule set is: collect the roles assigned at or above the scope,
 * union their actions, and see whether the action is granted. No deny rules,
 * no conditions, no implicit grants.
 */

import { describeAccess, grants, rankOf, roleById } from "./roles";
import type { Directory } from "./types";

export const ROOT_SCOPE = "/";

export function projectScope(projectId: string): string {
  return `/projects/${projectId}`;
}

/** True when `parent` covers `child` ("/" covers everything). */
export function scopeContains(parent: string, child: string): boolean {
  if (parent === ROOT_SCOPE) return true;
  if (parent === child) return true;
  const prefix = parent.endsWith("/") ? parent : `${parent}/`;
  return child.startsWith(prefix);
}

export type DecisionReason =
  | "granted"
  | "no_grant"
  | "no_principal"
  | "disabled";

export interface Decision {
  allowed: boolean;
  reason: DecisionReason;
}

export function effectiveActions(
  directory: Directory,
  principalId: string,
  scope: string
): Set<string> {
  const actions = new Set<string>();
  for (const assignment of directory.assignments) {
    if (assignment.principalId !== principalId) continue;
    if (!scopeContains(assignment.scope, scope)) continue;
    const role = roleById(assignment.roleId);
    if (!role) continue;
    for (const action of role.actions) actions.add(action);
  }
  return actions;
}

export function can(
  directory: Directory,
  principalId: string,
  action: string,
  scope: string = ROOT_SCOPE
): Decision {
  const principal = directory.principals.find((item) => item.id === principalId);
  if (!principal) return { allowed: false, reason: "no_principal" };
  if (principal.disabledAt) return { allowed: false, reason: "disabled" };
  const actions = effectiveActions(directory, principalId, scope);
  return grants(actions, action)
    ? { allowed: true, reason: "granted" }
    : { allowed: false, reason: "no_grant" };
}

/** The role name and access sentence shown in `My permission`. */
export function summaryFor(
  directory: Directory,
  principalId: string,
  scope: string
): { roleName: string; access: string; actions: Set<string> } {
  const actions = effectiveActions(directory, principalId, scope);
  let best: { name: string; rank: number } | undefined;
  for (const assignment of directory.assignments) {
    if (assignment.principalId !== principalId) continue;
    if (!scopeContains(assignment.scope, scope)) continue;
    const role = roleById(assignment.roleId);
    if (!role) continue;
    const rank = rankOf(role.id);
    if (!best || rank > best.rank) best = { name: role.name, rank };
  }
  return {
    roleName: best?.name ?? "No role",
    access: describeAccess(actions),
    actions,
  };
}

/** How many principals can still change access. Used by the last-owner rule. */
export function accessControllerCount(directory: Directory): number {
  return directory.principals.filter(
    (principal) =>
      !principal.disabledAt &&
      can(directory, principal.id, "directory.write", ROOT_SCOPE).allowed
  ).length;
}
