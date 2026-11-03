import "server-only";
import { getSettings } from "../store";
import { projectScope, ROOT_SCOPE } from "./can";

/**
 * Everything is checked at the project, except writing the install's own
 * settings. Root-scope access control is checked inside the routes that can
 * actually change it, because the same route serves both scopes.
 */
export async function scopeForAction(action: string): Promise<string> {
  const settings = await getSettings();
  if (action === "settings.write") return ROOT_SCOPE;
  return projectScope(settings.projectId);
}
