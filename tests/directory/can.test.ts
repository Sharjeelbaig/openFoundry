// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  can,
  effectiveActions,
  projectScope,
  ROOT_SCOPE,
  scopeContains,
  summaryFor,
} from "@/lib/directory/can";
import {
  ROLE_CONTRIBUTOR,
  ROLE_FOUNDRY_USER,
  ROLE_OWNER,
  ROLE_READER,
  describeAccess,
  roleById,
} from "@/lib/directory/roles";
import type { Directory, RoleDefinition } from "@/lib/directory/types";
import { DIRECTORY_VERSION } from "@/lib/directory/types";

function directoryWith(
  roles: string[],
  scope: string = ROOT_SCOPE,
  disabled = false
): Directory {
  return {
    version: DIRECTORY_VERSION,
    principals: [
      {
        id: "usr_test",
        kind: "user",
        name: "Test Person",
        email: "test@example.com",
        initials: "TP",
        createdAt: "2026-01-01T00:00:00.000Z",
        disabledAt: disabled ? "2026-01-02T00:00:00.000Z" : undefined,
      },
    ],
    credentials: [],
    assignments: roles.map((roleId, index) => ({
      id: `asg_${index}`,
      principalId: "usr_test",
      roleId,
      scope,
      createdAt: "2026-01-01T00:00:00.000Z",
      createdBy: "usr_test",
    })),
    sessions: [],
  };
}

const project = projectScope("proj-1");

describe("scopeContains", () => {
  it("root covers everything", () => {
    expect(scopeContains(ROOT_SCOPE, project)).toBe(true);
    expect(scopeContains(ROOT_SCOPE, ROOT_SCOPE)).toBe(true);
  });

  it("a project does not cover the install", () => {
    expect(scopeContains(project, ROOT_SCOPE)).toBe(false);
    expect(scopeContains(project, project)).toBe(true);
    expect(scopeContains(project, `${project}/deployments/x`)).toBe(true);
  });

  it("is not fooled by a shared prefix", () => {
    expect(scopeContains("/projects/abc", "/projects/abcd")).toBe(false);
  });
});

describe("can()", () => {
  it("grants everything to Owner", () => {
    const directory = directoryWith([ROLE_OWNER]);
    expect(can(directory, "usr_test", "directory.write").allowed).toBe(true);
    expect(can(directory, "usr_test", "models.invoke", project).allowed).toBe(true);
  });

  it("lets a Reader read and nothing else", () => {
    const directory = directoryWith([ROLE_READER]);
    expect(can(directory, "usr_test", "models.read").allowed).toBe(true);
    expect(can(directory, "usr_test", "models.invoke").allowed).toBe(false);
    expect(can(directory, "usr_test", "models.write").allowed).toBe(false);
  });

  it("lets a Foundry User run models but not change them", () => {
    const directory = directoryWith([ROLE_FOUNDRY_USER]);
    expect(can(directory, "usr_test", "models.invoke").allowed).toBe(true);
    expect(can(directory, "usr_test", "agents.invoke").allowed).toBe(true);
    expect(can(directory, "usr_test", "models.deploy").allowed).toBe(false);
  });

  it("keeps access control away from a Contributor", () => {
    const directory = directoryWith([ROLE_CONTRIBUTOR]);
    expect(can(directory, "usr_test", "models.deploy").allowed).toBe(true);
    expect(can(directory, "usr_test", "settings.write").allowed).toBe(false);
    expect(can(directory, "usr_test", "directory.write").allowed).toBe(false);
  });

  it("applies a project grant to the project only", () => {
    const directory = directoryWith([ROLE_READER], project);
    expect(can(directory, "usr_test", "models.read", project).allowed).toBe(true);
    expect(can(directory, "usr_test", "models.read", ROOT_SCOPE).allowed).toBe(false);
  });

  it("applies a root grant everywhere", () => {
    const directory = directoryWith([ROLE_READER], ROOT_SCOPE);
    expect(can(directory, "usr_test", "models.read", project).allowed).toBe(true);
  });

  it("unions roles held at the same scope", () => {
    const directory = directoryWith([ROLE_READER, ROLE_FOUNDRY_USER], project);
    expect(can(directory, "usr_test", "models.read", project).allowed).toBe(true);
    expect(can(directory, "usr_test", "models.invoke", project).allowed).toBe(true);
  });

  it("refuses a disabled principal", () => {
    const directory = directoryWith([ROLE_OWNER], ROOT_SCOPE, true);
    expect(can(directory, "usr_test", "models.read").allowed).toBe(false);
  });

  it("refuses an unknown principal", () => {
    const directory = directoryWith([ROLE_OWNER]);
    expect(can(directory, "usr_nobody", "models.read").reason).toBe("no_principal");
  });

  it("does not let a read grant imply a write", () => {
    const directory = directoryWith([ROLE_READER]);
    expect(can(directory, "usr_test", "models.write").allowed).toBe(false);
    const actions = effectiveActions(directory, "usr_test", ROOT_SCOPE);
    expect(actions.has("*.read")).toBe(true);
  });
});

describe("summaryFor", () => {
  it("names the highest role held", () => {
    const directory = directoryWith([ROLE_READER, ROLE_FOUNDRY_USER], project);
    expect(summaryFor(directory, "usr_test", project).roleName).toBe("Foundry User");
    expect(summaryFor(directory, "usr_test", project).access).toBe("Read and use");
  });

  it("says so when there is no role", () => {
    const directory = directoryWith([], project);
    expect(summaryFor(directory, "usr_test", project).roleName).toBe("No role");
    expect(summaryFor(directory, "usr_test", project).access).toBe("No access");
  });
});

describe("describeAccess", () => {
  const actionsOf = (roleId: string): string[] => {
    const role = roleById(roleId) as RoleDefinition;
    // Wildcards need expanding against the catalogue.
    return role.actions;
  };

  it("describes each built-in role from its actions", () => {
    expect(describeAccess(actionsOf(ROLE_OWNER))).toBe("Full access");
    expect(describeAccess(actionsOf(ROLE_CONTRIBUTOR))).toBe(
      "Full access except access control"
    );
    expect(describeAccess(actionsOf(ROLE_FOUNDRY_USER))).toBe("Read and use");
    expect(describeAccess(actionsOf(ROLE_READER))).toBe("Read-only access");
  });
});
