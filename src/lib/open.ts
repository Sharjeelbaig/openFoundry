import { openPath, openUrl } from "@tauri-apps/plugin-opener";

export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

export async function openFolder(path: string): Promise<void> {
  await openPath(path);
}
