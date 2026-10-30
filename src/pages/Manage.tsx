import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  Add20Regular,
  ArrowClockwise20Regular,
  Checkmark20Regular,
  Dismiss20Regular,
  Folder20Regular,
  Info20Regular,
  Server20Regular,
  Settings20Regular,
} from "@fluentui/react-icons";
import { CopyButton, Spinner } from "../components/ui";
import { useApp } from "../lib/app-context";
import { appVersion, dataDirectory, saveSettings } from "../lib/api";
import { initials } from "../lib/format";
import { openFolder } from "../lib/open";
import { useProviders } from "../lib/useProviders";
import type { Settings } from "../lib/types";

export default function Manage({ section = "workspace" }: { section?: string }) {
  const { data, updateSettings } = useApp();
  const { providers, refresh } = useProviders(data.settings);
  const [draft, setDraft] = useState<Settings>(data.settings);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [version, setVersion] = useState("");
  const [path, setPath] = useState("");

  useEffect(() => {
    void appVersion().then(setVersion);
    void dataDirectory().then(setPath);
  }, []);

  useEffect(() => setDraft(data.settings), [data.settings]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    try {
      const next = await saveSettings({
        ...draft,
        initials: draft.initials || initials(draft.displayName),
      });
      updateSettings({ ...data, settings: next });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    } finally {
      setSaving(false);
    }
  };

  const addProvider = () => {
    setDraft((current) => ({
      ...current,
      providers: [
        ...current.providers,
        {
          id: `custom-${crypto.randomUUID().slice(0, 8)}`,
          label: "Custom endpoint",
          kind: "openai",
          baseUrl: "http://127.0.0.1:8000",
          enabled: true,
          custom: true,
        },
      ],
    }));
  };

  const updateProvider = (id: string, patch: Partial<Settings["providers"][number]>) => {
    setDraft((current) => ({
      ...current,
      providers: current.providers.map((provider) =>
        provider.id === id ? { ...provider, ...patch } : provider
      ),
    }));
  };

  const removeProvider = (id: string) => {
    setDraft((current) => ({
      ...current,
      providers: current.providers.filter((provider) => provider.id !== id),
    }));
  };

  const resetSetup = async () => {
    const next = await saveSettings({
      ...data.settings,
      onboarded: false,
      termsAccepted: false,
    });
    updateSettings({ ...data, settings: next });
  };

  const models = providers.flatMap((provider) => provider.models);

  if (section === "quota") {
    return (
      <div className="page" style={{ paddingTop: 18 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Quota</h1>
            <p className="page-subtitle">Local capacity is limited by your hardware and providers.</p>
          </div>
        </div>
        <div className="metric-grid mt-16">
          <div className="operate-card">
            <span className="metric-label">Providers</span>
            <span className="metric-value">{providers.length}</span>
            <span className="metric-note">{providers.filter((p) => p.online).length} online</span>
          </div>
          <div className="operate-card">
            <span className="metric-label">Models</span>
            <span className="metric-value">{models.length}</span>
            <span className="metric-note">discovered</span>
          </div>
          <div className="operate-card">
            <span className="metric-label">Agents</span>
            <span className="metric-value">{data.agents.length}</span>
            <span className="metric-note">local records</span>
          </div>
          <div className="operate-card">
            <span className="metric-label">Cloud quota</span>
            <span className="metric-value" style={{ fontSize: 20 }}>None</span>
            <span className="metric-note">No cloud resources are provisioned</span>
          </div>
        </div>
        <div className="banner mt-16">
          <Info20Regular />
          <span>
            There is no token quota or subscription here. Model limits are enforced by
            the provider running on this computer.
          </span>
        </div>
      </div>
    );
  }

  if (section === "resources") {
    return (
      <div className="page" style={{ paddingTop: 18 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">Resource details</h1>
            <p className="page-subtitle">The local machine and storage backing this workspace.</p>
          </div>
        </div>
        <div className="operate-card mt-16">
          <div className="row" style={{ gap: 14 }}>
            <span className="resource-icon"><Server20Regular /></span>
            <div>
              <h2>{data.settings.workspaceName}</h2>
              <p className="muted text-13">openFoundry {version || ""}</p>
            </div>
          </div>
          <div className="manage-section mt-16">
            <div>
              <div className="manage-field-label">Data directory</div>
              <div className="manage-field-value mono truncate">{path || "Loading…"}</div>
            </div>
            <div>
              <div className="manage-field-label">API key</div>
              <div className="manage-field-value mono">
                {data.settings.apiKey.slice(0, 16)}…
              </div>
            </div>
            <div>
              <div className="manage-field-label">Providers</div>
              <div className="manage-field-value">{providers.length}</div>
            </div>
            <div>
              <div className="manage-field-label">Models</div>
              <div className="manage-field-value">{models.length}</div>
            </div>
          </div>
          <div className="row mt-12" style={{ gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => void openFolder(path)} disabled={!path}>
              <Folder20Regular /> Open data folder
            </button>
            <Link to="/manage" className="btn btn-secondary">Workspace settings</Link>
          </div>
        </div>
      </div>
    );
  }

  if (section === "gateway") {
    return (
      <div className="page" style={{ paddingTop: 18 }}>
        <div className="page-header">
          <div>
            <h1 className="page-title">AI Gateway</h1>
            <p className="page-subtitle">Connect openFoundry to OpenAI-compatible providers.</p>
          </div>
        </div>
        <div className="operate-card mt-16">
          <h3>Configured endpoints</h3>
          <p className="muted text-13" style={{ maxWidth: 700 }}>
            openFoundry currently calls provider endpoints directly. A local forwarding
            gateway with API keys, request limits and caching will be exposed here in a
            future update.
          </p>
          <div className="table-card mt-12">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Endpoint</th>
                  <th style={{ width: 120 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {providers.map((provider) => (
                  <tr key={provider.id}>
                    <td className="cell-strong">{provider.label}</td>
                    <td className="mono text-12">{provider.baseUrl}</td>
                    <td>
                      <span className="status">
                        <span className={`status-dot${provider.online ? "" : " muted"}`} />
                        {provider.online ? "Online" : "Offline"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Workspace details</h1>
          <p className="page-subtitle">Identity, providers and local credentials.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => void refresh()}>
            <ArrowClockwise20Regular /> Scan providers
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : saved ? <Checkmark20Regular /> : <Settings20Regular />}
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      <section className="manage-block">
        <div className="manage-block-head"><h2>Workspace</h2></div>
        <div className="manage-section">
          <label className="field">
            <span className="field-label">Workspace name</span>
            <input
              className="input"
              value={draft.workspaceName}
              onChange={(event) => setDraft({ ...draft, workspaceName: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Display name</span>
            <input
              className="input"
              value={draft.displayName}
              onChange={(event) => setDraft({ ...draft, displayName: event.target.value })}
            />
          </label>
          <label className="field">
            <span className="field-label">Initials</span>
            <input
              className="input"
              maxLength={3}
              value={draft.initials}
              onChange={(event) => setDraft({ ...draft, initials: event.target.value.toUpperCase() })}
            />
          </label>
          <div>
            <div className="manage-field-label">Created</div>
            <div className="manage-field-value">{new Date(draft.createdAt).toLocaleDateString()}</div>
          </div>
        </div>
      </section>

      <section className="manage-block">
        <div className="manage-block-head">
          <h2>Local API key</h2>
        </div>
        <div className="manage-key-row">
          <div className="field" style={{ maxWidth: 500 }}>
            <span className="field-label">Workspace key</span>
            <span className="input-with-button">
              <input className="input mono" readOnly value={draft.apiKey} />
              <CopyButton value={draft.apiKey} label="Copy workspace API key" />
            </span>
          </div>
          <p className="muted text-12" style={{ maxWidth: 520 }}>
            Reserved for the local API server. It is generated on this computer and can
            be rotated by editing the workspace file.
          </p>
        </div>
      </section>

      <section className="manage-block">
        <div className="manage-block-head">
          <h2>Providers</h2>
          <button className="btn btn-sm btn-secondary" onClick={addProvider}>
            <Add20Regular /> Add endpoint
          </button>
        </div>
        <div className="provider-settings-list">
          {draft.providers.map((provider) => {
            const status = providers.find((entry) => entry.id === provider.id);
            return (
              <div className="provider-settings-row" key={provider.id}>
                <label className="provider-toggle">
                  <input
                    type="checkbox"
                    checked={provider.enabled}
                    onChange={(event) => updateProvider(provider.id, { enabled: event.target.checked })}
                  />
                  <span>
                    <strong>{provider.label}</strong>
                    <small>{status?.online ? `${status.models.length} models` : "Not running"}</small>
                  </span>
                </label>
                <input
                  className="input mono"
                  value={provider.baseUrl}
                  onChange={(event) => updateProvider(provider.id, { baseUrl: event.target.value })}
                />
                <span className="status">
                  <span className={`status-dot${status?.online ? "" : " muted"}`} />
                  {status?.online ? "Online" : "Offline"}
                </span>
                {provider.custom ? (
                  <button className="icon-button small" aria-label="Remove provider" onClick={() => removeProvider(provider.id)}>
                    <Dismiss20Regular />
                  </button>
                ) : (
                  <span />
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="manage-block">
        <div className="manage-block-head"><h2>Security and privacy</h2></div>
        <div className="manage-section">
          <div>
            <div className="manage-field-label">Telemetry</div>
            <div className="manage-field-value">Off</div>
          </div>
          <div>
            <div className="manage-field-label">Cloud services</div>
            <div className="manage-field-value">Only endpoints you configure</div>
          </div>
          <div>
            <div className="manage-field-label">Terms</div>
            <div className="manage-field-value"><Link to="/terms" className="link">Read terms</Link></div>
          </div>
          <div>
            <div className="manage-field-label">Privacy</div>
            <div className="manage-field-value"><Link to="/privacy" className="link">Privacy policy</Link></div>
          </div>
        </div>
      </section>

      <section className="manage-block">
        <div className="manage-block-head"><h2>Advanced</h2></div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={resetSetup}>
            <Settings20Regular /> Re-run setup
          </button>
          <button className="btn btn-secondary" onClick={() => void openFolder(path)}>
            <Folder20Regular /> Open data folder
          </button>
        </div>
      </section>
    </div>
  );
}
