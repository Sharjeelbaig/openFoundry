// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { can, projectScope, ROOT_SCOPE } from "./can";
import { currentSession } from "./server";
import { getSettings } from "../store";

/**
 * Whether the caller may see or use a secret tied to this action. Keys are
 * read-gated by default; a Reader must not be able to read a key and then call
 * the API it unlocks.
 */
export async function may(action: string): Promise<boolean> {
  const session = await currentSession();
  if (!session) return false;
  if (action === "settings.write") {
    return can(session.directory, session.principal.id, action, ROOT_SCOPE).allowed;
  }
  const settings = await getSettings();
  return can(
    session.directory,
    session.principal.id,
    action,
    projectScope(settings.projectId)
  ).allowed;
}

/** Replaces a secret with an empty string when the caller may not use it. */
export function hideSecret<T extends Record<string, unknown>>(
  row: T,
  field: keyof T,
  allowed: boolean
): T {
  if (allowed) return row;
  return { ...row, [field]: "" };
}
