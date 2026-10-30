import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Checkmark20Regular,
  Dismiss20Regular,
  Info20Regular,
  PlugConnected20Regular,
  Search20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { detectProviders } from "../lib/api";
import { initials } from "../lib/format";
import type {
  ProviderConfig,
  ProviderStatus,
  Settings,
} from "../lib/types";
import { ModelLogo, OpenFoundryMark } from "./Logos";

const STEPS = ["Welcome", "Profile", "Providers", "Models", "Ready"] as const;

export default function SetupWizard({
  initial,
  onComplete,
}: {
  initial: Settings;
  onComplete: (settings: Settings) => Promise<void>;
}) {
  const [step, setStep] = useState(0);
  const [settings, setSettings] = useState<Settings>({
    ...initial,
    providers: initial.providers.length ? initial.providers : [],
    termsAccepted: false,
    onboarded: false,
    displayName: "",
    initials: "",
  });
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const available = useMemo(
    () => providers.flatMap((provider) => provider.models),
    [providers]
  );

  useEffect(() => {
    setSettings((current) => ({
      ...current,
      initials: current.initials || initials(current.displayName),
    }));
  }, [settings.displayName]);

  const scan = async () => {
    setScanning(true);
    setError("");
    try {
      const result = await detectProviders(settings.providers);
      setProviders(result);
      setScanned(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    if (step === 2 && !scanned && !scanning) void scan();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const updateProvider = (id: string, patch: Partial<ProviderConfig>) => {
    setSettings((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider
      ),
    }));
  };

  const addCustom = () => {
    const id = `custom-${crypto.randomUUID().slice(0, 8)}`;
    setSettings((current) => ({
      ...current,
      providers: [
        ...current.providers,
        {
          id,
          label: "Custom endpoint",
          kind: "openai",
          baseUrl: "http://127.0.0.1:8000",
          enabled: true,
          custom: true,
        },
      ],
    }));
  };

  const removeCustom = (id: string) => {
    setSettings((current) => ({
      ...current,
      providers: current.providers.filter((provider) => provider.id !== id),
    }));
  };

  const chooseModel = (providerId: string, model: string) => {
    setSettings((current) => ({
      ...current,
      defaultProvider: providerId,
      defaultModel: model,
    }));
  };

  const canContinue = () => {
    if (step === 0) return settings.termsAccepted && settings.workspaceName.trim().length > 0;
    if (step === 1) return settings.displayName.trim().length > 0;
    if (step === 2) return !scanning;
    return true;
  };

  const finish = async () => {
    setSaving(true);
    setError("");
    try {
      await onComplete({
        ...settings,
        initials: settings.initials || initials(settings.displayName),
        termsAccepted: true,
        onboarded: true,
        providers: settings.providers,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const online = providers.filter((provider) => provider.online);

  return (
    <div className="setup-screen">
      <div className="setup-shell">
        <aside className="setup-rail">
          <div className="setup-brand">
            <OpenFoundryMark size={30} />
            <div>
              <strong>openFoundry</strong>
              <span>A local AI workbench</span>
            </div>
          </div>
          <ol className="setup-steps">
            {STEPS.map((label, index) => (
              <li
                key={label}
                className={`${index === step ? "active" : ""}${index < step ? " done" : ""}`}
              >
                <span>{index < step ? <Checkmark20Regular /> : index + 1}</span>
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
            ))}
          </ol>
          <div className="setup-rail-note">
            <Info20Regular />
            <span>
              This app runs on your computer. It is independent and not affiliated
              with any model provider.
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
                agents and knowledge bases on your own hardware. No cloud account, no
                cloud subscription, no usage bill.
              </p>
              <div className="setup-points">
                <div>
                  <strong>Local by default</strong>
                  <span>Models, prompts and documents stay on this computer.</span>
                </div>
                <div>
                  <strong>Bring your own engine</strong>
                  <span>Use Ollama, LM Studio, llama.cpp, Foundry CLI or a custom endpoint.</span>
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
                  value={settings.workspaceName}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      workspaceName: event.target.value,
                    }))
                  }
                />
                <span className="field-hint">
                  This name appears in the app header and local data folder.
                </span>
              </label>
              <label className="setup-check">
                <input
                  type="checkbox"
                  checked={settings.termsAccepted}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      termsAccepted: event.target.checked,
                    }))
                  }
                />
                <span>
                  I understand that openFoundry is an independent project, that model
                  use is governed by each model&apos;s license, and I accept the{" "}
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
                This is a local display name for the workspace. It never creates an
                account or leaves your computer.
              </p>
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Display name</span>
                  <input
                    className="input"
                    autoFocus
                    placeholder="Your name"
                    value={settings.displayName}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        displayName: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Initials</span>
                  <input
                    className="input"
                    maxLength={3}
                    placeholder="AB"
                    value={settings.initials}
                    onChange={(event) =>
                      setSettings((current) => ({
                        ...current,
                        initials: event.target.value.toUpperCase(),
                      }))
                    }
                  />
                </label>
              </div>
              <label className="field">
                <span className="field-label">Workspace name</span>
                <input
                  className="input"
                  value={settings.workspaceName}
                  onChange={(event) =>
                    setSettings((current) => ({
                      ...current,
                      workspaceName: event.target.value,
                    }))
                  }
                />
              </label>
              <div className="setup-path">
                <Settings20Regular />
                <span>
                  Local API key{" "}
                  <code>{settings.apiKey.slice(0, 14)}••••••••</code> is generated
                  automatically.
                </span>
              </div>
            </section>
          )}

          {step === 2 && (
            <section className="setup-step">
              <div className="setup-row">
                <div>
                  <div className="setup-kicker">Providers</div>
                  <h1>Connect a local runtime.</h1>
                  <p className="setup-lead">
                    openFoundry can talk to any OpenAI-compatible server. Enable the
                    runtimes you already have; you can change this later.
                  </p>
                </div>
                <button className="btn btn-secondary" onClick={scan} disabled={scanning}>
                  <Search20Regular /> {scanning ? "Scanning…" : "Scan again"}
                </button>
              </div>

              <div className="provider-setup-list">
                {settings.providers.map((provider) => {
                  const status = providers.find((item) => item.id === provider.id);
                  return (
                    <div className={`provider-setup-card${provider.enabled ? " enabled" : ""}`} key={provider.id}>
                      <label className="provider-toggle">
                        <input
                          type="checkbox"
                          checked={provider.enabled}
                          onChange={(event) =>
                            updateProvider(provider.id, { enabled: event.target.checked })
                          }
                        />
                        <span className="kb-icon">
                          <PlugConnected20Regular />
                        </span>
                        <span className="provider-setup-name">
                          <strong>{provider.label}</strong>
                          <small>
                            {provider.custom ? "Custom endpoint" : provider.kind === "ollama" ? "Ollama API" : "OpenAI-compatible"}
                          </small>
                        </span>
                      </label>
                      <div className="provider-status">
                        {status ? (
                          status.online ? (
                            <span className="status">
                              <span className="status-dot" />
                              {status.models.length} models
                            </span>
                          ) : (
                            <span className="status">
                              <span className="status-dot muted" />
                              Not running
                            </span>
                          )
                        ) : (
                          <span className="muted text-12">Not scanned</span>
                        )}
                      </div>
                      <input
                        className="input mono provider-url"
                        value={provider.baseUrl}
                        onChange={(event) =>
                          updateProvider(provider.id, { baseUrl: event.target.value })
                        }
                        aria-label={`${provider.label} URL`}
                      />
                      {provider.custom && (
                        <button
                          className="icon-button small"
                          aria-label={`Remove ${provider.label}`}
                          onClick={() => removeCustom(provider.id)}
                        >
                          <Dismiss20Regular />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <button className="btn btn-secondary" onClick={addCustom}>
                <Add20Regular /> Add OpenAI-compatible endpoint
              </button>

              {error && <div className="banner error">{error}</div>}
              <div className="banner">
                <Info20Regular />
                <span>
                  If you do not have Ollama installed, install it later or point
                  openFoundry at llama.cpp, LM Studio or any OpenAI-compatible server.
                  The app remains usable without a runtime; model features unlock when
                  one is available.
                </span>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="setup-step">
              <div className="setup-kicker">Models</div>
              <h1>Choose your first model.</h1>
              <p className="setup-lead">
                {available.length
                  ? "This list comes from the runtimes on this computer. Nothing is downloaded or deployed here."
                  : "No models were discovered. You can finish setup and add a runtime later."}
              </p>
              {available.length > 0 ? (
                <div className="setup-model-list">
                  {providers
                    .filter((provider) => provider.models.length > 0)
                    .map((provider) => (
                      <div key={provider.id}>
                        <div className="setup-provider-heading">
                          <strong>{provider.label}</strong>
                          <span className="badge gray">{provider.models.length} models</span>
                        </div>
                        {provider.models.map((model) => {
                          const active =
                            settings.defaultProvider === model.providerId &&
                            settings.defaultModel === model.id;
                          return (
                            <button
                              key={`${model.providerId}-${model.id}`}
                              className={`setup-model-row${active ? " active" : ""}`}
                              onClick={() => chooseModel(model.providerId, model.id)}
                            >
                              <ModelLogo publisher={model.publisher} name={model.name} size={28} />
                              <span>
                                <strong>{model.name}</strong>
                                <small>{model.publisher} · {provider.label}</small>
                              </span>
                              {active && <Checkmark20Regular />}
                            </button>
                          );
                        })}
                      </div>
                    ))}
                </div>
              ) : (
                <div className="setup-no-models">
                  <PlugConnected20Regular />
                  <strong>No model runtime detected</strong>
                  <p>
                    Start Ollama, LM Studio, llama.cpp or Foundry CLI, then come back
                    to Providers and scan again. You can also finish now.
                  </p>
                  <button
                    className="btn btn-secondary"
                    onClick={() => {
                      setStep(2);
                      setScanned(false);
                    }}
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
                openFoundry will open on the workspace dashboard. You can add more
                providers and models from Settings at any time.
              </p>
              <div className="setup-summary">
                <div>
                  <span>Workspace</span>
                  <strong>{settings.workspaceName}</strong>
                </div>
                <div>
                  <span>Profile</span>
                  <strong>{settings.displayName}</strong>
                </div>
                <div>
                  <span>Providers online</span>
                  <strong>{online.length}</strong>
                </div>
                <div>
                  <span>Models discovered</span>
                  <strong>{available.length}</strong>
                </div>
                <div>
                  <span>Default model</span>
                  <strong>{settings.defaultModel || "None selected"}</strong>
                </div>
              </div>
              <div className="banner">
                <Info20Regular />
                <span>
                  openFoundry is independent. Model weights, licenses and provider
                  terms remain the responsibility of their respective owners.
                </span>
              </div>
            </section>
          )}

          <footer className="setup-actions">
            {step > 0 ? (
              <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
                <ArrowLeft20Regular /> Back
              </button>
            ) : (
              <span />
            )}
            <div className="row" style={{ gap: 8 }}>
              {step === 2 && (
                <button
                  className="btn btn-ghost"
                  onClick={() => {
                    void scan();
                    setStep(3);
                  }}
                >
                  Skip for now
                </button>
              )}
              {step < STEPS.length - 1 ? (
                <button
                  className="btn btn-primary"
                  disabled={!canContinue()}
                  onClick={() => {
                    if (step === 2 && !scanned) void scan();
                    setStep(step + 1);
                  }}
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
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="openFoundry terms">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Terms of use</h2>
                <p className="dialog-sub">Summary · the repository contains the full text</p>
              </div>
              <button className="icon-button" onClick={() => setTermsOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body model-prose">
              <p>
                openFoundry is free software provided as-is, without warranty. You are
                responsible for the models you download, the licenses attached to them,
                and the data you process.
              </p>
              <p>
                Nothing is uploaded by default. If you connect a remote provider or use
                a web tool, data may leave your computer according to that provider&apos;s
                terms.
              </p>
              <p>
                openFoundry is an independent project. It is not affiliated with,
                endorsed by, or sponsored by any model provider.
              </p>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setTermsOpen(false)}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
