// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useState } from "react";
import {
  ArrowDownload20Regular,
  Delete20Regular,
  Play20Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import { formatBytes, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { OnDeviceRuntimeStatus } from "@/lib/types";

/**
 * The bundled on-device model runtime. On a phone this is llama.cpp running in
 * the app itself; on a desktop it is absent and the section explains that the
 * desktop runtimes (Foundry Local, Ollama, LM Studio) are used instead.
 */
export default function OnDeviceRuntime() {
  const { toast } = useToast();
  const { data, refresh } = useApi<{ runtime: OnDeviceRuntimeStatus }>(
    "/api/runtime",
    2500
  );
  const [busy, setBusy] = useState<string | null>(null);

  const runtime = data?.runtime;

  const act = async (
    action: "download" | "start" | "stop" | "delete",
    file?: string,
    success?: string
  ) => {
    setBusy(file ? `${action}:${file}` : action);
    try {
      const res = await fetch("/api/runtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, file }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "The action failed.");
      if (success) toast(success, "success");
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "The action failed.", "error");
    } finally {
      setBusy(null);
    }
  };

  if (!runtime) {
    return (
      <div className="table-card" style={{ padding: 24 }}>
        <Spinner />
      </div>
    );
  }

  const downloaded = new Map(runtime.models.map((m) => [m.file, m]));
  const downloads = new Map(runtime.downloads.map((d) => [d.file, d]));

  return (
    <div className="card runtime-card">
      <div className="runtime-head">
        <div>
          <h3 className="runtime-title">On-device model runtime</h3>
          <p className="runtime-sub">
            {runtime.available
              ? "llama.cpp is bundled in this app and serves GGUF models from the phone itself."
              : runtime.mobile
              ? "This app has no bundled llama.cpp runtime."
              : "This is a desktop install. It uses Foundry Local, Ollama and LM Studio, so no bundled runtime is needed."}
          </p>
        </div>
        <div className="runtime-state">
          <StatusBadge
            status={runtime.ready ? "Running" : runtime.running ? "Starting" : "Stopped"}
          />
          {runtime.running ? (
            <button
              className="btn btn-sm btn-outline"
              onClick={() => act("stop", undefined, "On-device runtime stopped")}
              disabled={busy === "stop"}
            >
              <Stop20Regular /> Stop
            </button>
          ) : (
            <button
              className="btn btn-sm btn-outline"
              onClick={() => act("start", undefined, "On-device runtime started")}
              disabled={busy === "start" || runtime.models.length === 0}
            >
              <Play20Regular /> Start
            </button>
          )}
        </div>
      </div>

      {!runtime.available ? (
        runtime.note && <p className="runtime-note">{runtime.note}</p>
      ) : (
        <>
          {runtime.running && (
            <p className="runtime-note">
              Serving <strong>{runtime.model}</strong> on 127.0.0.1:{runtime.port}. This is the
              llama.cpp provider in Models and Providers.
            </p>
          )}
          <div className="table-card">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Model</th>
                  <th style={{ width: 90 }}>Params</th>
                  <th style={{ width: 110 }}>Size</th>
                  <th style={{ width: 130 }}>License</th>
                  <th style={{ width: 220 }}>State</th>
                </tr>
              </thead>
              <tbody>
                {runtime.catalog.map((spec) => {
                  const present = downloaded.get(spec.file);
                  const progress = downloads.get(spec.file);
                  const loaded = runtime.model === spec.file && runtime.running;
                  return (
                    <tr key={spec.file}>
                      <td className="cell-strong">
                        {spec.name}
                        <div className="muted text-12">{spec.description}</div>
                      </td>
                      <td>{spec.params}</td>
                      <td>{formatBytes(spec.sizeBytes)}</td>
                      <td className="text-12">{spec.license}</td>
                      <td>
                        {progress && !progress.error ? (
                          <div className="runtime-progress">
                            <div
                              className="runtime-progress-bar"
                              style={{
                                width: `${Math.min(
                                  100,
                                  Math.round((progress.received / progress.total) * 100)
                                )}%`,
                              }}
                            />
                            <span className="text-12">
                              {formatBytes(progress.received)} / {formatBytes(progress.total)}
                            </span>
                          </div>
                        ) : present ? (
                          <div className="runtime-actions">
                            {loaded ? (
                              <span className="text-12 muted">Loaded</span>
                            ) : (
                              <button
                                className="btn btn-sm btn-outline"
                                onClick={() =>
                                  act("start", spec.file, `${spec.name} is loading`)
                                }
                                disabled={busy === `start:${spec.file}`}
                              >
                                <Play20Regular /> Load
                              </button>
                            )}
                            <button
                              className="btn btn-sm btn-outline"
                              onClick={() => act("delete", spec.file, `${spec.name} deleted`)}
                              disabled={busy === `delete:${spec.file}`}
                            >
                              <Delete20Regular /> Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            className="btn btn-sm btn-outline"
                            onClick={() => act("download", spec.file, `Downloading ${spec.name}`)}
                            disabled={Boolean(progress) || busy === `download:${spec.file}`}
                          >
                            <ArrowDownload20Regular /> Download
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {runtime.logs.length > 0 && (
            <details className="runtime-logs">
              <summary>Runtime log</summary>
              <pre>{runtime.logs.join("\n")}</pre>
            </details>
          )}
        </>
      )}
    </div>
  );
}
