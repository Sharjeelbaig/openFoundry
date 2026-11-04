// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import { useEffect, useState } from "react";
import {
  Add20Regular,
  Dismiss20Regular,
  Warning20Regular,
} from "@fluentui/react-icons";
import { Spinner } from "@/components/ui";
import type { HttpTool } from "@/lib/types";

function parsePairs(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split(/\r?\n/)) {
    const index = line.indexOf("=");
    if (index <= 0) continue;
    const key = line.slice(0, index).trim();
    const value = line.slice(index + 1).trim();
    if (key) out[key] = value;
  }
  return out;
}

function pairsText(record?: Record<string, string>): string {
  return Object.entries(record || {})
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
}

const DEFAULT_SCHEMA =
  '{\n  "type": "object",\n  "properties": {\n    "input": { "type": "string" }\n  },\n  "required": ["input"]\n}';

export default function HttpToolDialog({
  open,
  tool,
  onClose,
  onSaved,
}: {
  open: boolean;
  tool?: HttpTool | null;
  onClose: () => void;
  onSaved: (tool: HttpTool) => void;
}) {
  const editing = Boolean(tool);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [method, setMethod] = useState<HttpTool["method"]>("GET");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [bodyTemplate, setBodyTemplate] = useState("");
  const [schema, setSchema] = useState(DEFAULT_SCHEMA);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(tool?.name || "");
    setDescription(tool?.description || "");
    setMethod(tool?.method || "GET");
    setUrl(tool?.url || "");
    setHeaders(pairsText(tool?.headers));
    setBodyTemplate(tool?.bodyTemplate || "");
    setSchema(
      tool?.inputSchema ? JSON.stringify(tool.inputSchema, null, 2) : DEFAULT_SCHEMA
    );
    setError("");
  }, [open, tool]);

  if (!open) return null;

  const save = async () => {
    if (!name.trim() || !url.trim()) {
      setError("Name and URL are required.");
      return;
    }
    let parsedSchema: Record<string, unknown>;
    try {
      const value = JSON.parse(schema);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("not an object");
      parsedSchema = value as Record<string, unknown>;
    } catch {
      setError("Input schema must be a JSON object.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editing ? `/api/http-tools/${encodeURIComponent(tool!.id)}` : "/api/http-tools",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            method,
            url: url.trim(),
            headers: parsePairs(headers),
            bodyTemplate: bodyTemplate.trim() || undefined,
            inputSchema: parsedSchema,
          }),
        }
      );
      const json = (await res.json()) as { tool?: HttpTool; error?: string };
      if (!res.ok || !json.tool)
        throw new Error(json.error || "Could not save the HTTP tool.");
      onSaved(json.tool);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the HTTP tool."
      );
    } finally {
      setSaving(false);
    }
  };

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
        aria-label={editing ? "Edit HTTP tool" : "Create HTTP tool"}
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">
              {editing ? "Edit HTTP tool" : "Create HTTP tool"}
            </h2>
            <p className="dialog-sub">
              Point a function at any REST endpoint. It runs from this computer
              with the headers and body you configure.
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <Dismiss20Regular />
          </button>
        </div>
        <div className="dialog-body">
          <label className="field">
            <span className="field-label">Name</span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="internal-status"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <input
              className="input"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What does this endpoint do?"
            />
          </label>
          <div className="row" style={{ gap: 10 }}>
            <label className="field" style={{ width: 130 }}>
              <span className="field-label">Method</span>
              <Select
                className="select"
                value={method}
                onChange={(event) =>
                  setMethod(event.target.value as HttpTool["method"])
                }
              >
                {["GET", "POST", "PUT", "PATCH", "DELETE"].map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span className="field-label">URL</span>
              <input
                className="input mono"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://api.example.com/items/{{id}}"
              />
            </label>
          </div>
          <label className="field">
            <span className="field-label">Headers (KEY=VALUE, one per line)</span>
            <textarea
              className="textarea mono"
              value={headers}
              onChange={(event) => setHeaders(event.target.value)}
              placeholder="Authorization=Bearer ..."
            />
          </label>
          <label className="field">
            <span className="field-label">Body template (JSON, optional)</span>
            <textarea
              className="textarea mono"
              value={bodyTemplate}
              onChange={(event) => setBodyTemplate(event.target.value)}
              placeholder={'{"query": "{{input}}"}'}
            />
          </label>
          <label className="field">
            <span className="field-label">Input schema (JSON)</span>
            <textarea
              className="textarea mono"
              value={schema}
              onChange={(event) => setSchema(event.target.value)}
              style={{ minHeight: 130 }}
            />
          </label>
          <div className="banner">
            <Warning20Regular />
            <span>
              Use <span className="mono">{"{{name}}"}</span> placeholders in the
              URL, headers or body. The tool can reach any http(s) host you
              configure.
            </span>
          </div>
          {error && <div className="banner error">{error}</div>}
        </div>
        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={saving}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <Spinner /> : <Add20Regular />}{" "}
            {editing ? "Save tool" : "Create tool"}
          </button>
        </div>
      </div>
    </div>
  );
}
