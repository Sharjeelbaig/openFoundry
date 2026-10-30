"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  ChevronDown20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Edit20Regular,
  Eye20Regular,
  EyeOff20Regular,
  Info20Regular,
  MoreHorizontal20Regular,
  Search20Regular,
  Server20Regular,
  Shield20Regular,
} from "@fluentui/react-icons";
import { formatDate, formatNumber, useApi, useDeployments, useModels } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { CopyButton, Spinner, StatusBadge } from "@/components/ui";
import type {
  Agent,
  KnowledgeBase,
  LocalSettings,
  ProjectRole,
  ProjectUser,
  ProviderStatus,
} from "@/lib/types";

type Tab = "Users" | "Connected resources" | "Admin-connected models";

function Field({
  label,
  value,
  mono,
  copy,
  info,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  copy?: string;
  info?: string;
}) {
  return (
    <div className="manage-field">
      <div className="manage-field-label">
        <span>{label}</span>
        {info && (
          <span title={info} className="info-dot">
            <Info20Regular />
          </span>
        )}
      </div>
      <div className={`manage-field-value${mono ? " mono" : ""}`}>
        <span className="truncate">{value}</span>
        {copy && (
          <CopyButton value={copy} label={`Copy ${label}`} className="icon-button small" />
        )}
      </div>
    </div>
  );
}

const EMPTY_USER = { name: "", email: "", role: "Contributor" as ProjectRole };

