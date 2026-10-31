import "server-only";
import { completeChat } from "./chat";
import { ChatTool, ProviderId, WireMessage, WireToolCall } from "./types";
import { findModel } from "./providers";
import { getDeployments, newId } from "./store";
import {
  ConversationItem,
  appendConversationItems,
  getConversation,
  messageItem,
} from "./conversations";
import { getAgentVersion } from "./agent-versions";

/**
 * Runs the Foundry-shaped agent API locally.
 *
 * The azure-ai-projects SDK talks to two surfaces: project operations such as
 * `agents.create_version` under the project endpoint, and the OpenAI Responses
 * API under `<endpoint>/openai/v1`. This module maps the Responses request onto
 * the local chat pipeline, resolving the agent definition (instructions, model
 * and function tools) that create_version stored.
 */

interface ResponsesInputItem {
  type?: string;
  role?: string;
  content?: unknown;
  call_id?: string;
  output?: unknown;
  name?: string;
  arguments?: string;
}

export interface ResponsesRequest {
  model?: string;
  input?: string | ResponsesInputItem[] | null;
  instructions?: string | null;
  conversation?: string | { id?: string } | null;
  tools?: unknown[];
  tool_choice?: unknown;
  temperature?: number;
  top_p?: number;
  max_output_tokens?: number;
  stream?: boolean;
  agent_reference?: { name?: string; type?: string } | null;
  metadata?: Record<string, string>;
}

export interface ResponsesResult {
  status: number;
  body: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function textFrom(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        const record = asRecord(part);
        return typeof record?.text === "string" ? record.text : "";
      })
      .join("");
  }
  const record = asRecord(content);
  return typeof record?.text === "string" ? record.text : "";
}

/** Conversation history, with consecutive function calls grouped into one assistant turn. */
export function historyToMessages(items: ConversationItem[]): WireMessage[] {
  const messages: WireMessage[] = [];
  let pendingCalls: WireToolCall[] = [];

  const flushCalls = () => {
    if (!pendingCalls.length) return;
    messages.push({ role: "assistant", content: "", tool_calls: pendingCalls });
    pendingCalls = [];
  };

  for (const item of items) {
    if (item.type === "function_call" && item.call_id && item.name) {
      pendingCalls.push({
        id: item.call_id,
        type: "function",
        function: { name: item.name, arguments: item.arguments || "{}" },
      });
      continue;
    }
    if (item.type === "function_call_output" && item.call_id) {
      flushCalls();
      messages.push({
        role: "tool",
        tool_call_id: item.call_id,
        content: textFrom(item.output),
      });
      continue;
    }
    flushCalls();
    if (item.type === "message" && item.role) {
      messages.push({ role: item.role, content: textFrom(item.content) });
    }
  }
  flushCalls();
  return messages;
}

function inputItems(input: ResponsesRequest["input"]): ResponsesInputItem[] {
  if (!input) return [];
  if (typeof input === "string") {
    return input.trim() ? [{ type: "message", role: "user", content: input }] : [];
  }
  return input;
}

/** Turns an HTTP input payload into chat messages plus the items worth remembering. */
function inputToMessages(input: ResponsesRequest["input"]): {
  messages: WireMessage[];
  stored: ConversationItem[];
} {
  const messages: WireMessage[] = [];
  const stored: ConversationItem[] = [];
  const inFlight: WireToolCall[] = [];

  const flushCalls = () => {
    if (!inFlight.length) return;
    messages.push({ role: "assistant", content: "", tool_calls: inFlight });
    inFlight.length = 0;
  };

  for (const item of inputItems(input)) {
    if (item.type === "function_call" && item.call_id && item.name) {
      inFlight.push({
        id: item.call_id,
        type: "function",
        function: { name: item.name, arguments: item.arguments || "{}" },
      });
      stored.push({
        id: newId("fc"),
        object: "conversation.item",
        type: "function_call",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        call_id: item.call_id,
        name: item.name,
        arguments: item.arguments || "{}",
      });
      continue;
    }
    if (item.type === "function_call_output" && item.call_id) {
      flushCalls();
      const output = textFrom(item.output);
      messages.push({ role: "tool", tool_call_id: item.call_id, content: output });
      stored.push({
        id: newId("fco"),
        object: "conversation.item",
        type: "function_call_output",
        created_at: Math.floor(Date.now() / 1000),
        status: "completed",
        call_id: item.call_id,
        output,
      });
      continue;
    }
    flushCalls();
    const role = item.role === "assistant" ? "assistant" : item.role === "system" || item.role === "developer" ? "system" : "user";
    const text = textFrom(item.content);
    if (!text) continue;
    messages.push({ role, content: text });
    if (role === "user") stored.push(messageItem("user", text));
  }
  flushCalls();
  return { messages, stored };
}

