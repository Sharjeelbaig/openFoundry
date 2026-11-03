import "server-only";
import { getSettings } from "../store";
import { projectScope, ROOT_SCOPE } from "./can";

/**
 * Installation-level things are checked at the root; everything else belongs
 * to the project. This is the only place that decision is made.
 */
export async function scopeForAction(action: string): Promise<string> {
  if (action.startsWith("directory.") || action.startsWith("settings.")) {
    return ROOT_SCOPE;
  }
  const settings = await getSettings();
  return projectScope(settings.projectId);
}
