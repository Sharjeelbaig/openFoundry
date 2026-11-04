// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Add20Regular,
  ChevronDown20Regular,
  Delete20Regular,
  Search20Regular,
  Flow20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Workflow } from "@/lib/types";
import { TEMPLATE_META, type WorkflowTemplate } from "@/lib/workflows/templates";

export default function WorkflowsList() {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, error, refresh } = useApi<{ workflows: Workflow[] }>(
    "/api/workflows",
    5000
  );
  const [query, setQuery] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [creating, setCreating] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Workflow | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const workflows = useMemo(() => data?.workflows ?? [], [data?.workflows]);
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return workflows;
    return workflows.filter(
      (workflow) =>
        workflow.name.toLowerCase().includes(needle) ||
        workflow.description.toLowerCase().includes(needle)
    );
  }, [workflows, query]);

  useEffect(() => {
    const onDown = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, []);

  const create = async (template: WorkflowTemplate) => {
    setCreating(template);
    setMenuOpen(false);
    try {
      const res = await fetch("/api/workflows", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ template }),
      });
      const json = (await res.json()) as { workflow?: Workflow; error?: string };
      if (!res.ok || !json.workflow)
        throw new Error(json.error || "Could not create the workflow.");
      toast(`${json.workflow.name} created`, "success");
      router.push(
        `/build/agents/workflows/${encodeURIComponent(json.workflow.id)}/build`
      );
    } catch (cause) {
      toast(cause instanceof Error ? cause.message : "Create failed.", "error");
    } finally {
      setCreating("");
    }
  };

  const remove = async () => {
    if (!deleteTarget) return;
    const res = await fetch(
      `/api/workflows/${encodeURIComponent(deleteTarget.id)}`,
      { method: "DELETE" }
    );
    if (!res.ok) {
      toast("Could not delete the workflow.", "error");
      return;
    }
    toast(`${deleteTarget.name} deleted`, "success");
    setDeleteTarget(null);
    refresh();
  };

  const createMenu = (
    <div className="workflow-create" ref={menuRef}>
      <button
        className="btn btn-primary"
        onClick={() => setMenuOpen((value) => !value)}
        disabled={Boolean(creating)}
      >
        {creating ? <Spinner /> : <Add20Regular />}
        Create workflow <ChevronDown20Regular />
      </button>
      {menuOpen && (
        <div className="menu-popover workflow-template-menu">
          {TEMPLATE_META.map((item) => (
            <button
              key={item.template}
              className="workflow-template-item"
              onClick={() => void create(item.template)}
            >
              <span className="workflow-template-icon">
                <Flow20Regular />
              </span>
              <span>
                <strong>{item.label}</strong>
                <small>{item.description}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <div className="workflow-toolbar">
        <div className="search-input">
          <Search20Regular />
          <input
            className="input"
            placeholder="Search workflows"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <span className="spacer" />
        {createMenu}
      </div>

      {loading && workflows.length === 0 ? (
        <div className="routine-empty">
          <Spinner large />
          <span className="muted">Loading workflows…</span>
        </div>
      ) : error ? (
        <div className="banner error">{error}</div>
      ) : workflows.length === 0 ? (
        <div className="routine-empty workflow-empty">
          <span className="routine-empty-icon">
            <Flow20Regular />
          </span>
          <h2>Ready to build your first workflow?</h2>
          <p>
            Workflows orchestrate agents, branching and human approvals in a
            repeatable local process.
          </p>
          <div style={{ display: "flex", gap: 8 }}>{createMenu}</div>
        </div>
      ) : (
        <div className="table-card">
          <table className="data-table workflow-table">
            <thead>
              <tr>
                <th>Workflow</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 90 }}>Nodes</th>
                <th style={{ width: 90 }}>Version</th>
                <th style={{ width: 190 }}>Last run</th>
                <th style={{ width: 190 }}>Updated</th>
                <th style={{ width: 90 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((workflow) => (
                <tr key={workflow.id}>
                  <td>
                    <Link
                      className="agent-name"
                      href={`/build/agents/workflows/${encodeURIComponent(
                        workflow.id
                      )}/build`}
                    >
                      {workflow.name}
                    </Link>
                    <div className="workflow-row-desc">
                      {workflow.description || "Workflow"}
                    </div>
                  </td>
                  <td>
                    <span
                      className={`routine-status ${
                        workflow.status === "published" ? "active" : "paused"
                      }`}
                    >
                      {workflow.status === "published" ? "Published" : "Draft"}
                    </span>
                  </td>
                  <td>{workflow.nodes.length}</td>
                  <td>{workflow.version || "--"}</td>
                  <td>
                    {workflow.lastRunAt
                      ? new Date(workflow.lastRunAt).toLocaleString()
                      : "Never run"}
                  </td>
                  <td>{new Date(workflow.updatedAt).toLocaleString()}</td>
                  <td>
                    <button
                      className="icon-button small"
                      aria-label={`Delete ${workflow.name}`}
                      onClick={() => setDeleteTarget(workflow)}
                    >
                      <Delete20Regular />
                    </button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="muted" style={{ textAlign: "center", padding: 40 }}>
                    No workflows match that search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {deleteTarget && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setDeleteTarget(null);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Delete workflow">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Delete {deleteTarget.name}?</h2>
                <p className="dialog-sub">
                  This removes the workflow and its local run history.
                </p>
              </div>
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setDeleteTarget(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={() => void remove()}>
                <Delete20Regular /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
