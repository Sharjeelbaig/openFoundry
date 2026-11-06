// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import {
  speechStatus,
  synthesizeSpeech,
  transcribeAudio,
} from "./speech";
import type {
  LocalMcpToolDefinition,
  LocalMcpToolResult,
} from "./local-mcp";

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export const speechMcpTools: LocalMcpToolDefinition[] = [
  {
    name: "synthesize_speech",
    description:
      "Generate a WAV from text with the operating-system voice. Returns MCP audio content plus metadata. " +
      "The engine is macOS say; this is not Azure Speech.",
    inputSchema: {
      type: "object",
      properties: {
        text: {
          type: "string",
          maxLength: 5000,
          description: "Text to speak (maximum 5000 characters).",
        },
        voice: {
          type: "string",
          description: 'Optional system voice name, e.g. "Samantha".',
        },
        rate: {
          type: "integer",
          minimum: 90,
          maximum: 320,
          description: "Words per minute (default 180).",
        },
      },
      required: ["text"],
      additionalProperties: false,
    },
    execution: { taskSupport: "optional" },
  },
  {
    name: "transcribe_audio",
    description:
      "Transcribe WAV or other audio with whisper.cpp. Fails with the exact install step when whisper.cpp or its model is missing; it never invents a transcript.",
    inputSchema: {
      type: "object",
      properties: {
        audio: {
          type: "string",
          description:
            "Base64 audio bytes, optionally a data:audio/...;base64 URL. Maximum 50 MB.",
        },
        filename: {
          type: "string",
          description: 'Original file name; its extension selects the format. Defaults to "audio.wav".',
        },
      },
      required: ["audio"],
      additionalProperties: false,
    },
    execution: { taskSupport: "optional" },
  },
  {
    name: "speech_status",
    description:
      "Report whether local text-to-speech and speech-to-text are available, with the install step when STT is missing.",
    inputSchema: {
      type: "object",
      properties: {},
      additionalProperties: false,
    },
    execution: { taskSupport: "optional" },
  },
];

function textContent(value: string, structured?: unknown): LocalMcpToolResult {
  return {
    content: [{ type: "text", text: value }],
    ...(structured === undefined ? {} : { structuredContent: structured }),
  };
}

function decodeAudio(raw: unknown): Buffer {
  let data = String(raw || "").trim();
  if (data.startsWith("data:")) {
    const comma = data.indexOf(",");
    if (comma > 0) data = data.slice(comma + 1);
  }
  if (!data) {
    throw new Error("audio is required as base64-encoded bytes.");
  }
  const buffer = Buffer.from(data, "base64");
  if (buffer.length === 0) {
    throw new Error("audio decoded to zero bytes.");
  }
  if (buffer.length > MAX_AUDIO_BYTES) {
    throw new Error("Audio is limited to 50 MB.");
  }
  return buffer;
}

export async function callSpeechTool(
  name: string,
  args: Record<string, unknown>
): Promise<LocalMcpToolResult> {
  if (name === "synthesize_speech") {
    const rate = args.rate == null ? undefined : Number(args.rate);
    if (rate !== undefined && !Number.isFinite(rate)) {
      throw new Error("rate must be a number between 90 and 320.");
    }
    const speech = await synthesizeSpeech({
      text: String(args.text || ""),
      voice: args.voice ? String(args.voice) : undefined,
      rate,
    });
    const meta = {
      engine: speech.engine,
      filename: speech.filename,
      mime: speech.mime,
      bytes: speech.buffer.length,
    };
    return {
      content: [
        {
          type: "audio",
          data: speech.buffer.toString("base64"),
          mimeType: speech.mime,
        },
        { type: "text", text: JSON.stringify(meta) },
      ],
      structuredContent: meta,
    };
  }

  if (name === "transcribe_audio") {
    const result = await transcribeAudio({
      buffer: decodeAudio(args.audio),
      name: String(args.filename || "audio.wav"),
    });
    return textContent(result.text, result);
  }

  if (name === "speech_status") {
    const status = await speechStatus();
    return textContent(JSON.stringify(status, null, 2), status);
  }

  throw new Error(`Unknown speech tool "${name}".`);
}
