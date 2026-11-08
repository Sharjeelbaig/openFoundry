// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

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

/** A local inference runtime openFoundry can detect, install and control. */
export type RuntimeId = "llamacpp" | "ollama" | "lmstudio" | "foundry";

export type RuntimeState =
  | "running"
  | "stopped"
  | "missing"
  | "installing"
  | "error";

export interface RuntimeStatus {
  id: RuntimeId;
  label: string;
  state: RuntimeState;
  /** Installed and managed by openFoundry, not by the user or another app. */
  managed: boolean;
  url: string;
  detail: string;
  modelCount: number;
  /** One-click install is available on this platform. */
  installable: boolean;
  /** Where to get it when one-click install is not available. */
  installUrl: string;
  version?: string;
  jobId?: string;
}

export type RuntimeJobStage = "runtime" | "extract" | "model" | "start" | "done";

export interface RuntimeJob {
  id: string;
  runtime: RuntimeId;
  status: DownloadStatus;
  stage: RuntimeJobStage;
  /** 0–100 across the whole install, not just the current download. */
  progress: number;
  message: string;
  bytesDownloaded: number;
  bytesTotal: number;
  startedAt: string;
  updatedAt: string;
  finishedAt?: string;
  error?: string;
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
  /**
   * Full configuration snapshot, so a stored version can be rolled back to its
   * tools, knowledge, memory and guardrail as well as its prompt (OS-25).
   * Optional so entries written before the snapshot existed stay valid.
   */
  provider?: ProviderId;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  voiceMode?: boolean;
  memoryEnabled?: boolean;
  memoryStoreId?: string;
  guardrail?: "Default" | "Strict" | "Off";
  guardrailId?: string;
  tools?: string[];
  knowledgeBaseIds?: string[];
}

export type ToolCatalogType = "Custom" | "Remote MCP" | "Local MCP" | "Skills";

/**
 * One entry in the local tool catalog. The entry is metadata only; the
 * `availability` field decides which local action the UI offers.
 */
export interface ToolCatalogEntry {
  id: string;
  /** URL-safe identifier for the full detail page. */
  slug: string;
  name: string;
  /** Catalog creation date, when the reference published one. */
  releaseDate?: string;
  /** Short plain-text summary for cards and drawers. */
  summary: string;
  /** Full catalog description; for skills this is the instruction pack. */
  description: string;
  /** Full skill instructions, applied to an agent prompt. */
  instructions?: string;
  type: ToolCatalogType;
  kind: string;
  /** Actual publisher company derived from the catalog metadata. */
  company: string;
  category?: string | null;
  categories: string[];
  auth: string[];
  tags: string[];
  icon?: string | null;
  connector?: string | null;
  remoteUrl?: string | null;
  remoteTransport?: string | null;
  preview?: boolean;
  docs: { title: string; url: string }[];
  availability: "local-skill" | "mcp" | "mcp-local" | "http";
}

export interface ToolSetupField {
  name: string;
  label: string;
  description: string;
  required: boolean;
  secret: boolean;
  type: "text" | "password" | "select";
  options: string[];
  placeholder: string;
}

export interface ToolSetupOAuth {
  authorizationUrl?: string | null;
  tokenUrl?: string | null;
  refreshUrl?: string | null;
  scopes?: string[];
  clientId?: string | null;
  redirectUrl?: string | null;
  identityProvider?: string | null;
  note?: string;
}

export interface ToolSetupAuthMethod {
  id: string;
  label: string;
  type: "oauth2" | "apiKey" | "bearer" | "custom" | "none";
  description: string;
  fields: ToolSetupField[];
  oauth?: ToolSetupOAuth | null;
  headerName?: string | null;
}

export interface ToolSetupOperation {
  id: string;
  name: string;
  method: string;
  path: string;
  docs?: string;
}

export interface ToolSetup {
  authMethods: ToolSetupAuthMethod[];
  operations: ToolSetupOperation[];
  runtimeUrls: string[];
  baseUrlHint?: string | null;
  docs: { title: string; url: string }[];
  note?: string;
}

export interface OAuthPending {
  state: string;
  toolId: string;
  authMethodId: string;
  toolName: string;
  authorizationUrl: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
  codeVerifier: string;
  redirectUri: string;
  scopes: string[];
  extraAuthParams: Record<string, string>;
  createdAt: string;
  expiresAt: string;
}

