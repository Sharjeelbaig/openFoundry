// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowDownload20Regular,
  Image20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";

interface ImageStatus {
  available: boolean;
  kind?: string;
  baseUrl?: string;
  models: string[];
  reason?: string;
}

export default function ImagesPage() {
  const { toast } = useToast();
  const [status, setStatus] = useState<ImageStatus | null>(null);
  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [steps, setSteps] = useState(25);
  const [seed, setSeed] = useState(-1);
  const [model, setModel] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    image: string;
    model: string;
    seed: number;
    provider: string;
    bytes: number;
  } | null>(null);

  const loadStatus = async () => {
    const res = await fetch("/api/images/status", { cache: "no-store" });
    const json = (await res.json()) as ImageStatus;
    setStatus(json);
    if (json.models.length && !model) setModel(json.models[0]);
  };

  useEffect(() => {
    void loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const generate = async () => {
    if (!prompt.trim()) {
      toast("Write a prompt first.", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/images/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt,
          negativePrompt,
          width,
          height,
          steps,
          seed,
          model: model || undefined,
        }),
      });
      const json = (await res.json()) as {
        image?: string;
        model?: string;
        seed?: number;
        provider?: string;
        bytes?: number;
        error?: string;
      };
      if (!res.ok || !json.image) {
        throw new Error(json.error || "Image generation failed");
      }
      setResult({
        image: json.image,
        model: json.model || "unknown",
        seed: json.seed ?? seed,
        provider: json.provider || "local",
        bytes: json.bytes || 0,
      });
      toast("Image generated locally", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Image generation failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Images</h1>
          <p className="page-subtitle">
            Text-to-image on a runtime you control. The prompt never leaves this
            machine except to reach the runtime you configured.
          </p>
        </div>
        <div className="page-header-actions">
          <Link className="btn btn-secondary" href="/manage">
            <Settings20Regular /> Manage runtime
          </Link>
        </div>
      </div>

      {status ? (
        status.available ? (
          <div className="banner info">
            <Image20Regular />
            <span>
              {status.kind === "automatic1111"
                ? "AUTOMATIC1111-compatible runtime"
                : "OpenAI-compatible image runtime"}{" "}
              at <span className="mono">{status.baseUrl}</span> ·{" "}
              {status.models.length} model(s)
            </span>
          </div>
        ) : (
          <div className="banner error">
            <Image20Regular />
            <span>
              {status.reason} Configure it in{" "}
              <Link className="link" href="/manage">
                Manage → Runtime endpoints
              </Link>
              .
            </span>
          </div>
        )
      ) : (
        <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
          <Spinner /> Checking the image runtime…
        </div>
      )}

      <div className="knowledge-split mt-16">
        <div className="operate-card">
          <h3 className="mb-12">Generate an image</h3>
          <label className="field mb-12">
            <span className="field-label">Prompt</span>
            <textarea
              className="textarea"
              style={{ minHeight: 120 }}
              placeholder="A copper foundry mark on a dark ceramic tile, studio lighting"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>
          <label className="field mb-12">
            <span className="field-label">Negative prompt</span>
            <textarea
              className="textarea"
              style={{ minHeight: 64 }}
              placeholder="blurry, text, watermark"
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
            />
          </label>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Width</span>
              <input
                className="input"
                type="number"
                min={64}
                max={2048}
                step={64}
                value={width}
                onChange={(event) => setWidth(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Height</span>
              <input
                className="input"
                type="number"
                min={64}
                max={2048}
                step={64}
                value={height}
                onChange={(event) => setHeight(Number(event.target.value))}
              />
            </label>
          </div>
          <div className="form-grid mt-12">
            <label className="field">
              <span className="field-label">Steps</span>
              <input
                className="input"
                type="number"
                min={1}
                max={150}
                value={steps}
                onChange={(event) => setSteps(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span className="field-label">Seed (-1 = random)</span>
              <input
                className="input"
                type="number"
                value={seed}
                onChange={(event) => setSeed(Number(event.target.value))}
              />
            </label>
          </div>
          {status?.models.length ? (
            <label className="field mt-12">
              <span className="field-label">Model</span>
              <select
                className="select"
                value={model}
                onChange={(event) => setModel(event.target.value)}
              >
                {status.models.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="row mt-16" style={{ gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={busy || !status?.available || !prompt.trim()}
              onClick={generate}
            >
              {busy ? <Spinner /> : <Image20Regular />} Generate
            </button>
            {result ? (
              <a
                className="btn btn-secondary"
                href={result.image}
                download={`openfoundry-${result.seed}.png`}
              >
                <ArrowDownload20Regular /> Download
              </a>
            ) : null}
          </div>
        </div>

        <div className="operate-card">
          <h3 className="mb-12">Result</h3>
          {result ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={result.image}
                alt={prompt}
                style={{
                  width: "100%",
                  borderRadius: 8,
                  border: "1px solid var(--stroke-4)",
                }}
              />
              <div className="stack mt-12" style={{ gap: 4 }}>
                <span className="muted text-12">
                  {result.model} · {result.provider} · seed {result.seed} ·{" "}
                  {Math.round(result.bytes / 1024)} KB
                </span>
              </div>
            </>
          ) : (
            <p className="muted text-12">
              Nothing generated yet. The runtime does the work; openFoundry only
              sends the prompt and stores the result you keep.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
