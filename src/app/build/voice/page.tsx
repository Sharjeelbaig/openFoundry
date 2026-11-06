// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpload20Regular,
  Mic20Regular,
  Speaker220Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent } from "@/lib/types";

interface VoiceEvent {
  type: string;
  sessionId?: string;
  text?: string;
  message?: string;
  mime?: string;
  bytes?: number;
  data?: string;
  index?: number;
  agent?: string;
  agentName?: string;
  engine?: string;
  erleDb?: number;
  totalErleDb?: number;
  residualSuppressionDb?: number;
  suppressorGain?: number;
  delayMs?: number;
  frames?: number;
  doubleTalk?: boolean;
  enabled?: boolean;
  echoSim?: boolean;
  aec?: { enabled?: boolean; echoSim?: boolean };
}

export default function VoiceLivePage() {
  const { toast } = useToast();
  const { data } = useApi<{ agents: Agent[] }>("/api/agents", 15_000);
  const agents = data?.agents ?? [];
  const [agentId, setAgentId] = useState("");
  const [voice, setVoice] = useState("Samantha");
  const [rate, setRate] = useState(180);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [answer, setAnswer] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [events, setEvents] = useState<string[]>([]);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const audioRef = useRef<string | null>(null);
  const [duplex, setDuplex] = useState<"off" | "connecting" | "listening" | "working">("off");
  const [duplexTranscript, setDuplexTranscript] = useState("");
  const [duplexAnswer, setDuplexAnswer] = useState("");
  const [duplexStatus, setDuplexStatus] = useState("");
  const [duplexAudioUrl, setDuplexAudioUrl] = useState<string | null>(null);
  const [duplexAec, setDuplexAec] = useState<{
    totalErleDb: number;
    linearErleDb: number;
    residualSuppressionDb: number;
    delayMs: number;
    frames: number;
  } | null>(null);
  const [aecEnabled, setAecEnabled] = useState(false);
  const duplexWs = useRef<WebSocket | null>(null);
  const duplexContext = useRef<AudioContext | null>(null);
  const duplexStream = useRef<MediaStream | null>(null);
  const duplexProcessor = useRef<ScriptProcessorNode | null>(null);
  const duplexChunks = useRef<Uint8Array[]>([]);
  const duplexAudioRef = useRef<string | null>(null);
  const duplexAudioElement = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!agentId && data?.agents?.length) setAgentId(data.agents[0].id);
  }, [data, agentId]);

  useEffect(
    () => () => {
      if (audioRef.current) URL.revokeObjectURL(audioRef.current);
    },
    []
  );

  const sendAudio = async (blob: Blob, name: string) => {
    setBusy(true);
    setTranscript("");
    setAnswer("");
    setEvents([]);
    try {
      const form = new FormData();
      form.append("file", blob, name);
      form.append("agent", agentId);
      form.append("voice", voice);
      form.append("rate", String(rate));
      const response = await fetch("/api/voice/live", { method: "POST", body: form });
      if (!response.ok) {
        const json = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || `Voice Live returned ${response.status}.`);
      }
      if (!response.body) throw new Error("Voice Live returned no stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let audioType = "audio/wav";
      const audioChunks: Uint8Array[] = [];

      const consume = (frame: string) => {
        const dataLine = frame
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) return;
        let event: VoiceEvent;
        try {
          event = JSON.parse(dataLine.slice(5).trim()) as VoiceEvent;
        } catch {
          return;
        }
        setEvents((current) => [...current.slice(-8), event.type]);
        if (event.type === "session") {
          setEvents((current) => [
            ...current,
            `agent: ${event.agentName || event.agent || "unknown"}`,
          ]);
        } else if (event.type === "transcript" && event.text) {
          setTranscript(event.text);
        } else if (event.type === "assistant.delta" && event.text) {
          setAnswer((current) => current + event.text);
        } else if (event.type === "audio.start") {
          audioType = event.mime || "audio/wav";
          audioChunks.length = 0;
        } else if (event.type === "audio.chunk" && event.data) {
          const bytes = Uint8Array.from(atob(event.data), (char) =>
            char.charCodeAt(0)
          );
          audioChunks.push(bytes);
        } else if (event.type === "audio.done") {
          if (audioRef.current) URL.revokeObjectURL(audioRef.current);
          const url = URL.createObjectURL(
            new Blob(audioChunks as BlobPart[], { type: audioType })
          );
          audioRef.current = url;
          setAudioUrl(url);
        } else if (event.type === "error") {
          toast(event.message || "Voice Live failed.", "error");
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() || "";
        for (const frame of frames) consume(frame);
      }
      if (buffer.trim()) consume(buffer);
    } catch (error) {
      toast(error instanceof Error ? error.message : "Voice Live failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const media = new MediaRecorder(stream);
      chunks.current = [];
      media.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      media.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void sendAudio(
          new Blob(chunks.current, { type: media.mimeType || "audio/webm" }),
          "voice.webm"
        );
      };
      recorder.current = media;
      media.start();
      setRecording(true);
    } catch (error) {
      toast(
        error instanceof Error
          ? `Microphone access failed: ${error.message}`
          : "Microphone access failed.",
        "error"
      );
    }
  };

  const stopRecording = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  };

  const downsample = (input: Float32Array, from: number, to = 16000) => {
    if (from === to) return input;
    const ratio = from / to;
    const length = Math.floor(input.length / ratio);
    const output = new Float32Array(length);
    for (let index = 0; index < length; index += 1) {
      const start = Math.floor(index * ratio);
      const end = Math.min(input.length, Math.floor((index + 1) * ratio));
      let sum = 0;
      for (let sample = start; sample < end; sample += 1) sum += input[sample];
      output[index] = end > start ? sum / (end - start) : 0;
    }
    return output;
  };

  const pcm16 = (input: Float32Array) => {
    const output = new Int16Array(input.length);
    for (let index = 0; index < input.length; index += 1) {
      const sample = Math.max(-1, Math.min(1, input[index]));
      output[index] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return output.buffer;
  };

  const stopDuplex = () => {
    duplexProcessor.current?.disconnect();
    duplexProcessor.current = null;
    duplexStream.current?.getTracks().forEach((track) => track.stop());
    duplexStream.current = null;
    void duplexContext.current?.close();
    duplexContext.current = null;
    duplexWs.current?.close();
    duplexWs.current = null;
    if (duplexAudioRef.current) URL.revokeObjectURL(duplexAudioRef.current);
    duplexAudioRef.current = null;
    setDuplexAudioUrl(null);
    setDuplex("off");
    setDuplexStatus("Stopped");
  };

  const startDuplex = async () => {
    setDuplex("connecting");
    setDuplexStatus("Issuing a Voice Live token…");
    try {
      const tokenResponse = await fetch("/api/voice/live/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent: agentId }),
      });
      const tokenJson = (await tokenResponse.json().catch(() => ({}))) as {
        token?: string;
        wsUrl?: string;
        error?: string;
      };
      if (!tokenResponse.ok || !tokenJson.token || !tokenJson.wsUrl) {
        throw new Error(tokenJson.error || "Could not issue a Voice Live token.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      duplexStream.current = stream;
      const context = new AudioContext();
      duplexContext.current = context;
      const ws = new WebSocket(
        `${tokenJson.wsUrl}/?token=${encodeURIComponent(tokenJson.token)}` +
          `&voice=${encodeURIComponent(voice)}&rate=${rate}&threshold=0.012&aec=1`
      );
      duplexWs.current = ws;

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(String(event.data)) as VoiceEvent;
          if (message.type === "ready") {
            setAecEnabled(Boolean(message.aec?.enabled));
            setDuplex("listening");
            setDuplexStatus("Calibrating noise floor…");
          } else if (message.type === "aec.stats") {
            if (
              typeof message.totalErleDb === "number" ||
              typeof message.erleDb === "number"
            ) {
              setDuplexAec({
                totalErleDb: Number(message.totalErleDb ?? message.erleDb ?? 0),
                linearErleDb: Number(message.erleDb ?? 0),
                residualSuppressionDb: Number(
                  message.residualSuppressionDb ?? 0
                ),
                delayMs: Number(message.delayMs || 0),
                frames: Number(message.frames || 0),
              });
            }
          } else if (message.type === "aec.reference") {
            setDuplexAec(null);
          } else if (message.type === "vad.ready") {
            setDuplexStatus("Listening");
          } else if (message.type === "speech.start") {
            duplexAudioElement.current?.pause();
            setDuplex("listening");
            setDuplexStatus("Speech detected");
            setDuplexTranscript("");
            setDuplexAnswer("");
            if (duplexAudioRef.current) URL.revokeObjectURL(duplexAudioRef.current);
            duplexAudioRef.current = null;
            setDuplexAudioUrl(null);
          } else if (message.type === "speech.end") {
            setDuplex("working");
            setDuplexStatus("Transcribing");
          } else if (message.type === "transcript" && message.text) {
            setDuplexTranscript(message.text);
            setDuplexStatus("Thinking");
          } else if (message.type === "assistant.delta" && message.text) {
            setDuplexAnswer((current) => current + message.text);
          } else if (message.type === "audio.start") {
            duplexChunks.current = [];
          } else if (message.type === "audio.chunk" && message.data) {
            duplexChunks.current.push(
              Uint8Array.from(atob(message.data), (char) => char.charCodeAt(0))
            );
          } else if (message.type === "audio.done") {
            if (duplexAudioRef.current) URL.revokeObjectURL(duplexAudioRef.current);
            const url = URL.createObjectURL(
              new Blob(duplexChunks.current as BlobPart[], { type: "audio/wav" })
            );
            duplexAudioRef.current = url;
            setDuplexAudioUrl(url);
            setDuplexStatus("Speaking");
          } else if (message.type === "cancelled") {
            duplexAudioElement.current?.pause();
            setDuplex("listening");
            setDuplexStatus("Barge-in (echo cancelled)");
          } else if (message.type === "turn.done") {
            setDuplex("listening");
            setDuplexStatus("Listening");
          } else if (message.type === "error") {
            setDuplexStatus(message.message || "Voice Live error");
            toast(message.message || "Voice Live error", "error");
          }
        } catch {
          // Ignore malformed frames.
        }
      };
      ws.onerror = () => {
        setDuplexStatus("WebSocket error");
        toast("Voice Live WebSocket failed.", "error");
      };
      ws.onclose = () => {
        if (duplex !== "off") setDuplexStatus("Disconnected");
      };

      const source = context.createMediaStreamSource(stream);
      const processor = context.createScriptProcessor(4096, 1, 1);
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(processor);
      processor.connect(silent);
      silent.connect(context.destination);
      processor.onaudioprocess = (event) => {
        if (ws.readyState !== WebSocket.OPEN) return;
        const channel = event.inputBuffer.getChannelData(0);
        ws.send(pcm16(downsample(channel, context.sampleRate)));
      };
      duplexProcessor.current = processor;
    } catch (error) {
      stopDuplex();
      toast(
        error instanceof Error ? error.message : "Could not start full duplex.",
        "error"
      );
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Voice Live</h1>
          <p className="page-subtitle">
            Push-to-talk conversation with a local agent. Speech is transcribed by
            whisper.cpp, answered by the agent runtime, and spoken by the system
            voice. This is a turn-based streaming transport, not a full-duplex
            socket.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-secondary" href="/build/speech">
            <Speaker220Regular /> Speech setup
          </Link>
        </div>
      </div>

      <div className="banner info">
        <Mic20Regular />
        <span>
          Local engine: whisper.cpp for speech-to-text, macOS say for
          text-to-speech, ffmpeg for browser audio conversion.
        </span>
      </div>

      <div className="knowledge-split mt-16">
        <div className="operate-card">
          <h3 className="mb-12">Speak a turn</h3>
          <div className="form-grid mb-12">
            <label className="field">
              <span className="field-label">Agent</span>
              <select
                className="select"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              >
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Voice</span>
              <input
                className="input"
                value={voice}
                onChange={(event) => setVoice(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Words per minute</span>
              <input
                className="input"
                type="number"
                min={90}
                max={320}
                value={rate}
                onChange={(event) => setRate(Number(event.target.value))}
              />
            </label>
          </div>

          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className={`btn ${recording ? "btn-danger" : "btn-primary"}`}
              onClick={recording ? stopRecording : () => void startRecording()}
              disabled={busy || agents.length === 0}
            >
              {busy ? (
                <Spinner />
              ) : recording ? (
                <Stop20Regular />
              ) : (
                <Mic20Regular />
              )}
              {recording ? "Stop and send" : "Start recording"}
            </button>
            <label className="btn btn-secondary" style={{ cursor: "pointer" }}>
              <ArrowUpload20Regular /> Upload audio
              <input
                type="file"
                accept="audio/*,.wav,.webm,.mp3,.m4a,.ogg"
                style={{ display: "none" }}
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  setFile(selected);
                  if (selected) void sendAudio(selected, selected.name);
                }}
              />
            </label>
          </div>
          {file && <p className="muted text-12 mt-12">Last file: {file.name}</p>}
          {events.length > 0 && (
            <p className="muted text-12 mt-12">
              Stream: {events.join(" → ")}
            </p>
          )}
        </div>

        <div className="operate-card">
          <h3 className="mb-8">Turn</h3>
          <div className="stack" style={{ gap: 12 }}>
            <div>
              <div className="text-12 muted mb-8">You said</div>
              <div className="retrieval-answer">
                {transcript || "Waiting for a recording…"}
              </div>
            </div>
            <div>
              <div className="text-12 muted mb-8">Agent</div>
              <div className="retrieval-answer">
                {answer || (busy ? "Thinking…" : "The answer will stream here.")}
              </div>
            </div>
            {audioUrl && (
              <audio style={{ width: "100%" }} controls src={audioUrl} />
            )}
          </div>
        </div>
      </div>

      <div className="operate-card mt-16">
        <div className="row between mb-8">
          <div>
            <h3>Full duplex (WebSocket)</h3>
            <p className="muted text-12">
              Streams 16 kHz PCM from the microphone to a persistent socket. The
              server runs energy VAD, starts a turn on speech, and barge-in aborts
              the active answer when you speak again. The synthesized TTS is used
              as a reference for server-side echo cancellation, so the answer
              should not retrigger the microphone. Headphones still give the best
              result.
            </p>
          </div>
          <span className={`badge ${duplex === "listening" ? "green" : duplex === "working" ? "warning" : "gray"}`}>
            {duplex === "off" ? "off" : duplexStatus || duplex}
          </span>
        </div>
        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            className={`btn ${duplex === "off" ? "btn-primary" : "btn-danger"}`}
            onClick={duplex === "off" ? () => void startDuplex() : stopDuplex}
            disabled={duplex === "connecting"}
          >
            {duplex === "connecting" ? <Spinner /> : <Mic20Regular />}
            {duplex === "off" ? "Start full duplex" : "Stop full duplex"}
          </button>
          {duplex !== "off" && (
            <span className="muted text-12" style={{ alignSelf: "center" }}>
              {duplexStatus}
            </span>
          )}
          {aecEnabled && (
            <span className="muted text-12" style={{ alignSelf: "center" }}>
              Server AEC{" "}
              {duplexAec
                ? `· ${duplexAec.totalErleDb.toFixed(1)} dB total (${duplexAec.linearErleDb.toFixed(1)} dB linear + ${duplexAec.residualSuppressionDb.toFixed(1)} dB residual) · ${duplexAec.delayMs.toFixed(0)} ms delay`
                : "· waiting for a TTS reference"}
            </span>
          )}
        </div>
        {(duplexTranscript || duplexAnswer) && (
          <div className="knowledge-split mt-12">
            <div className="retrieval-answer">
              <div className="text-12 muted mb-8">You said</div>
              {duplexTranscript || "…"}
            </div>
            <div className="retrieval-answer">
              <div className="text-12 muted mb-8">Agent</div>
              {duplexAnswer || "…"}
            </div>
          </div>
        )}
        {duplexAudioUrl && (
          <audio
            ref={duplexAudioElement}
            className="mt-12"
            style={{ width: "100%" }}
            controls
            src={duplexAudioUrl}
          />
        )}
      </div>

      <div className="banner mt-16">
        <Speaker220Regular />
        <span>
          API clients can send one audio turn to{" "}
          <span className="mono">POST /api/voice/live</span> with the project API
          key and read the SSE events: transcript, assistant.delta, audio.chunk
          and done.
        </span>
      </div>
    </div>
  );
}
