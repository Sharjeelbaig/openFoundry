import { NextRequest, NextResponse } from "next/server";
import { isProjectKey, unauthorized } from "@/lib/auth";
import { completeChat } from "@/lib/chat";
import { resolveChatTarget } from "@/lib/foundry-responses";
import { ChatTool, WireMessage } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!(await isProjectKey(req))) return unauthorized();
  const body = (await req.json().catch(() => ({}))) as {
    model?: string;
    messages?: WireMessage[];
    tools?: ChatTool[];
    temperature?: number;
    top_p?: number;
    max_tokens?: number;
    stream?: boolean;
  };

  if (!body.model)
    return NextResponse.json(
      { error: { message: "model is required", type: "invalid_request_error" } },
      { status: 400 }
    );
  if (!body.messages?.length)
    return NextResponse.json(
      { error: { message: "messages is required", type: "invalid_request_error" } },
      { status: 400 }
    );
  if (body.stream === true)
    return NextResponse.json(
      {
        error: {
          message:
            "Streaming chat completions are not served on the project surface yet. Use /api/v1/chat/completions for streaming.",
          type: "invalid_request_error",
          code: "stream_unsupported",
        },
      },
      { status: 400 }
    );

  const target = await resolveChatTarget(body.model);
  if (!target)
    return NextResponse.json(
      {
        error: {
          message: `No deployment or local model serves "${body.model}".`,
          type: "not_found",
          code: "model_not_found",
        },
      },
      { status: 404 }
    );
  if (target.unavailable)
    return NextResponse.json(
      {
        error: {
          message: target.unavailable,
          type: "deployment_unavailable",
          code: "deployment_unavailable",
        },
      },
      { status: 503 }
    );

  const tools = (body.tools || []).filter(
    (tool) => tool?.type === "function" && tool.function?.name
  );

  try {
    const result = await completeChat({
      model: target.modelId,
      provider: target.provider,
      messages: body.messages,
      temperature: body.temperature,
      topP: body.top_p,
      maxTokens: body.max_tokens,
      tools: tools.length ? tools : undefined,
    });

    return NextResponse.json({
      id: `chatcmpl-${Date.now().toString(36)}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: target.modelId,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text || null,
            ...(result.toolCalls.length ? { tool_calls: result.toolCalls } : {}),
          },
          finish_reason: result.toolCalls.length ? "tool_calls" : "stop",
        },
      ],
      usage: {
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: {
          message:
            error instanceof Error ? error.message : "The local model request failed.",
          type: "model_error",
        },
      },
      { status: 502 }
    );
  }
}
