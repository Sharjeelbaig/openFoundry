# Voice Live — local realtime audio transport

Date: 2026-11-06

Voice Live is implemented as a **turn-based streaming HTTP transport**, not a
full-duplex WebSocket. A spoken turn is uploaded, transcribed locally, answered
by the configured agent, and the answer audio is streamed back as SSE events.
That is the honest local equivalent of Azure Voice Live given the local STT/TTS
engines are file-based.

## Endpoint

`POST /api/voice/live`

- Authentication: project API key (`api-key` / bearer) or a signed-in session.
- Input: `multipart/form-data` with `file` (WAV, WebM/Opus, MP3, M4A, …), or raw
  audio bytes with `?filename=…`.
- Optional fields/query: `agent`, `voice`, `rate`.
- Response: `text/event-stream`.

Pipeline:

1. ffmpeg converts the recording to 16 kHz mono PCM WAV.
2. whisper.cpp transcribes it.
3. The selected agent runs through the same `/api/chat` runtime as the builder,
   with tools, knowledge and guardrails.
4. macOS `say` synthesizes the answer.
5. The SSE stream returns the transcript, assistant deltas, and base64 WAV
   chunks.

## Events

```
session        { agent, agentName, stt, tts }
transcript     { text, engine }
assistant.delta{ text }
assistant.done { text, model, citations }
audio.start    { mime, bytes, engine }
audio.chunk    { index, data }   // base64 WAV
audio.done     { bytes }
done           { }
error          { message }
```

## Live round trip

`roundtrip-summary.txt` and `roundtrip.sse` come from the live server:

- transcript: `In one short sentence, say hello to the user.`
- answer: `Hello! How can I help you today?`
- audio: `109424` bytes, `RIFF` header, `audio/wav`
- events: `session, transcript, assistant.done, audio.start, audio.done, done`

`voice-live-page.png` shows the `/build/voice` page: agent selection, recording
and upload controls, the transcript, the streamed answer, and the audio player.

## UI

`/build/voice` records with `MediaRecorder` (WebM/Opus), uploads the turn, parses
the SSE stream, displays transcript and answer deltas, assembles the audio chunks
into a WAV Blob, and autoplays/offers it in an audio player. A file-upload path is
available for environments without a microphone.

## Test

`sdk/python/tests/test_live.py::test_voice_live_transport` generates a real WAV
with macOS `say`, sends it to the endpoint, and asserts:

- transcript is non-empty,
- assistant text streams,
- audio chunks decode to a RIFF WAV,
- the final event is `done`.

Run:

```bash
OPENFOUNDRY_API_KEY="<project key>" \
OPENFOUNDRY_MODEL="gemma4:31b-cloud" \
PYTHONPATH=sdk/python python -m unittest -v sdk/python/tests/test_live.py
```

## Full-duplex WebSocket

`ws://127.0.0.1:3002/` is a persistent WebSocket started by the Next server
instrumentation. It is separate from the SSE endpoint because App Router route
handlers do not expose HTTP upgrades.

- Auth: short-lived HMAC token from `POST /api/voice/live/token` (session or
  project key). The socket is bound to `127.0.0.1` and the token is valid for
  two minutes.
- Audio: 16-bit mono PCM at 16 kHz, 640-byte frames (20 ms).
- Server VAD: 3 consecutive speech frames start a turn; 45 silence frames
  (900 ms) end it; 200 ms pre-roll is included.
- Barge-in: speech during an active turn aborts the agent stream, increments
  the turn generation, sends `cancelled`, and starts a new utterance.
- Events: `ready`, `speech.start`, `speech.end`, `transcript`,
  `assistant.delta`, `assistant.done`, `audio.start/chunk/done`, `cancelled`,
  `turn.done`, `error`.

`full-duplex-barge-in.txt` records a live run:

```
FIRST_TRANSCRIPT: In one short sentence, say hello to the user.
CANCELLED: {'type': 'cancelled', 'reason': 'barge-in', 'generation': 1}
SECOND_TRANSCRIPT: What is 2 + 2? Answer with just the number.
ANSWER: 4
BARGE_IN: True
AUDIO_BYTES: 29760 RIFF: bytearray(b'RIFF')
```

The `/build/voice` page has a **Full duplex (WebSocket)** panel that streams
microphone PCM, shows the transcript/answer, and plays returned WAV chunks.

## Noise suppression

- Browser capture requests `echoCancellation`, `noiseSuppression` and
  `autoGainControl` from `getUserMedia`.
- The server calibrates a noise floor from the first 25 frames (500 ms), then
  sets the VAD threshold to `max(base, noiseFloor * 2.5)`.
- The floor adapts only while nobody is speaking.
- `noise-gate.txt` records a live run with 1 second of background noise:

```
VAD_READY: {'type': 'vad.ready', 'threshold': 0.05696383088215882,
            'noiseFloor': 0.022785532352863527}
NOISE_ONLY_SPEECH_STARTS: 0
SPEECH_TURN: True
```

Server-side reference-signal AEC is now implemented: the TTS output is parsed to
16 kHz PCM, aligned with the microphone by an adaptive delay search, and removed
with a 256-tap NLMS filter plus a nonlinear residual suppressor before VAD/STT.
See `docs/designs/voice-aec-2026-11-06/` for the linear evidence and
`docs/designs/voice-nonlinear-aec-2026-11-06/` for the nonlinear synthetic-room
and real acoustic-capture measurements. Browser AEC remains enabled as well.

## Limits

- The SSE endpoint remains turn-based. The WebSocket is full-duplex with
  server-side energy VAD and barge-in.
- ffmpeg is required for browser WebM/Opus input on the SSE path.
- whisper.cpp and a ggml model are required; the Speech page installs them.
- Browser AEC/noise suppression, an adaptive server noise floor, server-side
  reference-signal AEC and nonlinear residual-echo suppression are implemented;
  semantic VAD is not.
