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
import type { McpServer } from "@/lib/types";

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

export default function McpServerDialog({
  open,
  server,
  initial,
  onClose,
  onSaved,
}: {
  open: boolean;
  server?: McpServer | null;
  initial?: { name?: string; url?: string };
  onClose: () => void;
  onSaved: (server: McpServer) => void;
}) {
  const editing = Boolean(server);
  const [name, setName] = useState("");
  const [transport, setTransport] = useState<"stdio" | "http" | "sse">("http");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState("");
  const [url, setUrl] = useState("");
  const [headers, setHeaders] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(server?.name || initial?.name || "");
    setTransport(server?.transport || (initial?.url ? "http" : "http"));
    setCommand(server?.command || "");
    setArgs((server?.args || []).join("\n"));
    setEnv(pairsText(server?.env));
    setUrl(server?.url || initial?.url || "");
    setHeaders(pairsText(server?.headers));
    setError("");
  }, [open, server, initial?.name, initial?.url]);

  if (!open) return null;

  const save = async () => {
    if (!name.trim()) {
      setError("Give the server a name.");
      return;
    }
    if (transport === "stdio" && !command.trim()) {
      setError("Enter the command that starts the MCP server.");
      return;
    }
    if (transport !== "stdio" && !url.trim()) {
      setError("Enter the MCP server URL.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editing ? `/api/mcp/${encodeURIComponent(server!.id)}` : "/api/mcp",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            transport,
            command: transport === "stdio" ? command.trim() : undefined,
            args:
              transport === "stdio"
                ? args
                    .split(/\r?\n/)
                    .map((item) => item.trim())
                    .filter(Boolean)
                : undefined,
            env: transport === "stdio" ? parsePairs(env) : undefined,
            url: transport === "stdio" ? undefined : url.trim(),
            headers: transport === "stdio" ? undefined : parsePairs(headers),
          }),
        }
      );
      const json = (await res.json()) as {
        server?: McpServer;
        error?: string;
      };
      if (!res.ok || !json.server)
        throw new Error(json.error || "Could not save the server.");
      onSaved(json.server);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Could not save the server."
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
        aria-label={editing ? "Edit MCP server" : "Connect MCP server"}
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">
              {editing ? "Edit MCP server" : "Connect MCP server"}
            </h2>
            <p className="dialog-sub">
              openFoundry starts a local process or calls a streamable HTTP
              endpoint, then stores the tool list on this computer.
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
              placeholder="filesystem-tools"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-label">Transport</span>
            <Select
              className="select"
              value={transport}
              onChange={(event) =>
                setTransport(event.target.value as "stdio" | "http" | "sse")
              }
              disabled={editing}
            >
              <option value="http">Streamable HTTP</option>
              <option value="sse">SSE (legacy remote)</option>
              <option value="stdio">Local stdio process</option>
            </Select>
          </label>
          {transport !== "stdio" ? (
            <>
              <label className="field">
                <span className="field-label">URL</span>
                <input
                  className="input mono"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  placeholder="http://127.0.0.1:3000/mcp"
                />
              </label>
              <label className="field">
                <span className="field-label">
                  Headers (KEY=VALUE, one per line)
                </span>
                <textarea
                  className="textarea mono"
                  value={headers}
                  onChange={(event) => setHeaders(event.target.value)}
                  placeholder="Authorization=Bearer ..."
                />
              </label>
            </>
          ) : (
            <>
              <label className="field">
                <span className="field-label">Command</span>
                <input
                  className="input mono"
                  value={command}
                  onChange={(event) => setCommand(event.target.value)}
                  placeholder="npx"
                />
              </label>
              <label className="field">
                <span className="field-label">Arguments (one per line)</span>
                <textarea
                  className="textarea mono"
                  value={args}
                  onChange={(event) => setArgs(event.target.value)}
                  placeholder={"-y\n@modelcontextprotocol/server-filesystem\n/Users/you/Documents"}
                />
              </label>
              <label className="field">
                <span className="field-label">
                  Environment (KEY=VALUE, one per line)
                </span>
                <textarea
                  className="textarea mono"
                  value={env}
                  onChange={(event) => setEnv(event.target.value)}
                  placeholder="OPTIONAL_TOKEN=..."
                />
              </label>
            </>
          )}
          <div className="banner">
            <Warning20Regular />
            <span>
              A stdio server runs a command on this computer with your user
              permissions. Only connect servers whose code you trust.
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
            {editing ? "Save and reconnect" : "Connect server"}
          </button>
        </div>
      </div>
    </div>
  );
}
