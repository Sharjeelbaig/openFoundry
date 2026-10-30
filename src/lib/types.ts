export type ProviderKind = "ollama" | "openai" | "huggingface";

export interface ProviderConfig {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  custom: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  providerId: string;
  providerLabel: string;
  publisher: string;
  sizeBytes?: number;
  contextWindow?: number;
  kind: string;
}

export interface ProviderStatus {
  id: string;
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  enabled: boolean;
  online: boolean;
  latencyMs?: number;
  models: ModelInfo[];
  error?: string;
}

export interface Settings {
  onboarded: boolean;
  termsAccepted: boolean;
  displayName: string;
  initials: string;
  workspaceName: string;
  apiKey: string;
  providers: ProviderConfig[];
  defaultProvider: string;
  defaultModel: string;
  createdAt: string;
}

export interface Agent {
  id: string;
  name: string;
  instructions: string;
  model: string;
  providerId: string;
  providerLabel: string;
  createdAt: string;
  updatedAt: string;
}

export interface AppData {
  settings: Settings;
  agents: Agent[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  providerId: string;
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export type ChatEvent =
  | { type: "delta"; text: string }
  | { type: "done"; promptTokens: number; completionTokens: number }
  | { type: "error"; message: string };
