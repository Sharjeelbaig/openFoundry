// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  speechStatus,
  synthesizeSpeech,
  transcribeAudio,
  SpeechUnavailableError,
} from "@/lib/speech";

const isMac = process.platform === "darwin";

describe("local speech", () => {
  it("reports text-to-speech availability", async () => {
    const status = await speechStatus();
    expect(status.tts.engine).toBe("macOS say");
    expect(typeof status.tts.available).toBe("boolean");
    expect(typeof status.stt.available).toBe("boolean");
  });

  it.skipIf(!isMac)("synthesizes a real WAV file", async () => {
    const speech = await synthesizeSpeech({
      text: "openFoundry speech verification.",
      voice: "Samantha",
      rate: 180,
    });
    expect(speech.mime).toBe("audio/wav");
    expect(speech.buffer.byteLength).toBeGreaterThan(2000);
    expect(speech.buffer.subarray(0, 4).toString("ascii")).toBe("RIFF");
    expect(speech.buffer.subarray(8, 12).toString("ascii")).toBe("WAVE");
  }, 30_000);

  it("rejects empty text", async () => {
    await expect(synthesizeSpeech({ text: "   " })).rejects.toThrow(/required/i);
  });

  it("refuses to invent a transcription when STT cannot run", async () => {
    const status = await speechStatus();
    const attempt = transcribeAudio({
      buffer: Buffer.from("RIFF"),
      name: "a.wav",
    });
    if (!status.stt.available) {
      await expect(attempt).rejects.toBeInstanceOf(SpeechUnavailableError);
    } else {
      // whisper.cpp is installed: invalid audio must still fail, never return
      // a fabricated transcript.
      await expect(attempt).rejects.toThrow();
    }
  }, 60_000);
});
