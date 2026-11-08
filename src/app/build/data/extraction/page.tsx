// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Add20Regular,
  ArrowSync20Regular,
  DocumentText20Regular,
  Table20Regular,
} from "@fluentui/react-icons";
import { formatBytes, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";

interface Field {
  name: string;
  type: "string" | "number" | "date" | "boolean";
  description?: string;
  required?: boolean;
}

interface Example {
  id: string;
  text: string;
  expected: Record<string, unknown>;
  createdAt: string;
}

interface Model {
  id: string;
  name: string;
  description: string;
  instructions: string;
  model?: string;
  fields: Field[];
  examples: Example[];
  status: "draft" | "ready";
  metrics?: {
    examples: number;
    fields: number;
    matched: number;
    accuracy: number;
    evaluatedAt: string;
  };
  neural?: {
    metrics?: {
      fields: number;
      checks: number;
      correct: number;
      accuracy: number;
      evaluatedAt: string;
    };
    fields: Record<string, unknown>;
  };
  foundation?: FoundationInfo;
  createdAt: string;
  updatedAt: string;
}

interface FoundationFieldMetric {
  field: string;
  checks: number;
  baseCorrect: number;
  tunedCorrect: number;
}

interface FoundationCandidate {
  id: string;
  learningRate: number;
  iterations: number;
  numLayers: number;
  rank: number;
  tunedCorrect: number;
  checks: number;
  tunedAccuracy: number;
  durationMs: number;
  adapterPath: string;
  error?: string;
}

interface FoundationInfo {
  status: "training" | "ready" | "failed";
  baseModel: string;
  adapterPath?: string;
  modelPath?: string;
  quantized?: boolean;
  error?: string;
  trainedAt?: string;
  search?: { candidates: FoundationCandidate[]; best: string };
  metrics?: {
    baseModel: string;
    trainExamples: number;
    validExamples: number;
    testExamples: number;
    fields: number;
    checks: number;
    baseCorrect: number;
    tunedCorrect: number;
    baseAccuracy: number;
    tunedAccuracy: number;
    improvement: number;
    perField: FoundationFieldMetric[];
    iterations: number;
    learningRate?: number;
    numLayers?: number;
    rank?: number;
    evaluatedAt: string;
  };
}

interface FoundationBaseModel {
  id: string;
  label: string;
  approxBytes: number;
  validated: boolean;
  quantized?: boolean;
  bits?: number;
  minMemoryBytes?: number;
  defaultLearningRate?: number;
  defaultIterations?: number;
}

interface FoundationPreflight {
  baseModel: string;
  label: string;
  quantized: boolean;
  bits?: number;
  approxBytes: number;
  requiredDiskBytes: number;
  requiredMemoryBytes: number;
  freeDiskBytes: number;
  totalMemoryBytes: number;
  fitsDisk: boolean;
  fitsMemory: boolean;
  ok: boolean;
  validated: boolean;
  warning?: string;
  reason?: string;
}

interface FoundationRuntimeStatus {
  available: boolean;
  python: string | null;
  mlxLmVersion: string | null;
  baseModel: string;
  baseModelCached: boolean;
  models?: FoundationBaseModel[];
  preflight?: FoundationPreflight;
  reason?: string;
  installCommand: string;
  setupHint: string;
}

interface ExtractedField {
  value: string | number | boolean | null;
  confidence: number;
  grounded: boolean;
  engine?: string;
}

interface ExtractionResult {
  kind: string;
  fields: Record<string, ExtractedField>;
  missing: string[];
  warnings: string[];
}

const SAMPLE_FIELDS = JSON.stringify(
  [
    { name: "vendor", type: "string", required: true },
    { name: "invoice", type: "string", required: true },
    { name: "total", type: "number", required: true },
  ],
  null,
  2
);

export default function CustomExtractionPage() {
  const { toast } = useToast();
  const { data, refresh } = useApi<{ models: Model[] }>("/api/extraction", 0);
  const models = data?.models ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldsJson, setFieldsJson] = useState(SAMPLE_FIELDS);
  const [modelId, setModelId] = useState("");
  const [busy, setBusy] = useState(false);
  const [exampleText, setExampleText] = useState(
    "Vendor: Contoso Ltd.\nInvoice: INV-1001\nTotal: $1,250.00"
  );
  const [exampleExpected, setExampleExpected] = useState(
    '{"vendor":"Contoso Ltd.","invoice":"INV-1001","total":1250}'
  );
  const [extractText, setExtractText] = useState(
    "Vendor: Northwind\nInvoice: INV-2001\nTotal: 440"
  );
  const [extractFile, setExtractFile] = useState<File | null>(null);
  const [engine, setEngine] = useState<"hybrid" | "neural" | "foundation">(
    "hybrid"
  );
  const [result, setResult] = useState<ExtractionResult | null>(null);
  const [log, setLog] = useState("");
  const [foundationStatus, setFoundationStatus] =
    useState<FoundationRuntimeStatus | null>(null);
  const [foundationPreflight, setFoundationPreflight] =
    useState<FoundationPreflight | null>(null);
  const [foundationBaseModel, setFoundationBaseModel] = useState("");
  const [foundationIterations, setFoundationIterations] = useState(80);
  const [foundationBusy, setFoundationBusy] = useState(false);
  const [foundationSearch, setFoundationSearch] = useState(false);
  const [foundationLog, setFoundationLog] = useState("");

  const selected = models.find((model) => model.id === selectedId);

  useEffect(() => {
    const list = data?.models ?? [];
    if (!selectedId && list.length) setSelectedId(list[0].id);
    if (selectedId && !list.some((model) => model.id === selectedId)) {
      setSelectedId(list[0]?.id || "");
    }
  }, [data, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const model = data?.models?.find((item) => item.id === selectedId);
    if (model?.foundation?.baseModel) {
      setFoundationBaseModel(model.foundation.baseModel);
    } else if (foundationStatus?.baseModel) {
      setFoundationBaseModel(foundationStatus.baseModel);
    }
    if (model?.foundation?.metrics?.iterations) {
      setFoundationIterations(model.foundation.metrics.iterations);
    }
  }, [selectedId, data, foundationStatus?.baseModel]);

  const statusRequest = useRef(0);

  const loadStatus = useCallback(async (baseModel?: string) => {
    const seq = ++statusRequest.current;
    const url = baseModel
      ? `/api/extraction/foundation?baseModel=${encodeURIComponent(baseModel)}`
      : "/api/extraction/foundation";
    const res = await fetch(url, { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as {
      status?: FoundationRuntimeStatus;
    };
    if (seq !== statusRequest.current || !json.status) return;
    setFoundationStatus(json.status);
    setFoundationPreflight(json.status.preflight || null);
    if (baseModel) {
      const info = json.status.models?.find((model) => model.id === baseModel);
      if (info?.defaultIterations) {
        setFoundationIterations(info.defaultIterations);
      }
    } else {
      setFoundationBaseModel((current) => current || json.status!.baseModel);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    const id = foundationBaseModel.trim();
    if (!id) return;
    const timer = setTimeout(() => {
      void loadStatus(id);
    }, 350);
    return () => clearTimeout(timer);
  }, [foundationBaseModel, loadStatus]);

  const createModel = async () => {
    setBusy(true);
    try {
      let fields: Field[];
      try {
        fields = JSON.parse(fieldsJson) as Field[];
      } catch {
        throw new Error("Fields must be valid JSON.");
      }
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name,
          description,
          model: modelId || undefined,
          fields,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        model?: Model;
        error?: string;
      };
      if (!res.ok || !json.model) {
        throw new Error(json.error || "Could not create the model.");
      }
      setCreateOpen(false);
      setName("");
      setDescription("");
      setSelectedId(json.model.id);
      refresh();
      toast("Custom extraction model created", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const addExample = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      let expected: Record<string, unknown>;
      try {
        expected = JSON.parse(exampleExpected) as Record<string, unknown>;
      } catch {
        throw new Error("Expected values must be valid JSON.");
      }
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "example",
          id: selected.id,
          text: exampleText,
          expected,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not add the example.");
      refresh();
      toast("Labeled example added", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Add example failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const train = async () => {
    if (!selected) return;
    setBusy(true);
    setLog("Running leave-one-out evaluation…");
    try {
      const res = await fetch("/api/extraction", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "train", id: selected.id }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        model?: Model;
        error?: string;
      };
      if (!res.ok || !json.model) {
        throw new Error(json.error || "Training failed.");
      }
      setLog(
        `Trained on ${json.model.metrics?.examples} examples · ${
          Math.round((json.model.metrics?.accuracy || 0) * 100)
        }% field accuracy`
      );
      refresh();
      toast("Custom extraction model is ready", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Training failed.";
      setLog(message);
      toast(message, "error");
    } finally {
      setBusy(false);
    }
  };

  const extract = async () => {
    if (!selected) return;
    setBusy(true);
    setResult(null);
    try {
      let res: Response;
      if (extractFile) {
        const form = new FormData();
        form.append("modelId", selected.id);
        form.append("file", extractFile);
        form.append("engine", engine);
        res = await fetch("/api/extraction/extract", {
          method: "POST",
          body: form,
        });
      } else {
        res = await fetch("/api/extraction/extract", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            modelId: selected.id,
            text: extractText,
            engine,
          }),
        });
      }
      const json = (await res.json().catch(() => ({}))) as ExtractionResult & {
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Extraction failed.");
      setResult(json);
      toast("Document extracted", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Extraction failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const trainFoundation = async () => {
    if (!selected) return;
    setFoundationBusy(true);
    setFoundationLog(
      foundationSearch
        ? "Running the preset hyperparameter search with MLX: train each candidate, evaluate it on the held-out split, fuse the best adapter, then report base vs tuned. This can take several minutes; 1.5B takes longer."
        : "Training a LoRA adapter with MLX, fusing it, then evaluating base vs tuned on the held-out split. This can take a few minutes…"
    );
    try {
      const res = await fetch("/api/extraction/foundation/train", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          modelId: selected.id,
          baseModel: foundationBaseModel || undefined,
          iterations: foundationIterations,
          search: foundationSearch,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        metrics?: FoundationInfo["metrics"];
        logTail?: string;
        error?: string;
      };
      if (!res.ok || !json.metrics) {
        throw new Error(json.error || "Foundation training failed.");
      }
      const metrics = json.metrics;
      setFoundationLog(
        `Held-out: base ${Math.round(metrics.baseAccuracy * 100)}% → tuned ${Math.round(
          metrics.tunedAccuracy * 100
        )}% (${metrics.tunedCorrect}/${metrics.checks} fields, ${metrics.testExamples} documents).\n` +
          (json.logTail || "")
      );
      refresh();
      toast("Fine-tuned adapter is ready", "success");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Foundation training failed.";
      setFoundationLog(message);
      toast(message, "error");
    } finally {
      setFoundationBusy(false);
    }
  };

  const installFoundationRuntime = async () => {
    setFoundationBusy(true);
    setFoundationLog("Creating data/foundation/venv and installing mlx-lm…");
    try {
      const res = await fetch("/api/extraction/foundation/setup", {
        method: "POST",
      });
      const json = (await res.json().catch(() => ({}))) as {
        status?: FoundationRuntimeStatus;
        log?: string;
        error?: string;
      };
      if (!res.ok || !json.status) {
        throw new Error(json.error || "MLX setup failed.");
      }
      setFoundationStatus(json.status);
      setFoundationBaseModel((current) => current || json.status!.baseModel);
      setFoundationLog(json.log || "MLX runtime installed.");
      toast("MLX runtime installed", "success");
    } catch (error) {
      const message = error instanceof Error ? error.message : "MLX setup failed.";
      setFoundationLog(message);
      toast(message, "error");
    } finally {
      setFoundationBusy(false);
    }
  };

  const remove = async () => {
    if (!selected) return;
    if (!window.confirm(`Delete custom model "${selected.name}"?`)) return;
    const res = await fetch("/api/extraction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: selected.id }),
    });
    if (!res.ok) {
      toast("Delete failed", "error");
      return;
    }
    setSelectedId("");
    setResult(null);
    refresh();
    toast("Model deleted", "success");
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Custom extraction models</h1>
          <p className="page-subtitle">
            Define fields and label examples, then extract those fields from new
            documents. A locally trained neural candidate model handles labels it
            has learned, and an optional MLX LoRA fine-tune adapts a real local
            foundation model to the same labels. Metrics are held-out checks.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setCreateOpen((open) => !open)}>
            <Add20Regular /> New model
          </button>
        </div>
      </div>

      {createOpen && (
        <div className="operate-card mt-12">
          <h3 className="mb-8">New custom model</h3>
          <div className="form-grid">
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="input"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="field">
              <span className="field-label">Chat model (optional)</span>
              <input
                className="input"
                placeholder="Deployment name; defaults to the first running model"
                value={modelId}
                onChange={(event) => setModelId(event.target.value)}
              />
            </label>
          </div>
          <label className="field mt-12">
            <span className="field-label">Description</span>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <label className="field mt-12">
            <span className="field-label">Fields (JSON)</span>
            <textarea
              className="textarea"
              style={{ minHeight: 160 }}
              value={fieldsJson}
              onChange={(event) => setFieldsJson(event.target.value)}
            />
          </label>
          <div className="row mt-12" style={{ gap: 8 }}>
            <button className="btn btn-primary" onClick={() => void createModel()} disabled={busy}>
              {busy ? <Spinner /> : <Add20Regular />} Create model
            </button>
            <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="knowledge-split mt-16">
        <div className="operate-card">
          <div className="row between mb-8">
            <h3>Models</h3>
            <button className="icon-button" onClick={refresh} aria-label="Refresh models">
              <ArrowSync20Regular />
            </button>
          </div>
          {models.length === 0 ? (
            <p className="muted text-12">
              No custom models yet. Create one with fields such as vendor, invoice
              and total.
            </p>
          ) : (
            <div className="stack" style={{ gap: 6 }}>
              {models.map((model) => (
                <button
                  key={model.id}
                  className={`kb-type-card${model.id === selectedId ? " added" : ""}`}
                  onClick={() => {
                    setSelectedId(model.id);
                    setResult(null);
                    setLog("");
                  }}
                >
                  <span className="kb-source-icon">
                    <Table20Regular />
                  </span>
                  <span className="kb-type-body">
                    <strong>{model.name}</strong>
                    <span className="muted text-12">
                      {model.fields.length} fields · {model.examples.length} examples
                      {model.status === "ready" ? " · ready" : " · draft"}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="operate-card">
          {selected ? (
            <>
              <div className="row between mb-8">
                <h3>{selected.name}</h3>
                <span className={`badge ${selected.status === "ready" ? "green" : "gray"}`}>
                  {selected.status}
                </span>
              </div>
              <p className="muted text-12">
                {selected.description || "No description."}
              </p>
              {selected.metrics && (
                <p className="text-12 mt-8">
                  Leave-one-out: {selected.metrics.matched}/{selected.metrics.fields}{" "}
                  fields · {Math.round(selected.metrics.accuracy * 100)}% accurate
                </p>
              )}
              {selected.neural?.metrics && (
                <p className="text-12 mt-4">
                  Neural candidate model: {selected.neural.metrics.correct}/
                  {selected.neural.metrics.checks} held-out fields ·{" "}
                  {Math.round(selected.neural.metrics.accuracy * 100)}% accurate
                </p>
              )}
              <div className="row mt-12" style={{ gap: 8 }}>
                <button className="btn btn-primary" onClick={() => void train()} disabled={busy}>
                  {busy ? <Spinner /> : <ArrowSync20Regular />} Train / evaluate
                </button>
                <button className="btn btn-secondary" onClick={() => void remove()}>
                  Delete
                </button>
              </div>
              {log && <p className="muted text-12 mt-8">{log}</p>}
            </>
          ) : (
            <p className="muted">Select or create a model.</p>
          )}
        </div>
      </div>

      {selected && (
        <div className="operate-card mt-16">
          <div className="row between mb-8">
            <div>
              <h3>Foundation fine-tune (MLX LoRA)</h3>
              <p className="muted text-12">
                Trains a real LoRA adapter on the labeled examples, fuses it into
                a bf16 base or loads it beside a 4-bit base for QLoRA, and reports
                base vs tuned accuracy on documents held out of training. The
                adapter runs locally after setup.
              </p>
            </div>
            <span
              className={`badge ${
                selected.foundation?.status === "ready"
                  ? "green"
                  : selected.foundation?.status === "training"
                  ? "warning"
                  : "gray"
              }`}
            >
              {selected.foundation?.status || "not trained"}
            </span>
          </div>

          {foundationStatus ? (
            foundationStatus.available ? (
              <p className="muted text-12">
                MLX-LM {foundationStatus.mlxLmVersion} · Python{" "}
                <span className="mono">{foundationStatus.python}</span> · base{" "}
                <span className="mono">
                  {selected.foundation?.baseModel || foundationStatus.baseModel}
                </span>
                {(selected.foundation?.baseModel || foundationStatus.baseModel) ===
                  foundationStatus.baseModel && foundationStatus.baseModelCached
                  ? " (cached)"
                  : ""}
              </p>
            ) : (
              <div className="banner error">
                <span>
                  {foundationStatus.reason}{" "}
                  <span className="mono">{foundationStatus.installCommand}</span>
                </span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => void installFoundationRuntime()}
                  disabled={foundationBusy}
                >
                  {foundationBusy ? <Spinner /> : null} Install MLX runtime
                </button>
              </div>
            )
          ) : (
            <p className="muted text-12">Checking the local MLX runtime…</p>
          )}

          {foundationPreflight && (
            <div
              className={`banner ${foundationPreflight.ok ? "info" : "error"} mt-8`}
            >
              <span>
                {foundationPreflight.label}
                {foundationPreflight.quantized
                  ? ` · ${foundationPreflight.bits}-bit QLoRA with gradient checkpointing`
                  : ""}
                {" · "}
                needs {formatBytes(foundationPreflight.requiredDiskBytes)} free
                disk and {formatBytes(foundationPreflight.requiredMemoryBytes)}{" "}
                memory. This machine has{" "}
                {formatBytes(foundationPreflight.freeDiskBytes)} free and{" "}
                {formatBytes(foundationPreflight.totalMemoryBytes)} RAM.{" "}
                {foundationPreflight.ok
                  ? "This model fits."
                  : `${foundationPreflight.reason} Training is blocked until the hardware has room.`}
                {foundationPreflight.warning
                  ? ` ${foundationPreflight.warning}`
                  : ""}
              </span>
            </div>
          )}

          <div className="form-grid mt-12">
            <label className="field">
              <span className="field-label">Base model</span>
              <input
                className="input"
                list="foundation-base-models"
                value={foundationBaseModel}
                onChange={(event) => setFoundationBaseModel(event.target.value)}
                placeholder="Qwen/Qwen2.5-0.5B-Instruct"
              />
              <datalist id="foundation-base-models">
                {(foundationStatus?.models || [])
                  .filter((model) => model.validated)
                  .map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.label}
                  </option>
                ))}
              </datalist>
              <span className="field-hint">
                Validated locally: 0.5B and 1.5B bf16 LoRA, plus
                <span className="mono"> mlx-community/Qwen2.5-7B-Instruct-4bit</span>{" "}
                (4-bit QLoRA, ~4.3 GB download, gradient checkpointing). Rank
                stays 8.
              </span>
            </label>
            <label className="field">
              <span className="field-label">Training iterations</span>
              <input
                className="input"
                type="number"
                min={20}
                max={1000}
                value={foundationIterations}
                onChange={(event) => setFoundationIterations(Number(event.target.value))}
                disabled={foundationSearch}
              />
              <span className="field-hint">
                {foundationSearch
                  ? "Ignored during search; each preset has its own learning rate, iterations and layer count."
                  : foundationPreflight?.quantized
                    ? "7B QLoRA uses 40 iterations at 5e-6 by default; 1e-5 diverged after ~20 iterations."
                    : "LoRA rank 8. 80 iterations is enough for a small labeled set."}
              </span>
            </label>
          </div>

          <label className="row mt-12" style={{ gap: 8, alignItems: "center" }}>
            <input
              type="checkbox"
              checked={foundationSearch}
              onChange={(event) => setFoundationSearch(event.target.checked)}
            />
            <span className="text-12">
              Hyperparameter search (3 presets: learning rate, iterations and
              adapted layers; best held-out score wins)
            </span>
          </label>

          <div className="row mt-12" style={{ gap: 8, flexWrap: "wrap" }}>
            <button
              className="btn btn-primary"
              onClick={() => void trainFoundation()}
              disabled={
                foundationBusy ||
                !foundationStatus?.available ||
                (foundationPreflight ? !foundationPreflight.ok : false) ||
                selected.examples.length < 6
              }
            >
              {foundationBusy ? <Spinner /> : <ArrowSync20Regular />}{" "}
              {foundationSearch
                ? "Run hyperparameter search"
                : foundationPreflight?.quantized
                  ? "Train QLoRA adapter"
                  : "Train foundation adapter"}
            </button>
            {selected.examples.length < 6 && (
              <span className="muted text-12" style={{ alignSelf: "center" }}>
                Add at least 6 labeled examples (currently {selected.examples.length}).
              </span>
            )}
          </div>

          {selected.foundation?.metrics && (
            <div className="mt-12">
              <p className="text-12 strong">
                Held-out accuracy: base{" "}
                {Math.round(selected.foundation.metrics.baseAccuracy * 100)}% → tuned{" "}
                {Math.round(selected.foundation.metrics.tunedAccuracy * 100)}% (
                {selected.foundation.metrics.improvement >= 0 ? "+" : ""}
                {Math.round(selected.foundation.metrics.improvement * 100)} points ·{" "}
                {selected.foundation.metrics.tunedCorrect}/
                {selected.foundation.metrics.checks} fields ·{" "}
                {selected.foundation.metrics.testExamples} held-out documents ·{" "}
                {selected.foundation.metrics.iterations} iterations
                {selected.foundation.metrics.learningRate
                  ? ` · lr ${selected.foundation.metrics.learningRate}`
                  : ""}
                {selected.foundation.metrics.numLayers
                  ? ` · ${selected.foundation.metrics.numLayers} layers`
                  : ""}
                {selected.foundation.quantized ? " · 4-bit QLoRA" : ""})
              </p>
              <div className="table-card mt-8">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Checks</th>
                      <th>Base</th>
                      <th>Tuned</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.foundation.metrics.perField.map((metric) => (
                      <tr key={metric.field}>
                        <td className="strong">{metric.field}</td>
                        <td>{metric.checks}</td>
                        <td className="muted">
                          {metric.baseCorrect}/{metric.checks}
                        </td>
                        <td>
                          {metric.tunedCorrect}/{metric.checks}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {selected.foundation.search?.candidates.length ? (
                <div className="table-card mt-8">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>LR</th>
                        <th>Iters</th>
                        <th>Layers</th>
                        <th>Held-out</th>
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selected.foundation.search.candidates.map((candidate) => (
                        <tr key={candidate.id}>
                          <td className="strong">
                            {candidate.id}
                            {selected.foundation?.search?.best === candidate.id ? (
                              <span className="badge green" style={{ marginLeft: 6 }}>
                                best
                              </span>
                            ) : null}
                          </td>
                          <td className="muted">{candidate.learningRate}</td>
                          <td>{candidate.iterations}</td>
                          <td>{candidate.numLayers}</td>
                          <td className={candidate.error ? "muted" : ""}>
                            {candidate.error
                              ? "failed"
                              : `${candidate.tunedCorrect}/${candidate.checks} · ${Math.round(
                                  candidate.tunedAccuracy * 100
                                )}%`}
                            {candidate.error ? (
                              <span className="text-12 muted" title={candidate.error}>
                                {" "}
                                — {candidate.error.slice(0, 90)}
                              </span>
                            ) : null}
                          </td>
                          <td className="muted">
                            {candidate.durationMs
                              ? `${Math.round(candidate.durationMs / 1000)}s`
                              : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {selected.foundation.modelPath && (
                <p className="muted text-12 mt-8">
                  {selected.foundation.quantized
                    ? "Base model + adapter"
                    : "Fused model"}
                  :{" "}
                  <span className="mono">{selected.foundation.modelPath}</span>
                  {selected.foundation.trainedAt
                    ? ` · trained ${selected.foundation.trainedAt}`
                    : ""}
                </p>
              )}
            </div>
          )}

          {selected.foundation?.status === "failed" && (
            <p className="text-12 mt-8" style={{ color: "var(--danger)" }}>
              {selected.foundation.error}
            </p>
          )}
          {foundationLog && (
            <pre
              className="mt-12"
              style={{
                whiteSpace: "pre-wrap",
                maxHeight: 240,
                overflow: "auto",
                fontSize: 12,
                color: "var(--fg-3)",
              }}
            >
              {foundationLog}
            </pre>
          )}
        </div>
      )}

      {selected && (
        <div className="knowledge-split mt-16">
          <div className="operate-card">
            <h3 className="mb-8">Labeled examples ({selected.examples.length})</h3>
            <div className="stack" style={{ gap: 8 }}>
              {selected.examples.map((example) => (
                <div className="retrieval-result" key={example.id}>
                  <p>{example.text.slice(0, 260)}</p>
                  <span className="muted text-12">
                    {JSON.stringify(example.expected)}
                  </span>
                </div>
              ))}
            </div>
            <label className="field mt-12">
              <span className="field-label">Example text</span>
              <textarea
                className="textarea"
                style={{ minHeight: 90 }}
                value={exampleText}
                onChange={(event) => setExampleText(event.target.value)}
              />
            </label>
            <label className="field mt-8">
              <span className="field-label">Expected values (JSON)</span>
              <textarea
                className="textarea"
                style={{ minHeight: 70 }}
                value={exampleExpected}
                onChange={(event) => setExampleExpected(event.target.value)}
              />
            </label>
            <button
              className="btn btn-secondary mt-8"
              onClick={() => void addExample()}
              disabled={busy}
            >
              <Add20Regular /> Add labeled example
            </button>
          </div>

          <div className="operate-card">
            <h3 className="mb-8">Extract a document</h3>
            <label className="field">
              <span className="field-label">Document text</span>
              <textarea
                className="textarea"
                style={{ minHeight: 120 }}
                value={extractText}
                onChange={(event) => {
                  setExtractText(event.target.value);
                  setExtractFile(null);
                }}
              />
            </label>
            <label className="field mt-8">
              <span className="field-label">Or upload a PDF/image</span>
              <input
                className="input"
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.txt,.md"
                onChange={(event) => setExtractFile(event.target.files?.[0] || null)}
              />
            </label>
            <label className="field mt-8">
              <span className="field-label">Extraction engine</span>
              <select
                className="select"
                value={engine}
                onChange={(event) =>
                  setEngine(event.target.value as "hybrid" | "neural" | "foundation")
                }
              >
                <option value="hybrid">Hybrid (neural + local chat model)</option>
                <option value="neural">Neural only (no LLM fallback)</option>
                <option value="foundation">Fine-tuned foundation model (MLX)</option>
              </select>
              {engine === "foundation" && !selected.foundation?.metrics && (
                <span className="field-hint">
                  Train the foundation adapter first.
                </span>
              )}
            </label>
            <button className="btn btn-primary mt-8" onClick={() => void extract()} disabled={busy}>
              {busy ? <Spinner /> : <DocumentText20Regular />} Extract fields
            </button>
            {result && (
              <div className="mt-12">
                <p className="muted text-12">
                  {result.kind} · {result.missing.length} missing
                </p>
                <div className="table-card mt-8">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Field</th>
                        <th>Value</th>
                        <th>Confidence</th>
                        <th>Engine</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(result.fields).map(([field, value]) => (
                        <tr key={field}>
                          <td className="strong">{field}</td>
                          <td>{value.value === null ? "—" : String(value.value)}</td>
                          <td className="muted">
                            {value.confidence.toFixed(2)}{" "}
                            <span className="text-12">
                              {value.grounded ? "grounded" : "derived"}
                            </span>
                          </td>
                          <td className="muted">{value.engine || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {result.warnings.map((warning) => (
                  <p className="muted text-12 mt-8" key={warning}>
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