export default function ProjectDetailsPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: settingsData, refresh: refreshSettings } = useApi<{
    settings: LocalSettings;
  }>("/api/settings", 15000);
  const { data: systemData } = useApi<{
    stats: {
      hostname: string;
      platform: string;
      cpuModel: string;
      cpuCount: number;
      totalMem: number;
      freeMem: number;
      disk: { total: number; free: number };
      node: string;
      agents: number;
      deployments: number;
      knowledgeBases: number;
      traces: number;
    };
    providers: ProviderStatus[];
  }>("/api/system", 15000);
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const { data: knowledgeData } = useApi<{ knowledgeBases: KnowledgeBase[] }>(
    "/api/knowledge"
  );
  const { data: deploymentData } = useDeployments(10000);
  const { data: modelData } = useModels(30000);

  const settings = settingsData?.settings;
  const stats = systemData?.stats;
  const providers = systemData?.providers ?? [];
  const agents = agentData?.agents ?? [];
  const knowledgeBases = knowledgeData?.knowledgeBases ?? [];
  const deployments = deploymentData?.deployments ?? [];
  const models = modelData?.models ?? [];

  const [tab, setTab] = useState<Tab>("Users");
  const [query, setQuery] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [origin, setOrigin] = useState("http://localhost:3000");
  const [editOpen, setEditOpen] = useState(false);
  const [edit, setEdit] = useState<LocalSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [newUser, setNewUser] = useState(EMPTY_USER);
  const [userBusy, setUserBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (settings) setEdit(settings);
  }, [settings]);

  const projectName = settings?.projectName || "local-project";
  const endpoint = `${origin}/api/v1`;
  const users = settings?.users ?? [];
  const visibleUsers = users.filter(
    (user) =>
      !query ||
      user.name.toLowerCase().includes(query.toLowerCase()) ||
      user.email.toLowerCase().includes(query.toLowerCase()) ||
      user.role.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (key: string) =>
    setCollapsed((current) => ({ ...current, [key]: !current[key] }));

  const saveProject = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectName: edit.projectName,
          userName: edit.userName,
          userEmail: edit.userEmail,
          userInitials: edit.userInitials,
          resourceName: edit.resourceName,
          resourceGroup: edit.resourceGroup,
          location: edit.location,
          subscriptionName: edit.subscriptionName,
          foundryUrl: edit.foundryUrl,
          ollamaUrl: edit.ollamaUrl,
          lmStudioUrl: edit.lmStudioUrl,
          llamaCppUrl: edit.llamaCppUrl,
          huggingFacePath: edit.huggingFacePath,
        }),
      });
      const json = (await res.json()) as { settings?: LocalSettings; error?: string };
      if (!res.ok || !json.settings) throw new Error(json.error || "Could not save project");
      toast("Project settings saved", "success");
      setEditOpen(false);
      refreshSettings();
      router.refresh();
      window.dispatchEvent(new CustomEvent("foundry:settings-updated"));
    } catch (error) {
      toast(error instanceof Error ? error.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const rotateKey = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rotate-api-key" }),
      });
      if (!res.ok) throw new Error("Could not rotate the key");
      setRotateOpen(false);
      setShowKey(true);
      refreshSettings();
      toast("Project API key rotated. Existing clients must use the new key.", "success");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Rotate failed", "error");
    } finally {
      setSaving(false);
    }
  };

  const addUser = async () => {
    if (!newUser.name.trim() || !newUser.email.trim()) return;
    setUserBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(newUser),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not add the user");
      toast(`${newUser.name} added to the project`, "success");
      setUserOpen(false);
      setNewUser(EMPTY_USER);
      refreshSettings();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Add user failed", "error");
    } finally {
      setUserBusy(false);
    }
  };

  const changeRole = async (user: ProjectUser, role: ProjectRole) => {
    setUserBusy(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: user.id, role }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not change the role");
      toast(`${user.name} is now ${role}`, "success");
      refreshSettings();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Update failed", "error");
    } finally {
      setUserBusy(false);
    }
  };

  const removeUser = async (user: ProjectUser) => {
    setUserBusy(true);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(user.id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Could not remove the user");
      toast(`${user.name} removed from the project`, "success");
      refreshSettings();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Remove failed", "error");
    } finally {
      setUserBusy(false);
    }
  };

  if (!settings || !edit) {
    return (
      <div className="page row" style={{ gap: 8, color: "var(--fg-3)" }}>
        <Spinner /> Reading local project…
      </div>
    );
  }

  return (
    <div className="page manage-page" style={{ paddingTop: 18 }}>
      <div className="manage-project-head">
        <button className="icon-button" aria-label="Back" onClick={() => history.back()}>
          <ArrowLeft20Regular />
        </button>
        <h1 className="page-title">{projectName}</h1>
        <span className="badge gray">Local project</span>
        <span className="grow" />
        <button className="btn btn-sm btn-secondary" onClick={() => setEditOpen(true)}>
          <Edit20Regular /> Edit project
        </button>
        <div style={{ position: "relative" }}>
          <button
            className="icon-button"
            aria-label="Project actions"
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal20Regular />
          </button>
          {menuOpen && (
            <div className="menu-popover" style={{ right: 0, top: 36, minWidth: 240 }}>
              <button
                className="menu-item"
                onClick={() => {
                  setMenuOpen(false);
                  setEditOpen(true);
                }}
              >
                <Edit20Regular /> Edit project details
              </button>
              <Link href="/manage/resources" className="menu-item">
                <Server20Regular /> Resource details
              </Link>
              <Link href="/manage/quota" className="menu-item">
                <Info20Regular /> Quota and usage
              </Link>
              <Link href="/manage/gateway" className="menu-item">
                <Shield20Regular /> AI Gateway
              </Link>
            </div>
          )}
        </div>
      </div>

      <section className="manage-block">
        <button className="manage-block-head" onClick={() => toggle("details")}>
          <h2>Project details</h2>
          <ChevronDown20Regular
            style={{
              transform: collapsed.details ? "rotate(-90deg)" : undefined,
              transition: "transform 120ms",
            }}
          />
        </button>
        {!collapsed.details && (
          <div className="manage-section">
            <Field label="Name" value={projectName} />
            <Field label="Parent resource" value={settings.resourceName} />
            <Field
              label="Resource group"
              value={settings.resourceGroup}
              copy={settings.resourceGroup}
            />
            <Field label="Tenant ID" value={settings.tenantId} mono copy={settings.tenantId} />
            <Field
              label="Project endpoint"
              value={endpoint}
              copy={endpoint}
              info="OpenAI-compatible base URL served by this computer."
            />
            <Field label="Location" value={settings.location} />
            <Field label="Subscription" value={settings.subscriptionName} />
            <Field label="Project ID" value={settings.projectId} mono copy={settings.projectId} />
            <Field label="Created on" value={formatDate(settings.createdAt).split(",")[0]} />
            <Field label="Resource status" value={<StatusBadge status="Running" />} />
            <Field
              label="Local data center"
              value={stats?.hostname || "this computer"}
            />
            <Field
              label="Manage locally"
              value={
                <Link href="/manage/resources" className="link">
                  Open resource details
                </Link>
              }
            />
          </div>
        )}
        {!collapsed.details && (
          <div className="manage-key-row">
            <div className="field" style={{ maxWidth: 480 }}>
              <span className="field-label">Project API key</span>
              <span className="input-with-button">
                <input
                  className="input mono"
                  readOnly
                  value={showKey ? settings.apiKey : "••••••••••••••••••••••••••••••••"}
                />
                <button
                  className="icon-button"
                  aria-label={showKey ? "Hide key" : "Show key"}
                  onClick={() => setShowKey((value) => !value)}
                >
                  {showKey ? <EyeOff20Regular /> : <Eye20Regular />}
                </button>
                <CopyButton
                  value={settings.apiKey}
                  label="Copy API key"
                  className="icon-button"
                />
                <button
                  className="btn btn-sm btn-ghost"
                  onClick={() => setRotateOpen(true)}
                >
                  Rotate
                </button>
              </span>
            </div>
            <p className="muted text-12" style={{ maxWidth: 560 }}>
              This key authenticates the local <span className="mono">/api/v1</span>{" "}
              endpoints, including chat and embeddings. It is generated on this computer
              and can be rotated at any time.
            </p>
          </div>
        )}
      </section>

      <section className="manage-block">
        <button className="manage-block-head" onClick={() => toggle("permission")}>
          <h2>My permission</h2>
          <ChevronDown20Regular
            style={{
              transform: collapsed.permission ? "rotate(-90deg)" : undefined,
              transition: "transform 120ms",
            }}
          />
        </button>
        {!collapsed.permission && (
          <>
            <div className="permission-line">
              <span className="status-dot" />
              <strong>Owner</strong>
              <span className="muted">· Full access</span>
            </div>
            <div className="tabbar" style={{ marginTop: -2 }}>
              {(["Users", "Connected resources", "Admin-connected models"] as Tab[]).map(
                (item) => (
                  <button
                    key={item}
                    className={`tab${tab === item ? " active" : ""}`}
                    onClick={() => setTab(item)}
                  >
                    {item}
                  </button>
                )
              )}
            </div>

            <div className="manage-tab-body">
              {tab === "Users" && (
                <>
                  <div className="page-toolbar" style={{ paddingTop: 0 }}>
                    <div className="search-input" style={{ maxWidth: 360 }}>
                      <Search20Regular />
                      <input
                        className="input"
                        placeholder="Search users"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                      />
                    </div>
                    <span className="spacer" />
                    <button className="btn btn-secondary" onClick={() => setUserOpen(true)}>
                      <Add20Regular /> Add user
                    </button>
                  </div>
                  <div className="table-card">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th>Name</th>
                          <th style={{ width: 170 }}>Access type</th>
                          <th style={{ width: 150 }}>Role</th>
                          <th>Scope</th>
                          <th style={{ width: 170 }}>Added</th>
                          <th style={{ width: 70 }}>Remove</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleUsers.map((user) => (
                          <tr key={user.id}>
                            <td>
                              <span className="row" style={{ gap: 10 }}>
                                <span className="user-avatar">
                                  {user.name
                                    .split(/\s+/)
                                    .map((part) => part[0])
                                    .join("")
                                    .slice(0, 2)
                                    .toUpperCase()}
                                </span>
                                <span>
                                  <span className="cell-strong" style={{ display: "block" }}>
                                    {user.name}
                                  </span>
                                  <span className="muted text-12">{user.email}</span>
                                </span>
                              </span>
                            </td>
                            <td>
                              <span className="badge gray">{user.accessType}</span>
                            </td>
                            <td>
                              <select
                                className="select"
                                value={user.role}
                                disabled={
                                  userBusy ||
                                  (user.role === "Owner" &&
                                    users.filter((item) => item.role === "Owner").length === 1)
                                }
                                onChange={(event) =>
                                  changeRole(user, event.target.value as ProjectRole)
                                }
                                aria-label={`Role for ${user.name}`}
                                title={
                                  user.role === "Owner" &&
                                  users.filter((item) => item.role === "Owner").length === 1
                                    ? "Add another Owner before changing this role."
                                    : undefined
                                }
                              >
                                <option value="Owner">Owner</option>
                                <option value="Contributor">Contributor</option>
                                <option value="Reader">Reader</option>
                              </select>
                            </td>
                            <td className="mono text-12">
                              <span className="row" style={{ gap: 6 }}>
                                <span className="truncate" style={{ maxWidth: 420 }}>
                                  {settings.resourceGroup}/projects/{projectName}
                                </span>
                                <CopyButton
                                  value={`${settings.resourceGroup}/projects/${projectName}`}
                                  label="Copy scope"
                                  className="icon-button small"
                                />
                              </span>
                            </td>
                            <td>{formatDate(user.addedAt)}</td>
                            <td>
                              <button
                                className="icon-button small"
                                aria-label={`Remove ${user.name}`}
                                disabled={
                                  userBusy ||
                                  (user.role === "Owner" &&
                                    users.filter((item) => item.role === "Owner").length === 1)
                                }
                                title={
                                  user.role === "Owner" &&
                                  users.filter((item) => item.role === "Owner").length === 1
                                    ? "The project must keep at least one Owner."
                                    : undefined
                                }
                                onClick={() => removeUser(user)}
                              >
                                <Delete20Regular />
                              </button>
                            </td>
                          </tr>
                        ))}
                        {visibleUsers.length === 0 && (
                          <tr>
                            <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 36 }}>
                              No users match that search.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="table-footer">
                    <span>{users.length} project users</span>
                    <span className="muted">
                      Local access records · no sign-in provider is configured
                    </span>
                  </div>
                </>
              )}

              {tab === "Connected resources" && (
                <div className="table-card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Resource</th>
                        <th style={{ width: 150 }}>Type</th>
                        <th style={{ width: 210 }}>Endpoint</th>
                        <th style={{ width: 120 }}>Status</th>
                        <th style={{ width: 120 }}>Models</th>
                        <th style={{ width: 90 }}>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {providers.map((provider) => (
                        <tr key={provider.id}>
                          <td className="cell-strong">{provider.label}</td>
                          <td>Local runtime</td>
                          <td className="mono text-12 truncate" style={{ maxWidth: 210 }}>
                            {provider.url || "On device"}
                          </td>
                          <td>
                            <StatusBadge status={provider.online ? "Running" : "Stopped"} />
                          </td>
                          <td>{provider.modelCount}</td>
                          <td>
                            <Link href="/manage/resources" className="btn btn-sm btn-outline">
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {tab === "Admin-connected models" && (
                <div className="table-card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Model</th>
                        <th style={{ width: 180 }}>Publisher</th>
                        <th style={{ width: 130 }}>Task</th>
                        <th style={{ width: 160 }}>Runtime</th>
                        <th style={{ width: 130 }}>Availability</th>
                        <th style={{ width: 90 }}>Open</th>
                      </tr>
                    </thead>
                    <tbody>
                      {models.slice(0, 40).map((model) => (
                        <tr key={model.key}>
                          <td className="cell-strong truncate" style={{ maxWidth: 280 }}>
                            {model.displayName}
                          </td>
                          <td>{model.publisher}</td>
                          <td>{model.task}</td>
                          <td>{model.providerLabel}</td>
                          <td>{model.cached ? "Downloaded" : "Download"}</td>
                          <td>
                            <Link
                              href={`/discover/models/${encodeURIComponent(model.key)}`}
                              className="btn btn-sm btn-outline"
                            >
                              View
                            </Link>
                          </td>
                        </tr>
                      ))}
                      {models.length === 0 && (
                        <tr>
                          <td colSpan={6} className="muted" style={{ textAlign: "center", padding: 36 }}>
                            No models discovered yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </section>

      <section className="manage-block">
        <button className="manage-block-head" onClick={() => toggle("contents")}>
          <h2>Project contents</h2>
          <ChevronDown20Regular
            style={{
              transform: collapsed.contents ? "rotate(-90deg)" : undefined,
              transition: "transform 120ms",
            }}
          />
        </button>
        {!collapsed.contents && (
          <div className="manage-stat-grid">
            {[
              ["Agents", agents.length, "/build/agents"],
              ["Deployments", deployments.length, "/build/models/deployments"],
              ["Knowledge bases", knowledgeBases.length, "/build/knowledge/search"],
              ["Traces", formatNumber(stats?.traces || 0), "/operate"],
            ].map(([label, value, href]) => (
              <Link href={href as string} className="manage-stat" key={label as string}>
                <span className="metric-label">{label}</span>
                <span className="metric-value">{value}</span>
                <span className="muted text-12">Stored on this computer</span>
              </Link>
            ))}
          </div>
        )}
      </section>

      {editOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Edit project">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Edit project</h2>
                <p className="dialog-sub">
                  These values identify this computer as your private Foundry data center.
                </p>
              </div>
              <button className="icon-button" onClick={() => setEditOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Project name</span>
                  <input
                    className="input"
                    value={edit.projectName}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, projectName: event.target.value } : current
                      )
                    }
                  />
                  <span className="field-hint">Lowercase letters, numbers and hyphens.</span>
                </label>
                <label className="field">
                  <span className="field-label">Your name</span>
                  <input
                    className="input"
                    value={edit.userName}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, userName: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Email</span>
                  <input
                    className="input"
                    value={edit.userEmail}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, userEmail: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Initials</span>
                  <input
                    className="input"
                    maxLength={3}
                    value={edit.userInitials}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, userInitials: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Resource name</span>
                  <input
                    className="input"
                    value={edit.resourceName}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, resourceName: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Resource group</span>
                  <input
                    className="input"
                    value={edit.resourceGroup}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, resourceGroup: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Location</span>
                  <input
                    className="input"
                    value={edit.location}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, location: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Subscription display name</span>
                  <input
                    className="input"
                    value={edit.subscriptionName}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, subscriptionName: event.target.value } : current
                      )
                    }
                  />
                </label>
                <label className="field">
                  <span className="field-label">Foundry Local URL</span>
                  <input
                    className="input mono"
                    value={edit.foundryUrl}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, foundryUrl: event.target.value } : current
                      )
                    }
                  />
                  <span className="field-hint">Usually http://127.0.0.1:50414</span>
                </label>
                <label className="field">
                  <span className="field-label">Ollama URL</span>
                  <input
                    className="input mono"
                    value={edit.ollamaUrl}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, ollamaUrl: event.target.value } : current
                      )
                    }
                  />
                  <span className="field-hint">Usually http://127.0.0.1:11434</span>
                </label>
                <label className="field">
                  <span className="field-label">LM Studio URL</span>
                  <input
                    className="input mono"
                    value={edit.lmStudioUrl}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, lmStudioUrl: event.target.value } : current
                      )
                    }
                  />
                  <span className="field-hint">Usually http://127.0.0.1:1234</span>
                </label>
                <label className="field">
                  <span className="field-label">llama.cpp server URL</span>
                  <input
                    className="input mono"
                    value={edit.llamaCppUrl}
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, llamaCppUrl: event.target.value } : current
                      )
                    }
                  />
                  <span className="field-hint">Usually http://127.0.0.1:8080</span>
                </label>
                <label className="field">
                  <span className="field-label">Hugging Face cache path</span>
                  <input
                    className="input mono"
                    value={edit.huggingFacePath}
                    placeholder="~/.cache/huggingface/hub"
                    onChange={(event) =>
                      setEdit((current) =>
                        current ? { ...current, huggingFacePath: event.target.value } : current
                      )
                    }
                  />
                  <span className="field-hint">
                    Leave blank to use the default cache location.
                  </span>
                </label>
              </div>
              <div className="banner">
                <Server20Regular />
                <span>
                  Changing a runtime URL takes effect on the next model refresh. If the
                  runtime is unreachable, its models disappear from the catalog until it
                  comes back.
                </span>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setEditOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={saveProject} disabled={saving}>
                {saving ? <Spinner /> : null} Save project
              </button>
            </div>
          </div>
        </div>
      )}

      {rotateOpen && (
        <div className="dialog-backdrop">
          <div className="dialog" role="alertdialog" aria-modal="true" aria-label="Rotate API key">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Rotate the project API key?</h2>
                <p className="dialog-sub">
                  Any external client using the old key will receive 401 until it is
                  updated. UI sessions are unaffected.
                </p>
              </div>
              <button className="icon-button" onClick={() => setRotateOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setRotateOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={rotateKey} disabled={saving}>
                Rotate key
              </button>
            </div>
          </div>
        </div>
      )}

      {userOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setUserOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Add project user">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add user</h2>
                <p className="dialog-sub">
                  Records a project collaborator. This local build has no external
                  identity provider, so roles are informational.
                </p>
              </div>
              <button className="icon-button" onClick={() => setUserOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Name</span>
                <input
                  className="input"
                  autoFocus
                  value={newUser.name}
                  onChange={(event) =>
                    setNewUser((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Email</span>
                <input
                  className="input"
                  value={newUser.email}
                  onChange={(event) =>
                    setNewUser((current) => ({ ...current, email: event.target.value }))
                  }
                />
              </label>
              <label className="field">
                <span className="field-label">Role</span>
                <select
                  className="select"
                  value={newUser.role}
                  onChange={(event) =>
                    setNewUser((current) => ({
                      ...current,
                      role: event.target.value as ProjectRole,
                    }))
                  }
                >
                  <option value="Owner">Owner</option>
                  <option value="Contributor">Contributor</option>
                  <option value="Reader">Reader</option>
                </select>
              </label>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setUserOpen(false)}>
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={addUser}
                disabled={userBusy || !newUser.name.trim() || !newUser.email.trim()}
              >
                {userBusy ? <Spinner /> : <Add20Regular />} Add user
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
