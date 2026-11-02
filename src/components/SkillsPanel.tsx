"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ChevronDown20Regular,
  Delete20Regular,
  Edit20Regular,
  MoreHorizontal20Regular,
  Search20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { DottedObject, Spinner } from "@/components/ui";
import type { Agent, LocalSkill } from "@/lib/types";
import { formatModified } from "@/components/tools/tool-options";
import SkillDialog from "@/components/tools/SkillDialog";
import SelectSkillDialog from "@/components/tools/SelectSkillDialog";

const PAGE_SIZE = 10;

export default function SkillsPanel() {
  const { toast } = useToast();
  const { data, refresh, loading } = useApi<{ skills: LocalSkill[] }>(
    "/api/skills"
  );
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");
  const skills = useMemo(() => data?.skills ?? [], [data]);
  const agents = useMemo(() => agentData?.agents ?? [], [agentData]);

  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [newMenu, setNewMenu] = useState(false);
  const [dialog, setDialog] = useState<"create" | "upload" | "edit" | "">("");
  const [editSkill, setEditSkill] = useState<LocalSkill | null>(null);
  const [browseOpen, setBrowseOpen] = useState(false);
  const [attachTarget, setAttachTarget] = useState<LocalSkill | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<LocalSkill | null>(null);
  const [menuId, setMenuId] = useState("");
  const [agentId, setAgentId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!agentId && agents[0]) setAgentId(agents[0].id);
  }, [agents, agentId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return skills;
    return skills.filter((skill) =>
      `${skill.name} ${skill.description} ${skill.instructions}`
        .toLowerCase()
        .includes(needle)
    );
  }, [skills, query]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageItems = filtered.slice(
    currentPage * PAGE_SIZE,
    currentPage * PAGE_SIZE + PAGE_SIZE
  );

  const openCreate = () => {
    setNewMenu(false);
    setEditSkill(null);
    setDialog("create");
  };
  const openUpload = () => {
    setNewMenu(false);
    setEditSkill(null);
    setDialog("upload");
  };
  const openEdit = (skill: LocalSkill) => {
    setEditSkill(skill);
    setDialog("edit");
  };

  const attach = async () => {
    if (!attachTarget || !agentId) return;
    const agent = agents.find((item) => item.id === agentId);
    if (!agent) return;
    const id = `skill:local:${attachTarget.id}`;
    if (agent.tools.includes(id)) {
      toast(`${attachTarget.name} is already attached.`, "info");
      setAttachTarget(null);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tools: [...agent.tools, id] }),
      });
      if (!res.ok) throw new Error("Attach failed.");
      toast(`${attachTarget.name} attached to ${agent.name}`, "success");
      setAttachTarget(null);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Attach failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/skills/${encodeURIComponent(deleteTarget.id)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Delete failed.");
      toast(`${deleteTarget.name} deleted`, "success");
      setDeleteTarget(null);
      refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusy(false);
    }
  };

  if (loading && skills.length === 0) {
    return (
      <div className="empty" style={{ paddingTop: 80 }}>
        <Spinner /> Loading skills…
      </div>
    );
  }

  if (skills.length === 0) {
    return (
      <section className="tools-empty">
        <DottedObject />
        <h2>Add your first skill</h2>
        <p>
          Skills are reusable capabilities — upload a skill manifest or create
          one to make it available to your agents.
        </p>
        <div className="tools-empty-actions">
          <button
            className="btn btn-secondary"
            onClick={() => setBrowseOpen(true)}
          >
            Browse skill
          </button>
          <div style={{ position: "relative" }}>
            <button
              className="btn btn-primary"
              onClick={() => setNewMenu((value) => !value)}
              aria-expanded={newMenu}
            >
              New skill <ChevronDown20Regular />
            </button>
            {newMenu && (
              <>
                <div
                  className="menu-scrim"
                  onClick={() => setNewMenu(false)}
                  aria-hidden="true"
                />
                <div
                  className="menu-popover new-skill-menu"
                  role="menu"
                  aria-label="New skill"
                >
                  <button className="menu-item" role="menuitem" onClick={openCreate}>
                    <Sparkle20Regular /> Create skill
                  </button>
                  <button className="menu-item" role="menuitem" onClick={openUpload}>
                    <Add20Regular /> Upload skill
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        <SelectSkillDialog
          open={browseOpen}
          mode="browse"
          onClose={() => setBrowseOpen(false)}
          onConfirm={() => setBrowseOpen(false)}
          onLocalSkillSaved={refresh}
          onOpenSkill={(skill) => {
            setBrowseOpen(false);
            openEdit(skill);
          }}
        />
        <SkillDialog
          open={Boolean(dialog)}
          mode={dialog === "upload" ? "upload" : dialog === "edit" ? "edit" : "create"}
          skill={editSkill}
          onClose={() => setDialog("")}
          onSaved={(skill) => {
            refresh();
            toast(`${skill.name} saved`, "success");
          }}
        />
      </section>
    );
  }

  return (
    <section>
      <div className="tools-list-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search skills"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(0);
            }}
            aria-label="Search skills"
          />
        </div>
        <span className="grow" />
        <button
          className="btn btn-secondary"
          onClick={() => setBrowseOpen(true)}
        >
          Browse skill
        </button>
        <div style={{ position: "relative" }}>
          <button
            className="btn btn-primary"
            onClick={() => setNewMenu((value) => !value)}
            aria-expanded={newMenu}
          >
            New skill <ChevronDown20Regular />
          </button>
          {newMenu && (
            <>
              <div
                className="menu-scrim"
                onClick={() => setNewMenu(false)}
                aria-hidden="true"
              />
              <div
                className="menu-popover new-skill-menu"
                role="menu"
                aria-label="New skill"
              >
                <button className="menu-item" role="menuitem" onClick={openCreate}>
                  <Sparkle20Regular /> Create skill
                </button>
                <button className="menu-item" role="menuitem" onClick={openUpload}>
                  <Add20Regular /> Upload skill
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="tools-table-card">
        <table className="data-table tools-table">
          <thead>
            <tr>
              <th style={{ width: "50%" }}>Name</th>
              <th style={{ width: "25%" }}>Type</th>
              <th style={{ width: "20%" }}>Modified on</th>
              <th style={{ width: 40 }} />
            </tr>
          </thead>
          <tbody>
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={4} className="cell-muted">
                  No skills match this search.
                </td>
              </tr>
            ) : (
              pageItems.map((skill) => (
                <tr key={skill.id}>
                  <td>
                    <div className="tools-name-cell">
                      <span className="tools-status-dot ready" title="Ready" />
                      <button
                        className="tools-name-link"
                        onClick={() => openEdit(skill)}
                      >
                        {skill.name}
                      </button>
                    </div>
                  </td>
                  <td>
                    {skill.source === "uploaded" ? "Uploaded skill" : "Local skill"}
                  </td>
                  <td>{formatModified(skill.updatedAt)}</td>
                  <td>
                    <div style={{ position: "relative" }}>
                      <button
                        className="icon-button small"
                        aria-label={`Options for ${skill.name}`}
                        onClick={() =>
                          setMenuId((current) =>
                            current === skill.id ? "" : skill.id
                          )
                        }
                      >
                        <MoreHorizontal20Regular />
                      </button>
                      {menuId === skill.id && (
                        <>
                          <div
                            className="menu-scrim"
                            onClick={() => setMenuId("")}
                            aria-hidden="true"
                          />
                          <div className="menu-popover" role="menu">
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuId("");
                                openEdit(skill);
                              }}
                            >
                              <Edit20Regular /> View and edit
                            </button>
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuId("");
                                setAttachTarget(skill);
                              }}
                            >
                              <Add20Regular /> Attach to agent
                            </button>
                            <button
                              className="menu-item"
                              role="menuitem"
                              onClick={() => {
                                setMenuId("");
                                setDeleteTarget(skill);
                              }}
                            >
                              <Delete20Regular /> Delete
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="table-footer">
        <span>
          {filtered.length === 0
            ? "0 of 0"
            : `${currentPage * PAGE_SIZE + 1}-${Math.min(
                (currentPage + 1) * PAGE_SIZE,
                filtered.length
              )} of ${filtered.length}`}
        </span>
        <div className="pager">
          <button
            disabled={currentPage === 0}
            onClick={() => setPage((value) => Math.max(0, value - 1))}
          >
            Prev
          </button>
          <button
            disabled={currentPage >= pageCount - 1}
            onClick={() => setPage((value) => Math.min(pageCount - 1, value + 1))}
          >
            Next
          </button>
        </div>
      </div>

      <SelectSkillDialog
        open={browseOpen}
        mode="browse"
        onClose={() => setBrowseOpen(false)}
        onConfirm={() => setBrowseOpen(false)}
        onLocalSkillSaved={refresh}
        onOpenSkill={(skill) => {
          setBrowseOpen(false);
          openEdit(skill);
        }}
      />
      <SkillDialog
        open={Boolean(dialog)}
        mode={dialog === "upload" ? "upload" : dialog === "edit" ? "edit" : "create"}
        skill={editSkill}
        onClose={() => setDialog("")}
        onSaved={(skill) => {
          refresh();
          toast(`${skill.name} saved`, "success");
        }}
      />

      {attachTarget && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setAttachTarget(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Attach skill">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Attach {attachTarget.name}</h2>
                <p className="dialog-sub">
                  The skill instructions are added to the agent system prompt.
                </p>
              </div>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent</span>
                <select
                  className="select"
                  value={agentId}
                  onChange={(event) => setAgentId(event.target.value)}
                >
                  {agents.map((agent) => (
                    <option key={agent.id} value={agent.id}>
                      {agent.name}
                      {agent.tools.includes(`skill:local:${attachTarget.id}`)
                        ? " · already attached"
                        : ""}
                    </option>
                  ))}
                  {agents.length === 0 && <option value="">No agents</option>}
                </select>
              </label>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setAttachTarget(null)}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={attach}
                disabled={busy || !agentId}
              >
                {busy ? <Spinner /> : <Add20Regular />} Attach
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !busy)
              setDeleteTarget(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Delete skill">
            <div className="dialog-head">
              <h2 className="dialog-title">Delete {deleteTarget.name}?</h2>
            </div>
            <div className="dialog-body">
              <p className="dialog-sub" style={{ margin: 0 }}>
                Are you sure you want to delete {deleteTarget.name}? This action
                cannot be undone.
              </p>
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={busy}
              >
                Cancel
              </button>
              <button className="btn btn-primary" onClick={remove} disabled={busy}>
                {busy ? <Spinner /> : null} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
