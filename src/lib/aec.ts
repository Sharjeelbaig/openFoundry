// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

/**
 * Server-side acoustic echo cancellation for Voice Live.
 *
 * The synthesized answer is the far-end reference. The canceller estimates the
 * delay between that reference and the microphone, then removes the echo with a
 * sample-by-sample NLMS adaptive filter. It freezes adaptation during double
 * talk so the user's own speech does not train the filter.
 *
 * This is a linear echo canceller over 16 kHz PCM. It does not model speaker
 * nonlinearity, room reverberation beyond the filter length, or a nonstationary
 * acoustic path; the Voice Live client still requests browser AEC.
 */

const DEFAULT_SAMPLE_RATE = 16_000;

export interface AecOptions {
  /** Adaptive filter length in samples. 256 = 16 ms. */
  taps?: number;
  /** NLMS step size. */
  mu?: number;
  /** Maximum reference-to-microphone delay to search, in milliseconds. */
  maxDelayMs?: number;
  /** Re-estimate the delay every N frames. */
  delaySearchEvery?: number;
  /** Known playback/echo delay prior, in milliseconds. */
  initialDelayMs?: number;
  /** How far around the current delay to search, in milliseconds. */
  delaySearchWindowMs?: number;
}

export interface AecFrameResult {
  output: Float32Array;
  /** Linear AEC ERLE before the nonlinear residual suppressor. */
  erleDb: number;
  /** Linear + nonlinear ERLE measured at the microphone. */
  totalErleDb: number;
  /** Additional attenuation applied by the residual suppressor, in dB. */
  residualSuppressionDb: number;
  suppressorGain: number;
  delaySamples: number;
  doubleTalk: boolean;
  referenceActive: boolean;
}

function rmsFloat(samples: Float32Array): number {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return samples.length ? Math.sqrt(sum / samples.length) : 0;
}

export class AcousticEchoCanceller {
  private readonly taps: number;
  private readonly mu: number;
  private readonly maxDelaySamples: number;
  private readonly delaySearchWindowSamples: number;
  private readonly initialDelaySamples: number;
  private readonly delaySearchEvery: number;
  private readonly weights: Float32Array;
  private readonly history: Float32Array;
  private readonly historyLength: number;
  private writeIndex = 0;
  private delaySamples = 0;
  private frameCount = 0;
  private referenceActive = false;
  private erleDb = 0;
  private lastErrorRms = 0;
  private totalErleDb = 0;
  private residualSuppressionDb = 0;
  private suppressorGain = 1;

  constructor(options: AecOptions = {}) {
    this.taps = Math.max(16, Math.min(2_048, Math.floor(options.taps ?? 256)));
    this.mu = Math.max(0.001, Math.min(0.5, options.mu ?? 0.12));
    this.maxDelaySamples = Math.max(
      0,
      Math.round(((options.maxDelayMs ?? 400) / 1000) * DEFAULT_SAMPLE_RATE)
    );
    this.delaySearchEvery = Math.max(1, Math.floor(options.delaySearchEvery ?? 5));
    this.delaySearchWindowSamples = Math.max(
      0,
      Math.min(
        this.maxDelaySamples,
        Math.round(
          ((options.delaySearchWindowMs ?? options.maxDelayMs ?? 400) / 1000) *
            DEFAULT_SAMPLE_RATE
        )
      )
    );
    this.weights = new Float32Array(this.taps);
    this.historyLength = this.maxDelaySamples + this.taps + 1_024;
    this.history = new Float32Array(this.historyLength);
    this.initialDelaySamples = Math.max(
      0,
      Math.min(
        this.maxDelaySamples,
        Math.round(((options.initialDelayMs ?? 0) / 1000) * DEFAULT_SAMPLE_RATE)
      )
    );
    this.delaySamples = this.initialDelaySamples;
  }

  /** Starts a new far-end reference without discarding the learned path. */
  startReference(): void {
    this.referenceActive = true;
    this.frameCount = 0;
    this.erleDb = 0;
    this.totalErleDb = 0;
    this.residualSuppressionDb = 0;
    this.suppressorGain = 1;
    this.lastErrorRms = 0;
    this.delaySamples = this.initialDelaySamples;
    this.history.fill(0);
    this.writeIndex = 0;
  }

  stopReference(): void {
    this.referenceActive = false;
    this.history.fill(0);
    this.writeIndex = 0;
  }

  isReferenceActive(): boolean {
    return this.referenceActive;
  }

  getDelayMs(): number {
    return (this.delaySamples / DEFAULT_SAMPLE_RATE) * 1000;
  }

  getErleDb(): number {
    return this.erleDb;
  }

  getTotalErleDb(): number {
    return this.totalErleDb;
  }

  getResidualSuppressionDb(): number {
    return this.residualSuppressionDb;
  }

  /** RMS of the last suppressor output, used to keep VAD above residual echo. */
  getResidualRms(): number {
    return this.lastErrorRms;
  }

