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
  Copy20Regular,
  Dismiss20Regular,
  LockClosed20Regular,
  Open20Regular,
  Play20Regular,
  PlugConnected20Regular,
  Server20Regular,
  ShieldCheckmark20Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  Badge,
  Button,
  Card,
  Checkbox,
  Dialog,
  DialogActions,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Field,
  FluentProvider,
  Input,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
  ProgressBar,
  Radio,
  RadioGroup,
  Spinner,
  Text,
} from "@fluentui/react-components";
import { foundryFluentTheme } from "./fluent-theme";
import ExternalLink from "./ExternalLink";
import { ModelLogo, OpenFoundryLogo } from "./Logos";
import type {
  LocalModel,
  LocalSettings,
  ProviderStatus,
  RuntimeJob,
  RuntimeJobStage,
  RuntimeStatus,
} from "@/lib/types";

const STEPS = [
  { label: "Welcome", description: "Terms and workspace" },
  { label: "Profile", description: "Your local identity" },
  { label: "Providers", description: "Connect a runtime" },
  { label: "Model", description: "Pick your first model" },
  { label: "Ready", description: "Start building" },
] as const;

type SetupWizardProps = {
  initial: LocalSettings;
  systemHost: string;
  needsClaim?: boolean;
  theme?: "dark" | "light";
};

