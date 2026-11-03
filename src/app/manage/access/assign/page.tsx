"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight20Regular,
  Dismiss20Regular,
  Info20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import { useApi } from "@/lib/client";
import { ROLES, actionsByResource, roleById } from "@/lib/directory/roles";

interface PrincipalRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: { roleId: string; roleName: string; scope: string }[];
}

const STEPS = ["Role", "Members", "Conditions", "Review + assign"] as const;

export default function AssignRolePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data: peopleData } = useApi<{ principals: PrincipalRow[] }>(
    "/api/directory/principals"
  );
  const { data: payload } = useApi<{
    scopeLabels: { root: string; project: string };
  }>("/api/directory/assignments");

  const [step, setStep] = useState<0 | 1 | 3>(0);
  const [roleId, setRoleId] = useState("");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [description, setDescription] = useState("");
  const [paneOpen, setPaneOpen] = useState(false);
  const [detailsRole, setDetailsRole] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const principals = peopleData?.principals ?? [];
  const role = roleId ? roleById(roleId) : undefined;
  const members = useMemo(
    () => principals.filter((person) => memberIds.includes(person.id)),
    [principals, memberIds]
  );

  useEffect(() => {
    if (!paneOpen) setQuery("");
  }, [paneOpen]);

  const filteredPeople = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return principals;
    return principals.filter(
      (person) =>
        person.name.toLowerCase().includes(needle) ||
        person.email.toLowerCase().includes(needle)
    );
  }, [principals, query]);

  const submit = async () => {
    if (!roleId || memberIds.length === 0 || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/directory/assignments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roleId,
          scope: "project",
          principalIds: memberIds,
          description,
        }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        assignments?: unknown[];
        error?: string;
      };
      if (!response.ok) throw new Error(body.error || "Could not assign the role.");
      const count = body.assignments?.length ?? 0;
      toast(
        count === 0
          ? "Those members already had this role."
          : `${role?.name} assigned to ${count} ${count === 1 ? "member" : "members"}`,
        "success"
      );
      router.push("/manage/access");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="iam-wizard">
      <div className="iam-wizard-head">
        <div>
          <div className="muted text-12" style={{ marginBottom: 6 }}>
            <Link href="/manage/access">Access control (IAM)</Link> / Add role assignment
          </div>
          <h1 className="page-title">Add role assignment</h1>
        </div>
        <button
          className="icon-button"
          aria-label="Close"
          onClick={() => router.push("/manage/access")}
        >
          <Dismiss20Regular />
        </button>
      </div>

      <div className="iam-steps" role="tablist">
        {STEPS.map((label, index) => {
          const disabled = label === "Conditions";
          const active = !disabled && index === step;
          return (
            <button
              key={label}
              role="tab"
              aria-selected={active}
              aria-disabled={disabled}
              className={`iam-step${active ? " active" : ""}${disabled ? " disabled" : ""}`}
              onClick={() => {
                if (disabled) return;
                if (index === 0) setStep(0);
                if (index === 1 && roleId) setStep(1);
                if (index === 3 && roleId && memberIds.length > 0) setStep(3);
              }}
            >
              {label}
              <span className="iam-required">*</span>
            </button>
          );
        })}
      </div>

      <div className="iam-body">
        {step === 0 && (
          <>
            <p className="muted text-13" style={{ marginBottom: 16 }}>
              A role definition is a collection of permissions. These are the built-in
              roles for this install.
            </p>
            <div className="table-card">
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 40 }} aria-label="Select" />
                    <th>Name</th>
                    <th>Description</th>
                    <th style={{ width: 120 }}>Type</th>
                    <th style={{ width: 90 }}>Details</th>
                  </tr>
                </thead>
                <tbody>
                  {ROLES.map((item) => (
                    <tr
                      key={item.id}
                      onClick={() => setRoleId(item.id)}
                      style={{ cursor: "pointer" }}
                    >
                      <td>
                        <input
                          type="radio"
                          name="role"
                          checked={roleId === item.id}
                          onChange={() => setRoleId(item.id)}
                          aria-label={item.name}
                        />
                      </td>
                      <td className="cell-strong">{item.name}</td>
                      <td className="muted">{item.description}</td>
                      <td>
                        <span className="badge gray">BuiltInRole</span>
                      </td>
                      <td>
                        <button
                          className="link"
                          onClick={(event) => {
                            event.stopPropagation();
                            setDetailsRole(item.id);
                          }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        {step === 1 && (
          <div className="iam-form">
            <div className="iam-field">
              <span className="iam-label">Selected role</span>
              <span className="cell-strong">{role?.name}</span>
            </div>
            <div className="iam-field">
              <span className="iam-label">Assign access to</span>
              <span>
                <label className="row" style={{ gap: 8, marginBottom: 8 }}>
                  <input type="radio" checked readOnly /> User, group, or service principal
                </label>
                <label className="row" style={{ gap: 8, color: "var(--fg-disabled)" }}>
                  <input type="radio" disabled /> Managed identity
                </label>
                <span className="muted text-12" style={{ display: "block", marginTop: 4 }}>
                  Managed identities are not available in a local install.
                </span>
              </span>
            </div>
            <div className="iam-field">
              <span className="iam-label">Members</span>
              <span>
                <button className="link" onClick={() => setPaneOpen(true)}>
                  + Select members
                </button>
                <div className="table-card" style={{ marginTop: 8 }}>
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Object ID</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.length === 0 && (
                        <tr>
                          <td colSpan={3} className="muted">
                            No members selected
                          </td>
                        </tr>
                      )}
                      {members.map((person) => (
                        <tr key={person.id}>
                          <td>{person.name}</td>
                          <td className="mono text-12">{person.id}</td>
                          <td>User</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </span>
            </div>
            <div className="iam-field">
              <span className="iam-label">Description</span>
              <textarea
                className="input"
                placeholder="Optional"
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="iam-form">
            <div className="iam-field">
              <span className="iam-label">Role</span>
              <span>{role?.name}</span>
            </div>
            <div className="iam-field">
              <span className="iam-label">Scope</span>
              <span className="mono text-12">
                {(payload?.scopeLabels?.root ?? "Install") +
                  "/projects/" +
                  (payload?.scopeLabels?.project ?? "project")}
              </span>
            </div>
            <div className="iam-field">
              <span className="iam-label">Members</span>
              <span>
                <div className="table-card">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Name</th>
                        <th>Object ID</th>
                        <th>Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {members.map((person) => (
                        <tr key={person.id}>
                          <td>{person.name}</td>
                          <td className="mono text-12">{person.id}</td>
                          <td>User</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </span>
            </div>
            <div className="iam-field">
              <span className="iam-label">Description</span>
              <span>{description.trim() || <span className="muted">No description</span>}</span>
            </div>
            {error && (
              <p className="text-12" style={{ color: "var(--danger)" }}>
                {error}
              </p>
            )}
          </div>
        )}
      </div>

      <div className="iam-footer">
        <button
          className="btn btn-primary"
          disabled={busy || step === 0 || !roleId || memberIds.length === 0}
          onClick={step === 3 ? submit : () => setStep(3)}
        >
          {busy ? <Spinner /> : null} Review + assign
        </button>
        <button
          className="btn btn-secondary"
          disabled={step === 0}
          onClick={() => setStep(step === 3 ? 1 : 0)}
        >
          Previous
        </button>
        <button
          className="btn btn-secondary"
          disabled={step === 3 || (step === 0 && !roleId) || (step === 1 && memberIds.length === 0)}
          onClick={() => setStep(step === 0 ? 1 : 3)}
        >
          Next
        </button>
      </div>

      {detailsRole && (
        <div className="dialog-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setDetailsRole("");
        }}>
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Role details">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">{roleById(detailsRole)?.name}</h2>
                <p className="dialog-sub">{roleById(detailsRole)?.description}</p>
              </div>
              <button
                className="icon-button"
                onClick={() => setDetailsRole("")}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              {actionsByResource(roleById(detailsRole)?.actions ?? []).map((entry) => (
                <div key={entry.resource} style={{ marginBottom: 8 }}>
                  <span className="field-label">{entry.resource}</span>
                  <div className="row" style={{ flexWrap: "wrap", gap: 6 }}>
                    {entry.actions.map((action) => (
                      <span key={action} className="badge gray mono">
                        {action}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-primary" onClick={() => setDetailsRole("")}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {paneOpen && (
        <div className="side-pane-backdrop" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setPaneOpen(false);
        }}>
          <aside className="side-pane" aria-label="Select members">
            <div className="side-pane-head">
              <h2>Select members</h2>
              <button
                className="icon-button"
                onClick={() => setPaneOpen(false)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="side-pane-body">
              <div className="side-pane-left">
                <div className="search-input" style={{ marginBottom: 10 }}>
                  <Search20Regular />
                  <input
                    className="input"
                    autoFocus
                    placeholder="Search by name or email address"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                  />
                </div>
                <div className="side-pane-list">
                  {filteredPeople.map((person) => {
                    const picked = memberIds.includes(person.id);
                    return (
                      <button
                        key={person.id}
                        className={`picker-item${picked ? " picked" : ""}`}
                        onClick={() =>
                          setMemberIds((current) =>
                            picked
                              ? current.filter((id) => id !== person.id)
                              : [...current, person.id]
                          )
                        }
                      >
                        <span className="user-avatar small">{person.initials}</span>
                        <span style={{ flex: 1 }}>
                          <span style={{ display: "block" }}>{person.name}</span>
                          <span className="muted text-12">{person.email}</span>
                        </span>
                        {picked && <span className="badge gray">Selected</span>}
                      </button>
                    );
                  })}
                  {filteredPeople.length === 0 && (
                    <p className="muted text-12">No people match that search.</p>
                  )}
                </div>
              </div>
              <div className="side-pane-selected">
                <span className="field-label">Selected members:</span>
                {members.length === 0 ? (
                  <p className="muted text-12">
                    No members selected. Search for and add one or more members you want to
                    assign to the role for this resource.
                  </p>
                ) : (
                  members.map((person) => (
                    <div key={person.id} className="row" style={{ gap: 8, marginTop: 6 }}>
                      <span className="user-avatar small">{person.initials}</span>
                      <span className="text-12">{person.name}</span>
                      <span className="spacer" />
                      <button
                        className="icon-button small"
                        aria-label={`Remove ${person.name}`}
                        onClick={() =>
                          setMemberIds((current) =>
                            current.filter((id) => id !== person.id)
                          )
                        }
                      >
                        <Dismiss20Regular />
                      </button>
                    </div>
                  ))
                )}
                <p className="row" style={{ gap: 6, marginTop: 12 }}>
                  <Info20Regular />
                  <span className="muted text-12">
                    Members are people who already have an account on this install.
                  </span>
                </p>
              </div>
            </div>
            <div className="side-pane-foot">
              <button className="btn btn-primary" onClick={() => setPaneOpen(false)}>
                Select
              </button>
              <button className="btn btn-secondary" onClick={() => setPaneOpen(false)}>
                Close
              </button>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
