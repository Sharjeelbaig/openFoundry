# Nonlinear residual-echo suppression and acoustic-room validation — 2026-11-06

Voice Live no longer relies only on the linear NLMS canceller. A nonlinear
residual suppressor removes the echo the linear filter leaves behind, and the
canceller has now been measured against a real speaker-to-microphone capture,
not just a synthetic path.

## What changed

### Residual suppressor

`src/lib/aec.ts`:

- The linear 256-tap NLMS canceller is unchanged in structure.
- After the linear filter, a soft Wiener-like gain is computed from the frame
  RMS of the linear output and the echo estimate:
  `target = max(0.05, (out / (out + estimate))^2 * 0.8)`.
- The gain is smoothed (0.7 previous + 0.3 target) and floored at 0.05.
- `suppress=false` (server VAD says near-end speech) opens the gain to 1
  immediately, so the first syllable is not gated.
- `AecFrameResult` now reports `totalErleDb`, `residualSuppressionDb`,
  `suppressorGain`, and the linear `erleDb` separately.
- Adaptation now freezes when the reference norm is near zero. Without this,
  a TTS pause divided by ~1e-6 and blew the filter up. A unit test covers the
  silent-reference case.
- `startReference()` reseeds the delay from `initialDelayMs`. It previously
  reset the delay to 0, which let the search lock onto a room-reflection peak
  instead of the playback offset. The live server seeds it from `echoDelayMs`.

### Voice Live integration

- `aec.stats` includes `totalErleDb`, `residualSuppressionDb`,
  `suppressorGain`, and `echoPath`.
- The UI shows `total (linear + residual)` echo suppression and the delay.
- `echoPath=room` mixes the TTS reference through a nonlinear `tanh` stage and
  a 64 ms synthetic room impulse response before the AEC. `echoPath=delay`
  remains the simple linear path.
- The server VAD gates suppression: `suppress = !speech && speechFrames === 0`.
  The AEC guard is 100 frames (2 s), the linear step is `mu = 0.05`, and the
  delay is seeded from `echoDelayMs`. The live server searches 80 ms around the
  seed; the unit and fixture tests search their full configured range.

## Synthetic room evidence

`live-room-aec.txt` was captured from the running WebSocket with
`echoPath=room`, gain 0.7 and a 120 ms reference delay. The second utterance
was sent while the first answer's reference was still alive.

```
READY: {"enabled": true, "echoSim": true, "echoGain": 0.7, "echoDelayMs": 120, "echoPath": "room"}
FIRST_TRANSCRIPT: Say exactly, the vault code is 4417.
AEC_REFERENCE_SAMPLES: 69667
AEC_RELEASED_AT_FRAME: 242
FALSE_STARTS_DURING_ROOM_ECHO: 0
AEC_STAT frames=175: erleDb=12.84 totalErleDb=37.35 residualSuppressionDb=24.52 suppressorGain=0.067 delayMs=119.9
MAX_TOTAL_ERLE_DB: 37.35
MAX_LINEAR_ERLE_DB: 12.84
MAX_RESIDUAL_SUPPRESSION_DB: 24.52
DELAY_MS: 119.9
SECOND_TRANSCRIPT: What is 2 + 2? Answer with just the number.
SECOND_ANSWER: 4
```

The echo-only stretch produced no false turn. The linear filter absorbed
12.84 dB and the residual suppressor added 24.52 dB, for 37.35 dB total on this
synthetic nonlinear room path.

`tests/aec.test.ts` (4 tests) adds a nonlinear-room case: `tanh(2.4x)` plus a
250 ms synthetic RIR with a diffuse tail. The linear filter reaches about
7.3 dB; the total reaches about 17.4 dB with about 10.1 dB from the residual
suppressor. A separate double-talk test confirms the near-end tone survives.

## Physical acoustic-room evidence

`tests/fixtures/physical-aec/` is a real 10 s capture: the built-in MacBook Pro
microphone recorded the built-in speakers playing a `say` TTS reference, on the
same desk, with no headphones. `scripts/physical-aec-capture.py` reproduces it.

The reference was padded by the measured playback offset (19,197 samples =
1,199.8 ms), then the production canceller class ran on the aligned pair. The
delay search was bounded to 30 ms because the reference was already aligned;
the live server uses 400 ms with a 120 ms seed. `physical-room-aec.txt`:

```
offset: 19197
erle_0_5_to_end: 5.87
erle_1_to_4_5: 4.24
erle_2_to_4: 1.71
erle_2_to_5: 3.86
maxLinear: 5.5
maxTotal: 23.23
maxResidual: 17.79
delayMs: 2.75
micRms: 0.020387
outRms: 0.010374
```

The echo was about 11.5 dB above the ambient floor (`micRms` 0.0204 vs
`ambientRms` 0.00544). The canceller removed 5.87 dB of the echo over the whole
reference; the best frame reached 23.23 dB total, of which 17.79 dB was the
residual suppressor. The measured acoustic delay after alignment was 2.75 ms.

The built-in microphone array makes this path non-linear/time-varying: even an
offline optimal linear FIR cannot do much better than the production linear
filter on the same window (`linear-ceiling.txt`):

| Filter | ERLE on 1.0–4.5 s |
| --- | ---: |
| 256 taps (16 ms) | 2.98 dB |
| 512 taps (32 ms) | 3.15 dB |
| 1024 taps (64 ms) | 3.24 dB |
| 2048 taps (128 ms) | 3.31 dB |

The production AEC reaches 4.24 dB on that same window and 5.87 dB overall, so
the nonlinear suppressor is doing work beyond the best linear ceiling measured
here. That is the honest result: a modest acoustic ERLE on a hard, non-LTI
built-in path, not the 30+ dB of the synthetic room.

`capture-notes.txt` records the clock issue: `ffmpeg`/AVFoundation dropped
samples (0.5 s clicks recorded at 0.4 s) while a steady tone kept its pitch;
sounddevice with `latency="high"` preserved the click intervals exactly. The
fixture uses the sounddevice path.

## Tests

- `tests/aec.test.ts` — 4 tests: delayed linear echo, double-talk preservation,
  nonlinear room suppression, WAV parse/resample.
- `tests/aec-physical.test.ts` — 2 tests against the real fixture: the physical
  capture is suppressed (aggregate ERLE > 4 dB, peak total > peak linear + 5 dB,
  output RMS < 0.7 × mic RMS), and a silent reference does not diverge.
- The full Vitest suite is 205 passed with 1 skipped (36 files).
- The live Python suite is 14 tests, including `test_voice_aec_suppression`
  (now `echoPath=room`); `python-tests.txt` records 14 tests in 96.849s.

## Limits

- The physical measurement used the built-in microphone and speakers. The
  microphone array's processing makes the echo path non-LTI, so the result is
  5.87 dB aggregate (23.23 dB peak), not a studio-grade ERLE.
- The suppressor is a frame-level soft gain, not a neural post-filter or
  spectral residual-echo suppressor. It can attenuate near-end speech if the
  VAD is wrong; the VAD gate and the 1.0 gain on speech are the safeguards.
- The linear filter is 256 taps (16 ms). A larger filter did not help this
  physical path, but a different room/speaker may benefit from more taps.
- `echoPath=room` is a synthetic nonlinear echo, not a captured room. The
  physical fixture is the real acoustic evidence.
- Headphones still give the best live result; the server AEC is additive to the
  browser's echoCancellation/noiseSuppression constraints.
