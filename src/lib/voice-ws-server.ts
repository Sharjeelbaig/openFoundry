// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import "server-only";
import { createServer, type Server } from "http";
import { WebSocket, WebSocketServer } from "ws";
import { POST as chatPost } from "@/app/api/chat/route";
import { NextRequest } from "next/server";
import { getAgent } from "./store";
import { transcribeAudio, synthesizeSpeech } from "./speech";
import { verifyVoiceToken } from "./voice-token";
import {
  AcousticEchoCanceller,
  floatToPcm16,
  pcm16ToFloat,
  wavToFloat32,
} from "./aec";
import { RoomEchoSimulator } from "./room-echo";

/**
 * Full-duplex Voice Live WebSocket.
 *
 * The socket listens on a separate loopback port because Next's App Router does
 * not expose HTTP upgrade handlers. Clients stream 16 kHz mono PCM frames;
 * server-side energy VAD detects speech and silence, speech starts barge in on
 * an active answer, and each completed utterance is transcribed, answered by
 * the agent runtime, and spoken back as base64 WAV chunks.
 */

const SAMPLE_RATE = 16_000;
const FRAME_BYTES = 640; // 20 ms of 16-bit mono PCM
const FRAME_SAMPLES = FRAME_BYTES / 2;
const AEC_TAIL_SAMPLES = Math.round(0.5 * SAMPLE_RATE);
const AEC_GUARD_FRAMES = 100; // 2 s: let the canceller and suppressor converge
const SPEECH_FRAMES = 3;
const SILENCE_FRAMES = 45; // 900 ms
const MAX_UTTERANCE_FRAMES = 1_500; // 30 s
const PRE_ROLL_FRAMES = 10;

interface GlobalWithVoiceWs {
  __openfoundryVoiceWs?: Server;
}

const globalStore = globalThis as unknown as GlobalWithVoiceWs;

function pcmToWav(pcm: Buffer): Buffer {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(SAMPLE_RATE, 24);
  header.writeUInt32LE(SAMPLE_RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function rms(frame: Buffer): number {
  let sum = 0;
  let count = 0;
  for (let offset = 0; offset + 1 < frame.length; offset += 2) {
    const sample = frame.readInt16LE(offset) / 32768;
    sum += sample * sample;
    count += 1;
  }
  return count ? Math.sqrt(sum / count) : 0;
}

async function handleTurn(
  socket: WebSocket,
  agentId: string,
  voice: string,
  rate: number,
  pcm: Buffer,
  generation: number,
  isCurrent: () => boolean,
  signal: AbortSignal,
  onReference: (pcm: Float32Array) => void
) {
  const send = (event: Record<string, unknown>) => {
    if (socket.readyState === WebSocket.OPEN && isCurrent()) {
      socket.send(JSON.stringify(event));
    }
  };

  try {
    const transcription = await transcribeAudio({
      buffer: pcmToWav(pcm),
      name: "voice.wav",
    });
    if (!isCurrent()) return;
    if (!transcription.text.trim()) {
      send({ type: "error", message: "No speech was recognized." });
      send({ type: "turn.done", generation });
      return;
    }
    send({ type: "transcript", text: transcription.text, engine: transcription.engine });

    const agent = await getAgent(agentId);
    if (!agent) throw new Error("The agent no longer exists.");

    const origin =
      process.env.OPENFOUNDRY_ORIGIN ||
      `http://127.0.0.1:${process.env.PORT || 3000}`;
    const chat = await chatPost(
      new NextRequest(new URL("/api/chat", origin), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId: agent.id,
          messages: [{ role: "user", content: transcription.text }],
          saveTrace: true,
        }),
        signal,
      })
    );
    if (!chat.ok || !chat.body) throw new Error(`Agent runtime returned ${chat.status}.`);

    const reader = chat.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let answer = "";
    let model = agent.model;
    let runtimeError: string | null = null;

    const consume = (frame: string) => {
      const line = frame.split("\n").find((item) => item.startsWith("data:"));
      if (!line) return;
      try {
        const event = JSON.parse(line.slice(5).trim()) as {
          type: string;
          text?: string;
          model?: string;
          message?: string;
        };
        if (event.type === "delta" && event.text) {
          answer += event.text;
          send({ type: "assistant.delta", text: event.text, generation });
        } else if (event.type === "meta" && event.model) {
          model = event.model;
        } else if (event.type === "error") {
          runtimeError = event.message || "The agent failed.";
        }
      } catch {
        // Ignore malformed SSE frames.
      }
    };

    while (isCurrent()) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const frames = buffer.split("\n\n");
      buffer = frames.pop() || "";
      for (const frame of frames) consume(frame);
    }
    if (buffer.trim()) consume(buffer);
    if (!isCurrent()) return;
    if (runtimeError) throw new Error(runtimeError);
    if (!answer.trim()) throw new Error("The agent returned no text.");

    send({ type: "assistant.done", text: answer.trim(), model, generation });

    const speech = await synthesizeSpeech({ text: answer.trim(), voice, rate });
    if (!isCurrent()) return;
    // The synthesized answer is the far-end reference for server-side AEC.
    // Parsing happens before audio.start so the reference timeline begins with
    // the same frame the client starts playing.
    try {
      onReference(wavToFloat32(speech.buffer, SAMPLE_RATE));
    } catch {
      // A WAV format the parser does not understand must not break playback;
      // the AEC simply stays idle for this turn.
    }
    send({
      type: "audio.start",
      mime: speech.mime,
      bytes: speech.buffer.length,
      engine: speech.engine,
      generation,
    });
    for (let offset = 0, index = 0; offset < speech.buffer.length; offset += 32 * 1024, index += 1) {
      if (!isCurrent()) return;
      send({
        type: "audio.chunk",
        index,
        data: speech.buffer.subarray(offset, offset + 32 * 1024).toString("base64"),
        generation,
      });
    }
    send({ type: "audio.done", bytes: speech.buffer.length, generation });
    send({ type: "turn.done", generation });
  } catch (error) {
    if (signal.aborted) return;
    send({
      type: "error",
      message: error instanceof Error ? error.message : String(error),
      generation,
    });
    send({ type: "turn.done", generation });
  }
}

