// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { describe, expect, it } from "vitest";
import {
  AcousticEchoCanceller,
  floatToPcm16,
  pcm16ToFloat,
  wavToFloat32,
} from "@/lib/aec";

const RATE = 16_000;
const FRAME = 320;

function chirp(seconds: number, amplitude = 0.5): Float32Array {
  const samples = new Float32Array(Math.floor(seconds * RATE));
  const f0 = 250;
  const f1 = 3_200;
  const duration = samples.length / RATE;
  for (let index = 0; index < samples.length; index += 1) {
    const time = index / RATE;
    const phase =
      2 * Math.PI * (f0 * time + ((f1 - f0) / (2 * duration)) * time * time);
    const envelope = Math.min(1, time * 8, (duration - time) * 8);
    samples[index] = amplitude * envelope * Math.sin(phase);
  }
  return samples;
}

function echoDelay(): number {
  return Math.round(0.12 * RATE); // 120 ms
}

function addEcho(
  reference: Float32Array,
  gain = 0.7,
  noise = 0.003
): Float32Array {
  const delay = echoDelay();
  const mic = new Float32Array(reference.length);
  let seed = 7;
  for (let index = 0; index < mic.length; index += 1) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const dither = (seed / 0xffffffff - 0.5) * 2 * noise;
    mic[index] =
      (index >= delay ? reference[index - delay] * gain : 0) + dither;
  }
  return mic;
}

function energy(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return sum;
}

