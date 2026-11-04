// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { randomUUID } from "crypto";
import { getSettings, nowIso } from "../store";
import { ROOT_SCOPE } from "./can";
import { ROLE_READER, roleByName } from "./roles";
import { DIRECTORY_VERSION, emptyDirectory, type Assignment, type Directory, type Principal } from "./types";

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/**
 * First boot after this feature lands: `settings.users` was a decorative list.
 * Every row becomes a real principal with a real role, and the permissions
 * that come with it. Nobody has a credential afterwards; the desktop signs
 * the local user in, and an Owner issues codes for everyone else.
 */
export async function migrateFromSettings(): Promise<Directory> {
  const settings = await getSettings();
  if (!settings.users?.length) return emptyDirectory();

  const local = settings.userEmail.trim().toLowerCase();
  const directory: Directory = {
    ...emptyDirectory(),
    version: DIRECTORY_VERSION,
  };

  for (const user of settings.users) {
    // The seeded row is this computer's own identity, not a person somebody
    // added. It is claimed by the machine credential (or the setup token),
    // never migrated as an existing account.
    if (user.role === "Owner" && user.email.trim().toLowerCase() === local) {
      continue;
    }
    const principal: Principal = {
      id: `usr_${randomUUID().slice(0, 8)}`,
      kind: "user",
      name: user.name,
      email: user.email.toLowerCase(),
      initials: initialsFor(user.name),
      createdAt: user.addedAt || nowIso(),
    };
    directory.principals.push(principal);

    const role = roleByName(user.role) ?? roleByName("Reader") ?? { id: ROLE_READER };
    const assignment: Assignment = {
      id: `asg_${randomUUID().slice(0, 8)}`,
      principalId: principal.id,
      roleId: role.id,
      scope: ROOT_SCOPE,
      createdAt: nowIso(),
      createdBy: "system",
    };
    directory.assignments.push(assignment);
  }

  return directory;
}