  private write(sample: number): void {
    this.history[this.writeIndex] = sample;
    this.writeIndex = (this.writeIndex + 1) % this.historyLength;
  }

  /** Reads relative to the most recent sample: 0 is newest, 1 is previous. */
  private read(offset: number): number {
    const index =
      (this.writeIndex - 1 - offset + this.historyLength * 2) %
      this.historyLength;
    return this.history[index];
  }

  /**
   * Finds the delay with the strongest normalized correlation between the
   * microphone frame and the reference history. Decimated so the search stays
   * cheap enough for a 20 ms frame budget.
   */
  private estimateDelay(mic: Float32Array): void {
    if (rmsFloat(mic) < 0.004) return;
    const step = 4;
    const window = Math.min(256, mic.length);
    const micStart = Math.max(0, mic.length - window);
    const searchMax = Math.min(
      this.maxDelaySamples,
      this.historyLength - this.taps - 1
    );
    let bestLag = this.delaySamples;
    let bestScore = -Infinity;
    const fromLag = Math.max(0, this.delaySamples - this.delaySearchWindowSamples);
    const toLag = Math.min(
      searchMax,
      this.delaySamples + this.delaySearchWindowSamples
    );
    for (let lag = fromLag; lag <= toLag; lag += step) {
      let dot = 0;
      let micEnergy = 0;
      let refEnergy = 0;
      for (let index = 0; index < window; index += step) {
        const micSample = mic[micStart + index];
        const refSample = this.read(
          lag + (mic.length - 1 - (micStart + index))
        );
        dot += micSample * refSample;
        micEnergy += micSample * micSample;
        refEnergy += refSample * refSample;
      }
      const score = dot / Math.sqrt(micEnergy * refEnergy + 1e-9);
      if (score > bestScore) {
        bestScore = score;
        bestLag = lag;
      }
    }
    if (bestScore > 0.2) {
      if (this.delaySamples === 0) {
        this.delaySamples = bestLag;
      } else if (Math.abs(bestLag - this.delaySamples) <= 64) {
        this.delaySamples = Math.round(
          this.delaySamples * 0.7 + bestLag * 0.3
        );
      }
    }
  }

  /**
   * Processes one microphone frame. The reference frame must cover the same
   * time span as the microphone frame and is pushed before filtering.
   */
  process(
    mic: Float32Array,
    referenceFrame: Float32Array | null,
    /** False while the server has detected near-end speech. */
    suppress = true
  ): AecFrameResult {
    if (referenceFrame) {
      for (let index = 0; index < referenceFrame.length; index += 1) {
        this.write(referenceFrame[index]);
      }
    }
    if (!this.referenceActive) {
      return {
        output: mic,
        erleDb: 0,
        totalErleDb: 0,
        residualSuppressionDb: 0,
        suppressorGain: 1,
        delaySamples: this.delaySamples,
        doubleTalk: false,
        referenceActive: false,
      };
    }

    this.frameCount += 1;
    if (this.frameCount % this.delaySearchEvery === 0) {
      this.estimateDelay(mic);
    }

    const output = new Float32Array(mic.length);
    const x = new Float32Array(this.taps);
    const frameLength = referenceFrame?.length ?? mic.length;
    let micEnergy = 0;
    let outEnergy = 0;
    let estimateEnergy = 0;

    for (let index = 0; index < mic.length; index += 1) {
      const currentOffset = frameLength - 1 - index;
      for (let tap = 0; tap < this.taps; tap += 1) {
        x[tap] = this.read(
          this.delaySamples + currentOffset + (this.taps - 1 - tap)
        );
      }
      let estimate = 0;
      for (let tap = 0; tap < this.taps; tap += 1) {
        estimate += this.weights[tap] * x[tap];
      }
      const error = mic[index] - estimate;
      output[index] = error;
      micEnergy += mic[index] * mic[index];
      outEnergy += error * error;
      estimateEnergy += estimate * estimate;

      // The server's VAD is the near-end detector. Freeze adaptation while the
      // user is speaking so their voice does not train the echo path. Also
      // freeze when the reference is silent: dividing by a near-zero norm
      // would otherwise blow the filter up during TTS pauses.
      if (suppress) {
        let norm = 0;
        for (let tap = 0; tap < this.taps; tap += 1) {
          norm += x[tap] * x[tap];
        }
        if (norm > 1e-4) {
          const step = (this.mu * error) / norm;
          for (let tap = 0; tap < this.taps; tap += 1) {
            this.weights[tap] += step * x[tap];
          }
        }
      }
    }

    const frameLengthSamples = Math.max(1, mic.length);
    const linearOutputRms = Math.sqrt(outEnergy / frameLengthSamples);
    const echoEstimateRms = Math.sqrt(estimateEnergy / frameLengthSamples);

    // Nonlinear residual-echo suppression. When the linear canceller has
    // converged and there is no near-end speech, a soft Wiener-like gain
    // attenuates what remains of the echo. Double talk forces the gain back to
    // unity so the user's voice is not gated.
    let targetGain = 1;
    if (suppress) {
      const residualRatio =
        linearOutputRms / (linearOutputRms + echoEstimateRms + 1e-9);
      targetGain = Math.max(0.05, residualRatio * residualRatio * 0.8);
      this.suppressorGain = this.suppressorGain * 0.7 + targetGain * 0.3;
    } else {
      // Near-end speech: open immediately so the first syllable is not gated.
      this.suppressorGain = 1;
    }
    const gain = Math.max(0.05, Math.min(1, this.suppressorGain));
    for (let index = 0; index < output.length; index += 1) {
      output[index] *= gain;
    }
    const suppressedEnergy = outEnergy * gain * gain;
    this.lastErrorRms = Math.sqrt(suppressedEnergy / frameLengthSamples);
    if (micEnergy > 1e-6) {
      const frameErle = 10 * Math.log10((micEnergy + 1e-9) / (outEnergy + 1e-9));
      this.erleDb =
        this.erleDb * 0.9 + Math.max(-20, Math.min(60, frameErle)) * 0.1;
      const frameTotalErle =
        10 * Math.log10((micEnergy + 1e-9) / (suppressedEnergy + 1e-9));
      this.totalErleDb =
        this.totalErleDb * 0.9 +
        Math.max(-20, Math.min(80, frameTotalErle)) * 0.1;
      const frameSuppression = -20 * Math.log10(gain + 1e-9);
      this.residualSuppressionDb =
        this.residualSuppressionDb * 0.9 +
        Math.max(0, Math.min(40, frameSuppression)) * 0.1;
    }
    return {
      output,
      erleDb: this.erleDb,
      totalErleDb: this.totalErleDb,
      residualSuppressionDb: this.residualSuppressionDb,
      suppressorGain: gain,
      delaySamples: this.delaySamples,
      doubleTalk: !suppress,
      referenceActive: true,
    };
  }
}

