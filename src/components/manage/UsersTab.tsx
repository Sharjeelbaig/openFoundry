"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  ArrowRight20Regular,
  Dismiss20Regular,
  Info20Regular,
  Open20Regular,
  Search20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";

interface AssignmentRow {
  id: string;
  principalId: string;
  name: string;
  email: string;
  initials: string;
  roleName: string;
  scope: string;
  accessType: "Direct access" | "Inherited access";
  createdAt: string;
}

interface PrincipalRow {
  id: string;
  name: string;
  email: string;
  initials: string;
  roles: { roleId: string; roleName: string; scope: string }[];
  credential: { state: "active" | "never_used" | "none" | "revoked" };
}

interface Payload {
  assignments: AssignmentRow[];
  me: { roleName: string; access: string; email: string; canManage: boolean };
  scopeLabels: { root: string; project: string };
  scopes: { root: string; project: string };
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PAGE = 10;

export default function UsersTab() {
  const { toast } = useToast();
  const { data, refresh } = useApi<Payload>("/api/directory/assignments", 15000);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [open, setOpen] = useState(false);
  const [candidates, setCandidates] = useState<PrincipalRow[]>([]);
  const [pick, setPick] = useState<{ id?: string; name: string; email: string } | null>(null);
  const [pickQuery, setPickQuery] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [inviteMode, setInviteMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<{
    name: string;
    email: string;
    accessCode: string;
    roles: string[];
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const rows = useMemo(() => data?.assignments ?? [], [data?.assignments]);
  const canManage = data?.me.canManage ?? false;
  const scopeLabel = (scope: string) =>
    scope === (data?.scopes.root ?? "/")
      ? data?.scopeLabels.root || "This install"
      : `${data?.scopeLabels.root || "install"}/projects/${
          data?.scopeLabels.project || "project"
        }`;

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (row) =>
        row.name.toLowerCase().includes(needle) ||
        row.email.toLowerCase().includes(needle) ||
        row.roleName.toLowerCase().includes(needle)
    );
  }, [rows, query]);

  const pages = Math.max(1, Math.ceil(visible.length / PAGE));
  const current = Math.min(page, pages - 1);
  const slice = visible.slice(current * PAGE, current * PAGE + PAGE);

  useEffect(() => setPage(0), [query, rows.length]);

  const openDialog = async () => {
    setOpen(true);
    setPick(null);
    setPickQuery("");
    setInviteName("");
    setInviteMode(false);
    setInviteMode(false);
    setError("");
    setIssued(null);
    try {
      const response = await fetch("/api/directory/principals", { cache: "no-store" });
      const payload = (await response.json()) as { principals?: PrincipalRow[] };
      setCandidates(payload.principals ?? []);
    } catch {
      setCandidates([]);
    }
  };

  const matches = useMemo(() => {
    const needle = pickQuery.trim().toLowerCase();
    if (!needle) return candidates.slice(0, 6);
    return candidates
      .filter(
        (person) =>
          person.name.toLowerCase().includes(needle) ||
          person.email.toLowerCase().includes(needle)
      )
      .slice(0, 6);
  }, [candidates, pickQuery]);

  const inviteEmail =
    pickQuery.trim().toLowerCase() &&
    !matches.some((person) => person.email.toLowerCase() === pickQuery.trim().toLowerCase()) &&
    EMAIL.test(pickQuery.trim())
      ? pickQuery.trim().toLowerCase()
      : "";