/** Foundry function tools are a flat Responses shape; chat completions nests them. */
function toolsFromDefinition(definition: Record<string, unknown>): {
  flat: Record<string, unknown>[];
  chat: ChatTool[];
} {
  const declared = Array.isArray(definition.tools) ? definition.tools : [];
  const flat: Record<string, unknown>[] = [];
  const chat: ChatTool[] = [];
  for (const entry of declared) {
    const tool = asRecord(entry);
    if (!tool || tool.type !== "function") continue;
    const name = typeof tool.name === "string" ? tool.name : "";
    if (!name) continue;
    const parameters =
      asRecord(tool.parameters) || { type: "object", properties: {} };
    flat.push({
      type: "function",
      name,
      description: typeof tool.description === "string" ? tool.description : undefined,
      parameters,
      strict: tool.strict === true,
    });
    chat.push({
      type: "function",
      function: {
        name,
        ...(typeof tool.description === "string"
          ? { description: tool.description }
          : {}),
        parameters,
      },
    });
  }
  return { flat, chat };
}

interface ChatTarget {
  modelId: string;
  provider: ProviderId;
  /** Set when a deployment exists but is not serving traffic. */
  unavailable?: string;
}

/** Deployments first, then anything the local runtimes actually serve. */
export async function resolveChatTarget(
  name: string
): Promise<ChatTarget | undefined> {
  if (!name) return undefined;
  const deployments = await getDeployments();
  const deployment = deployments.find(
    (item) =>
      item.name === name || item.modelId === name || item.modelName === name
  );
  if (deployment)
    return {
      modelId: deployment.modelId,
      provider: deployment.provider,
      unavailable:
        deployment.status === "Running"
          ? undefined
          : `Deployment ${deployment.name} is ${deployment.status}. Start it in Build → Models.`,
    };

  const model = await findModel(name);
  if (model && model.provider !== "huggingface")
    return { modelId: model.id, provider: model.provider };
  return undefined;
}

function errorBody(message: string, type: string, code?: string) {
  return { error: { message, type, code } };
}

function usage(promptTokens: number, completionTokens: number) {
  return {
    input_tokens: promptTokens,
    input_tokens_details: { cached_tokens: 0 },
    output_tokens: completionTokens,
    output_tokens_details: { reasoning_tokens: 0 },
    total_tokens: promptTokens + completionTokens,
  };
}