export function pcm16ToFloat(buffer: Buffer): Float32Array {
  const samples = new Float32Array(buffer.length >> 1);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = buffer.readInt16LE(index * 2) / 32768;
  }
  return samples;
}

export function floatToPcm16(samples: Float32Array): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);
  for (let index = 0; index < samples.length; index += 1) {
    const sample = Math.max(-1, Math.min(1, samples[index]));
    buffer.writeInt16LE(
      Math.round(sample < 0 ? sample * 0x8000 : sample * 0x7fff),
      index * 2
    );
  }
  return buffer;
}

/** Linear resampling; adequate for turning 22.05 kHz TTS into 16 kHz PCM. */
export function resampleLinear(
  input: Float32Array,
  fromRate: number,
  toRate: number
): Float32Array {
  if (fromRate === toRate) return input;
  const ratio = toRate / fromRate;
  const length = Math.max(1, Math.floor(input.length * ratio));
  const output = new Float32Array(length);
  for (let index = 0; index < length; index += 1) {
    const position = index / ratio;
    const lower = Math.floor(position);
    const upper = Math.min(input.length - 1, lower + 1);
    const fraction = position - lower;
    output[index] =
      input[lower] * (1 - fraction) + input[upper] * fraction;
  }
  return output;
}

/**
 * Parses a mono/stereo 16-bit PCM WAV and resamples it to the target rate. The
 * local TTS engine writes 22.05 kHz PCM16, so this is the reference path used by
 * Voice Live. Unsupported WAV encodings throw instead of returning silence.
 */
export function wavToFloat32(
  buffer: Buffer,
  targetRate = DEFAULT_SAMPLE_RATE
): Float32Array {
  if (buffer.length < 44) throw new Error("The WAV file is too short.");
  if (buffer.toString("ascii", 0, 4) !== "RIFF") {
    throw new Error("The TTS output is not a RIFF WAV.");
  }
  let offset = 12;
  let channels = 1;
  let sampleRate = DEFAULT_SAMPLE_RATE;
  let bits = 16;
  let format = 1;
  let data: Buffer | null = null;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= buffer.length) {
      format = buffer.readUInt16LE(body);
      channels = buffer.readUInt16LE(body + 2);
      sampleRate = buffer.readUInt32LE(body + 4);
      bits = buffer.readUInt16LE(body + 14);
    } else if (id === "data") {
      data = buffer.subarray(body, Math.min(buffer.length, body + size));
      break;
    }
    offset = body + size + (size % 2);
  }
  if (!data) throw new Error("The WAV file has no data chunk.");
  if (format !== 1 || bits !== 16) {
    throw new Error("Only 16-bit PCM WAV is supported as an AEC reference.");
  }
  const frames = Math.floor(data.length / 2 / channels);
  const output = new Float32Array(frames);
  for (let frame = 0; frame < frames; frame += 1) {
    let sum = 0;
    for (let channel = 0; channel < channels; channel += 1) {
      sum += data.readInt16LE((frame * channels + channel) * 2);
    }
    output[frame] = sum / channels / 32768;
  }
  return resampleLinear(output, sampleRate, targetRate);
}