export default function SetupWizard({
  initial,
  systemHost,
  needsClaim = false,
  theme = "dark",
}: SetupWizardProps) {
  const router = useRouter();
  const fluentTheme = useMemo(() => foundryFluentTheme(theme), [theme]);
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
  const [starter, setStarter] = useState<{ name: string; sizeBytes: number } | null>(null);
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
    if (!res.ok || !json.settings) throw new Error(json.error || "Could not save setup settings");
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
      const json = (await res.json()) as { models?: LocalModel[]; providers?: ProviderStatus[]; error?: string };
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
    const active = (json.jobs || []).find((job) => job.status === "running" || job.status === "queued");
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
      const json = (await res.json()) as { job?: RuntimeJob; error?: string; detail?: string };
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
        const json = (await res.json()) as { runtimes?: RuntimeStatus[]; jobs?: RuntimeJob[] };
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
          const payload = (await response.json().catch(() => ({}))) as { accessCode?: string; error?: string };
          if (!response.ok || !payload.accessCode) throw new Error(payload.error || "Could not claim this install.");
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
          ...(editProviders ? {} : { termsAccepted: true, disclaimerDismissed: true }),
          onboarded: true,
        }),
      });
      const json = (await res.json()) as { settings?: LocalSettings; error?: string };
      if (!res.ok || !json.settings) throw new Error(json.error || "Could not finish setup");
      if (editProviders) {
        router.push(returnTo || "/discover/models");
        router.refresh();
        return;
      }
      window.location.assign(returnTo || "/discover/models");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const copyAccessCode = async () => {
    try {
      await navigator.clipboard.writeText(accessCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Select the code and copy it manually.");
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
  const installing = Boolean(runtimeJob && (runtimeJob.status === "running" || runtimeJob.status === "queued"));
  const installFailed = runtimeJob?.status === "error";
  const llamaRunning = llama?.state === "running";
  const llamaInstalled = llama?.state === "stopped" || llamaRunning;
  const installSizeMb = Math.round(((starter?.sizeBytes || 397808192) + 25 * 1024 * 1024) / 1_000_000);
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

  const selectedModelKey =
    chatModels.find((model) => model.provider === settings.defaultProviderId && model.id === settings.defaultModel)?.key ?? "";

  const visibleSteps = editProviders ? [2] : STEPS.map((_, index) => index);

  const endpointsOpenValue = endpointsOpen || editProviders ? ["endpoints"] : [];

  return (
    <FluentProvider theme={fluentTheme} className="setup-provider">
      <div className="setup-screen">
        <div className="setup-shell">
          <header className="setup-topbar">
            <div className="setup-brand">
              <OpenFoundryLogo size={24} />
              <div className="setup-brand-text">
                <strong>
                  <span className="setup-brand-open">open</span>Foundry
                </strong>
                <span>Local workspace</span>
              </div>
            </div>
            <div className="setup-topbar-meta">
              <span>
                {editProviders
                  ? "Provider setup"
                  : `Step ${step + 1} of ${STEPS.length}`}
              </span>
              <Badge appearance="tint" color="brand" size="small">
                <ShieldCheckmark20Regular />
                Local
              </Badge>
            </div>
          </header>

          <aside className="setup-rail">
            <ol className="setup-steps" aria-label="Setup steps">
              {visibleSteps.map((index) => {
                const done = index < step && !editProviders;
                const active = index === step;
                return (
                  <li
                    key={index}
                    className={`setup-step-item${active ? " active" : ""}${done ? " done" : ""}`}
                    aria-current={active ? "step" : undefined}
                  >
                    <span className="setup-step-index" aria-hidden="true">
                      {done ? <Checkmark20Regular /> : index + 1}
                    </span>
                    <div className="setup-step-copy">
                      <strong>{STEPS[index].label}</strong>
                      <small>{STEPS[index].description}</small>
                    </div>
                  </li>
                );
              })}
            </ol>
            <div className="setup-rail-note">
              <LockClosed20Regular />
              <span>Everything stays on this computer.</span>
            </div>
          </aside>

          <main className="setup-main">
            <div className="setup-scroll">
              <div className="setup-content">
                {step === 0 && (
                  <section className="setup-step" aria-labelledby="setup-title-0">
                    <h1 className="setup-title" id="setup-title-0">
                      Set up your local AI workbench.
                    </h1>
                    <p className="setup-lead">
                      openFoundry runs models, agents and knowledge on this computer. No
                      cloud account, no subscription, no usage bill.
                    </p>

                    <div className="setup-feature-list">
                      <div className="setup-feature">
                        <span className="setup-feature-icon">
                          <LockClosed20Regular />
                        </span>
                        <div className="setup-feature-copy">
                          <strong>Local by default</strong>
                          <span>Models, prompts and documents stay on this machine.</span>
                        </div>
                      </div>
                      <div className="setup-feature">
                        <span className="setup-feature-icon">
                          <Server20Regular />
                        </span>
                        <div className="setup-feature-copy">
                          <strong>Bring your own engine</strong>
                          <span>Ollama, LM Studio, llama.cpp and Foundry Local are detected automatically.</span>
                        </div>
                      </div>
                      <div className="setup-feature">
                        <span className="setup-feature-icon">
                          <ShieldCheckmark20Regular />
                        </span>
                        <div className="setup-feature-copy">
                          <strong>Nothing to configure later</strong>
                          <span>Start with one local model and change any endpoint afterwards.</span>
                        </div>
                      </div>
                    </div>

                    <div className="setup-form-grid">
                      <Field
                        className="setup-field setup-field-wide"
                        label="Workspace name"
                        hint="This name appears in the app header."
                      >
                        <Input
                          className="setup-input"
                          value={settings.projectName}
                          onChange={(_, data) =>
                            setSettings((current) => ({ ...current, projectName: data.value }))
                          }
                        />
                      </Field>
                    </div>

                    <div className="setup-terms">
                      <Checkbox
                        checked={settings.termsAccepted}
                        onChange={(_, data) =>
                          setSettings((current) => ({
                            ...current,
                            termsAccepted: data.checked === true,
                          }))
                        }
                        label="I understand that openFoundry is independent, that model use is governed by each model's license, and I accept the terms of use."
                      />
                      <Button
                        appearance="subtle"
                        size="small"
                        onClick={() => setTermsOpen(true)}
                      >
                        Read the terms
                      </Button>
                    </div>
                  </section>
                )}

                {step === 1 && (
                  <section className="setup-step" aria-labelledby="setup-title-1">
                    <h1 className="setup-title" id="setup-title-1">Who is building?</h1>
                    <p className="setup-lead">
                      This name and email identify you in this install&apos;s directory. They stay
                      on this computer.
                    </p>

                    <div className="setup-form-grid">
                      <Field
                        className="setup-field setup-field-wide"
                        label="Display name"
                      >
                        <Input
                          className="setup-input"
                          autoFocus
                          placeholder="Your name"
                          value={settings.userName}
                          onChange={(_, data) => {
                            const userName = data.value;
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
                      </Field>
                      <Field className="setup-field" label="Initials">
                        <Input
                          className="setup-input"
                          maxLength={3}
                          value={settings.userInitials}
                          onChange={(_, data) =>
                            setSettings((current) => ({
                              ...current,
                              userInitials: data.value.toUpperCase(),
                            }))
                          }
                        />
                      </Field>
                      <Field className="setup-field setup-field-wide" label="Email">
                        <Input
                          className="setup-input"
                          placeholder="name@company.com"
                          value={settings.userEmail}
                          onChange={(_, data) =>
                            setSettings((current) => ({ ...current, userEmail: data.value }))
                          }
                        />
                      </Field>
                    </div>

                    {!claimed && (
                      <div className="setup-owner-panel">
                        <MessageBar intent="info" className="setup-message">
                          <MessageBarBody>
                            <MessageBarTitle>This install has no owner yet</MessageBarTitle>
                            openFoundry printed a one-time token in the terminal it started
                            from. Enter it here to claim this install. The desktop app signs
                            itself in and never asks for this again.
                          </MessageBarBody>
                        </MessageBar>
                        <Field
                          className="setup-field setup-field-narrow"
                          label="Setup token"
                          hint="Enter the token printed in the terminal."
                        >
                          <Input
                            className="setup-input setup-mono"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="XXXX-XXXX-XXXX"
                            value={claimToken}
                            onChange={(_, data) => setClaimToken(data.value)}
                          />
                        </Field>
                      </div>
                    )}
                  </section>
                )}

                {step === 2 && (
                  <section className="setup-step" aria-labelledby="setup-title-2">
                    <h1 className="setup-title" id="setup-title-2">
                      {editProviders && focusLabel ? `Connect ${focusLabel}.` : "Get one model running."}
                    </h1>
                    <p className="setup-lead">
                      {editProviders
                        ? "Start a runtime here, or point openFoundry at one you already run. Then scan again. openFoundry returns to the model you were viewing when you save."
                        : "openFoundry needs one local runtime to answer a prompt. llama.cpp installs here in a few minutes, with no account and nothing to configure."}
                    </p>

                    {error && (
                      <MessageBar intent="error" className="setup-message">
                        <MessageBarBody>{error}</MessageBarBody>
                      </MessageBar>
                    )}
                    {runtimeError && (
                      <MessageBar intent="error" className="setup-message">
                        <MessageBarBody>{runtimeError}</MessageBarBody>
                      </MessageBar>
                    )}

                    <Card appearance="filled-alternative" focusMode="off" className="setup-runtime-hero">
                      <div className="setup-runtime-head">
                        <span className="setup-runtime-icon">
                          <PlugConnected20Regular />
                        </span>
                        <div className="setup-runtime-copy">
                          <div className="setup-runtime-title">
                            <strong>llama.cpp</strong>
                            {installing ? (
                              <Badge appearance="tint" color="informative" size="small">Installing</Badge>
                            ) : installFailed ? (
                              <Badge appearance="tint" color="danger" size="small">Install failed</Badge>
                            ) : llamaRunning ? (
                              <Badge appearance="tint" color="success" size="small">Running</Badge>
                            ) : llamaInstalled ? (
                              <Badge appearance="tint" color="warning" size="small">Installed</Badge>
                            ) : (
                              <Badge appearance="tint" color="brand" size="small">Recommended</Badge>
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
                        <div className="setup-runtime-progress" aria-live="polite">
                          <ProgressBar
                            max={100}
                            value={Math.max(0, Math.min(100, runtimeJob.progress))}
                            thickness="large"
                            color="brand"
                            aria-label={`${Math.round(runtimeJob.progress)}% complete`}
                          />
                          <div className="setup-runtime-progress-meta">
                            <span>{stageLabel(runtimeJob.stage)}</span>
                            <span>{Math.round(runtimeJob.progress)}%</span>
                          </div>
                        </div>
                      )}

                      {installFailed && runtimeJob?.error && (
                        <MessageBar intent="error" className="setup-message">
                          <MessageBarBody>{runtimeJob.error}</MessageBarBody>
                        </MessageBar>
                      )}

                      <div className="setup-runtime-actions">
                        {installing ? (
                          <Button
                            appearance="secondary"
                            size="small"
                            icon={runtimeBusy === "cancel" ? <Spinner size="tiny" /> : <Dismiss20Regular />}
                            onClick={() => runtimeAction("cancel")}
                            disabled={runtimeBusy === "cancel"}
                          >
                            {runtimeBusy === "cancel" ? "Cancelling…" : "Cancel install"}
                          </Button>
                        ) : installFailed ? (
                          <>
                            <Button
                              appearance="primary"
                              size="small"
                              icon={runtimeBusy === "install" ? <Spinner size="tiny" /> : <ArrowDownload20Regular />}
                              onClick={() => runtimeAction("install")}
                              disabled={runtimeBusy === "install"}
                            >
                              {runtimeBusy === "install" ? "Starting…" : "Retry install"}
                            </Button>
                            {llamaInstalled && (
                              <Button
                                appearance="secondary"
                                size="small"
                                onClick={() => runtimeAction("uninstall")}
                                disabled={runtimeBusy === "uninstall"}
                              >
                                Remove
                              </Button>
                            )}
                          </>
                        ) : llamaRunning ? (
                          <>
                            <Button
                              appearance="secondary"
                              size="small"
                              icon={runtimeBusy === "stop" ? <Spinner size="tiny" /> : <Stop20Regular />}
                              onClick={() => runtimeAction("stop")}
                              disabled={runtimeBusy === "stop"}
                            >
                              {runtimeBusy === "stop" ? "Stopping…" : "Stop server"}
                            </Button>
                            <Button
                              appearance="secondary"
                              size="small"
                              icon={scanning ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
                              onClick={scan}
                              disabled={scanning}
                            >
                              {scanning ? "Scanning…" : "Scan models"}
                            </Button>
                          </>
                        ) : llamaInstalled ? (
                          <>
                            <Button
                              appearance="primary"
                              size="small"
                              icon={runtimeBusy === "start" ? <Spinner size="tiny" /> : <Play20Regular />}
                              onClick={() => runtimeAction("start")}
                              disabled={runtimeBusy === "start"}
                            >
                              {runtimeBusy === "start" ? "Starting…" : "Start server"}
                            </Button>
                            <Button
                              appearance="secondary"
                              size="small"
                              onClick={() => runtimeAction("uninstall")}
                              disabled={runtimeBusy === "uninstall"}
                            >
                              Remove
                            </Button>
                          </>
                        ) : (
                          <Button
                            appearance="primary"
                            icon={runtimeBusy === "install" ? <Spinner size="tiny" /> : <ArrowDownload20Regular />}
                            onClick={() => runtimeAction("install")}
                            disabled={runtimeBusy === "install" || !llama?.installable}
                          >
                            {runtimeBusy === "install" ? "Starting…" : "Install llama.cpp"}
                          </Button>
                        )}
                        <span className="setup-runtime-note">
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
                    </Card>

                    <div className="setup-section-head">
                      <Text weight="semibold">Already have a runtime?</Text>
                      <Button
                        appearance="subtle"
                        size="small"
                        icon={scanning ? <Spinner size="tiny" /> : <ArrowClockwise20Regular />}
                        onClick={() => {
                          void scan();
                          void refreshRuntimes().catch((err) =>
                            setRuntimeError(err instanceof Error ? err.message : String(err))
                          );
                        }}
                        disabled={scanning}
                      >
                        {scanning ? "Scanning…" : "Scan again"}
                      </Button>
                    </div>

                    <ul className="setup-runtime-list">
                      {otherRuntimes.length === 0 && (
                        <li className="setup-runtime-row setup-runtime-row-empty">
                          <p>Looking for runtimes…</p>
                        </li>
                      )}
                      {otherRuntimes.map((runtime) => (
                        <li className="setup-runtime-row" key={runtime.id}>
                          <span className="setup-runtime-row-icon">
                            <Server20Regular />
                          </span>
                          <div className="setup-runtime-row-copy">
                            <div className="setup-runtime-row-name">
                              <Text weight="semibold">{runtime.label}</Text>
                              {runtime.modelCount > 0 && (
                                <span className="setup-runtime-row-meta">
                                  {runtime.modelCount} model{runtime.modelCount === 1 ? "" : "s"}
                                </span>
                              )}
                            </div>
                            <p>{runtime.detail}</p>
                          </div>
                          <RuntimeStateBadge state={runtime.state} />
                          {runtime.state === "missing" && runtime.installUrl ? (
                            <ExternalLink
                              className="setup-external-link"
                              href={runtime.installUrl}
                              onOpenError={(message) => setRuntimeError(message)}
                            >
                              Get {runtime.label}
                              <Open20Regular />
                            </ExternalLink>
                          ) : (
                            <span className="setup-runtime-row-spacer" />
                          )}
                        </li>
                      ))}
                    </ul>

                    <Accordion
                      className="setup-endpoints"
                      collapsible
                      openItems={endpointsOpenValue}
                      onToggle={(_, data) => setEndpointsOpen(data.openItems.includes("endpoints"))}
                    >
                      <AccordionItem value="endpoints">
                        <AccordionHeader>Use a different endpoint</AccordionHeader>
                        <AccordionPanel>
                          <div className="setup-endpoint-grid">
                            {[
                              ["Foundry Local", "foundryUrl"],
                              ["Ollama", "ollamaUrl"],
                              ["LM Studio", "lmStudioUrl"],
                              ["llama.cpp", "llamaCppUrl"],
                            ].map(([label, key]) => (
                              <Field key={key} label={label}>
                                <Input
                                  className="setup-input setup-mono"
                                  value={String(settings[key as keyof LocalSettings] || "")}
                                  onChange={(_, data) =>
                                    setSettings((current) => ({
                                      ...current,
                                      [key]: data.value,
                                    }))
                                  }
                                  aria-label={`${label} URL`}
                                />
                              </Field>
                            ))}
                            <Field className="setup-field-wide" label="Hugging Face cache">
                              <Input
                                className="setup-input setup-mono"
                                value={settings.huggingFacePath}
                                placeholder="~/.cache/huggingface/hub"
                                onChange={(_, data) =>
                                  setSettings((current) => ({
                                    ...current,
                                    huggingFacePath: data.value,
                                  }))
                                }
                                aria-label="Hugging Face cache path"
                              />
                            </Field>
                          </div>
                        </AccordionPanel>
                      </AccordionItem>
                    </Accordion>

                    {!editProviders && (
                      <MessageBar intent="info" className="setup-message">
                        <MessageBarBody>
                          You can leave everything offline and configure it later. Model
                          features unlock when a runtime responds.
                        </MessageBarBody>
                      </MessageBar>
                    )}
                  </section>
                )}

                {step === 3 && (
                  <section className="setup-step" aria-labelledby="setup-title-3">
                    <h1 className="setup-title" id="setup-title-3">Choose your first model.</h1>
                    <p className="setup-lead">
                      {chatModels.length
                        ? "These models were reported by the providers on this computer."
                        : "No chat models were discovered. You can finish setup and add one later."}
                    </p>

                    {chatModels.length > 0 ? (
                      <RadioGroup
                        className="setup-model-radio-group"
                        value={selectedModelKey}
                        onChange={(_, data) => {
                          const model = chatModels.find((item) => item.key === data.value);
                          if (model) {
                            setSettings((current) => ({
                              ...current,
                              defaultProviderId: model.provider,
                              defaultModel: model.id,
                            }));
                          }
                        }}
                      >
                        <div className="setup-model-list">
                          {chatModels.map((model) => (
                            <Radio
                              key={model.key}
                              value={model.key}
                              className="setup-model-option"
                              label={
                                <>
                                  <ModelLogo publisher={model.publisher} name={model.displayName} size={28} />
                                  <span className="setup-model-copy">
                                    <strong>{model.displayName}</strong>
                                    <small>
                                      {model.publisher} · {model.providerLabel}
                                    </small>
                                  </span>
                                </>
                              }
                            />
                          ))}
                        </div>
                      </RadioGroup>
                    ) : (
                      <div className="setup-empty">
                        <PlugConnected20Regular />
                        <strong>No model runtime detected</strong>
                        <p>Start a provider and scan again, or continue and configure it later.</p>
                        <Button
                          appearance="secondary"
                          onClick={() => setStep(2)}
                          icon={<ArrowLeft20Regular />}
                        >
                          Back to providers
                        </Button>
                      </div>
                    )}
                  </section>
                )}

                {step === 4 && (
                  <section className="setup-step" aria-labelledby="setup-title-4">
                    <h1 className="setup-title" id="setup-title-4">Your workshop is ready.</h1>
                    <p className="setup-lead">
                      openFoundry opens on the workspace dashboard. Providers and models can
                      be changed later.
                    </p>
                    <div className="setup-summary">
                      <div className="setup-summary-item">
                        <span className="setup-summary-label">Workspace</span>
                        <strong className="setup-summary-value">{settings.projectName}</strong>
                      </div>
                      <div className="setup-summary-item">
                        <span className="setup-summary-label">Profile</span>
                        <strong className="setup-summary-value">{settings.userName || "Local user"}</strong>
                      </div>
                      <div className="setup-summary-item">
                        <span className="setup-summary-label">Providers online</span>
                        <strong className="setup-summary-value">{online.length}</strong>
                      </div>
                      <div className="setup-summary-item">
                        <span className="setup-summary-label">Models discovered</span>
                        <strong className="setup-summary-value">{models.length}</strong>
                      </div>
                      <div className="setup-summary-item">
                        <span className="setup-summary-label">Default model</span>
                        <strong className="setup-summary-value">
                          {settings.defaultModel || "None selected"}
                        </strong>
                      </div>
                      <div className="setup-summary-item">
                        <span className="setup-summary-label">Location</span>
                        <strong className="setup-summary-value">{systemHost || "This computer"}</strong>
                      </div>
                    </div>
                    <MessageBar intent="info" className="setup-message">
                      <MessageBarBody>
                        This workspace lives on {systemHost || "this computer"}. Model licenses
                        remain the responsibility of their owners.
                      </MessageBarBody>
                    </MessageBar>
                  </section>
                )}
              </div>
            </div>

            <footer className="setup-actions">
              <div>
                {editProviders ? (
                  <Button
                    appearance="secondary"
                    onClick={() => router.push(returnTo || "/discover/models")}
                    icon={<ArrowLeft20Regular />}
                  >
                    Back to model
                  </Button>
                ) : step > 0 ? (
                  <Button
                    appearance="secondary"
                    onClick={() => setStep(step - 1)}
                    icon={<ArrowLeft20Regular />}
                  >
                    Back
                  </Button>
                ) : (
                  <span />
                )}
              </div>
              <div className="setup-actions-right">
                {editProviders ? (
                  <Button
                    appearance="primary"
                    disabled={saving || scanning}
                    onClick={finish}
                  >
                    {saving ? "Saving…" : "Save and return"}
                  </Button>
                ) : step < STEPS.length - 1 ? (
                  <Button
                    appearance="primary"
                    icon={<ArrowRight20Regular />}
                    iconPosition="after"
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
                    Continue
                  </Button>
                ) : (
                  <Button
                    appearance="primary"
                    disabled={saving}
                    onClick={finish}
                  >
                    {saving ? "Starting…" : "Open openFoundry"}
                  </Button>
                )}
              </div>
            </footer>
          </main>
        </div>

        <Dialog
          open={claimOpen}
          modalType="alert"
          onOpenChange={(_, data) => {
            if (!data.open) setClaimOpen(false);
          }}
        >
          <DialogSurface className="setup-dialog">
            <DialogBody>
              <DialogTitle>Your access code</DialogTitle>
              <DialogContent>
                <p className="setup-dialog-note">
                  Nobody can recover this code. Store it somewhere before you continue.
                </p>
                <div className="setup-code-box">
                  <code>{accessCode}</code>
                  <Button
                    appearance="secondary"
                    size="small"
                    icon={copied ? <Checkmark20Regular /> : <Copy20Regular />}
                    onClick={copyAccessCode}
                  >
                    {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
                <p className="setup-dialog-note">
                  You will use it to sign in from another browser. On this computer you stay
                  signed in.
                </p>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={finishClaim}>
                  I saved it
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>

        <Dialog open={termsOpen} onOpenChange={(_, data) => setTermsOpen(data.open)}>
          <DialogSurface className="setup-dialog">
            <DialogBody>
              <DialogTitle>Terms of use</DialogTitle>
              <DialogContent>
                <p>openFoundry is free software provided as-is, without warranty.</p>
                <p>
                  You are responsible for models, model licenses, data and remote endpoints you
                  configure.
                </p>
                <p>openFoundry is independent and is not affiliated with any model provider or platform vendor.</p>
              </DialogContent>
              <DialogActions>
                <Button appearance="primary" onClick={() => setTermsOpen(false)}>
                  Close
                </Button>
              </DialogActions>
            </DialogBody>
          </DialogSurface>
        </Dialog>
      </div>
    </FluentProvider>
  );
}

function RuntimeStateBadge({ state }: { state: RuntimeStatus["state"] }) {
  if (state === "running") return <Badge appearance="tint" color="success" size="small">Running</Badge>;
  if (state === "stopped") return <Badge appearance="tint" color="warning" size="small">Installed</Badge>;
  if (state === "installing") return <Badge appearance="tint" color="informative" size="small">Installing</Badge>;
  return <Badge appearance="tint" color="subtle" size="small">Not installed</Badge>;
}