describe("acoustic echo cancellation", () => {
  it("cancels a delayed reference echo and estimates the delay", () => {
    const reference = chirp(3);
    const mic = addEcho(reference);
    const aec = new AcousticEchoCanceller({ taps: 256, mu: 0.12 });
    aec.startReference();
    const output = new Float32Array(mic.length);
    for (let offset = 0; offset + FRAME <= mic.length; offset += FRAME) {
      const result = aec.process(
        mic.subarray(offset, offset + FRAME),
        reference.subarray(offset, offset + FRAME)
      );
      output.set(result.output, offset);
    }

    const start = Math.floor(1.2 * RATE);
    const erle =
      10 *
      Math.log10(
        (energy(mic.subarray(start)) + 1e-9) /
          (energy(output.subarray(start)) + 1e-9)
      );
    expect(erle).toBeGreaterThan(12);
    expect(Math.abs(aec.getDelayMs() - 120)).toBeLessThan(4);
    expect(aec.getErleDb()).toBeGreaterThan(10);
  });

  it("keeps near-end speech during double talk and recovers", () => {
    const reference = chirp(3);
    const mic = addEcho(reference);
    // Add a near-end 1 kHz tone during the second half.
    const toneStart = Math.floor(1.5 * RATE);
    const toneEnd = Math.floor(2.0 * RATE);
    for (let index = toneStart; index < toneEnd; index += 1) {
      mic[index] += 0.25 * Math.sin((2 * Math.PI * 1000 * index) / RATE);
    }

    const aec = new AcousticEchoCanceller({ taps: 256, mu: 0.12 });
    aec.startReference();
    const output = new Float32Array(mic.length);
    let doubleTalkSeen = false;
    for (let offset = 0; offset + FRAME <= mic.length; offset += FRAME) {
      const nearEnd = offset >= toneStart && offset < toneEnd;
      const result = aec.process(
        mic.subarray(offset, offset + FRAME),
        reference.subarray(offset, offset + FRAME),
        !nearEnd
      );
      output.set(result.output, offset);
      if (result.doubleTalk) doubleTalkSeen = true;
    }

    expect(doubleTalkSeen).toBe(true);
    const tone = output.subarray(toneStart, toneEnd);
    const toneRms = Math.sqrt(energy(tone) / tone.length);
    expect(toneRms).toBeGreaterThan(0.08);
    const after = Math.floor(2.4 * RATE);
    const erleAfter =
      10 *
      Math.log10(
        (energy(mic.subarray(after)) + 1e-9) /
          (energy(output.subarray(after)) + 1e-9)
      );
    expect(erleAfter).toBeGreaterThan(3);
  });

  it("suppresses residual nonlinear room echo beyond the linear filter", () => {
    const reference = chirp(3);
    // A nonlinear loudspeaker and a 250 ms synthetic room tail. The linear
    // 256-tap filter (16 ms) cannot model the late reverb; the nonlinear
    // suppressor is what removes the remaining echo.
    const distorted = new Float32Array(reference.length);
    for (let index = 0; index < reference.length; index += 1) {
      distorted[index] = Math.tanh(2.4 * reference[index]);
    }
    const rirLength = Math.round(0.25 * RATE);
    const rir = new Float32Array(rirLength);
    rir[0] = 0.7;
    const early = [
      [0.012, 0.42],
      [0.027, -0.31],
      [0.043, 0.24],
      [0.071, -0.16],
      [0.104, 0.11],
    ];
    for (const [delay, gain] of early) {
      rir[Math.round(delay * RATE)] += gain;
    }
    let seed = 19;
    for (let index = Math.round(0.08 * RATE); index < rirLength; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const decay = Math.exp(-index / (0.07 * RATE));
      rir[index] += ((seed / 0xffffffff - 0.5) * 2 * 0.18) * decay;
    }
    const echo = new Float32Array(reference.length);
    for (let index = 0; index < reference.length; index += 1) {
      let sum = 0;
      for (let tap = 0; tap < rirLength && tap <= index; tap += 1) {
        sum += rir[tap] * distorted[index - tap];
      }
      echo[index] = sum;
    }
    const mic = new Float32Array(reference.length);
    seed = 23;
    for (let index = 0; index < mic.length; index += 1) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const noise = (seed / 0xffffffff - 0.5) * 2 * 0.002;
      mic[index] = 0.9 * echo[index] + noise;
    }

    const aec = new AcousticEchoCanceller({ taps: 256, mu: 0.12 });
    aec.startReference();
    const output = new Float32Array(mic.length);
    for (let offset = 0; offset + FRAME <= mic.length; offset += FRAME) {
      const result = aec.process(
        mic.subarray(offset, offset + FRAME),
        reference.subarray(offset, offset + FRAME)
      );
      output.set(result.output, offset);
    }
    const start = Math.floor(1.2 * RATE);
    const totalErle =
      10 *
      Math.log10(
        (energy(mic.subarray(start)) + 1e-9) /
          (energy(output.subarray(start)) + 1e-9)
      );
    expect(totalErle).toBeGreaterThan(10);
    expect(aec.getTotalErleDb()).toBeGreaterThan(aec.getErleDb() + 2);
    expect(aec.getResidualSuppressionDb()).toBeGreaterThan(1);
  });

  it("parses and resamples a 22.05 kHz TTS WAV", () => {
    const rate = 22_050;
    const seconds = 0.2;
    const frames = Math.floor(rate * seconds);
    const data = Buffer.alloc(frames * 2);
    for (let index = 0; index < frames; index += 1) {
      data.writeInt16LE(
        Math.round(0.5 * 32767 * Math.sin((2 * Math.PI * 440 * index) / rate)),
        index * 2
      );
    }
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + data.length, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(rate, 24);
    header.writeUInt32LE(rate * 2, 28);
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(data.length, 40);
    const wav = Buffer.concat([header, data]);
    const pcm = wavToFloat32(wav, RATE);
    expect(pcm.length).toBeCloseTo(seconds * RATE, -1);
    expect(Math.max(...pcm)).toBeGreaterThan(0.4);
    expect(Math.min(...pcm)).toBeLessThan(-0.4);

    const roundTrip = pcm16ToFloat(floatToPcm16(pcm));
    expect(roundTrip.length).toBe(pcm.length);
    expect(Math.abs(roundTrip[100] - pcm[100])).toBeLessThan(1 / 32768);
  });
});
