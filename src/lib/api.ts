import { Channel, invoke } from "@tauri-apps/api/core";
import type {
  Agent,
  AppData,
  ChatEvent,
  ChatRequest,
  ProviderConfig,
  ProviderStatus,
  Settings,
} from "./types";

export function loadApp(): Promise<AppData> {
  return invoke<AppData>("load_app");
}

export function saveSettings(settings: Settings): Promise<Settings> {
  return invoke<Settings>("save_settings", { settings });
}

export function detectProviders(
  providers?: ProviderConfig[]
): Promise<ProviderStatus[]> {
  return invoke<ProviderStatus[]>("detect_providers", { providers });
}

export function saveAgent(agent: Agent): Promise<Agent> {
  return invoke<Agent>("save_agent", { agent });
}

export function deleteAgent(id: string): Promise<void> {
  return invoke("delete_agent", { id });
}

export function dataDirectory(): Promise<string> {
  return invoke<string>("app_data_dir");
}

export function appVersion(): Promise<string> {
  return invoke<string>("app_version");
}

export async function streamChat(
  request: ChatRequest,
  onEvent: (event: ChatEvent) => void
): Promise<void> {
  const channel = new Channel<ChatEvent>();
  channel.onmessage = onEvent;
  await invoke("chat_stream", { request, onEvent: channel });
}