export interface OAuthTokenRecord {
  toolId: string;
  authMethodId: string;
  accessToken: string;
  refreshToken?: string;
  tokenType?: string;
  scope?: string;
  expiresAt?: string;
  clientId: string;
  clientSecret?: string;
  tokenUrl: string;
  createdAt: string;
  updatedAt: string;
}

export interface LocalSkill {
  id: string;
  name: string;
  description: string;
  instructions: string;
  source: "created" | "uploaded";
  createdAt: string;
  updatedAt: string;
}

export interface Toolbox {
  id: string;
  name: string;
  description: string;
  /**
   * Tool ids: built-in ids, mcp:<server>:<tool>, http:<id>,
   * skill:<catalog-id>, skill:local:<id> and toolbox:<id>.
   */
  toolIds: string[];
  /** When true, only the most relevant tools are passed per request. */
  toolSearch: boolean;
  guardrailId?: string;
  /** Incremented every time the toolbox definition is saved. */
  version: number;
  createdAt: string;
  updatedAt: string;
}

export type McpTransport = "stdio" | "http" | "sse";

/** A user-owned HTTP endpoint exposed to agents as a function. */
export interface HttpTool {
  id: string;
  name: string;
  description: string;
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  url: string;
  headers?: Record<string, string>;
  /** Optional request body. `{{argument}}` placeholders are replaced. */
  bodyTemplate?: string;
  /** JSON Schema for the function arguments. */
  inputSchema: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

/** MCP tool annotations, as advertised by the server (MCP 2024-11-05). */
export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** A tool advertised by a user-owned MCP server. */
export interface McpToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

/** A local or remote Model Context Protocol server registered in the workspace. */
export interface McpServer {
  id: string;
  name: string;
  transport: McpTransport;
  /** stdio transport */
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  /** streamable HTTP or legacy SSE transport */
  url?: string;
  headers?: Record<string, string>;
  status: "Connected" | "Error" | "Unknown";
  error?: string;
  tools: McpToolDefinition[];
  createdAt: string;
  updatedAt: string;
  lastConnectedAt?: string;
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
  /** Memory store this agent writes to and recalls from (Foundry Memory Preview). */
  memoryStoreId?: string;
  guardrail?: "Default" | "Strict" | "Off";
  /** Guardrail resource applied to this agent (Foundry Guardrails Preview). */
  guardrailId?: string;
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

/**
 * Retrieval reasoning effort, exactly as Foundry IQ offers it in the knowledge
 * base creator. Higher effort spends more local model work planning queries.
 */
export type ReasoningEffort = "Minimal" | "Low" | "Medium";

/** Foundry IQ output mode. */
export type OutputMode = "Extractive data" | "Answer synthesis";

/** The data-source kinds Foundry IQ can ground a knowledge base on. */
export type KnowledgeSourceKind =
  | "upload"
  | "work-iq"
  | "fabric-iq"
  | "azure-blob"
  | "web"
  | "azure-ai-search";

export interface KnowledgeSource {
  id: string;
  kind: KnowledgeSourceKind;
  /** Display name, e.g. the source label or the connected asset name. */
  name: string;
  /** Short description shown under the name in the source list. */
  detail?: string;
  status: "Connected" | "Indexing" | "Ready" | "Error";
  /** Index this source is materialised into (uploads create a file-search index). */
  indexName?: string;
  documentCount?: number;
}

export interface KnowledgeBase {
  id: string;
  name: string;
  description: string;
  /** Foundry IQ connection the base is scoped to (e.g. an Azure AI Search connection). */
  connectionId?: string;
  /** Chat completion deployment used for agentic query planning / answer synthesis. */
  chatModel?: string;
  /** Retrieval reasoning effort. */
  reasoningEffort?: ReasoningEffort;
  /** Output mode: raw extractive chunks or a synthesised answer. */
  outputMode?: OutputMode;
  /** Query-planning instructions handed to the agentic retrieval engine. */
  retrievalInstructions?: string;
  /** Grounding sources attached to the base. */
  sources?: KnowledgeSource[];
  /** Customer-managed encryption key settings. */
  encryption?: { enabled: boolean; keyVault?: string; keyName?: string };
  indexName: string;
  embeddingModel: string;
  embeddingProvider: ProviderId | "lexical";
  status: "Ready" | "Indexing" | "Failed";
  documents: KnowledgeDocument[];
  createdAt: string;
  updatedAt: string;
}

/** A vector / agentic search index, as listed under Knowledge → Indexes. */
export interface SearchIndex {
  id: string;
  name: string;
  version: number;
  type: "File search" | "Agentic retrieval";
  documents: number;
  chunks: number;
  status: "Ready" | "Indexing" | "Failed";
  createdAt: string;
  updatedAt: string;
}

/**
 * A credentialed link to an external product. The secret itself is never part
 * of this shape; `secretSet` and `secretHint` describe it without exposing it.
 */
export interface Connection {
  id: string;
  name: string;
  /** Legacy label kept for older rows. New rows use `provider`. */
  kind?: "Azure AI Search" | "Azure Blob Storage" | "Microsoft 365" | "Microsoft Fabric";
  provider?: "s3" | "azure-blob" | "azure-ai-search" | "webdav" | "google-drive";
  providerLabel?: string;
  target: string;
  authType:
    | "API key"
    | "Managed identity"
    | "Local (no key required)"
    | "Access key"
    | "SAS token"
    | "Basic"
    | "oauth2";
  config?: Record<string, unknown>;
  secretSet?: boolean;
  secretHint?: string;
  status?: "unknown" | "ok" | "failed";
  oauthConnected?: boolean;
  lastCheckedAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt?: string;
}

/** Memory store kinds, matching Foundry's Memory store creator. */
export interface MemoryFeatures {
  chatSummary: boolean;
  proceduralMemory: boolean;
  userProfile: boolean;
}

export interface MemoryStore {
  id: string;
  name: string;
  description?: string;
  chatModel: string;
  chatModelSku?: string;
  embeddingModel: string;
  embeddingModelSku?: string;
  features: MemoryFeatures;
  userProfileDetails?: string;
  /** Default time-to-live in seconds. 0 means entries never expire. */
  ttlSeconds: number;
  createdAt: string;
  updatedAt: string;
  lastUsedAt?: string;
}

export type MemoryKind = "chat-summary" | "procedural" | "user-profile";

export interface MemoryItem {
  id: string;
  storeId: string;
  /** Whose memory this is — a local user id. */
  scope: string;
  kind: MemoryKind;
  /** Stable slot key for structured memories (e.g. "dietary-restrictions"). */
  key?: string;
  value: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
}

/** One control inside a guardrail. */
export interface GuardrailControl {
  /** Stable id, e.g. "jailbreak", "hate", "pii". */
  id: string;
  /** Group heading, e.g. "Jailbreak", "Content harms". */
  group: string;
  /** Risk type label shown in the table (e.g. "Hate", "Egress rules"). */
  riskType: string;
  /** Intervention point, e.g. "User input, Output". */
  intervention: string;
  /** Action, e.g. "Block", "Deny", "On". */
  action: string;
  /** How PII/secrets are handled when the control matches. */
  strategy?: "block" | "redact" | "mask" | "hash";
  /** Severity qualifier ("Medium blocking") for content harms. */
  severity?: string;
  /** True when Foundry adds it by default and it cannot be removed. */
  defaulted: boolean;
  /** True when the caller toggled it on. */
  enabled: boolean;
  /** Human description used for the enforcement prompt. */
  description: string;
}

export interface SemanticCheckResult {
  /** True when the classifier model actually ran and returned a verdict. */
  ran: boolean;
  model?: string;
  provider?: string;
  latencyMs?: number;
  categories?: string[];
  reason?: string;
  /** The classifier's own boolean verdict. */
  unsafe?: boolean;
  /** Why the classifier did not run; never presented as a pass. */
  error?: string;
  /** A benign skip, such as a deterministic control blocking first. */
  skipped?: string;
}

export interface Guardrail {
  id: string;
  name: string;
  streamingMode: "Default" | "Off";
  controls: GuardrailControl[];
  /** Agent ids the guardrail is attached to. */
  agents: string[];
  /** Deployment ids (models) the guardrail is attached to. */
  deployments: string[];
  /** Built-in guardrails cannot be deleted. */
  builtIn?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Blocklist {
  id: string;
  name: string;
  terms: string[];
  createdAt: string;
  builtIn?: boolean;
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

/* ---------------------------------------------------------------- fine-tune */

export interface FineTuneMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface FineTuneRow {
  messages: FineTuneMessage[];
}

export interface FineTuneDataset {
  id: string;
  name: string;
  source: "traces" | "agents" | "custom";
  rows: FineTuneRow[];
  rowCount: number;
  characters: number;
  createdAt: string;
}

/* ----------------------------------------------------------------- routines */

export type RoutineTrigger =
  | {
      type: "schedule";
      /** Five-field cron expression, evaluated in `timeZone`. */
      cron: string;
      /** IANA time zone such as Europe/London or America/Los_Angeles. */
      timeZone: string;
    }
  | {
      type: "timer";
      /** ISO timestamp. The routine disables itself after firing. */
      at: string;
    }
  | {
      type: "webhook";
      /** Secret path segment for /api/routine-events/[token]. */
      token: string;
    }
  | {
      type: "github_issue";
      owner: string;
      repository: string;
      issueEvent: "opened" | "closed";
      /** Optional personal access token for private repositories and higher limits. */
      token?: string;
      lastPolledAt?: string;
      seenEventIds?: string[];
      lastPollError?: string;
    }
  | {
      /** Kept in the document shape so the UI can explain why it is cloud-only. */
      type: "teams";
      connectionId?: string;
      groupId?: string;
      channelId?: string;
    };

export interface Routine {
  id: string;
  name: string;
  description?: string;
  agentId: string;
  prompt: string;
  trigger: RoutineTrigger;
  /** Local equivalent of the reference's dispatch identity choice. */
  identity: "agent" | "creator";
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  nextRunAt?: string;
  lastRunId?: string;
}

export type RoutineRunStatus = "queued" | "running" | "completed" | "failed";

export interface RoutineRun {
  id: string;
  routineId: string;
  routineName: string;
  /** manual, schedule, timer, webhook, or github_issue. */
  source: "manual" | RoutineTrigger["type"];
  status: RoutineRunStatus;
  queuedAt: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  input: string;
  output?: string;
  error?: string;
  responseId?: string;
  traceId?: string;
  attempts: number;
}

/* ---------------------------------------------------------------- workflows */

export type WorkflowNodeType =
  | "start"
  | "agent"
  | "setVariable"
  | "resetVariable"
  | "parseValue"
  | "ifElse"
  | "forEach"
  | "goTo"
  | "sendMessage"
  | "askQuestion"
  | "end"
  | "note";

export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
  label?: string;
}

export interface WorkflowVersion {
  version: number;
  savedAt: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: string[];
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  template: "blank" | "sequential" | "human-in-loop" | "group-chat" | "custom";
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  variables: string[];
  version: number;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string;
  versions: WorkflowVersion[];
}

export type WorkflowRunStatus =
  | "queued"
  | "running"
  | "waiting"
  | "completed"
  | "failed"
  | "cancelled";

export interface WorkflowNodeRun {
  nodeId: string;
  type: WorkflowNodeType;
  title: string;
  status: "running" | "completed" | "failed" | "skipped";
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  input?: unknown;
  output?: unknown;
  error?: string;
}

export type WorkflowFrame =
  | { kind: "node"; nodeId: string }
  | {
      kind: "forEach";
      nodeId: string;
      items: unknown[];
      index: number;
      itemVariable: string;
      indexVariable: string;
    };

export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  status: WorkflowRunStatus;
  source: "manual" | "preview";
  queuedAt: string;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  input: string;
  output?: string;
  error?: string;
  stepCount: number;
  promptTokens: number;
  completionTokens: number;
  variables: Record<string, unknown>;
  stack: WorkflowFrame[];
  messages: { role: "user" | "assistant"; content: string; at: string }[];
  nodeRuns: WorkflowNodeRun[];
  pending?: {
    nodeId: string;
    question: string;
    variable: string;
    inputType: "string" | "number" | "boolean" | "json" | "choice";
    choices?: string[];
  };
  traceIds: string[];
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

export type MessageContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | MessageContentPart[];
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
  content: string | MessageContentPart[];
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
  /** Image generation runtime. "auto" probes known local ports. */
  imageProvider: "auto" | "automatic1111" | "openai";
  imageUrl: string;
  imageApiKey: string;
  imageModel: string;
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

/** How destructive tool calls are handled before they run. */
export type ToolApprovalMode = "off" | "destructive" | "writes" | "all";

export interface ToolApprovalPolicy {
  mode: ToolApprovalMode;
  /** Tool ids or function names that never need approval. */
  allowlist: string[];
  /** How long the chat waits for a decision. */
  timeoutSeconds: number;
}

/** One request for a human decision, recorded for audit. */
export interface ToolApprovalRecord {
  id: string;
  principalId: string;
  agentId?: string;
  toolId: string;
  toolName: string;
  server: string;
  arguments: Record<string, unknown>;
  reason: string;
  status: "pending" | "approved" | "rejected" | "expired" | "cancelled";
  createdAt: string;
  expiresAt: string;
  decidedAt?: string;
  decidedBy?: string;
}

export interface ToolApprovalState {
  policy: ToolApprovalPolicy;
  history: ToolApprovalRecord[];
}
