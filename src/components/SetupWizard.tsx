"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Checkmark20Regular,
  Dismiss20Regular,
  Info20Regular,
  PlugConnected20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { ModelLogo, OpenFoundryLogo } from "./Logos";
import type { LocalModel, LocalSettings, ProviderStatus } from "@/lib/types";

const STEPS = ["Welcome", "Profile", "Providers", "Model", "Ready"] as const;

export default function SetupWizard({
  initial,
  systemHost,
}: {
  initial: LocalSettings;
  systemHost: string;
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

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get("return") || "";
    if (target.startsWith("/")) {
      setReturnTo(target);
      setFocusProvider(params.get("provider") || "");
      setEditProviders(true);
      setStep(2);
    }
  }, []);

  useEffect(() => {
    if (step === 2 && providers.length === 0 && !scanning) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const next = async () => {
    if (step === 1) {
      try {
        await savePartial({
          projectName: settings.projectName,
          userName: settings.userName,
          userInitials: settings.userInitials,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
        return;
      }
    }
    if (step === 2 && providers.length === 0) void scan();
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
      router.refresh();
      window.location.reload();
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
                This is a local display name. It never creates an account or leaves this
                computer.
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
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="setup-step">
              <div className="setup-row">
                <div>
                  <div className="setup-kicker">
                    {editProviders ? "Provider setup" : "Providers"}
                  </div>
                  <h1>
                    {editProviders && focusLabel
                      ? `Connect ${focusLabel}.`
                      : "Connect local runtimes."}
                  </h1>
                  <p className="setup-lead">
                    {editProviders
                      ? "Check the endpoint, then scan again. openFoundry returns to the model you were viewing when you save."
                      : "Scan the runtimes you already have. openFoundry talks to each one directly; nothing is installed silently."}
                  </p>
                </div>
                <button className="btn btn-secondary" onClick={scan} disabled={scanning}>
                  <Search20Regular /> {scanning ? "Scanning…" : "Scan providers"}
                </button>
              </div>

              <div className="provider-setup-list">
                {[
                  ["Foundry Local", "foundryUrl", "foundry"],
                  ["Ollama", "ollamaUrl", "ollama"],
                  ["LM Studio", "lmStudioUrl", "lmstudio"],
                  ["llama.cpp", "llamaCppUrl", "llamacpp"],
                ].map(([label, key, providerId]) => {
                  const status = providers.find(
                    (provider) => provider.id === providerId
                  );
                  return (
                    <div
                      className={`provider-setup-card enabled${
                        focusProvider === providerId ? " focused" : ""
                      }`}
                      key={key}
                    >
                      <div className="provider-setup-name">
                        <span className="kb-icon"><PlugConnected20Regular /></span>
                        <strong>{label}</strong>
                      </div>
                      <span className={`status${status?.online ? "" : " muted"}`}>
                        <span className={`status-dot${status?.online ? "" : " muted"}`} />
                        {status?.online ? `${status.modelCount} models` : "Not running"}
                      </span>
                      <input
                        className="input mono provider-url"
                        value={String(settings[key as keyof LocalSettings] || "")}
                        onChange={(event) =>
                          setSettings((current) => ({
                            ...current,
                            [key]: event.target.value,
                          }))
                        }
                        aria-label={`${label} URL`}
                      />
                    </div>
                  );
                })}
                <div className="provider-setup-card enabled">
                  <div className="provider-setup-name">
                    <span className="kb-icon"><PlugConnected20Regular /></span>
                    <strong>Hugging Face cache</strong>
                  </div>
                  <span className="status muted">
                    <span className="status-dot muted" /> Local files
                  </span>
                  <input
                    className="input mono provider-url"
                    value={settings.huggingFacePath}
                    placeholder="~/.cache/huggingface/hub"
                    onChange={(event) =>
                      setSettings((current) => ({ ...current, huggingFacePath: event.target.value }))
                    }
                    aria-label="Hugging Face cache path"
                  />
                </div>
              </div>

              {error && <div className="banner error">{error}</div>}
              <div className="banner">
                <Info20Regular />
                <span>
                  You can leave everything offline and configure it later. Model
                  features unlock when a runtime responds.
                </span>
              </div>
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
                  {chatModels.slice(0, 40).map((model) => {
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
                    (step === 1 && !settings.userName.trim())
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
