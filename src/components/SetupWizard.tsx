// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowClockwise20Regular,
  ArrowDownload20Regular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Checkmark20Regular,
  Dismiss20Regular,
  Info20Regular,
  Open20Regular,
  Play20Regular,
  PlugConnected20Regular,
  Stop20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { ModelLogo, OpenFoundryLogo } from "./Logos";
import type {
  LocalModel,
  LocalSettings,
  ProviderStatus,
  RuntimeJob,
  RuntimeJobStage,
  RuntimeStatus,
} from "@/lib/types";

const STEPS = ["Welcome", "Profile", "Providers", "Model", "Ready"] as const;

export default function SetupWizard({
  initial,
  systemHost,
  needsClaim = false,
}: {
  initial: LocalSettings;
  systemHost: string;
  needsClaim?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [returnTo, setReturnTo] = useState("");
  const [focusProvider, setFocusProvider] = useState("");
  const [editProviders, setEditProviders] = useState(false);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState("");
  const [termsOpen, setTermsOpen] = useState(false);
  const [claimToken, setClaimToken] = useState("");
  const [accessCode, setAccessCode] = useState("");
  const [claimed, setClaimed] = useState(!needsClaim);
  const [claimOpen, setClaimOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [models, setModels] = useState<LocalModel[]>([]);
  const [settings, setSettings] = useState<LocalSettings>({
    ...initial,
    onboarded: false,
    disclaimerDismissed: true,
    projectName: initial.projectName || "openFoundry Lab",
    userName: initial.userName || "",
    userInitials: initial.userInitials || "",
    lmStudioUrl: initial.lmStudioUrl || "http://127.0.0.1:1234",
    llamaCppUrl: initial.llamaCppUrl || "http://127.0.0.1:8080",
    huggingFacePath: initial.huggingFacePath || "",
  });
  const [runtimes, setRuntimes] = useState<RuntimeStatus[]>([]);
  const [runtimeJob, setRuntimeJob] = useState<RuntimeJob | null>(null);
  const [starter, setStarter] = useState<{
    name: string;
    sizeBytes: number;
  } | null>(null);
  const [runtimeError, setRuntimeError] = useState("");
  const [runtimeBusy, setRuntimeBusy] = useState("");
  const [endpointsOpen, setEndpointsOpen] = useState(false);

  const chatModels = useMemo(
    () => models.filter((model) => model.task === "chat" || model.task === "vision"),
    [models]
  );

  const savePartial = async (patch: Partial<LocalSettings>) => {
    const res = await fetch("/api/settings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...patch, onboarded: editProviders }),
    });
    const json = (await res.json()) as { settings?: LocalSettings; error?: string };
    if (!res.ok || !json.settings)
      throw new Error(json.error || "Could not save setup settings");
    setSettings(json.settings);
    return json.settings;
  };

  const scan = async () => {
    setScanning(true);
    setError("");
    try {
      await savePartial({
        foundryUrl: settings.foundryUrl,
        ollamaUrl: settings.ollamaUrl,
        lmStudioUrl: settings.lmStudioUrl,
        llamaCppUrl: settings.llamaCppUrl,
        huggingFacePath: settings.huggingFacePath,
      });
      const res = await fetch("/api/models", { cache: "no-store" });
      const json = (await res.json()) as {
        models?: LocalModel[];
        providers?: ProviderStatus[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Provider scan failed");
      setModels(json.models || []);
      setProviders(json.providers || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  const refreshRuntimes = async () => {
    const res = await fetch("/api/runtimes", { cache: "no-store" });
    const json = (await res.json()) as {
      runtimes?: RuntimeStatus[];
      jobs?: RuntimeJob[];
      starter?: { name: string; sizeBytes: number };
      error?: string;
    };
    if (!res.ok) throw new Error(json.error || "Could not read local runtimes");
    setRuntimes(json.runtimes || []);
    if (json.starter) setStarter(json.starter);
    const active = (json.jobs || []).find(
      (job) => job.status === "running" || job.status === "queued"
    );
    if (active) setRuntimeJob(active);
    return json;
  };

  const runtimeAction = async (
    action: "install" | "start" | "stop" | "uninstall" | "cancel"
  ) => {
    setRuntimeBusy(action);
    setRuntimeError("");
    try {
      const res = await fetch("/api/runtimes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          provider: "llamacpp",
          jobId: action === "cancel" ? runtimeJob?.id : undefined,
        }),
      });
      const json = (await res.json()) as {
        job?: RuntimeJob;
        error?: string;
        detail?: string;
      };
      if (!res.ok) throw new Error(json.error || "The runtime action failed.");
      if (json.job) setRuntimeJob(json.job);
      if (action === "uninstall") setRuntimeJob(null);
      await refreshRuntimes();
      if (action === "start" || action === "stop") void scan();
    } catch (err) {
      setRuntimeError(err instanceof Error ? err.message : String(err));
    } finally {
      setRuntimeBusy("");
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("return") || "";
    if (target.startsWith("/")) {
      setReturnTo(target);
      setFocusProvider(params.get("provider") || "");
      setEditProviders(true);
      setEndpointsOpen(true);
      setStep(2);
    }
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    if (providers.length === 0 && !scanning) void scan();
    void refreshRuntimes().catch((err) =>
      setRuntimeError(err instanceof Error ? err.message : String(err))
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (!runtimeJob || runtimeJob.status !== "running") return;
    const id = runtimeJob.id;
    let stopped = false;
    const tick = async () => {
      try {
        const res = await fetch("/api/runtimes", { cache: "no-store" });
        const json = (await res.json()) as {
          runtimes?: RuntimeStatus[];
          jobs?: RuntimeJob[];
        };
        if (stopped) return;
        if (json.runtimes) setRuntimes(json.runtimes);
        const job = (json.jobs || []).find((item) => item.id === id);
        if (!job) return;
        setRuntimeJob(job);
        if (job.status === "complete") void scan();
      } catch {
        // A dropped poll is harmless; the next tick catches up.
      }
    };
    const timer = setInterval(tick, 1500);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runtimeJob?.id, runtimeJob?.status]);

  const next = async () => {
    let firstClaim = false;
    if (step === 1) {
      try {
        if (!claimed) {
          const response = await fetch("/api/auth/bootstrap", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              token: claimToken,
              name: settings.userName,
              email: settings.userEmail,
            }),
          });
          const payload = (await response.json().catch(() => ({}))) as {
            accessCode?: string;
            error?: string;
          };
          if (!response.ok || !payload.accessCode) {
            throw new Error(payload.error || "Could not claim this install.");
          }
          setAccessCode(payload.accessCode);
          setClaimed(true);
          firstClaim = true;
        }
        await savePartial({
          projectName: settings.projectName,
          userName: settings.userName,
          userEmail: settings.userEmail,
          userInitials: settings.userInitials,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
      if (firstClaim) {
        setError("");
        setClaimOpen(true);
        return;
      }
    }
    if (step === 2 && providers.length === 0) void scan();
    setStep(Math.min(step + 1, STEPS.length - 1));
  };

  const finishClaim = () => {
    setClaimOpen(false);
    setStep(Math.min(step + 1, STEPS.length - 1));
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...settings,
          ...(editProviders
            ? {}
            : {
                termsAccepted: true,
                disclaimerDismissed: true,
              }),
          onboarded: true,
        }),
      });
      const json = (await res.json()) as { settings?: LocalSettings; error?: string };
      if (!res.ok || !json.settings)
        throw new Error(json.error || "Could not finish setup");
      if (editProviders) {
        router.push(returnTo || "/discover/models");
        router.refresh();
        return;
      }
      // Leave /setup for good. The layout is dynamic, so a full navigation is
      // the reliable way to drop the finished wizard and render the app shell:
      // reloading this route (the old behaviour) just re-rendered the wizard.
      window.location.assign(returnTo || "/discover/models");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const online = providers.filter((provider) => provider.online);
  const focusLabel =
    focusProvider === "ollama"
      ? "Ollama"
      : focusProvider === "foundry"
      ? "Foundry Local"
      : focusProvider === "lmstudio"
      ? "LM Studio"
      : focusProvider === "llamacpp"
      ? "llama.cpp"
      : "";
  const llama = runtimes.find((item) => item.id === "llamacpp");
  const otherRuntimes = runtimes.filter((item) => item.id !== "llamacpp");
  const installing = Boolean(
    runtimeJob &&
      (runtimeJob.status === "running" || runtimeJob.status === "queued")
  );
  const installFailed = runtimeJob?.status === "error";
  const llamaRunning = llama?.state === "running";
  const llamaInstalled = llama?.state === "stopped" || llamaRunning;
  const installSizeMb = Math.round(
    ((starter?.sizeBytes || 397808192) + 25 * 1024 * 1024) / 1_000_000
  );
  const stageLabel = (stage: RuntimeJobStage) =>
    stage === "runtime"
      ? "Downloading llama.cpp"
      : stage === "extract"
      ? "Unpacking"
      : stage === "model"
      ? "Downloading the starter model"
      : stage === "start"
      ? "Starting the server"
      : "Finishing";

  return (
    <div className="setup-screen">
      <div className="setup-shell">
        <aside className="setup-rail">
          <div className="setup-brand">
            <OpenFoundryLogo size={30} />
            <div>
              <strong><span className="setup-brand-open">open</span>Foundry</strong>
              <span>A local AI workbench</span>
            </div>
          </div>
          <ol className="setup-steps">
            {(editProviders ? [2] : [0, 1, 2, 3, 4]).map((index) => {
              const label = STEPS[index];
              return (
                <li
                  key={label}
                  className={
                    index === step ? "active" : index < step && !editProviders ? "done" : ""
                  }
                >
                  <span>
                    {index < step && !editProviders ? (
                      <Checkmark20Regular />
                    ) : editProviders ? (
                      <PlugConnected20Regular />
                    ) : (
                      index + 1
                    )}
                  </span>
                  <div>
                    <strong>{label}</strong>
                    <small>
                      {index === 0
                        ? "Terms and independence"
                        : index === 1
                        ? "Your local identity"
                        : index === 2
                        ? "Ollama, LM Studio, llama.cpp"
                        : index === 3
                        ? "Pick your first model"
                        : "Start building"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="setup-rail-note">
            <Info20Regular />
            <span>
              openFoundry is independent and not affiliated with any model provider.
            </span>
          </div>
        </aside>

        <main className="setup-main">
          {step === 0 && (
            <section className="setup-step">
              <div className="setup-kicker">Welcome</div>
              <h1>Your local AI workshop.</h1>
              <p className="setup-lead">
                openFoundry is a free, independent desktop workbench for running models,
                agents and knowledge on your own hardware. No cloud account, no cloud
                subscription, no usage bill.
              </p>
              <div className="setup-points">
                <div>
                  <strong>Local by default</strong>
                  <span>Models, prompts and documents stay on this computer.</span>
                </div>
                <div>
                  <strong>Bring your own engine</strong>
                  <span>Ollama, LM Studio, llama.cpp, Foundry Local or Hugging Face.</span>
                </div>
                <div>
                  <strong>No lock-in</strong>
                  <span>Your workspace can be exported and moved at any time.</span>
                </div>
              </div>
              <label className="field">
                <span className="field-label">Workspace name</span>
                <input
                  className="input"
                  value={settings.projectName}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, projectName: event.target.value }))
                  }
                />
                <span className="field-hint">This name appears in the app header.</span>
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={settings.termsAccepted}
                  onChange={(event) =>
                    setSettings((current) => ({ ...current, termsAccepted: event.target.checked }))
                  }
                />
                <span>
                  I understand that openFoundry is independent, that model use is governed
                  by each model&apos;s license, and I accept the{" "}
                  <button type="button" className="link" onClick={() => setTermsOpen(true)}>
                    terms of use
                  </button>
                  .
                </span>
              </label>
            </section>
          )}

          {step === 1 && (
            <section className="setup-step">
              <div className="setup-kicker">Profile</div>
              <h1>Who is building?</h1>
              <p className="setup-lead">
                This name and email identify you in this install&apos;s directory. They
                stay on this computer.
              </p>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Display name</span>
                  <input
                    className="input"
                    autoFocus
                    placeholder="Your name"
                    value={settings.userName}
                    onChange={(event) => {
                      const userName = event.target.value;
                      setSettings((current) => ({
                        ...current,
                        userName,
                        userInitials:
                          current.userInitials ||
                          userName
                            .trim()
                            .split(/\s+/)
                            .filter(Boolean)
                            .map((part) => part[0])
                            .join("")
                            .slice(0, 2)
                            .toUpperCase(),
                      }));
                    }}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Initials</span>
                  <input
                    className="input"
                    maxLength={3}
                    value={settings.userInitials}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        userInitials: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    className="input"
                    placeholder="name@company.com"
                    value={settings.userEmail}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        userEmail: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              {!claimed && (
                <div className="setup-card" style={{ marginTop: 18 }}>
                  <strong>This install has no owner yet</strong>
                  <p className="muted text-12" style={{ margin: 0 }}>
                    openFoundry printed a one-time token in the terminal it started
                    from. Enter it here to claim this install. The desktop app signs
                    itself in and never asks for this.
                  </p>
                  <label className="field" style={{ maxWidth: 320 }}>
                    <span className="field-label">Setup token</span>
                    <input
                      className="input mono"
                      autoComplete="off"
                      spellCheck={false}
                      placeholder="XXXX-XXXX-XXXX"
                      value={claimToken}
                      onChange={(event) => setClaimToken(event.target.value)}
                    />
                  </label>
                </div>
              )}
            </section>
          )}

          {step === 2 && (
            <section className="setup-step setup-runtime">
              <div className="setup-kicker">
                {editProviders ? "Provider setup" : "Runtime"}
              </div>
              <h1>
                {editProviders && focusLabel
                  ? `Connect ${focusLabel}.`
                  : "Get one model running."}
              </h1>
              <p className="setup-lead">
                {editProviders
                  ? "Start a runtime here, or point openFoundry at one you already run. Then scan again. openFoundry returns to the model you were viewing when you save."
                  : "openFoundry needs one local runtime to answer a prompt. llama.cpp installs here in a few minutes, with no account and nothing to configure."}
              </p>

              <div className="runtime-hero">
                <div className="runtime-hero-head">
                  <span className="runtime-hero-icon">
                    <PlugConnected20Regular />
                  </span>
                  <div className="runtime-hero-copy">
                    <div className="runtime-hero-title">
                      <strong>llama.cpp</strong>
                      {installing ? (
                        <span className="runtime-badge">Installing</span>
                      ) : installFailed ? (
                        <span className="runtime-badge warning">Install failed</span>
                      ) : llamaRunning ? (
                        <span className="runtime-badge running">Running</span>
                      ) : llamaInstalled ? (
                        <span className="runtime-badge">Installed</span>
                      ) : (
                        <span className="runtime-badge recommended">Recommended</span>
                      )}
                    </div>
                    <p>
                      {installing
                        ? runtimeJob?.message
                        : installFailed
                        ? runtimeJob?.error || "The install stopped before it finished."
                        : llamaRunning
                        ? llama?.detail || "The local server is answering."
                        : llamaInstalled
                        ? "Installed and ready. Start the server when you want to chat."
                        : "A self-contained server with a small starter model. Everything stays on this machine."}
                    </p>
                  </div>
                </div>

                {installing && runtimeJob && (
                  <div className="runtime-progress" aria-live="polite">
                    <div
                      className="runtime-progress-track"
                      role="progressbar"
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(runtimeJob.progress)}
                    >
                      <div
                        className="runtime-progress-fill"
                        style={{ width: `${Math.max(2, runtimeJob.progress)}%` }}
                      />
                    </div>
                    <div className="runtime-progress-meta">
                      <span>{stageLabel(runtimeJob.stage)}</span>
                      <span>{Math.round(runtimeJob.progress)}%</span>
                    </div>
                  </div>
                )}

                {installFailed && runtimeJob?.error && (
                  <div className="runtime-failure" role="alert">
                    <Warning20Regular />
                    <span>{runtimeJob.error}</span>
                  </div>
                )}

                <div className="runtime-hero-actions">
                  {installing ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => runtimeAction("cancel")}
                      disabled={runtimeBusy === "cancel"}
                    >
                      <Dismiss20Regular />
                      {runtimeBusy === "cancel" ? "Cancelling…" : "Cancel install"}
                    </button>
                  ) : installFailed ? (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => runtimeAction("install")}
                        disabled={runtimeBusy === "install"}
                      >
                        <ArrowDownload20Regular />
                        {runtimeBusy === "install" ? "Starting…" : "Retry install"}
                      </button>
                      {llamaInstalled && (
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => runtimeAction("uninstall")}
                          disabled={runtimeBusy === "uninstall"}
                        >
                          Remove
                        </button>
                      )}
                    </>
                  ) : llamaRunning ? (
                    <>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => runtimeAction("stop")}
                        disabled={runtimeBusy === "stop"}
                      >
                        <Stop20Regular />
                        {runtimeBusy === "stop" ? "Stopping…" : "Stop server"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={scan}
                        disabled={scanning}
                      >
                        <ArrowClockwise20Regular />
                        {scanning ? "Scanning…" : "Scan models"}
                      </button>
                    </>
                  ) : llamaInstalled ? (
                    <>
                      <button
                        className="btn btn-primary btn-sm"
                        onClick={() => runtimeAction("start")}
                        disabled={runtimeBusy === "start"}
                      >
                        <Play20Regular />
                        {runtimeBusy === "start" ? "Starting…" : "Start server"}
                      </button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => runtimeAction("uninstall")}
                        disabled={runtimeBusy === "uninstall"}
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <button
                      className="btn btn-primary"
                      onClick={() => runtimeAction("install")}
                      disabled={runtimeBusy === "install" || !llama?.installable}
                    >
                      <ArrowDownload20Regular />
                      {runtimeBusy === "install"
                        ? "Starting…"
                        : "Install llama.cpp"}
                    </button>
                  )}
                  <span className="runtime-hero-note">
                    {installing
                      ? "Downloads continue while this window stays open."
                      : installFailed
                      ? "Finished downloads are reused when you retry."
                      : llamaRunning
                      ? llama?.url
                      : llamaInstalled
                      ? llama?.version
                        ? `Build ${llama.version}, installed in your data folder.`
                        : "Installed in your data folder."
                      : `≈ ${installSizeMb} MB total · from GitHub and Hugging Face`}
                  </span>
                </div>
              </div>

              <div className="runtime-secondary-head">
                <h2>Already have a runtime?</h2>
                <button
                  className="link-button"
                  onClick={() => {
                    void scan();
                    void refreshRuntimes().catch((err) =>
                      setRuntimeError(
                        err instanceof Error ? err.message : String(err)
                      )
                    );
                  }}
                  disabled={scanning}
                >
                  <ArrowClockwise20Regular />
                  {scanning ? "Scanning…" : "Scan again"}
                </button>
              </div>

              <div className="runtime-list">
                {otherRuntimes.length === 0 && (
                  <div className="runtime-row runtime-row-empty">
                    <p>Looking for runtimes…</p>
                  </div>
                )}
                {otherRuntimes.map((runtime) => (
                  <div className="runtime-row" key={runtime.id}>
                    <div className="runtime-row-copy">
                      <div className="runtime-row-name">
                        <strong>{runtime.label}</strong>
                        {runtime.modelCount > 0 && (
                          <span>
                            {runtime.modelCount} model
                            {runtime.modelCount === 1 ? "" : "s"}
                          </span>
                        )}
                      </div>
                      <p>{runtime.detail}</p>
                    </div>
                    <span
                      className={`status${
                        runtime.state === "running" ? "" : " muted"
                      }`}
                    >
                      <span
                        className={`status-dot${
                          runtime.state === "running"
                            ? ""
                            : runtime.state === "stopped"
                            ? " warning"
                            : " muted"
                        }`}
                      />
                      {runtime.state === "running"
                        ? "Running"
                        : runtime.state === "stopped"
                        ? "Installed"
                        : "Not installed"}
                    </span>
                    {runtime.state === "running" ? (
                      <span className="runtime-row-spacer" />
                    ) : (
                      <a
                        className="runtime-link"
                        href={runtime.installUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Get {runtime.label}
                        <Open20Regular />
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <details
                className="runtime-endpoints"
                open={editProviders || endpointsOpen}
                onToggle={(event) =>
                  setEndpointsOpen(event.currentTarget.open)
                }
              >
                <summary>Use a different endpoint</summary>
                <div className="runtime-endpoint-grid">
                  {[
                    ["Foundry Local", "foundryUrl"],
                    ["Ollama", "ollamaUrl"],
                    ["LM Studio", "lmStudioUrl"],
                    ["llama.cpp", "llamaCppUrl"],
                  ].map(([label, key]) => (
                    <label className="runtime-endpoint" key={key}>
                      <span>{label}</span>
                      <input
                        className="input mono provider-url"
                        value={String(
                          settings[key as keyof LocalSettings] || ""
                        )}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        aria-label={`${label} URL`}
                      />
                    </label>
                  ))}
                  <label className="runtime-endpoint runtime-endpoint-wide">
                    <span>Hugging Face cache</span>
                    <input
                      className="input mono provider-url"
                      value={settings.huggingFacePath}
                      placeholder="~/.cache/huggingface/hub"
                      onChange={(event) =>
                        setSettings((current) => ({
                          ...current,
                          huggingFacePath: event.target.value,
                        }))
                      }
                      aria-label="Hugging Face cache path"
                    />
                  </label>
                </div>
              </details>

              {error && <div className="banner error">{error}</div>}
              {runtimeError && (
                <div className="banner error" role="alert">
                  <Warning20Regular />
                  <span>{runtimeError}</span>
                </div>
              )}
              {!editProviders && (
                <div className="banner">
                  <Info20Regular />
                  <span>
                    You can leave everything offline and configure it later.
                    Model features unlock when a runtime responds.
                  </span>
                </div>
              )}
            </section>
          )}

          {step === 3 && (
            <section className="setup-step">
              <div className="setup-kicker">Model</div>
              <h1>Choose your first model.</h1>
              <p className="setup-lead">
                {chatModels.length
                  ? "These models were reported by the providers on this computer."
                  : "No chat models were discovered. You can finish setup and add one later."}
              </p>
              {chatModels.length > 0 ? (
                <div className="setup-model-list">
                  {chatModels.map((model) => {
                    const active = settings.defaultProviderId === model.provider && settings.defaultModel === model.id;
                    return (
                      <button
                        key={model.key}
                        className={`setup-model-row${active ? " active" : ""}`}
                        onClick={() =>
                          setSettings((current) => ({
                            ...current,
                            defaultProviderId: model.provider,
                            defaultModel: model.id,
                          }))
                        }
                      >
                        <ModelLogo publisher={model.publisher} name={model.displayName} size={28} />
                        <span>
                          <strong>{model.displayName}</strong>
                          <small>{model.publisher} · {model.providerLabel}</small>
                        </span>
                        {active && <Checkmark20Regular />}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="setup-no-models">
                  <PlugConnected20Regular />
                  <strong>No model runtime detected</strong>
                  <p>Start a provider and scan again, or continue and configure it later.</p>
                  <button
                    className="btn btn-secondary"
                    onClick={() => setStep(2)}
                  >
                    <ArrowLeft20Regular /> Back to providers
                  </button>
                </div>
              )}
            </section>
          )}

          {step === 4 && (
            <section className="setup-step">
              <div className="setup-kicker">Ready</div>
              <h1>Your workshop is ready.</h1>
              <p className="setup-lead">
                openFoundry opens on the workspace dashboard. Providers and models can be
                changed later.
              </p>
              <div className="setup-summary">
                <div>
                  <span>Workspace</span>
                  <strong>{settings.projectName}</strong>
                </div>
                <div>
                  <span>Profile</span>
                  <strong>{settings.userName || "Local user"}</strong>
                </div>
                <div>
                  <span>Providers online</span>
                  <strong>{online.length}</strong>
                </div>
                <div>
                  <span>Models discovered</span>
                  <strong>{models.length}</strong>
                </div>
                <div>
                  <span>Default model</span>
                  <strong>{settings.defaultModel || "None selected"}</strong>
                </div>
              </div>
              <div className="banner">
                <Info20Regular />
                <span>
                  This workspace lives on {systemHost || "this computer"}. Model licenses
                  remain the responsibility of their owners.
                </span>
              </div>
            </section>
          )}

          <footer className="setup-actions">
            {editProviders ? (
              <button
                className="btn btn-secondary"
                onClick={() => router.push(returnTo || "/discover/models")}
              >
                <ArrowLeft20Regular /> Back to model
              </button>
            ) : step > 0 ? (
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                <ArrowLeft20Regular /> Back
              </button>
            ) : (
              <span />
            )}
            <div className="row" style={{ gap: 8 }}>
              {editProviders ? (
                <button
                  className="btn btn-primary"
                  disabled={saving || scanning}
                  onClick={finish}
                >
                  {saving ? "Saving…" : "Save and return"}
                </button>
              ) : step < STEPS.length - 1 ? (
                <button
                  className="btn btn-primary"
                  disabled={
                    saving ||
                    scanning ||
                    (step === 0 && !settings.termsAccepted) ||
                    (step === 1 && !settings.userName.trim()) ||
                    (step === 1 &&
                      !claimed &&
                      (!claimToken.trim() ||
                        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.userEmail)))
                  }
                  onClick={next}
                >
                  Continue <ArrowRight20Regular />
                </button>
              ) : (
                <button className="btn btn-primary" disabled={saving} onClick={finish}>
                  {saving ? "Starting…" : "Open openFoundry"}
                </button>
              )}
            </div>
          </footer>
        </main>
      </div>

      {claimOpen && (
        <div className="dialog-backdrop">
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Your access code"
          >
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Your access code</h2>
                <p className="dialog-sub">
                  Nobody can recover this code. Store it somewhere before you continue.
                </p>
              </div>
            </div>
            <div className="dialog-body">
              <div className="row" style={{ gap: 8 }}>
                <span className="mono" style={{ fontSize: 18, letterSpacing: "0.08em" }}>
                  {accessCode}
                </span>
                <span className="spacer" />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(accessCode);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1500);
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="muted text-12" style={{ marginTop: 10 }}>
                You will use it to sign in from another browser. On this computer you
                stay signed in.
              </p>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={finishClaim}>
                I saved it
              </button>
            </div>
          </div>
        </div>
      )}

      {termsOpen && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setTermsOpen(false);
        }}>
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Terms of use">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Terms of use</h2>
                <p className="dialog-sub">Summary</p>
              </div>
              <button className="icon-button" onClick={() => setTermsOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body model-prose">
              <p>openFoundry is free software provided as-is, without warranty.</p>
              <p>You are responsible for models, model licenses, data and remote endpoints you configure.</p>
              <p>openFoundry is independent and is not affiliated with any model provider or platform vendor.</p>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setTermsOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
