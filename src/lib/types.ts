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
  nodes?: RuntimeNode[];
}

export type DeploymentStatus = "Running" | "Creating" | "Stopped" | "Failed";
export type DeploymentKind = "Serverless" | "Managed compute" | "Adapter";

/** How a deployed model serves requests. Real local behaviour. */
export type ServingMode =
  | "Standard"
  | "Provisioned"
  | "Batch"
  | "Developer"
  | "Instant"
  | "Dedicated";

/** Where requests are routed. Routing is real; residency is simulated. */
export type DeploymentScope = "Global" | "Data Zone" | "Region" | "Device";

/** Azure data zone the deployment is pinned to when scope is "Data Zone". */
export type DataZone = "US" | "EU" | "APAC";

export interface Deployment {
  id: string;
  name: string;
  modelId: string;
  modelName: string;
  provider: ProviderId;
  providerLabel: string;
  status: DeploymentStatus;
  /** Section in Build → Models (Serverless / Managed compute / Adapter). */
  kind: DeploymentKind;
  /** Deployment type label, exactly as Microsoft Foundry shows it (e.g. "Global Standard"). */
  sku: string;
  capacity: number;
  endpoint: string;
  apiKey: string;
  createdAt: string;
  updatedAt: string;
  requests: number;
  tokens: number;
  /** Real serving behaviour, derived from the deployment type. */
  servingMode?: ServingMode;
  /** Routing scope, derived from the deployment type. */
  scope?: DeploymentScope;
  /** Data zone for Data Zone scopes (US / EU / APAC). */
  zone?: DataZone;
  /** Runtime node that serves this deployment. */
  nodeId?: string;
  /** Human-readable region label (Azure region name, or "On device"). */
  region?: string;
  /** Tokens-per-minute rate limit for token-based deployments. */
  tpm?: number;
  /** Reserved concurrency slots for provisioned / dedicated deployments. */
  reservedSlots?: number;
  /** Model version pinned at deploy time. */
  modelVersion?: string;
  /** Whether the platform may move the deployment to a newer model version. */
  autoUpdate?: boolean;
  /** Free-form description, mirroring Foundry's dialog field. */
  description?: string;
  /** Guardrail policy applied to requests. */
  guardrails?: "Default" | "Strict" | "Off";
}

/**
 * A concrete runtime endpoint on this machine that can serve models. Nodes carry
 * a region/zone label so a deployment can be pinned to a genuinely separate
 * process (a second Ollama daemon, a Docker container, a remote server).
 */
export interface RuntimeNode {
  id: string;
  name: string;
  provider: ProviderId;
  baseUrl: string;
  /** Azure-style region label, e.g. "East US" or "On device". */
  region: string;
  /** Data zone the node belongs to. */
  zone: DataZone | "Device";
  /** True when openFoundry started this runtime and can stop it. */
  managed: boolean;
  status: "Online" | "Offline" | "Starting";
  /** Isolated model store for managed nodes. */
  modelDir?: string;
  pid?: number;
  lastSeenAt?: string;
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

/** A function call the model asked for, in OpenAI wire format. */
export interface WireToolCall {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

/**
 * Chat message in the OpenAI wire format. Unlike ChatMessage this can carry the
 * tool turns: an assistant message that requested calls, and the tool replies.
 */
export interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: WireToolCall[];
  tool_call_id?: string;
}

/** A function declaration handed to the model. */
export interface ChatTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
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
