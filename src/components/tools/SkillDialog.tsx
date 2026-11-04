// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUpload20Regular,
  Dismiss20Regular,
  Document20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { Spinner } from "@/components/ui";
import type { LocalSkill } from "@/lib/types";

type Mode = "create" | "edit" | "upload";

function parseSkillFile(
  fileName: string,
  raw: string
): { name: string; description: string; instructions: string } {
  const fallbackName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (/\.json$/i.test(fileName)) {
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const instructions =
        (typeof parsed.instructions === "string" && parsed.instructions) ||
        (typeof parsed.prompt === "string" && parsed.prompt) ||
        (typeof parsed.content === "string" && parsed.content) ||
        raw;
      return {
        name:
          (typeof parsed.name === "string" && parsed.name.trim()) ||
          fallbackName,
        description:
          (typeof parsed.description === "string" && parsed.description.trim()) ||
          "Uploaded skill",
        instructions,
      };
    } catch {
      // Fall back to treating the file as text.
    }
  }
  const heading = raw.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const withoutHeading = raw.replace(/^#\s+.+\n?/m, "").trim();
  const firstParagraph = withoutHeading
    .split(/\n\s*\n/)
    .map((part) => part.replace(/^#+\s+/gm, "").trim())
    .find(Boolean);
  return {
    name: heading || fallbackName || "Uploaded skill",
    description:
      firstParagraph?.slice(0, 240) || "Uploaded local skill instructions.",
    instructions: raw.trim(),
  };
}

export default function SkillDialog({
  open,
  mode,
  skill,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: Mode;
  skill?: LocalSkill | null;
  onClose: () => void;
  onSaved: (skill: LocalSkill) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [source, setSource] = useState<LocalSkill["source"]>("created");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(skill?.name || "");
    setDescription(skill?.description || "");
    setInstructions(skill?.instructions || "");
    setSource(skill?.source || (mode === "upload" ? "uploaded" : "created"));
    setFileName("");
    setError("");
  }, [open, skill, mode]);

  if (!open) return null;

  const readFile = async (file: File) => {
    if (file.size > 2_000_000) {
      setError("Skill files must be smaller than 2 MB.");
      return;
    }
    try {
      const raw = await file.text();
      const parsed = parseSkillFile(file.name, raw);
      setName(parsed.name);
      setDescription(parsed.description);
      setInstructions(parsed.instructions);
      setSource("uploaded");
      setFileName(file.name);
      setError("");
    } catch {
      setError("Could not read that file.");
    }
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Give the skill a name.");
      return;
    }
    if (!instructions.trim()) {
      setError("Add the instructions the agent should follow.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        mode === "edit" && skill
          ? `/api/skills/${encodeURIComponent(skill.id)}`
          : "/api/skills",
        {
          method: mode === "edit" && skill ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            instructions: instructions.trim(),
            source,
          }),
        }
      );
      const json = (await res.json()) as { skill?: LocalSkill; error?: string };
      if (!res.ok || !json.skill)
        throw new Error(json.error || "Could not save the skill.");
      onSaved(json.skill);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the skill.");
    } finally {
      setSaving(false);
    }
  };

  const title =
    mode === "edit"
      ? "Edit skill"
      : mode === "upload"
      ? "Upload skill"
      : "Create skill";

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !saving) onClose();
      }}
    >
      <div
        className="dialog wide"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">{title}</h2>
            <p className="dialog-sub">
              Skills are reusable instruction packs. Attach one to an agent or
              include it in a toolbox.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          {mode === "upload" && (
            <div
              className={`skill-dropzone${dragging ? " dragging" : ""}`}
              onDragOver={(event) => {
                event.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragging(false);
                const file = event.dataTransfer.files?.[0];
                if (file) void readFile(file);
              }}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".md,.markdown,.txt,.json"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void readFile(file);
                }}
              />
              <Document20Regular />
              <div>
                <strong>
                  {fileName || "Drop a SKILL.md or JSON manifest here"}
                </strong>
                <p className="muted text-12">
                  Markdown, text or JSON up to 2 MB. The first heading becomes
                  the skill name.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                onClick={() => inputRef.current?.click()}
              >
                <ArrowUpload20Regular /> Browse files
              </button>
            </div>
          )}

          <label className="field">
            <span className="field-label">
              Name <span className="required">*</span>
            </span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="release-checklist"
              autoFocus={mode !== "upload"}
            />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What this skill helps the agent do"
            />
          </label>
          <label className="field">
            <span className="field-label">
              Instructions <span className="required">*</span>
            </span>
            <textarea
              className="textarea mono"
              value={instructions}
              onChange={(event) => setInstructions(event.target.value)}
              placeholder={"# Release checklist\n\n1. Read the changelog\n2. Run the tests\n3. Draft the release notes"}
              style={{ minHeight: 240 }}
            />
          </label>
          <div className="banner">
            <Sparkle20Regular />
            <span>
              The instructions are added to the agent system prompt when this
              skill is attached. They are stored locally and never uploaded.
            </span>
          </div>
          {error && <div className="banner error">{error}</div>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={saving || !name.trim() || !instructions.trim()}
          >
            {saving ? <Spinner /> : <Sparkle20Regular />}{" "}
            {mode === "edit" ? "Save skill" : "Add skill"}
          </button>
        </div>
      </div>
    </div>
  );
}