  const typedName = inviteName.trim() || (inviteEmail ? inviteEmail.split("@")[0] : "");

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (pick?.id) {
        const response = await fetch("/api/directory/assignments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roleId: "role_reader",
            scope: "project",
            principalIds: [pick.id],
          }),
        });
        if (!response.ok) throw new Error("Could not add this person.");
        // Foundry assigns Reader and Foundry User together.
        await fetch("/api/directory/assignments", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            roleId: "role_foundry_user",
            scope: "project",
            principalIds: [pick.id],
          }),
        });
        setIssued({
          name: pick.name,
          email: pick.email,
          accessCode: "",
          roles: ["Reader", "Foundry User"],
        });
      } else if (inviteEmail) {
        const response = await fetch("/api/directory/principals", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            name: typedName,
            email: inviteEmail,
            roleIds: ["role_reader", "role_foundry_user"],
            scope: "project",
          }),
        });
        const payload = (await response.json()) as {
          principal?: { name: string; email: string };
          accessCode?: string;
          error?: string;
        };
        if (!response.ok || !payload.principal) {
          throw new Error(payload.error || "Could not add this person.");
        }
        setIssued({
          name: payload.principal.name,
          email: payload.principal.email,
          accessCode: payload.accessCode ?? "",
          roles: ["Reader", "Foundry User"],
        });
      } else {
        throw new Error("Pick a person, or type an email address to invite.");
      }
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    setOpen(false);
    setIssued(null);
    setPick(null);
    setPickQuery("");
    setInviteMode(false);
    if (issued) toast(`${issued.name} added to the project`, "success");
  };

  return (
    <>
      <div className="page-toolbar" style={{ paddingTop: 0 }}>
        <div className="search-input" style={{ maxWidth: 320 }}>
          <Search20Regular />
          <input
            className="input"
            placeholder="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="spacer" />
        <button
          className={canManage ? "btn btn-primary" : "btn btn-secondary"}
          onClick={openDialog}
          disabled={!canManage}
          title={
            canManage
              ? undefined
              : "You can view this list, but not change who has access."
          }
        >
          <Add20Regular /> Add user
        </button>
      </div>

      <div className="table-card">
        <table className="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Access type</th>
              <th>Role</th>
              <th>Scope</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.id}>
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
                <td>
                  <span className="row" style={{ gap: 8 }}>
                    <span>{row.accessType}</span>
                    {row.accessType === "Inherited access" && (
                      <span className="badge gray">View only</span>
                    )}
                  </span>
                </td>
                <td>{row.roleName}</td>
                <td>
                  <a
                    className="scope-link"
                    href={`/manage/access?scope=${encodeURIComponent(row.scope)}`}
                  >
                    {scopeLabel(row.scope)}
                    <Open20Regular />
                  </a>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={4} className="muted" style={{ textAlign: "center", padding: 36 }}>
                  {rows.length === 0
                    ? "No one has access yet."
                    : "No users match that search."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-footer">
        <span>
          {visible.length === 0
            ? "0 of 0"
            : `${current * PAGE + 1}-${Math.min(
                visible.length,
                current * PAGE + PAGE
              )} of ${visible.length}`}
        </span>
        <span className="row" style={{ gap: 6 }}>
          <button
            className="btn btn-secondary btn-sm"
            disabled={current === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
            aria-label="Previous page"
          >
            <ArrowLeft20Regular /> Prev
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={current >= pages - 1}
            onClick={() => setPage((value) => Math.min(pages - 1, value + 1))}
            aria-label="Next page"
          >
            Next <ArrowRight20Regular />
          </button>
        </span>
      </div>

      {open && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setOpen(false);
          }}
        >
          <div
            className="dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Add user"
            style={{ width: 570, maxWidth: "calc(100vw - 40px)" }}
          >
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Add user</h2>
              </div>
              <button className="icon-button" onClick={close} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>

            {issued ? (
              <>
                <div className="dialog-body">
                  <p className="cell-strong" style={{ marginBottom: 4 }}>
                    {issued.name} · {issued.email}
                  </p>
                  <p className="muted text-12" style={{ marginBottom: 12 }}>
                    {issued.roles.join(" and ")} assigned to this project.
                  </p>
                  {issued.accessCode ? (
                    <div className="setup-card">
                      <span className="field-label">Access code</span>
                      <div className="row" style={{ gap: 8 }}>
                        <span className="mono" style={{ letterSpacing: "0.08em" }}>
                          {issued.accessCode}
                        </span>
                        <span className="spacer" />
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={async () => {
                            await navigator.clipboard.writeText(issued.accessCode);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 1500);
                          }}
                        >
                          {copied ? "Copied" : "Copy"}
                        </button>
                      </div>
                      <span className="muted text-12">
                        Shown once. Send it to this person; they sign in with it.
                      </span>
                    </div>
                  ) : (
                    <p className="muted text-12">
                      This person already has an access code. Issue a new one on the
                      Access control page if they lost it.
                    </p>
                  )}
                </div>
                <div className="dialog-footer">
                  <button className="btn btn-primary" onClick={close}>
                    Done
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="dialog-body">
                  <label className="field">
                    <span className="field-label">
                      Add people <span style={{ color: "var(--danger)" }}>*</span>
                    </span>
                    <div style={{ position: "relative" }}>
                      <input
                        className="input"
                        autoFocus
                        placeholder="Enter a name or email"
                        value={pick ? `${pick.name} <${pick.email}>` : pickQuery}
                        onChange={(event) => {
                          setPick(null);
                          setPickQuery(event.target.value);
                        }}
                      />
                      {!pick && !inviteMode && pickQuery.trim() !== "" && (
                        <div className="picker-menu">
                          {matches.map((person) => (
                            <button
                              key={person.id}
                              className="picker-item"
                              onClick={() => {
                                setPick({
                                  id: person.id,
                                  name: person.name,
                                  email: person.email,
                                });
                                setPickQuery("");
                              }}
                            >
                              <span className="user-avatar small">{person.initials}</span>
                              <span>
                                <span style={{ display: "block" }}>{person.name}</span>
                                <span className="muted text-12">{person.email}</span>
                              </span>
                            </button>
                          ))}
                          {inviteEmail && (
                            <button
                              className="picker-item"
                              onClick={() => {
                                setPickQuery(inviteEmail);
                                setInviteName(typedName);
                                setInviteMode(true);
                                setInviteMode(true);
                              }}
                            >
                              <span className="user-avatar small">+</span>
                              <span>
                                <span style={{ display: "block" }}>Invite {inviteEmail}</span>
                                <span className="muted text-12">
                                  Creates a person and an access code
                                </span>
                              </span>
                            </button>
                          )}
                          {matches.length === 0 && !inviteEmail && (
                            <div className="picker-empty">No options available</div>
                          )}
                        </div>
                      )}
                    </div>
                  </label>

                  {inviteEmail && !pick && (
                    <label className="field">
                      <span className="field-label">Name</span>
                      <input
                        className="input"
                        placeholder={typedName}
                        value={inviteName}
                        onChange={(event) => setInviteName(event.target.value)}
                      />
                    </label>
                  )}

                  <div className="info-banner">
                    <Info20Regular />
                    <span>
                      <strong>&quot;Reader&quot; and &quot;Foundry User&quot;</strong> roles
                      will be assigned to this user. To assign fine-grained access control,
                      use the Access control page.
                    </span>
                  </div>
                  {error && <p className="text-12" style={{ color: "var(--danger)" }}>{error}</p>}
                </div>
                <div className="dialog-footer">
                  <button className="btn btn-secondary" onClick={close}>
                    Cancel
                  </button>
                  <button
                    className="btn btn-primary"
                    onClick={submit}
                    disabled={busy || (!pick && !inviteEmail)}
                  >
                    {busy ? <Spinner /> : null} Add user
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
