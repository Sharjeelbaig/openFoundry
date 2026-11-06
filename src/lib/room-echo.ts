// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Synthetic room echo for Voice Live validation.
 *
 * This is not a captured room. It convolves a nonlinearly distorted reference
 * with a short synthetic impulse response (direct path, early reflections and a
 * decaying diffuse tail). It exists so the nonlinear residual suppressor can be
 * exercised end to end without a physical microphone. A real acoustic-room
 * capture needs microphone permission and an unlocked GUI session.
 */

const SAMPLE_RATE = 16_000;

export function syntheticRoomImpulse(
  seconds = 0.064,
  seed = 17
): Float32Array {
  const length = Math.max(4, Math.round(seconds * SAMPLE_RATE));
  const rir = new Float32Array(length);
  rir[0] = 0.7;
  const early: [number, number][] = [
    [0.006, 0.42],
    [0.014, -0.31],
    [0.023, 0.24],
    [0.037, -0.16],
    [0.052, 0.11],
  ];
  for (const [delay, gain] of early) {
    const index = Math.round(delay * SAMPLE_RATE);
    if (index < length) rir[index] += gain;
  }
  let state = seed >>> 0;
  const tailStart = Math.round(0.02 * SAMPLE_RATE);
  for (let index = tailStart; index < length; index += 1) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const decay = Math.exp(-index / (0.018 * SAMPLE_RATE));
    rir[index] += ((state / 0xffffffff - 0.5) * 2 * 0.18) * decay;
  }
  return rir;
}

export class RoomEchoSimulator {
  private readonly rir: Float32Array;
  private readonly history: Float32Array;
  private readonly gain: number;
  private writeIndex = 0;

  constructor(gain = 0.7, rir = syntheticRoomImpulse()) {
    this.gain = gain;
    this.rir = rir;
    this.history = new Float32Array(rir.length);
  }

  reset(): void {
    this.history.fill(0);
    this.writeIndex = 0;
  }

  /** Adds the distorted, reverberant reference to the microphone frame. */
  mix(reference: Float32Array, output: Float32Array): void {
    const length = this.history.length;
    for (let index = 0; index < reference.length; index += 1) {
      const distorted = Math.tanh(2.4 * reference[index]);
      this.history[this.writeIndex] = distorted;
      this.writeIndex = (this.writeIndex + 1) % length;
      let sum = 0;
      for (let tap = 0; tap < this.rir.length; tap += 1) {
        const historyIndex =
          (this.writeIndex - 1 - tap + length * 2) % length;
        sum += this.rir[tap] * this.history[historyIndex];
      }
      output[index] += this.gain * sum;
    }
  }
}
