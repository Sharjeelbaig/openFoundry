# Server-side reference-signal AEC for Voice Live — 2026-11-06

> The linear canceller described here was later extended with a nonlinear
> residual suppressor and a real acoustic-room capture. See
> `docs/designs/voice-nonlinear-aec-2026-11-06/` for the current system and the
> physical evidence.

Voice Live now cancels the synthesized answer from the microphone signal before
VAD and speech-to-text, using the TTS output itself as the far-end reference.

## Algorithm

`src/lib/aec.ts` implements a linear acoustic echo canceller:

- 16 kHz mono PCM, 20 ms frames (320 samples).
- 256-tap NLMS adaptive filter (16 ms echo path) with `mu = 0.12`.
- Delay search over 0–400 ms using normalized cross-correlation, re-estimated
  every 5 frames; the estimate is smoothed and large jumps are rejected.
- Frame-level double-talk detector: after 1.2 s of warm-up, a frame whose
  residual/microphone RMS ratio is above 0.5 while ERLE is above 10 dB freezes
  adaptation, so near-end speech does not train the filter.
- ERLE is reported in dB per frame and smoothed for `aec.stats`.

The TTS WAV is 22.05 kHz PCM16; `wavToFloat32()` parses the RIFF chunks and
linearly resamples to 16 kHz. Unsupported WAV encodings leave the AEC idle for
that turn rather than breaking playback.

## Voice Live integration

- `onReference()` starts a reference timeline when the answer TTS is synthesized.
- Each incoming 20 ms frame is paired with the reference frame at the same
  sample offset, passed to the canceller, and the filtered frame drives VAD,
  barge-in and the PCM sent to whisper.cpp.
- A 500 ms tail keeps cancelling after the reference ends.
- A 1 s guard after the reference starts prevents residual echo from opening a
  turn while the filter is still converging.
- VAD uses the last echo-only residual RMS (held, not updated during speech) as
  a floor, so the user's own voice can still exceed it.
- Barge-in and client cancel clear the reference; the UI also pauses the audio
  element on `speech.start`/`cancelled`.

## Live echo-suppression evidence

`live-aec.txt` was captured from the running WebSocket with a deterministic
digital echo path: the server mixed the TTS reference back into the microphone
signal at 120 ms and gain 0.7 (`echoSim=1`), then cancelled it before VAD.

```
READY: {"enabled": true, "echoSim": true, "echoGain": 0.7, "echoDelayMs": 120}
NOISE_SUPPRESSION: adaptive-noise-floor+browser-constraints+server-aec
FIRST_TRANSCRIPT: In one short sentence, say hello to the user.
FALSE_STARTS_DURING_ECHO: 0
AEC_STAT: {"erleDb": 10.48, "delayMs": 120, "doubleTalk": false, "frames": 25}
AEC_STAT: {"erleDb": 19.81, "delayMs": 120, "doubleTalk": false, "frames": 50}
AEC_STAT: {"erleDb": 28.31, "delayMs": 120, "doubleTalk": false, "frames": 75}
MAX_ERLE_DB: 28.31 DELAY_MS: 120
SECOND_TRANSCRIPT: What is 2 + 2? Answer with just the number.
SECOND_ANSWER: 4
```

The echo-only stretch produced no false `speech.start`, and the next user
utterance was transcribed cleanly while the reference was still active.

`python-tests.txt` records the full live suite: 14 tests in 61.619s, including
`test_voice_aec_suppression`. The Vitest suite is 173 passed with 1 skipped
(32 files); `vitest-aec.txt` is the focused AEC run.

## Unit tests

`tests/aec.test.ts` (the original linear cases; the file now has 4 tests including the nonlinear room case):

- Cancels a delayed chirp echo: ERLE > 12 dB, delay estimate within 4 ms of
  120 ms.
- Keeps a near-end 1 kHz tone during double talk (output RMS > 0.08) and
  recovers echo suppression afterward (ERLE > 3 dB).
- Parses/resamples a 22.05 kHz TTS WAV and round-trips PCM16.

## Limits

- The linear live test here uses a **digital echo path**. The nonlinear
  extension has a separate real acoustic capture in
  `docs/designs/voice-nonlinear-aec-2026-11-06/`; that is the physical ERLE
  measurement.
- This linear canceller does not model speaker distortion or a moving acoustic
  path; the nonlinear residual suppressor in the extension handles the leftover
  echo. It has no comfort-noise generator.
- The delay search is capped at 400 ms. Very large client playback buffers need
  a larger `maxDelayMs` or a reported playback delay.
- Browser `echoCancellation`, `noiseSuppression` and `autoGainControl` are still
  requested. The server AEC is additive, not a replacement for the browser's
  processing.
- Headphones still give the best result; the server cancellation is not a
  guarantee for every speaker/microphone pair.
