// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowUpload20Regular,
  CheckmarkCircle20Regular,
  Dismiss20Regular,
  Document20Regular,
  Search20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { LocalSkill, ToolCatalogEntry } from "@/lib/types";
import SkillDialog from "./SkillDialog";

type Tab = "Configured" | "Catalog" | "New skill";
const TABS: Tab[] = ["Configured", "Catalog", "New skill"];

export default function SelectSkillDialog({
  open,
  mode,
  selected = [],
  onClose,
  onConfirm,
  onLocalSkillSaved,
  onOpenSkill,
}: {
  open: boolean;
  mode: "select" | "browse";
  selected?: string[];
  onClose: () => void;
  onConfirm: (ids: string[]) => void;
  onLocalSkillSaved?: (skill: LocalSkill) => void;
  onOpenSkill?: (skill: LocalSkill) => void;
}) {
  const { toast } = useToast();
  const { data, refresh } = useApi<{ skills: LocalSkill[] }>("/api/skills");
  const { data: catalogData, loading: catalogLoading } = useApi<{
    tools: ToolCatalogEntry[];
  }>("/api/tools/catalog?type=Skills");
  const localSkills = useMemo(() => data?.skills ?? [], [data]);
  const catalog = useMemo(() => catalogData?.tools ?? [], [catalogData]);

  const [tab, setTab] = useState<Tab>("Configured");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const [dialog, setDialog] = useState<"create" | "upload" | "">("");
  const [adding, setAdding] = useState("");
  const [addedCatalog, setAddedCatalog] = useState<string[]>([]);

  const selectedKey = selected.join("\u0000");

  useEffect(() => {
    if (!open) return;
    setTab("Configured");
    setQuery("");
    setPicked(selected);
    setDialog("");
    setAdding("");
    setAddedCatalog([]);
    // selectedKey keeps the reset tied to real changes, not a new array identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedKey]);

  const needle = query.trim().toLowerCase();
  const localMatches = useMemo(
    () =>
      localSkills.filter(
        (skill) =>
          !needle ||
          `${skill.name} ${skill.description} ${skill.instructions}`
            .toLowerCase()
            .includes(needle)
      ),
    [localSkills, needle]
  );
  const catalogMatches = useMemo(
    () =>
      catalog.filter(
        (skill) =>
          !needle ||
          `${skill.name} ${skill.summary} ${skill.tags.join(" ")}`
            .toLowerCase()
            .includes(needle)
      ),
    [catalog, needle]
  );

  const toggle = (id: string) => {
    setPicked((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  };

  const browseAdded = async (entry: ToolCatalogEntry) => {
    setAdding(entry.id);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: entry.name,
          description: entry.summary,
          instructions: entry.instructions || entry.description,
          source: "created",
        }),
      });
      const json = (await res.json()) as { skill?: LocalSkill; error?: string };
      if (!res.ok || !json.skill) {
        throw new Error(json.error || "Could not add the skill.");
      }
      setAddedCatalog((current) => [...current, entry.id]);
      refresh();
      onLocalSkillSaved?.(json.skill);
      toast(`${entry.name} added to your skills`, "success");
    } catch (err) {
      toast(
        err instanceof Error ? err.message : "Could not add the skill.",
        "error"
      );
    } finally {
      setAdding("");
    }
  };

  const onSkillSaved = (skill: LocalSkill) => {
    refresh();
    onLocalSkillSaved?.(skill);
    if (mode === "select") {
      setPicked((current) => [
        ...new Set([...current, `skill:local:${skill.id}`]),
      ]);
      setTab("Configured");
      toast(`${skill.name} created and selected`, "success");
    } else {
      toast(`${skill.name} created`, "success");
    }
    setDialog("");
  };

  if (!open) return null;

  return (
    <>
      <div
        className="dialog-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <div
          className="dialog tool-picker-dialog skill-picker-dialog"
          role="dialog"
          aria-modal="true"
          aria-label={mode === "browse" ? "Browse skills" : "Select a skill"}
        >
          <div className="tool-picker-head">
            <h2 className="dialog-title">
              {mode === "browse" ? "Browse skills" : "Select a skill"}
            </h2>
            <button className="icon-button" onClick={onClose} aria-label="Close">
              <Dismiss20Regular />
            </button>
          </div>

          <div className="tool-picker-tabs" role="tablist">
            {TABS.map((item) => (
              <button
                key={item}
                role="tab"
                aria-selected={tab === item}
                className={`tool-picker-tab${tab === item ? " active" : ""}`}
                onClick={() => {
                  setTab(item);
                  setQuery("");
                }}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="tool-picker-note">
            {tab === "Configured" ? (
              mode === "browse" ? (
                <>
                  Your local skills. Open one to read or edit its instructions,
                  or browse the catalog to add another.
                </>
              ) : (
                <>
                  Choose local skills to add to this toolbox. Skills contribute
                  instructions, not callable functions.
                </>
              )
            ) : tab === "Catalog" ? (
              mode === "browse" ? (
                <>
                  Add a catalog skill to this workspace. openFoundry stores a
                  local copy; nothing is sent to a remote service.
                </>
              ) : (
                <>
                  Select a catalog skill. It is referenced directly by the
                  toolbox and applied to the agent prompt at runtime.
                </>
              )
            ) : (
              <>
                Create a skill from scratch or upload a SKILL.md or JSON
                manifest. Everything stays on this computer.
              </>
            )}
          </div>

          {tab !== "New skill" && (
            <div className="tool-picker-search">
              <div
                className="search-input"
                style={{ width: "100%", maxWidth: 520 }}
              >
                <Search20Regular />
                <input
                  className="input"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search skills"
                  aria-label="Search skills"
                />
              </div>
            </div>
          )}

          <div className="tool-picker-body">
            {tab === "Configured" && (
              <>
                {localMatches.length === 0 ? (
                  <div className="tool-picker-empty">
                    <Sparkle20Regular />
                    <h3>Add your first skill</h3>
                    <p>
                      Skills are reusable instructions — upload or create one to
                      make it available to your agents.
                    </p>
                    <button
                      className="btn btn-primary"
                      onClick={() => setTab("New skill")}
                    >
                      <Add20Regular /> New skill
                    </button>
                  </div>
                ) : (
                  <div className="tool-picker-grid">
                    {localMatches.map((skill) => {
                      const id = `skill:local:${skill.id}`;
                      const selected = picked.includes(id);
                      return (
                        <button
                          type="button"
                          key={skill.id}
                          className={`tool-picker-card${
                            selected ? " selected" : ""
                          }`}
                          onClick={() => {
                            if (mode === "select") toggle(id);
                            else onOpenSkill?.(skill);
                          }}
                          aria-pressed={mode === "select" ? selected : undefined}
                        >
                          <span className="tool-card-icon">
                            <Sparkle20Regular />
                          </span>
                          <span className="tool-card-main">
                            <span className="tool-card-name">{skill.name}</span>
                            <span className="tool-card-description">
                              {skill.description || "Local skill"}
                            </span>
                            <span className="tool-card-badges">
                              <span className="badge gray">
                                {skill.source === "uploaded"
                                  ? "Uploaded"
                                  : "Created locally"}
                              </span>
                              {selected && (
                                <span className="badge green">
                                  <CheckmarkCircle20Regular /> Selected
                                </span>
                              )}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === "Catalog" && (
              <>
                {catalogLoading ? (
                  <div className="tool-picker-empty">
                    <Spinner /> Loading the skill catalog…
                  </div>
                ) : catalogMatches.length === 0 ? (
                  <div className="tool-picker-empty">
                    No catalog skills match this search.
                  </div>
                ) : (
                  <div className="tool-picker-grid">
                    {catalogMatches.map((entry) => {
                      const id = `skill:${entry.id}`;
                      const selected = picked.includes(id);
                      const added = addedCatalog.includes(entry.id);
                      return (
                        <button
                          type="button"
                          key={entry.id}
                          className={`tool-picker-card${
                            selected ? " selected" : ""
                          }`}
                          onClick={() => {
                            if (mode === "select") {
                              toggle(id);
                            } else if (!added && !adding) {
                              void browseAdded(entry);
                            }
                          }}
                          disabled={mode === "browse" && (added || Boolean(adding))}
                          aria-pressed={mode === "select" ? selected : undefined}
                        >
                          <span className="tool-card-icon">
                            <Document20Regular />
                          </span>
                          <span className="tool-card-main">
                            <span className="tool-card-name">{entry.name}</span>
                            <span className="tool-card-description">
                              {entry.summary}
                            </span>
                            <span className="tool-card-badges">
                              <span className="badge gray">Catalog skill</span>
                              {entry.company && (
                                <span className="badge gray">{entry.company}</span>
                              )}
                              {selected && (
                                <span className="badge green">
                                  <CheckmarkCircle20Regular /> Selected
                                </span>
                              )}
                              {added && (
                                <span className="badge green">
                                  <CheckmarkCircle20Regular /> Added
                                </span>
                              )}
                              {adding === entry.id && <Spinner />}
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}

            {tab === "New skill" && (
              <div className="custom-tool-grid">
                <button
                  type="button"
                  className="custom-tool-card"
                  onClick={() => setDialog("create")}
                >
                  <span className="tool-card-icon">
                    <Sparkle20Regular />
                  </span>
                  <strong>Create skill</strong>
                  <span>
                    Write a name, description and the instructions the agent
                    should follow.
                  </span>
                </button>
                <button
                  type="button"
                  className="custom-tool-card"
                  onClick={() => setDialog("upload")}
                >
                  <span className="tool-card-icon">
                    <ArrowUpload20Regular />
                  </span>
                  <strong>Upload skill</strong>
                  <span>
                    Import a SKILL.md, text file or JSON manifest from this
                    computer.
                  </span>
                </button>
              </div>
            )}
          </div>

          <div className="tool-picker-footer">
            <span className="muted text-12">
              {mode === "select"
                ? `${picked.length} selected`
                : `${localSkills.length} local skills`}
            </span>
            <span className="grow" />
            <button className="btn btn-secondary" onClick={onClose}>
              {mode === "browse" ? "Done" : "Cancel"}
            </button>
            {mode === "select" && (
              <button
                className="btn btn-primary"
                onClick={() => onConfirm(picked)}
                disabled={!picked.length}
              >
                <Add20Regular /> Add {picked.length || ""}
              </button>
            )}
          </div>
        </div>
      </div>

      <SkillDialog
        open={Boolean(dialog)}
        mode={dialog === "upload" ? "upload" : "create"}
        onClose={() => setDialog("")}
        onSaved={onSkillSaved}
      />
    </>
  );
}
