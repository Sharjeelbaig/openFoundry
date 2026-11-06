// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import {
  findWhisperBinary,
  findWhisperModel,
  whisperSetupStatus,
} from "./whisper";

const execFileAsync = promisify(execFile);

/**
 * Local speech adapters.
 *
 * Text-to-speech uses the operating system voice (`say` on macOS), which is a
 * real local engine. Speech-to-text needs whisper.cpp and a model file; when
 * either is missing the call fails with the exact install step instead of
 * returning invented text.
 */

export class SpeechUnavailableError extends Error {}

const VOICE_PATTERN = /^[A-Za-z0-9 ._()-]{1,64}$/;

export interface SynthesizedSpeech {
  buffer: Buffer;
  mime: string;
  filename: string;
  engine: string;
}

export async function synthesizeSpeech(input: {
  text: string;
  voice?: string;
  rate?: number;
}): Promise<SynthesizedSpeech> {
  const text = input.text?.trim();
  if (!text) throw new Error("Text is required.");
  if (text.length > 5000) throw new Error("Text is limited to 5000 characters.");
  const voice = input.voice?.trim() || "Samantha";
  if (!VOICE_PATTERN.test(voice)) throw new Error("That voice name is not valid.");
  const rate = Math.min(Math.max(input.rate ?? 180, 90), 320);

  const temp = path.join(
    os.tmpdir(),
    `openfoundry-tts-${process.pid}-${Date.now()}.wav`
  );
  try {
    await execFileAsync(
      "say",
      [
        "-v",
        voice,
        "-r",
        String(rate),
        "-o",
        temp,
        "--data-format=LEI16@22050",
        text,
      ],
      { timeout: 60_000 }
    );
    const buffer = await fs.readFile(temp);
    return {
      buffer,
      mime: "audio/wav",
      filename: "speech.wav",
      engine: `macOS say (${voice})`,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new SpeechUnavailableError(
      `Text-to-speech failed. On macOS it uses the built-in "say" command. ${message.slice(0, 160)}`
    );
  } finally {
    await fs.unlink(temp).catch(() => undefined);
  }
}

/**
 * Convert an uploaded recording (WebM/Opus, MP3, M4A, WAV, ...) into the
 * 16 kHz mono PCM WAV that whisper.cpp expects. ffmpeg is a real dependency;
 * when it is missing the error says so instead of pretending the audio was
 * understood.
 */
export async function convertAudioToWav(
  buffer: Buffer,
  name: string
): Promise<Buffer> {
  const extension = path.extname(name) || ".audio";
  const input = path.join(
    os.tmpdir(),
    `openfoundry-voice-in-${process.pid}-${Date.now()}${extension}`
  );
  const output = path.join(
    os.tmpdir(),
    `openfoundry-voice-out-${process.pid}-${Date.now()}.wav`
  );
  try {
    await fs.writeFile(input, buffer);
    try {
      await execFileAsync(
        "ffmpeg",
        [
          "-hide_banner",
          "-loglevel",
          "error",
          "-y",
          "-i",
          input,
          "-ar",
          "16000",
          "-ac",
          "1",
          "-c:a",
          "pcm_s16le",
          output,
        ],
        { timeout: 120_000, maxBuffer: 16 * 1024 * 1024 }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new SpeechUnavailableError(
        `Audio conversion with ffmpeg failed. Install ffmpeg (brew install ffmpeg) and try again. ${message.slice(0, 300)}`
      );
    }
    return await fs.readFile(output);
  } finally {
    await fs.unlink(input).catch(() => undefined);
    await fs.unlink(output).catch(() => undefined);
  }
}

export async function transcribeAudio(input: {
  buffer: Buffer;
  name: string;
}): Promise<{ text: string; engine: string }> {
  const binary = await findWhisperBinary();
  const model = await findWhisperModel();
  if (!binary || !model) {
    const status = await whisperSetupStatus();
    throw new SpeechUnavailableError(
      status.reason ||
        "Speech-to-text needs whisper.cpp and a ggml model. Use the Speech page setup helper, or set WHISPER_CPP_BIN and WHISPER_MODEL."
    );
  }
  const extension = path.extname(input.name) || ".wav";
  const temp = path.join(
    os.tmpdir(),
    `openfoundry-stt-${process.pid}-${Date.now()}${extension}`
  );
  const outBase = temp.replace(/\.[^.]+$/, "");
  try {
    await fs.writeFile(temp, input.buffer);
    await execFileAsync(
      binary.path,
      ["-m", model.path, "-f", temp, "-otxt", "-of", outBase],
      { timeout: 300_000, maxBuffer: 32 * 1024 * 1024 }
    );
    const text = await fs.readFile(`${outBase}.txt`, "utf8");
    return { text: text.trim(), engine: "whisper.cpp" };
  } finally {
    await fs.unlink(temp).catch(() => undefined);
    await fs.unlink(`${outBase}.txt`).catch(() => undefined);
  }
}

export async function speechStatus(): Promise<{
  tts: { available: boolean; engine: string };
  stt: { available: boolean; reason?: string };
  whisper: Awaited<ReturnType<typeof whisperSetupStatus>>;
}> {
  let ttsAvailable = false;
  if (process.platform === "darwin") {
    try {
      await fs.access("/usr/bin/say");
      ttsAvailable = true;
    } catch {
      ttsAvailable = false;
    }
  }
  const whisper = await whisperSetupStatus();
  return {
    tts: { available: ttsAvailable, engine: "macOS say" },
    stt: {
      available: whisper.available,
      ...(whisper.available ? {} : { reason: whisper.reason }),
    },
    whisper,
  };
}
