// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { NextRequest } from "next/server";
import { POST as chatPost } from "@/app/api/chat/route";
import { isProjectKey } from "@/lib/auth";
import { currentSession } from "@/lib/directory/server";
import { getAgent, getAgents, newId } from "@/lib/store";
import {
  convertAudioToWav,
  SpeechUnavailableError,
  synthesizeSpeech,
  transcribeAudio,
} from "@/lib/speech";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_AUDIO_BYTES = 25 * 1024 * 1024;
const AUDIO_CHUNK_BYTES = 32 * 1024;

async function authorized(req: NextRequest): Promise<boolean> {
  if (await isProjectKey(req)) return true;
  return Boolean(await currentSession());
}

function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

interface VoiceInput {
  buffer: Buffer;
  name: string;
  agentId: string;
  voice: string;
  rate: number;
}

async function readInput(req: NextRequest): Promise<VoiceInput | Response> {
  const contentType = req.headers.get("content-type") || "";
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return jsonError(400, "Upload a WAV, WebM or other audio file in `file`.");
    }
    if (file.size > MAX_AUDIO_BYTES) {
      return jsonError(400, "Audio is limited to 25 MB.");
    }
    return {
      buffer: Buffer.from(await file.arrayBuffer()),
      name: file.name || "voice.webm",
      agentId: String(form.get("agent") || ""),
      voice: String(form.get("voice") || "Samantha"),
      rate: Number(form.get("rate") || 180),
    };
  }

  const length = Number(req.headers.get("content-length") || 0);
  if (length > MAX_AUDIO_BYTES) {
    return jsonError(400, "Audio is limited to 25 MB.");
  }
  const buffer = Buffer.from(await req.arrayBuffer());
  if (buffer.length === 0) {
    return jsonError(400, "Send audio bytes or a multipart `file`.");
  }
  return {
    buffer,
    name: req.nextUrl.searchParams.get("filename") || "voice.wav",
    agentId: req.nextUrl.searchParams.get("agent") || "",
    voice: req.nextUrl.searchParams.get("voice") || "Samantha",
    rate: Number(req.nextUrl.searchParams.get("rate") || 180),
  };
}

/**
 * Voice Live, local push-to-talk transport.
 *
 * The request is one spoken turn; the response is an SSE stream carrying the
 * transcript, assistant deltas, and a base64 WAV synthesized from the answer.
 * STT is whisper.cpp, TTS is the operating-system voice, and the agent is the
 * same runtime as the builder.
 */
export async function POST(req: NextRequest) {
  if (!(await authorized(req))) {
    return jsonError(401, "A project API key or signed-in session is required.");
  }

  const input = await readInput(req);
  if (input instanceof Response) return input;

  let wav: Buffer;
  let transcript: string;
  try {
    wav = await convertAudioToWav(input.buffer, input.name);
    const stt = await transcribeAudio({ buffer: wav, name: "voice.wav" });
    transcript = stt.text.trim();
    if (!transcript) {
      return jsonError(422, "No speech was recognized in that recording.");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonError(error instanceof SpeechUnavailableError ? 503 : 400, message);
  }

  const agent = input.agentId
    ? await getAgent(input.agentId)
    : (await getAgents())[0];
  if (!agent) {
    return jsonError(404, "No agent is configured on this install.");
  }

  const sessionId = newId("voice");
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let sequence = 0;
      const send = (type: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(
            `event: ${type}\ndata: ${JSON.stringify({
              type,
              sessionId,
              sequence: sequence++,
              ...data,
            })}\n\n`
          )
        );
      };

      send("session", {
        agent: agent.id,
        agentName: agent.name,
        stt: "whisper.cpp",
        tts: "macOS say",
      });
      send("transcript", { text: transcript, engine: "whisper.cpp" });

      let answer = "";
      let model = agent.model;
      let citations: unknown[] = [];
      let assistantError: string | null = null;

      try {
        const chatResponse = await chatPost(
          new NextRequest(new URL("/api/chat", req.nextUrl.origin), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: agent.id,
              messages: [{ role: "user", content: transcript }],
              saveTrace: true,
            }),
            signal: req.signal,
          })
        );
        if (!chatResponse.ok || !chatResponse.body) {
          throw new Error(`The agent runtime returned ${chatResponse.status}.`);
        }

        const reader = chatResponse.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        const consume = (frame: string) => {
          const line = frame.split("\n").find((item) => item.startsWith("data:"));
          if (!line) return;
          const payload = line.slice(5).trim();
          if (!payload) return;
          try {
            const event = JSON.parse(payload) as {
              type: string;
              text?: string;
              message?: string;
              model?: string;
              citations?: unknown[];
            };
            if (event.type === "delta" && event.text) {
              answer += event.text;
              send("assistant.delta", { text: event.text });
            } else if (event.type === "done") {
              citations = event.citations || citations;
            } else if (event.type === "meta") {
              model = event.model || model;
              citations = event.citations || citations;
            } else if (event.type === "error") {
              assistantError = event.message || "The agent failed.";
            }
          } catch {
            // Ignore malformed SSE frames.
          }
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) consume(frame);
        }
        if (buffer.trim()) consume(buffer);

        if (assistantError) throw new Error(assistantError);
        if (!answer.trim()) throw new Error("The agent returned no text.");

        send("assistant.done", {
          text: answer.trim(),
          model,
          citations,
        });

        const speech = await synthesizeSpeech({
          text: answer.trim(),
          voice: input.voice,
          rate: input.rate,
        });
        send("audio.start", {
          mime: speech.mime,
          bytes: speech.buffer.length,
          engine: speech.engine,
        });
        for (let offset = 0, index = 0; offset < speech.buffer.length; offset += AUDIO_CHUNK_BYTES, index += 1) {
          send("audio.chunk", {
            index,
            data: speech.buffer
              .subarray(offset, offset + AUDIO_CHUNK_BYTES)
              .toString("base64"),
          });
        }
        send("audio.done", { bytes: speech.buffer.length });
        send("done", {});
      } catch (error) {
        send("error", {
          message: error instanceof Error ? error.message : String(error),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
    },
  });
}