export async function runResponse(body: ResponsesRequest): Promise<ResponsesResult> {
  if (body.stream === true)
    return {
      status: 400,
      body: errorBody(
        "Streaming responses are not generated locally yet. Omit stream, or set stream: false.",
        "invalid_request_error",
        "stream_unsupported"
      ),
    };

  const agentName = body.agent_reference?.name?.trim();
  const agentVersion = agentName ? await getAgentVersion(agentName) : undefined;
  if (agentName && !agentVersion)
    return {
      status: 404,
      body: errorBody(
        `Agent ${agentName} has no versions. Create one with agents.create_version first.`,
        "not_found",
        "agent_not_found"
      ),
    };

  const definition = agentVersion?.definition || {};
  const requestedModel =
    typeof definition.model === "string" && definition.model
      ? definition.model
      : body.model?.trim() || "";
  if (!requestedModel)
    return {
      status: 400,
      body: errorBody(
        "A model is required. Reference an agent with agent_reference or pass model.",
        "invalid_request_error",
        "model_required"
      ),
    };

  const target = await resolveChatTarget(requestedModel);
  if (!target)
    return {
      status: 404,
      body: errorBody(
        `No deployment or local model serves "${requestedModel}". Deploy a model in Build → Models, or use an id your local runtime reports.`,
        "not_found",
        "model_not_found"
      ),
    };
  if (target.unavailable)
    return {
      status: 503,
      body: errorBody(
        target.unavailable,
        "deployment_unavailable",
        "deployment_unavailable"
      ),
    };

  const conversationId =
    typeof body.conversation === "string"
      ? body.conversation
      : body.conversation?.id;
  let history: WireMessage[] = [];
  if (conversationId) {
    const conversation = await getConversation(conversationId);
    if (!conversation)
      return {
        status: 404,
        body: errorBody(
          `Conversation ${conversationId} not found.`,
          "not_found",
          "conversation_not_found"
        ),
      };
    history = historyToMessages(conversation.items);
  }

  const { messages: inputMessages, stored: storedInput } = inputToMessages(
    body.input
  );
  const instructions =
    typeof definition.instructions === "string" && definition.instructions
      ? definition.instructions
      : body.instructions || "";

  const messages: WireMessage[] = [
    ...(instructions ? [{ role: "system" as const, content: instructions }] : []),
    ...history,
    ...inputMessages,
  ];

  const { flat: flatTools, chat: chatTools } = toolsFromDefinition(definition);

  let text = "";
  let toolCalls: WireToolCall[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  try {
    const result = await completeChat({
      model: target.modelId,
      provider: target.provider,
      messages,
      tools: chatTools.length ? chatTools : undefined,
      toolChoice: flatTools.length ? "auto" : undefined,
      temperature:
        typeof definition.temperature === "number"
          ? definition.temperature
          : body.temperature,
      topP:
        typeof definition.top_p === "number" ? definition.top_p : body.top_p,
      maxTokens: body.max_output_tokens,
    });
    text = result.text;
    toolCalls = result.toolCalls;
    promptTokens = result.promptTokens;
    completionTokens = result.completionTokens;
  } catch (error) {
    return {
      status: 502,
      body: errorBody(
        error instanceof Error ? error.message : "The local model request failed.",
        "model_error"
      ),
    };
  }

  const output: Record<string, unknown>[] = [];
  const outputConversationItems: ConversationItem[] = [];
  if (text.trim()) {
    output.push({
      id: newId("msg"),
      type: "message",
      status: "completed",
      role: "assistant",
      content: [{ type: "output_text", text, annotations: [] }],
    });
    outputConversationItems.push(messageItem("assistant", text));
  }
  for (const call of toolCalls) {
    output.push({
      id: newId("fc"),
      type: "function_call",
      status: "completed",
      call_id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    });
    outputConversationItems.push({
      id: newId("fc"),
      object: "conversation.item",
      type: "function_call",
      created_at: Math.floor(Date.now() / 1000),
      status: "completed",
      call_id: call.id,
      name: call.function.name,
      arguments: call.function.arguments,
    });
  }

  if (conversationId && (storedInput.length || outputConversationItems.length))
    await appendConversationItems(conversationId, [
      ...storedInput,
      ...outputConversationItems,
    ]);

  const response = {
    id: newId("resp"),
    object: "response",
    created_at: Math.floor(Date.now() / 1000),
    status: "completed",
    model: target.modelId,
    output,
    parallel_tool_calls: true,
    tool_choice: flatTools.length ? "auto" : "none",
    tools: flatTools,
    instructions: instructions || null,
    metadata: body.metadata || {},
    temperature:
      typeof definition.temperature === "number"
        ? definition.temperature
        : body.temperature ?? 0.7,
    top_p: typeof definition.top_p === "number" ? definition.top_p : body.top_p ?? 0.95,
    max_output_tokens: body.max_output_tokens ?? null,
    previous_response_id: null,
    error: null,
    incomplete_details: null,
    usage: usage(promptTokens, completionTokens),
  };

  return { status: 200, body: response };
}
