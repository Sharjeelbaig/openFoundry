// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { NextRequest } from "next/server";
import { streamCompletion } from "./chat";
import { Deployment } from "./types";
import { nodeForDeployment } from "./nodes";
import {
  acquireSlot,
  admit,
  estimateTokens,
  markResident,
  meter,
  rejectionResponse,
  releaseSlot,
} from "./serving";

interface ChatBody {
  messages?: { role: "system" | "user" | "assistant"; content: string }[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stream?: boolean;
}

export async function deploymentChat(
  req: NextRequest,
  deployment: Deployment
): Promise<Response> {
  if (deployment.status !== "Running")
    return json(
      {
        error: {
          message: `Deployment ${deployment.name} is ${deployment.status}. Start it in Build → Models.`,
          type: "deployment_unavailable",
        },
      },
      503
    );
  const body = (await req.json().catch(() => ({}))) as ChatBody;
  if (!body.messages?.length)
    return json(
      { error: { message: "messages is required", type: "invalid_request_error" } },
      400
    );

  const purpose = req.headers.get("x-foundry-purpose") || undefined;
  const node = await nodeForDeployment(deployment);
  const baseUrl = node?.baseUrl;

  const estimated = estimateTokens(body.messages, body.max_tokens ?? 1024);
  const rejection = admit(deployment, estimated, { purpose });
  if (rejection) return rejectionResponse(rejection);

  const acquired = await acquireSlot(deployment, 30_000);
  if (!acquired)
    return rejectionResponse({
      kind: "capacity",
      slots: deployment.reservedSlots || 1,
      retryAfter: 15,
    });

  if (deployment.servingMode === "Instant") markResident(deployment.id);

  const id = `chatcmpl-${Date.now().toString(36)}`;
  const created = Math.floor(Date.now() / 1000);

  if (body.stream !== true) {
    let text = "";
    let promptTokens = 0;
    let completionTokens = 0;
    try {
      for await (const event of streamCompletion({
        model: deployment.modelId,
        provider: deployment.provider,
        messages: body.messages,
        temperature: body.temperature,
        topP: body.top_p,
        maxTokens: body.max_tokens,
        baseUrl,
      })) {
        if (event.type === "delta") text += event.text;
        if (event.type === "usage") {
          promptTokens = event.promptTokens;
          completionTokens = event.completionTokens;
        }
      }
    } catch (error) {
      return json(
        {
          error: {
            message: error instanceof Error ? error.message : "Model failed",
            type: "model_error",
          },
        },
        502
      );
    } finally {
      releaseSlot(deployment);
    }
    void meter(deployment.id, promptTokens, completionTokens);
    return json({
      id,
      object: "chat.completion",
      created,
      model: deployment.modelId,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finish_reason: "stop",
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    });
  }

  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      async start(controller) {
        const send = (data: unknown) =>
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        let promptTokens = 0;
        let completionTokens = 0;
        try {
          for await (const event of streamCompletion({
            model: deployment.modelId,
            provider: deployment.provider,
            messages: body.messages || [],
            temperature: body.temperature,
            topP: body.top_p,
            maxTokens: body.max_tokens,
            baseUrl,
          })) {
            if (event.type === "delta") {
              send({
                id,
                object: "chat.completion.chunk",
                created,
                model: deployment.modelId,
                choices: [
                  {
                    index: 0,
                    delta: { content: event.text },
                    finish_reason: null,
                  },
                ],
              });
            }
            if (event.type === "usage") {
              promptTokens = event.promptTokens;
              completionTokens = event.completionTokens;
            }
          }
          send({
            id,
            object: "chat.completion.chunk",
            created,
            model: deployment.modelId,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
          });
          controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        } catch (error) {
          send({
            error: {
              message:
                error instanceof Error ? error.message : "Model request failed",
            },
          });
        } finally {
          releaseSlot(deployment);
          void meter(deployment.id, promptTokens, completionTokens);
          controller.close();
        }
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
      },
    }
  );
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
