// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  Add20Regular,
  ArrowDownload20Regular,
  ArrowLeft20Regular,
  Code20Regular,
  Copy20Regular,
  Dismiss20Regular,
  Document20Regular,
  Eye20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type {
  Agent,
  LocalModel,
  ToolCatalogEntry,
  ToolSetup,
} from "@/lib/types";

interface SkillDetailProps {
  entry: ToolCatalogEntry;
  setup?: ToolSetup;
}

function inline(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
  let last = 0;
  let match: RegExpExecArray | null;
  let key = 0;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const token = match[0];
    if (token.startsWith("**")) {
      nodes.push(<strong key={key++}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("`")) {
      nodes.push(<code key={key++}>{token.slice(1, -1)}</code>);
    } else {
      const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (link)
        nodes.push(
          <a key={key++} href={link[2]} target="_blank" rel="noreferrer">
            {link[1]}
          </a>
        );
      else nodes.push(token);
    }
    last = pattern.lastIndex;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

function isBlockStart(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.startsWith("#") ||
    trimmed.startsWith("```") ||
    trimmed.startsWith("|") ||
    trimmed.startsWith(">") ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed)
  );
}

function Markdown({ text }: { text: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;
  let key = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.trim().startsWith("```")) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push(
        <pre key={key++} className="skill-code-block">
          <code>{code.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      const level = Math.min(6, heading[1].length);
      const Tag = (`h${level}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6");
      blocks.push(<Tag key={key++}>{inline(heading[2])}</Tag>);
      index += 1;
      continue;
    }

    if (line.trim().startsWith("|")) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].trim().startsWith("|")) {
        const cells = lines[index]
          .trim()
          .replace(/^\|/, "")
          .replace(/\|$/, "")
          .split("|")
          .map((cell) => cell.trim());
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      if (rows.length) {
        const [head, ...body] = rows;
        blocks.push(
          <table key={key++}>
            <thead>
              <tr>
                {head.map((cell, cellIndex) => (
                  <th key={cellIndex}>{inline(cell)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex}>
                  {row.map((cell, cellIndex) => (
                    <td key={cellIndex}>{inline(cell)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        );
      }
      continue;
    }

    if (/^\s*[-*+]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*[-*+]\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*[-*+]\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ul key={key++}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </ul>
      );
      continue;
    }

    if (/^\s*\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\s*\d+\.\s+/.test(lines[index])) {
        items.push(lines[index].replace(/^\s*\d+\.\s+/, ""));
        index += 1;
      }
      blocks.push(
        <ol key={key++}>
          {items.map((item, itemIndex) => (
            <li key={itemIndex}>{inline(item)}</li>
          ))}
        </ol>
      );
      continue;
    }

    if (line.trim().startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].trim().startsWith(">")) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push(<blockquote key={key++}>{inline(quote.join(" "))}</blockquote>);
      continue;
    }

    const paragraph: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !isBlockStart(lines[index])
    ) {
      paragraph.push(lines[index]);
      index += 1;
    }
    blocks.push(<p key={key++}>{inline(paragraph.join(" "))}</p>);
  }

  return <div className="skill-markdown">{blocks}</div>;
}

export default function SkillDetail({ entry, setup }: SkillDetailProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [view, setView] = useState<"Preview" | "Code">("Code");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState(`${entry.name}-agent`);
  const [modelKey, setModelKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");
  const { data: modelData } = useApi<{ models: LocalModel[] }>("/api/models");
  const models = (modelData?.models ?? []).filter(
    (model) => model.task === "chat"
  );
  const selectedModel =
    models.find((model) => model.key === modelKey) || models[0];
  const instructions = entry.instructions || entry.description;
  const filename = `${entry.name}.md`;

  useEffect(() => {
    if (!modelKey && models[0]) setModelKey(models[0].key);
  }, [models, modelKey]);

  const release = entry.releaseDate
    ? new Date(entry.releaseDate).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "—";
  const authMethodLabels = [
    ...new Set(
      (setup?.authMethods || [])
        .filter((method) => method.type !== "none")
        .map((method) => method.label)
    ),
  ];
  const auth = authMethodLabels.length
    ? authMethodLabels.join(", ")
    : "Unauthenticated";

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(instructions);
      toast("Skill file copied", "success");
    } catch {
      toast("Could not copy the skill file", "error");
    }
  };

  const download = () => {
    const blob = new Blob([instructions], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const create = async () => {
    if (!selectedModel) {
      setError("Choose a chat model first.");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: `Agent using the ${entry.name} local skill.`,
          model: selectedModel.id,
          provider: selectedModel.provider,
          instructions:
            "Use the attached local skill when it is relevant. Follow the skill instructions and translate cloud-only steps to the local workspace.",
          tools: [`skill:${entry.id}`],
        }),
      });
      const json = (await res.json()) as { agent?: Agent; error?: string };
      if (!res.ok || !json.agent)
        throw new Error(json.error || "Could not create the agent.");
      toast(`Agent ${json.agent.name} created`, "success");
      router.push(`/build/agents/${encodeURIComponent(json.agent.id)}/build`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the agent.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="skill-detail-head">
        <div className="row" style={{ gap: 10, minWidth: 0 }}>
          <Link href="/discover/tools" className="icon-button" aria-label="Back to tools">
            <ArrowLeft20Regular />
          </Link>
          <span className="skill-detail-mark">
            <Document20Regular />
          </span>
          <h1 className="page-title" style={{ margin: 0 }}>
            {entry.name}
          </h1>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <Add20Regular /> Create
        </button>
      </div>

      <div className="skill-detail-layout">
        <section className="skill-preview-card">
          <div className="skill-preview-head">
            <strong>Skill preview</strong>
            <div className="segmented">
              <button
                className={view === "Preview" ? "active" : ""}
                onClick={() => setView("Preview")}
              >
                <Eye20Regular /> Preview
              </button>
              <button
                className={view === "Code" ? "active" : ""}
                onClick={() => setView("Code")}
              >
                <Code20Regular /> Code
              </button>
            </div>
          </div>
          <div className="skill-preview-body">
            <aside className="skill-tree">
              <div className="skill-tree-root">{entry.name}</div>
              <div className="skill-tree-item active">
                <Document20Regular />
                <span>{filename}</span>
              </div>
            </aside>
            <div className="skill-file">
              <div className="skill-file-head">
                <span className="row" style={{ gap: 8 }}>
                  <Document20Regular />
                  <strong className="text-13">{filename}</strong>
                </span>
                <span className="row" style={{ gap: 4 }}>
                  <button
                    className="icon-button small"
                    onClick={() => void copy()}
                    aria-label="Copy skill file"
                    title="Copy"
                  >
                    <Copy20Regular />
                  </button>
                  <button
                    className="icon-button small"
                    onClick={download}
                    aria-label="Download skill file"
                    title="Download"
                  >
                    <ArrowDownload20Regular />
                  </button>
                </span>
              </div>
              <div className="skill-file-body">
                {view === "Code" ? (
                  <pre className="skill-code">{instructions}</pre>
                ) : (
                  <Markdown text={instructions} />
                )}
              </div>
            </div>
          </div>
        </section>

        <aside className="skill-detail-side">
          <div className="operate-card skill-facts">
            <h2 className="text-16" style={{ marginTop: 0 }}>
              Quick facts
            </h2>
            <div className="facts-list">
              <div className="fact-row">
                <span>Type</span>
                <span>Skills</span>
              </div>
              <div className="fact-row">
                <span>Publisher</span>
                <span>{entry.company || "Microsoft"}</span>
              </div>
              <div className="fact-row">
                <span>Release date</span>
                <span>{release}</span>
              </div>
              <div className="fact-row">
                <span>Lifecycle</span>
                <span>Preview</span>
              </div>
              <div className="fact-row">
                <span>Authentication</span>
                <span>{auth}</span>
              </div>
            </div>
          </div>
          {entry.docs.length > 0 && (
            <div className="operate-card skill-facts">
              <h2 className="text-16" style={{ marginTop: 0 }}>
                Reference
              </h2>
              <div className="stack" style={{ gap: 6 }}>
                {entry.docs.map((doc) => (
                  <a
                    className="link text-13"
                    key={doc.url}
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {doc.title}
                  </a>
                ))}
              </div>
            </div>
          )}
          <div className="banner">
            <Sparkle20Regular />
            <span>
              This page previews an original local adaptation, not the vendor&apos;s
              official skill file. The skill runs as agent instructions on this
              computer; no cloud skill service is invoked. The skill and company
              names identify the source and imply no endorsement.
            </span>
          </div>
        </aside>
      </div>

      {createOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !creating)
              setCreateOpen(false);
          }}
        >
          <div className="dialog" role="dialog" aria-modal="true" aria-label="Create an agent with this skill">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Create an agent</h2>
                <p className="dialog-sub">
                  The {entry.name} skill is attached as local instructions.
                </p>
              </div>
              <button
                className="icon-button"
                onClick={() => setCreateOpen(false)}
                aria-label="Close"
              >
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <label className="field">
                <span className="field-label">Agent name</span>
                <input
                  className="input"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  autoFocus
                />
              </label>
              <label className="field">
                <span className="field-label">Chat model</span>
                <Select
                  className="select"
                  value={modelKey}
                  onChange={(event) => setModelKey(event.target.value)}
                >
                  {models.map((model) => (
                    <option key={model.key} value={model.key}>
                      {model.displayName} · {model.providerLabel}
                    </option>
                  ))}
                </Select>
              </label>
              {models.length === 0 && (
                <div className="banner error">
                  No chat model is available. Connect a local runtime and discover
                  a model first.
                </div>
              )}
              <div className="banner">
                <Sparkle20Regular />
                <span>
                  The agent receives <span className="mono">{filename}</span> as a
                  local skill. The file and the agent stay on this computer.
                </span>
              </div>
              {error && <div className="banner error">{error}</div>}
            </div>
            <div className="dialog-footer">
              <button
                className="btn btn-secondary"
                onClick={() => setCreateOpen(false)}
                disabled={creating}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary"
                onClick={() => void create()}
                disabled={creating || !selectedModel || !name.trim()}
              >
                {creating ? <Spinner /> : <Add20Regular />} Create agent
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
