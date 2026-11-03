"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  ArrowSync20Regular,
  CheckmarkCircle20Regular,
  ChevronDown20Regular,
  Copy20Regular,
  Delete20Regular,
  Dismiss20Regular,
  Key20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import Select from "@/components/Select";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { formatDate, useApi } from "@/lib/client";
import { ROLES, ROLE_ORDER, actionsByResource, roleById } from "@/lib/directory/roles";

interface AssignmentRow {
  id: string;
  principalId: string;
  name: string;
  email: string;
  initials: string;
  roleId: string;
  roleName: string;
  scope: string;
  accessType: "Direct access" | "Inherited access";
  createdAt: string;
}

interface Payload {
  assignments: AssignmentRow[];
  me: { roleName: string; access: string; canManage: boolean };
  scopeLabels: { root: string; project: string };
  scopes: { root: string; project: string };
}

interface PrincipalRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: { roleId: string; roleName: string; scope: string }[];
  credential: {
    state: "active" | "never_used" | "none" | "revoked";
    lastUsedAt?: string;
    createdAt?: string;
  };
}

type Tab = "Role assignments" | "Roles" | "Access codes";

export default function AccessControlPage() {
  const { toast } = useToast();
  const { data, refresh, loading } = useApi<Payload>("/api/directory/assignments", 20000);
  const { data: peopleData, refresh: refreshPeople } = useApi<{
    principals: PrincipalRow[];
  }>("/api/directory/principals", 20000);
  const [tab, setTab] = useState<Tab>("Role assignments");
  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [scopeFilter, setScopeFilter] = useState("all");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState<{ name: string; code: string } | null>(null);

  const rows = useMemo(() => data?.assignments ?? [], [data?.assignments]);
  const people = useMemo(() => peopleData?.principals ?? [], [peopleData?.principals]);
  const canManage = data?.me?.canManage ?? false;
  const scopeText = (scope: string) =>
    scope === (data?.scopes.root ?? "/")
      ? data?.scopeLabels.root ?? "Install"
      : `${data?.scopeLabels.root ?? "Install"}/projects/${
          data?.scopeLabels.project || "project"
        }`;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (roleFilter !== "all" && row.roleId !== roleFilter) return false;
      if (scopeFilter === "root" && row.scope !== "/") return false;
      if (scopeFilter === "project" && row.scope === "/") return false;
      if (!needle) return true;
      return (
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        row.roleName.toLowerCase().includes(needle)
      );
    });
  }, [rows, query, roleFilter, scopeFilter]);

  const grouped = useMemo(() => {
    return ROLE_ORDER.map((roleId) => ({
      roleId,
      roleName: roleById(roleId)?.name ?? roleId,
      rows: filtered.filter((row) => row.roleId === roleId),
    })).filter((group) => group.rows.length > 0);
  }, [filtered]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const removeSelected = async () => {
    if (selected.size === 0) return;
    setBusy(true);
    let removed = 0;
    try {
      for (const id of selected) {
        const response = await fetch(
          `/api/directory/assignments?id=${encodeURIComponent(id)}`,
          { method: "DELETE" }
        );
        if (response.ok) removed += 1;
        else {
          const payload = (await response.json().catch(() => ({}))) as { error?: string };
          throw new Error(payload.error || "Could not remove this assignment.");
        }
      }
      toast(`${removed} role assignment${removed === 1 ? "" : "s"} removed`, "success");
      setSelected(new Set());
      refresh();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Remove failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const issueCode = async (person: PrincipalRow) => {
    setBusy(true);
    try {
      const response = await fetch("/api/directory/credentials", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ principalId: person.id }),
      });
      const payload = (await response.json()) as { accessCode?: string; error?: string };
      if (!response.ok || !payload.accessCode) {
        throw new Error(payload.error || "Could not issue a code.");
      }
      setIssued({ name: person.name, code: payload.accessCode });
      refreshPeople();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Issue failed", "error");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (person: PrincipalRow) => {
    setBusy(true);
    try {
      const response = await fetch(
        `/api/directory/credentials?principalId=${encodeURIComponent(person.id)}`,
        { method: "DELETE" }
      );
      if (!response.ok) throw new Error("Could not revoke access.");
      toast(`Access revoked for ${person.name}`, "success");
      refreshPeople();
    } catch (error) {
      toast(error instanceof Error ? error.message : "Revoke failed", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="page row" style={{ gap: 8, color: "var(--fg-3)" }}>
        <Spinner /> Reading the directory…
      </div>
    );
  }

  return (
    <div className="page manage-page" style={{ paddingTop: 18 }}>
      <div className="muted text-12" style={{ marginBottom: 10 }}>
        Manage / Access control (IAM)
      </div>
      <div className="page-header" style={{ marginBottom: 10 }}>
        <h1 className="page-title">
          {data?.scopeLabels.root ?? "This install"} | Access control (IAM)
        </h1>
      </div>

      <div className="page-toolbar" style={{ paddingTop: 0 }}>
        <span className="muted text-12">
          {data?.me?.roleName} · {data?.me?.access}
        </span>
        <span className="spacer" />
        <button
          className="btn btn-secondary"
          onClick={() => {
            refresh();
            refreshPeople();
          }}
        >
          <ArrowSync20Regular /> Refresh
        </button>
        <button
          className="btn btn-secondary"
          disabled={selected.size === 0 || busy || !canManage}
          onClick={removeSelected}
        >
          <Delete20Regular /> Delete
        </button>
        {canManage ? (
          <Link className="btn btn-primary" href="/manage/access/assign">
            <Add20Regular /> Add role assignment
          </Link>
        ) : (
          <button className="btn btn-secondary" disabled title="You cannot change access.">
            <Add20Regular /> Add role assignment
          </button>
        )}
      </div>

      <div className="tabbar" style={{ marginTop: 8 }}>
        {(["Role assignments", "Roles", "Access codes"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
            {item === "Role assignments" ? ` (${rows.length})` : ""}
            {item === "Access codes" ? ` (${people.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "Role assignments" && (
        <>
          <div className="page-toolbar" style={{ paddingTop: 12 }}>
            <div className="search-input" style={{ maxWidth: 320 }}>
              <Search20Regular />
              <input
                className="input"
                placeholder="Search by name or email"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </div>
            <Select
              className="select"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">Role: All</option>
              {ROLES.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </Select>
            <Select
              className="select"
              value={scopeFilter}
              onChange={(event) => setScopeFilter(event.target.value)}
              aria-label="Filter by scope"
            >
              <option value="all">Scope: All</option>
              <option value="root">Install</option>
              <option value="project">Project</option>
            </Select>
          </div>

          {grouped.length === 0 ? (
            <div className="table-card" style={{ padding: 36, textAlign: "center" }}>
              <p className="muted" style={{ marginBottom: 12 }}>
                {rows.length === 0
                  ? "No role assignments. Add role assignment to grant access."
                  : "Nothing matches those filters."}
              </p>
            </div>
          ) : (
            grouped.map((group) => {
              const collapsedGroup = collapsed.has(group.roleId);
              return (
                <div key={group.roleId} className="table-card" style={{ marginBottom: 12 }}>
                  <button
                    className="row"
                    style={{
                      gap: 8,
                      width: "100%",
                      padding: "10px 16px",
                      border: 0,
                      background: "transparent",
                      color: "var(--fg-1)",
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setCollapsed((current) => {
                        const next = new Set(current);
                        if (next.has(group.roleId)) next.delete(group.roleId);
                        else next.add(group.roleId);
                        return next;
                      })
                    }
                  >
                    <ChevronDown20Regular
                      style={{
                        transform: collapsedGroup ? "rotate(-90deg)" : undefined,
                        transition: "transform 120ms",
                      }}
                    />
                    <strong>
                      {group.roleName} ({group.rows.length})
                    </strong>
                  </button>
                  {!collapsedGroup && (
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ width: 36 }} aria-label="Select" />
                          <th>Name</th>
                          <th>Role</th>
                          <th>Scope</th>
                          <th>Added</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((row) => (
                          <tr key={row.id}>
                            <td>
                              <input
                                type="checkbox"
                                checked={selected.has(row.id)}
                                onChange={() => toggle(row.id)}
                                aria-label={`Select ${row.name}`}
                              />
                            </td>
                            <td>
                              <span className="row" style={{ gap: 10 }}>
                                <span className="user-avatar">{row.initials}</span>
                                <span>
                                  <span className="cell-strong" style={{ display: "block" }}>
                                    {row.name}
                                  </span>
                                  <span className="muted text-12">{row.email}</span>
                                </span>
                              </span>
                            </td>
                            <td>{row.roleName}</td>
                            <td>
                              {scopeText(row.scope)}
                              {row.accessType === "Inherited access" && (
                                <span className="muted"> (Inherited)</span>
                              )}
                            </td>
                            <td>{formatDate(row.createdAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })
          )}
          <div className="table-footer">
            <span>
              Showing 1 - {filtered.length} of {filtered.length} results.
            </span>
            <span className="row" style={{ gap: 6 }}>
              <button className="btn btn-secondary btn-sm" disabled>
                <ArrowLeft20Regular /> Prev
              </button>
              <button className="btn btn-secondary btn-sm" disabled>
                Next <ArrowRight20Regular />
              </button>
            </span>
          </div>
        </>
      )}

      {tab === "Roles" && (
        <div style={{ marginTop: 12 }}>
          {ROLES.map((role) => (
            <div key={role.id} className="table-card" style={{ padding: 16, marginBottom: 12 }}>
              <div className="row" style={{ gap: 10, marginBottom: 6 }}>
                <strong>{role.name}</strong>
                <span className="badge gray">Built-in</span>
                <span className="spacer" />
                <span className="muted text-12">
                  {actionsByResource(role.actions).reduce(
                    (total, entry) => total + entry.actions.length,
                    0
                  )}{" "}
                  permissions
                </span>
              </div>
              <p className="muted text-12" style={{ marginBottom: 10 }}>
                {role.description}
              </p>
              <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                {actionsByResource(role.actions).map((entry) => (
                  <span key={entry.resource} className="badge gray">
                    {entry.resource}: {entry.actions.join(", ")}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "Access codes" && (
        <>
          <div className="table-card" style={{ marginTop: 12 }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Code</th>
                  <th>Last used</th>
                  <th style={{ width: 190 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {people.map((person) => (
                  <tr key={person.id}>
                    <td>
                      <span className="row" style={{ gap: 10 }}>
                        <span className="user-avatar">{person.initials}</span>
                        <span>
                          <span className="cell-strong" style={{ display: "block" }}>
                            {person.name}
                          </span>
                          <span className="muted text-12">{person.email}</span>
                        </span>
                      </span>
                    </td>
                    <td>
                      {person.credential.state === "active" ? (
                        <span className="row" style={{ gap: 6 }}>
                          <CheckmarkCircle20Regular style={{ color: "var(--success)" }} />
                          Active
                        </span>
                      ) : person.credential.state === "never_used" ? (
                        "Issued, never used"
                      ) : person.credential.state === "revoked" ? (
                        "Revoked"
                      ) : (
                        <span className="muted">None</span>
                      )}
                    </td>
                    <td className="muted">
                      {person.credential.lastUsedAt
                        ? formatDate(person.credential.lastUsedAt)
                        : "Never"}
                    </td>
                    <td>
                      <span className="row" style={{ gap: 6 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busy || !canManage}
                          onClick={() => issueCode(person)}
                        >
                          <Key20Regular /> Issue code
                        </button>
                        <button
                          className="btn btn-secondary btn-sm"
                          disabled={busy || !canManage}
                          onClick={() => revoke(person)}
                        >
                          Revoke
                        </button>
                      </span>
                    </td>
                  </tr>
                ))}
                {people.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 36 }}>
                      No people yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="table-footer">
            <span>{people.length} people</span>
            <span className="muted">
              A code is shown once. Issuing a new one revokes the old one.
            </span>
          </div>
        </>
      )}

      {issued && (
        <div className="dialog-backdrop">
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Access code">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Access code</h2>
                <p className="dialog-sub">
                  For {issued.name}. It replaces any previous code and is shown once.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setIssued(null)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="row" style={{ gap: 8 }}>
                <span className="mono" style={{ fontSize: 18, letterSpacing: "0.08em" }}>
                  {issued.code}
                </span>
                <span className="spacer" />
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(issued.code);
                    toast("Access code copied", "success");
                  }}
                >
                  <Copy20Regular /> Copy
                </button>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setIssued(null)}>
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
