export type ProviderId = "foundry" | "ollama" | "lmstudio" | "llamacpp" | "huggingface";

export type ModelTask =
  | "chat"
  | "embedding"
  | "vision"
  | "speech"
  | "image"
  | "other";

export interface LocalModel {
  /** Unique provider-scoped id. */
  key: string;
  id: string;
  name: string;
  displayName: string;
  provider: ProviderId;
  providerLabel: string;
  publisher: string;
  task: ModelTask;
  contextWindow?: number;
  sizeBytes?: number;
  /** downloaded / ready to serve without fetching anything */
  cached: boolean;
  loaded?: boolean;
  version?: string;
  license?: string;
  description?: string;
  tags?: string[];
}

export type DownloadStatus =
  | "queued"
  | "running"
  | "complete"
  | "error"
  | "cancelled";

export interface DownloadJob {
  id: string;
  modelKey: string;
  modelId: string;
  modelName: string;
  provider: ProviderId;
  providerLabel: string;
  publisher: string;
  status: DownloadStatus;
  /** 0–100. Stays at 0 while the runtime has not reported a percentage yet. */
  progress: number;
  message: string;
  bytesDownloaded?: number;
  bytesTotal?: number;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
  logs: string[];
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  online: boolean;
  url?: string;
  detail: string;
  modelCount: number;
  cachedCount: number;
  latencyMs?: number;
}

export interface DeploymentsResponse {
  deployments: Deployment[];
  providers: ProviderStatus[];
}

export type DeploymentStatus = "Running" | "Creating" | "Stopped" | "Failed";
export type DeploymentKind = "Serverless" | "Managed compute" | "Adapter";

export interface Deployment {
  id: string;
  name: string;
  modelId: string;
  modelName: string;
  provider: ProviderId;
  providerLabel: string;
  status: DeploymentStatus;
  kind: DeploymentKind;
  sku: string;
  capacity: number;
  endpoint: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  requests: number;
  tokens: number;
}

export type AgentStatus = "Running" | "Stopped" | "Draft";

export interface AgentVersion {
  version: number;
  savedAt: string;
  model: string;
  instructions: string;
}

export interface Agent {
  id: string;
  name: string;
  description: string;
  model: string;
  provider: ProviderId;
  instructions: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  voiceMode: boolean;
  memoryEnabled?: boolean;
  guardrail?: "Default" | "Strict" | "Off";
  tools: string[];
  knowledgeBaseIds: string[];
  status: AgentStatus;
  version: number;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
  lastViewedAt: string;
  endpoint: string;
  apiKey: string;
  history: AgentVersion[];
}

export interface KnowledgeDocument {
  id: string;
  name: string;
  size: number;
  type: string;
  text: string;
  chunks: string[];
  embeddings?: number[][];
  addedAt: string;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  indexName: string;
  embeddingModel: string;
  embeddingProvider: ProviderId | "lexical";
  status: "Ready" | "Indexing" | "Failed";
  documents: KnowledgeDocument[];
  createdAt: string;
  updatedAt: string;
}

export interface Citation {
  documentId: string;
  documentName: string;
  chunk: string;
  score: number;
}

export interface Trace {
  id: string;
  agentId: string;
  agentName: string;
  prompt: string;
  response: string;
  model: string;
  provider: ProviderId;
  latencyMs: number;
  promptTokens: number;
  completionTokens: number;
  citations: Citation[];
  at: string;
  error?: string;
}

export interface Routine {
  id: string;
  name: string;
  agentId: string;
  prompt: string;
  intervalMinutes: number;
  enabled: boolean;
  createdAt: string;
  lastRunAt?: string;
  nextRunAt: string;
  lastResult?: string;
}

export interface WorkflowStep {
  agentId: string;
  prompt: string;
}

export interface WorkflowRun {
  at: string;
  output: string[];
  error?: string;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  steps: WorkflowStep[];
  createdAt: string;
  lastRunAt?: string;
  runs: WorkflowRun[];
}

export interface BatchJob {
  id: string;
  name: string;
  deploymentId: string;
  deploymentName: string;
  status: "Running" | "Completed" | "Failed";
  createdAt: string;
  updatedAt?: string;
  prompts: string[];
  results: {
    prompt: string;
    response: string;
    promptTokens: number;
    completionTokens: number;
  }[];
}

export interface EvaluationResult {
  prompt: string;
  response: string;
  latencyMs: number;
  ok: boolean;
  citations: number;
  refused?: boolean;
}

export interface EvaluationRun {
  id: string;
  name: string;
  type: "evaluation" | "redteam";
  targetKind: "agent" | "deployment";
  targetId: string;
  targetName: string;
  model: string;
  provider: ProviderId;
  createdAt: string;
  results: EvaluationResult[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface QuotaRequest {
  id: string;
  requestedInstances: number;
  reason: string;
  status: "Recorded" | "Fulfilled" | "Declined";
  createdAt: string;
}

export interface GatewayRoute {
  id: string;
  name: string;
  deploymentId: string;
  enabled: boolean;
}

export interface GatewayConfig {
  enabled: boolean;
  defaultDeploymentId: string;
  rateLimitPerMinute: number;
  cacheEnabled: boolean;
  cacheTtlSeconds: number;
  routes: GatewayRoute[];
  updatedAt: string;
}

export type ProjectRole = "Owner" | "Contributor" | "Reader";

export interface ProjectUser {
  id: string;
  name: string;
  email: string;
  role: ProjectRole;
  accessType: "Direct access" | "Inherited access";
  addedAt: string;
}

export interface LocalSettings {
  disclaimerDismissed: boolean;
  onboarded: boolean;
  termsAccepted: boolean;
  initialized: boolean;
  projectName: string;
  userName: string;
  userEmail: string;
  userInitials: string;
  region: string;
  createdAt: string;
  projectId: string;
  tenantId: string;
  subscriptionId: string;
  subscriptionName: string;
  resourceName: string;
  resourceGroup: string;
  location: string;
  resourceCreatedAt: string;
  apiKey: string;
  users: ProjectUser[];
  foundryUrl: string;
  ollamaUrl: string;
  lmStudioUrl: string;
  llamaCppUrl: string;
  huggingFacePath: string;
  defaultProviderId: string;
  defaultModel: string;
}

export interface SystemStats {
  now: string;
  hostname: string;
  platform: string;
  release: string;
  cpuModel: string;
  cpuCount: number;
  totalMem: number;
  freeMem: number;
  loadAvg: number[];
  uptime: number;
  disk: { total: number; free: number };
  node: string;
  agents: number;
  deployments: number;
  knowledgeBases: number;
  traces: number;
  tokens: number;
}
