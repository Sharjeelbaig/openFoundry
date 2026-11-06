// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownload20Regular,
  ArrowSync20Regular,
  Mic20Regular,
  Speaker220Regular,
} from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";

interface WhisperModelSpec {
  id: string;
  label: string;
  bytes: number;
  file: string;
  url: string;
  downloaded: boolean;
  path: string;
}

interface SpeechStatus {
  tts: { available: boolean; engine: string };
  stt: { available: boolean; reason?: string };
  whisper?: {
    available: boolean;
    binary: { path: string; source: string } | null;
    model: { path: string; name: string; source: string } | null;
    brewAvailable: boolean;
    installCommand: string;
    modelDir: string;
    models: WhisperModelSpec[];
    reason?: string;
  };
}

export default function SpeechPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<SpeechStatus | null>(null);
  const [text, setText] = useState(
    "The vault code is 4417. This audio was generated on this computer."
  );
  const [voice, setVoice] = useState("Samantha");
  const [rate, setRate] = useState(180);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [ttsBusy, setTtsBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState("");
  const [sttBusy, setSttBusy] = useState(false);
  const [setupBusy, setSetupBusy] = useState<"install" | "download" | null>(null);
  const [setupLog, setSetupLog] = useState("");
  const [modelChoice, setModelChoice] = useState("base.en");
  const audioRef = useRef<string | null>(null);

  const loadStatus = async () => {
    const res = await fetch("/api/speech/status", { cache: "no-store" });
    const json = (await res.json()) as SpeechStatus;
    setStatus(json);
    const models = json.whisper?.models || [];
    if (models.length && !models.some((model) => model.id === modelChoice)) {
      setModelChoice(models[0].id);
    }
  };

  useEffect(() => {
    void loadStatus();
    return () => {
      if (audioRef.current) URL.revokeObjectURL(audioRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedModel = useMemo(
    () => status?.whisper?.models.find((model) => model.id === modelChoice),
    [status, modelChoice]
  );

  const synthesize = async () => {
    if (!text.trim()) {
      toast("Write text to speak first.", "error");
      return;
    }
    setTtsBusy(true);
    try {
      const res = await fetch("/api/speech/synthesize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice, rate }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(json.error || "Text-to-speech failed.");
      }
      const blob = await res.blob();
      if (audioRef.current) URL.revokeObjectURL(audioRef.current);
      const url = URL.createObjectURL(blob);
      audioRef.current = url;
      setAudioUrl(url);
      toast(`Generated ${Math.round(blob.size / 1024)} KB of WAV audio`, "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Text-to-speech failed.", "error");
    } finally {
      setTtsBusy(false);
    }
  };

  const transcribe = async () => {
    if (!file) {
      toast("Choose an audio file first.", "error");
      return;
    }
    setSttBusy(true);
    setTranscript("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/speech/transcribe", {
        method: "POST",
        body: form,
      });
      const json = (await res.json().catch(() => ({}))) as {
        text?: string;
        engine?: string;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(json.error || "Transcription failed.");
      }
      setTranscript(json.text || "");
      toast(`Transcribed with ${json.engine || "whisper.cpp"}`, "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Transcription failed.";
      setSetupLog(message);
      toast(message, "error");
    } finally {
      setSttBusy(false);
    }
  };

  const setup = async (action: "install" | "download") => {
    setSetupBusy(action);
    setSetupLog(
      action === "install"
        ? "Running brew install whisper.cpp. This can take a few minutes…"
        : `Downloading ${selectedModel?.label || modelChoice}…`
    );
    try {
      const res = await fetch("/api/speech/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, model: modelChoice }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        log?: string;
        path?: string;
        bytes?: number;
        status?: SpeechStatus["whisper"];
      };
      if (!res.ok) {
        setSetupLog(json.error || "Setup failed.");
        toast(json.error || "Setup failed.", "error");
        if (json.status) setStatus((current) => (current ? { ...current, whisper: json.status } : current));
        return;
      }
      if (action === "install") {
        setSetupLog(
          json.log ||
            `whisper.cpp installed at ${json.status?.binary?.path || "the Homebrew prefix"}.`
        );
        toast("whisper.cpp is installed", "success");
      } else {
        setSetupLog(
          `Downloaded ${json.path || modelChoice} (${Math.round(
            Number(json.bytes || 0) / 1024 / 1024
          )} MB).`
        );
        toast("Whisper model downloaded", "success");
      }
      await loadStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Setup failed.";
      setSetupLog(message);
      toast(message, "error");
    } finally {
      setSetupBusy(null);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Speech</h1>
          <p className="page-subtitle">
            Text-to-speech with the operating-system voice and speech-to-text
            with whisper.cpp. Audio is generated and transcribed on this computer.
          </p>
        </div>
        <div className="page-header-actions">
          <a className="btn btn-secondary" href="/build/voice">
            <Mic20Regular /> Voice Live
          </a>
          <button className="btn btn-secondary" onClick={() => void loadStatus()}>
            <ArrowSync20Regular /> Refresh status
          </button>
        </div>
      </div>

      {status ? (
        <div className={`banner ${status.tts.available ? "info" : "error"}`}>
          <Speaker220Regular />
          <span>
            TTS {status.tts.available ? "available" : "unavailable"} ·{" "}
            {status.tts.engine}. STT{" "}
            {status.stt.available ? "available" : "unavailable"}
            {status.whisper?.model
              ? ` · ${status.whisper.model.name}`
              : ""}
            .
          </span>
        </div>
      ) : (
        <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Checking local speech capabilities…
        </div>
      )}

      <div className="knowledge-split mt-16">
        <div className="operate-card">
          <h3 className="mb-8">Text to speech</h3>
          <p className="muted text-12 mb-12">
            Uses the macOS <span className="mono">say</span> engine. The WAV is
            returned without leaving the machine.
          </p>
          <label className="field mb-12">
            <span className="field-label">Text</span>
            <textarea
              className="textarea"
              style={{ minHeight: 110 }}
              value={text}
              onChange={(event) => setText(event.target.value)}
            />
          </label>
          <div className="form-grid mb-12">
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
          <div className="row" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              onClick={() => void synthesize()}
              disabled={ttsBusy || !status?.tts.available}
            >
              {ttsBusy ? <Spinner /> : <Speaker220Regular />} Synthesize
            </button>
            {audioUrl && (
              <a className="btn btn-secondary" href={audioUrl} download="speech.wav">
                <ArrowDownload20Regular /> Download WAV
              </a>
            )}
          </div>
          {audioUrl && (
            <audio
              className="mt-12"
              style={{ width: "100%" }}
              controls
              src={audioUrl}
            />
          )}
        </div>

        <div className="operate-card">
          <h3 className="mb-8">Speech to text</h3>
          <p className="muted text-12 mb-12">
            Runs whisper.cpp locally. If it or its model is missing, the error
            names the exact setup step rather than returning invented text.
          </p>
          <label className="field mb-12">
            <span className="field-label">Audio file</span>
            <input
              className="input"
              type="file"
              accept="audio/*,.wav,.mp3,.m4a,.flac,.ogg"
              onChange={(event) => setFile(event.target.files?.[0] || null)}
            />
          </label>
          <button
            className="btn btn-primary"
            onClick={() => void transcribe()}
            disabled={sttBusy || !file || !status?.stt.available}
          >
            {sttBusy ? <Spinner /> : <Mic20Regular />} Transcribe
          </button>
          {!status?.stt.available && status?.stt.reason && (
            <p className="muted text-12 mt-12">{status.stt.reason}</p>
          )}
          {transcript && (
            <div className="retrieval-answer mt-12">
              <div className="text-12 muted mb-8">Transcript</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{transcript}</div>
            </div>
          )}
        </div>
      </div>

      <div className="operate-card mt-16">
        <div className="row between" style={{ alignItems: "flex-start" }}>
          <div>
            <h3 className="mb-8">Whisper.cpp setup</h3>
            <p className="muted text-12 mb-12">
              Installing the Homebrew formula and downloading a ggml model are
              explicit actions. Nothing is marked available until the binary and
              model both exist.
            </p>
          </div>
          <span className={`badge ${status?.whisper?.available ? "green" : "gray"}`}>
            {status?.whisper?.available ? "Ready" : "Setup needed"}
          </span>
        </div>

        <div className="facts-list">
          <div className="fact-row">
            <span>Binary</span>
            <span className="mono text-12">
              {status?.whisper?.binary?.path || "not found"}
            </span>
          </div>
          <div className="fact-row">
            <span>Model</span>
            <span className="mono text-12">
              {status?.whisper?.model?.path || "not found"}
            </span>
          </div>
          <div className="fact-row">
            <span>Model folder</span>
            <span className="mono text-12">
              {status?.whisper?.modelDir || "~/.cache/whisper"}
            </span>
          </div>
          <div className="fact-row">
            <span>Homebrew</span>
            <span>{status?.whisper?.brewAvailable ? "available" : "not found"}</span>
          </div>
        </div>

        <div className="row mt-12" style={{ gap: 8, flexWrap: "wrap" }}>
          <button
            className="btn btn-secondary"
            disabled={setupBusy !== null || Boolean(status?.whisper?.binary)}
            onClick={() => void setup("install")}
          >
            {setupBusy === "install" ? <Spinner /> : <ArrowDownload20Regular />}{" "}
            Install whisper.cpp
          </button>
          <select
            className="select"
            style={{ maxWidth: 240 }}
            value={modelChoice}
            onChange={(event) => setModelChoice(event.target.value)}
          >
            {(status?.whisper?.models || []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label}
                {model.downloaded ? " · downloaded" : ""}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            disabled={setupBusy !== null || selectedModel?.downloaded}
            onClick={() => void setup("download")}
          >
            {setupBusy === "download" ? <Spinner /> : <ArrowDownload20Regular />}{" "}
            Download model
          </button>
        </div>
        {setupLog && (
          <pre
            className="mt-12"
            style={{
              whiteSpace: "pre-wrap",
              maxHeight: 220,
              overflow: "auto",
              fontSize: 12,
              color: "var(--fg-3)",
            }}
          >
            {setupLog}
          </pre>
        )}
      </div>

      <div className="banner mt-16">
        <Mic20Regular />
        <span>
          Agents and other MCP clients can call the same two capabilities through{" "}
          <span className="mono">/api/speech/mcp</span> with a bearer token from{" "}
          <span className="mono">/api/speech/mcp/token</span>.
        </span>
      </div>
    </div>
  );
}