export function startVoiceWebSocketServer(): Server | null {
  if (process.env.OPENFOUNDRY_DISABLE_VOICE_WS === "1") return null;
  if (globalStore.__openfoundryVoiceWs) return globalStore.__openfoundryVoiceWs;
  const port = Number(process.env.OPENFOUNDRY_VOICE_WS_PORT || 3002);
  const wss = new WebSocketServer({ noServer: true });
  const server = createServer((_req, res) => {
    res.writeHead(426, { "content-type": "text/plain" });
    res.end("Voice Live uses WebSocket upgrades.\n");
  });

  server.on("upgrade", (req, socket, head) => {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname !== "/") {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, url);
    });
  });

  wss.on(
    "connection",
    async (socket: WebSocket, _req: import("http").IncomingMessage, value: unknown) => {
      const url = value as URL;
      const token = url.searchParams.get("token") || "";
      const verified = await verifyVoiceToken(token);
      if (!verified) {
        socket.send(JSON.stringify({ type: "error", message: "Unauthorized" }));
        socket.close(4401, "Unauthorized");
        return;
      }
      const agent = await getAgent(verified.agentId);
      if (!agent) {
        socket.send(JSON.stringify({ type: "error", message: "Agent not found" }));
        socket.close(4404, "Agent not found");
        return;
      }
      const voice = url.searchParams.get("voice") || "Samantha";
      const rate = Number(url.searchParams.get("rate") || 180);
      const baseThreshold = Math.max(
        0.001,
        Math.min(0.2, Number(url.searchParams.get("threshold") || 0.012))
      );
      const calibrationFrames = 25;

      let leftover = Buffer.alloc(0);
      let preRoll: Buffer[] = [];
      let utterance: Buffer[] = [];
      let speech = false;
      let speechFrames = 0;
      let silenceFrames = 0;
      let generation = 0;
      let controller: AbortController | null = null;
      let alive = true;
      let utteranceStartedAt = 0;
      let calibrationLeft = calibrationFrames;
      let noiseSum = 0;
      let noiseFloor = 0;
      let threshold = baseThreshold;

      const aecEnabled = url.searchParams.get("aec") !== "0";
      const echoSim = url.searchParams.get("echoSim") === "1";
      const echoGain = Math.max(
        0,
        Math.min(1.5, Number(url.searchParams.get("echoGain") || 0.6))
      );
      const echoDelayMs = Math.max(
        0,
        Math.min(400, Number(url.searchParams.get("echoDelayMs") || 120))
      );
      const echoDelaySamples = Math.round((echoDelayMs / 1000) * SAMPLE_RATE);
      const echoPath = url.searchParams.get("echoPath") === "room" ? "room" : "delay";
      const roomEcho =
        echoSim && echoPath === "room"
          ? new RoomEchoSimulator(echoGain)
          : null;
      const aec = aecEnabled
        ? new AcousticEchoCanceller({
          taps: 256,
          mu: 0.05,
          maxDelayMs: 400,
          initialDelayMs: echoDelayMs,
          // Browser playback latency is expected around the seed; track a
          // wider band than a few milliseconds without locking onto early
          // room reflections.
          delaySearchWindowMs: 80,
        })
        : null;
      let referencePcm: Float32Array | null = null;
      let referenceOffset = 0;
      let aecFrameCount = 0;
      let lastAecReport = 0;
      let echoResidual = 0;

      const stopReference = () => {
        referencePcm = null;
        referenceOffset = 0;
        echoResidual = 0;
        roomEcho?.reset();
        aec?.stopReference();
      };

      const onReference = (pcm: Float32Array) => {
        if (!aec) return;
        referencePcm = pcm;
        referenceOffset = 0;
        aecFrameCount = 0;
        lastAecReport = 0;
        echoResidual = 0;
        roomEcho?.reset();
        aec.startReference();
        socket.send(
          JSON.stringify({
            type: "aec.reference",
            samples: pcm.length,
            sampleRate: SAMPLE_RATE,
          })
        );
      };

      socket.send(
        JSON.stringify({
          type: "ready",
          agent: agent.id,
          agentName: agent.name,
          sampleRate: SAMPLE_RATE,
          frameBytes: FRAME_BYTES,
          vad: {
            threshold,
            calibrationFrames,
            speechFrames: SPEECH_FRAMES,
            silenceFrames: SILENCE_FRAMES,
            noiseSuppression: aecEnabled
              ? "adaptive-noise-floor+browser-constraints+server-aec"
              : "adaptive-noise-floor+browser-constraints",
          },
          aec: {
            enabled: aecEnabled,
            echoSim,
            echoGain: aecEnabled ? echoGain : null,
            echoDelayMs: aecEnabled ? echoDelayMs : null,
            echoPath: aecEnabled ? echoPath : null,
          },
        })
      );

      const isCurrent = (turn: number) => alive && turn === generation;

      const finalize = () => {
        if (!speech || utterance.length === 0) return;
        speech = false;
        const pcm = Buffer.concat(utterance);
        utterance = [];
        speechFrames = 0;
        silenceFrames = 0;
        const turn = ++generation;
        controller?.abort();
        controller = new AbortController();
        socket.send(
          JSON.stringify({ type: "speech.end", bytes: pcm.length, generation: turn })
        );
        void handleTurn(
          socket,
          agent.id,
          voice,
          rate,
          pcm,
          turn,
          () => isCurrent(turn),
          controller.signal,
          onReference
        );
      };

      const frame = (chunk: Buffer) => {
        let processed = chunk;
        let aecGuarding = false;
        if (aec && referencePcm) {
          const mic = pcm16ToFloat(chunk);
          const referenceFrame = new Float32Array(FRAME_SAMPLES);
          for (let index = 0; index < FRAME_SAMPLES; index += 1) {
            const refIndex = referenceOffset + index;
            if (refIndex < referencePcm.length) {
              referenceFrame[index] = referencePcm[refIndex];
            }
          }
          if (echoSim) {
            // Deterministic test path: mix a delayed reference into the mic so
            // the AEC has a real echo to remove without a physical speaker.
            // echoPath=room adds nonlinear distortion and a short synthetic
            // room tail; echoPath=delay is the simpler linear path.
            if (roomEcho) {
              const echoFrame = new Float32Array(FRAME_SAMPLES);
              for (let index = 0; index < FRAME_SAMPLES; index += 1) {
                const echoIndex = referenceOffset - echoDelaySamples + index;
                if (echoIndex >= 0 && echoIndex < referencePcm.length) {
                  echoFrame[index] = referencePcm[echoIndex];
                }
              }
              roomEcho.mix(echoFrame, mic);
            } else {
              for (let index = 0; index < FRAME_SAMPLES; index += 1) {
                const echoIndex = referenceOffset - echoDelaySamples + index;
                if (echoIndex >= 0 && echoIndex < referencePcm.length) {
                  mic[index] += referencePcm[echoIndex] * echoGain;
                }
              }
            }
          }
          const suppress = !speech && speechFrames === 0;
          const result = aec.process(mic, referenceFrame, suppress);
          processed = floatToPcm16(result.output);
          aecFrameCount += 1;
          if (aecFrameCount % 25 === 0 && aecFrameCount !== lastAecReport) {
            lastAecReport = aecFrameCount;
            socket.send(
              JSON.stringify({
                type: "aec.stats",
                generation,
                erleDb: Number(result.erleDb.toFixed(2)),
                totalErleDb: Number(result.totalErleDb.toFixed(2)),
                residualSuppressionDb: Number(
                  result.residualSuppressionDb.toFixed(2)
                ),
                suppressorGain: Number(result.suppressorGain.toFixed(3)),
                echoPath,
                delayMs: Number(
                  ((result.delaySamples / SAMPLE_RATE) * 1000).toFixed(1)
                ),
                doubleTalk: result.doubleTalk,
                echoSim,
                frames: aecFrameCount,
              })
            );
          }
          aecGuarding = aecFrameCount < AEC_GUARD_FRAMES;
          referenceOffset += FRAME_SAMPLES;
          if (referenceOffset >= referencePcm.length + AEC_TAIL_SAMPLES) {
            stopReference();
            socket.send(JSON.stringify({ type: "aec.released", generation }));
          }
        }
        const energy = rms(processed);
        const residualRms = aec?.getResidualRms() ?? 0;
        // Hold the last echo-only residual; do not let the user's own speech
        // raise the VAD threshold above their voice.
        if (aec && referencePcm && !speech && energy < 0.08) {
          echoResidual = residualRms;
        }
        const vadThreshold =
          aec && referencePcm
            ? Math.max(threshold, echoResidual * 1.8)
            : threshold;
        if (calibrationLeft > 0) {
          noiseSum += energy;
          calibrationLeft -= 1;
          if (calibrationLeft === 0) {
            noiseFloor = noiseSum / calibrationFrames;
            threshold = Math.max(baseThreshold, noiseFloor * 2.5);
            socket.send(
              JSON.stringify({
                type: "vad.ready",
                threshold,
                noiseFloor,
              })
            );
          }
          return;
        }
        if (!speech && !referencePcm && energy < threshold) {
          // Track the ambient floor while nobody is speaking; do not let it
          // creep up during an utterance or while residual echo is present.
          noiseFloor = noiseFloor * 0.98 + energy * 0.02;
          threshold = Math.max(baseThreshold, noiseFloor * 2.5);
        }
        if (!speech) {
          preRoll.push(processed);
          if (preRoll.length > PRE_ROLL_FRAMES) preRoll.shift();
          if (aecGuarding) {
            // Residual echo during filter convergence must not start a turn.
            speechFrames = 0;
            return;
          }
          if (energy >= vadThreshold) {
            speechFrames += 1;
            if (speechFrames >= SPEECH_FRAMES) {
              speech = true;
              silenceFrames = 0;
              utteranceStartedAt = Date.now();
              utterance = [...preRoll];
              preRoll = [];
              if (controller) {
                controller.abort();
                stopReference();
                generation += 1;
                socket.send(
                  JSON.stringify({
                    type: "cancelled",
                    reason: "barge-in",
                    generation: generation - 1,
                  })
                );
              }
              controller = null;
              socket.send(JSON.stringify({ type: "speech.start" }));
            }
          } else {
            speechFrames = 0;
          }
          return;
        }
        utterance.push(processed);
        if (energy < vadThreshold) {
          silenceFrames += 1;
          if (silenceFrames >= SILENCE_FRAMES) finalize();
        } else {
          silenceFrames = 0;
        }
        if (
          utterance.length >= MAX_UTTERANCE_FRAMES ||
          Date.now() - utteranceStartedAt > 120_000
        ) {
          finalize();
        }
      };

      socket.on("message", (data, binary) => {
        if (binary) {
          const incoming = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          leftover = Buffer.concat([leftover, incoming]);
          while (leftover.length >= FRAME_BYTES) {
            frame(leftover.subarray(0, FRAME_BYTES));
            leftover = leftover.subarray(FRAME_BYTES);
          }
          return;
        }
        try {
          const message = JSON.parse(data.toString()) as { type?: string };
          if (message.type === "stop") finalize();
          if (message.type === "cancel") {
            if (controller) controller.abort();
            stopReference();
            controller = null;
            generation += 1;
            speech = false;
            utterance = [];
            socket.send(JSON.stringify({ type: "cancelled", reason: "client" }));
          }
          if (message.type === "ping") socket.send(JSON.stringify({ type: "pong" }));
        } catch {
          // Ignore malformed control messages.
        }
      });

      socket.on("close", () => {
        alive = false;
        controller?.abort();
        stopReference();
      });
      socket.on("error", () => {
        alive = false;
        controller?.abort();
        stopReference();
      });
    }
  );

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.readyState === WebSocket.OPEN) socket.ping();
    }
  }, 30_000);
  heartbeat.unref?.();
  wss.on("close", () => clearInterval(heartbeat));

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      console.error(
        `Voice Live WebSocket could not listen on ${port}: address already in use.`
      );
      return;
    }
    console.error(`Voice Live WebSocket error: ${error.message}`);
  });
  server.listen(port, "127.0.0.1", () => {
    console.log(`Voice Live WebSocket listening on ws://127.0.0.1:${port}`);
  });
  globalStore.__openfoundryVoiceWs = server;
  return server;
}
