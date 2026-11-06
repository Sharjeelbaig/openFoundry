// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { AcousticEchoCanceller, wavToFloat32 } from "@/lib/aec";

/**
 * Acoustic-room validation against a real capture.
 *
 * `tests/fixtures/physical-aec/` holds a 10 s recording from the built-in
 * MacBook Pro microphone while the TTS reference played through the built-in
 * speakers. The capture used sounddevice/CoreAudio with latency='high' because
 * the default buffer dropped samples and warped the timeline.
 *
 * The recording is not synthetic: it contains the room, the speaker, the
 * microphone array and the ambient noise. The reference is padded to the
 * measured acoustic offset, then the production AEC runs unchanged.
 */

const root = path.join(process.cwd(), "tests", "fixtures", "physical-aec");
const mic = wavToFloat32(readFileSync(path.join(root, "recording-16k.wav")));
const reference = wavToFloat32(readFileSync(path.join(root, "reference-16k.wav")));
const meta = JSON.parse(readFileSync(path.join(root, "meta.json"), "utf8")) as {
  alignmentSamples: number;
};

const RATE = 16_000;
const FRAME = 320;
const offset = meta.alignmentSamples;

function energy(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return sum;
}

function runAec() {
  const aligned = new Float32Array(mic.length);
  aligned.set(reference, offset);
  const aec = new AcousticEchoCanceller({
    taps: 256,
    mu: 0.05,
    maxDelayMs: 30,
    initialDelayMs: 0,
  });
  aec.startReference();
  const output = new Float32Array(mic.length);
  let maxLinear = -Infinity;
  let maxTotal = -Infinity;
  let maxResidual = -Infinity;
  for (let index = 0; index + FRAME <= mic.length; index += FRAME) {
    const result = aec.process(
      mic.subarray(index, index + FRAME),
      aligned.subarray(index, index + FRAME),
      true
    );
    output.set(result.output, index);
    if (index >= offset && index < offset + reference.length) {
      maxLinear = Math.max(maxLinear, result.erleDb);
      maxTotal = Math.max(maxTotal, result.totalErleDb);
      maxResidual = Math.max(maxResidual, result.residualSuppressionDb);
    }
  }
  const start = offset + Math.floor(0.5 * RATE);
  const end = Math.min(
    mic.length,
    offset + reference.length - Math.floor(0.2 * RATE)
  );
  const erle =
    10 *
    Math.log10(
      (energy(mic.subarray(start, end)) + 1e-9) /
        (energy(output.subarray(start, end)) + 1e-9)
    );
  return { output, erle, maxLinear, maxTotal, maxResidual, aec };
}

describe("physical acoustic-room AEC", () => {
  it("suppresses a real speaker-to-microphone echo", () => {
    const result = runAec();
    expect(result.erle).toBeGreaterThan(4);
    expect(result.output.length).toBe(mic.length);
    expect(result.maxTotal).toBeGreaterThan(result.maxLinear + 5);
    expect(result.maxResidual).toBeGreaterThan(5);
    expect(result.aec.getDelayMs()).toBeGreaterThanOrEqual(0);
    expect(result.aec.getDelayMs()).toBeLessThan(100);

    const start = offset + Math.floor(0.5 * RATE);
    const end = Math.min(
      mic.length,
      offset + reference.length - Math.floor(0.2 * RATE)
    );
    const micRms = Math.sqrt(energy(mic.subarray(start, end)) / (end - start));
    const outRms = Math.sqrt(
      energy(result.output.subarray(start, end)) / (end - start)
    );
    expect(outRms).toBeLessThan(micRms * 0.7);
  });

  it("does not diverge while the reference is silent", () => {
    const aec = new AcousticEchoCanceller({
      taps: 256,
      mu: 0.05,
      maxDelayMs: 30,
    });
    aec.startReference();
    // 1 s of microphone noise with a silent reference: the filter must not
    // adapt on a near-zero reference norm.
    const silent = new Float32Array(FRAME);
    const noise = new Float32Array(FRAME);
    for (let index = 0; index < FRAME; index += 1) {
      noise[index] = Math.sin(index * 0.7) * 0.01;
    }
    for (let frame = 0; frame < 50; frame += 1) {
      const result = aec.process(noise, silent, true);
      for (const sample of result.output) {
        expect(Math.abs(sample)).toBeLessThan(0.05);
      }
    }
    // At most a few dB of residual gating; the point is that the filter did
    // not blow up on a silent reference.
    expect(aec.getTotalErleDb()).toBeLessThan(6);
  });
});
