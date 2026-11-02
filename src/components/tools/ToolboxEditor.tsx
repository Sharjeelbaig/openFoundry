"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowLeft20Regular,
  ChevronDown20Regular,
  Copy20Regular,
  Dismiss20Regular,
  Info20Regular,
  MoreHorizontal20Regular,
  Sparkle20Regular,
  Wrench20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type {
  Guardrail,
  HttpTool,
  LocalSkill,
  McpServer,
  ToolCatalogEntry,
  Toolbox,
} from "@/lib/types";
import SelectToolDialog from "@/components/tools/SelectToolDialog";
import SelectSkillDialog from "@/components/tools/SelectSkillDialog";
import { ToolKindIcon } from "@/components/tools/ToolKindIcon";
import {
  describeToolId,
  type ToolDisplayContext,
} from "@/components/tools/tool-options";

function formatSaved(iso: string): string {
  if (!iso) return "Not saved";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "Not saved";
  return `saved ${date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    year: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  })}`;
}

function sampleFor(toolId: string | undefined): {
  name: string;
  args: Record<string, unknown>;
} {
  if (!toolId) return { name: "web_search", args: { query: "local AI" } };
  if (toolId === "web-search")
    return { name: "web_search", args: { query: "local AI" } };
  if (toolId === "calculator")
    return { name: "calculator", args: { expression: "18% of 2450" } };
  if (toolId.startsWith("mcp:"))
    return {
      name: toolId.split(":").slice(2).join(":"),
      args: { input: "hello" },
    };
  if (toolId.startsWith("http:"))
    return { name: toolId, args: { input: "hello" } };
  return { name: "web_search", args: { query: "local AI" } };
}

function codeFor(
  language: string,
  endpoint: string,
  name: string,
  args: Record<string, unknown>
): string {
  const body = JSON.stringify({ name, arguments: args }, null, 2);
  if (language === "Python") {
    return `import requests\n\nresponse = requests.post(\n    "${endpoint}",\n    json=${body.replace(/\n/g, "\n    ")},\n)\nprint(response.json()["text"])`;
  }
  if (language === "TypeScript") {
    return `const response = await fetch("${endpoint}", {\n  method: "POST",\n  headers: { "Content-Type": "application/json" },\n  body: JSON.stringify(${body.replace(/\n/g, "\n  ")}),\n});\nconst data = await response.json();\nconsole.log(data.text);`;
  }
  return `curl -X POST "${endpoint}" \\\n  -H "Content-Type: application/json" \\\n  -d '${body}'`;
}

export default function ToolboxEditor({ toolboxId }: { toolboxId?: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const editing = Boolean(toolboxId);
  const { data: toolboxData, loading: toolboxLoading, refresh: refreshToolboxes } =
    useApi<{ toolboxes: Toolbox[] }>("/api/toolboxes");
  const { data: mcpData } = useApi<{ servers: McpServer[] }>("/api/mcp", 15000);
  const { data: httpData } = useApi<{ tools: HttpTool[] }>("/api/http-tools", 15000);
  const { data: skillData } = useApi<{ tools: ToolCatalogEntry[] }>(
    "/api/tools/catalog?type=Skills"
  );
  const { data: localSkillData } = useApi<{ skills: LocalSkill[] }>("/api/skills");
  const { data: guardrailData } = useApi<{ guardrails: Guardrail[] }>(
    "/api/guardrails"
  );

  const toolboxes = toolboxData?.toolboxes ?? [];
  const servers = mcpData?.servers ?? [];
  const httpTools = httpData?.tools ?? [];
  const catalogSkills = skillData?.tools ?? [];
  const localSkills = localSkillData?.skills ?? [];
  const guardrails = guardrailData?.guardrails ?? [];
  const toolbox = toolboxId
    ? toolboxes.find((item) => item.id === toolboxId)
    : undefined;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [toolIds, setToolIds] = useState<string[]>([]);
  const [toolSearch, setToolSearch] = useState(true);
  const [guardrailId, setGuardrailId] = useState("");
  const [original, setOriginal] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [toolPicker, setToolPicker] = useState(false);
  const [skillPicker, setSkillPicker] = useState(false);
  const [menuId, setMenuId] = useState("");
  const [webNoteDismissed, setWebNoteDismissed] = useState(false);
  const [language, setLanguage] = useState("cURL");
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!editing || initialized || !toolbox) return;
    setName(toolbox.name);
    setDescription(toolbox.description);
    setToolIds(toolbox.toolIds);
    setToolSearch(toolbox.toolSearch);
    setGuardrailId(toolbox.guardrailId || "");
    setOriginal(
      JSON.stringify({
        name: toolbox.name,
        description: toolbox.description,
        toolIds: toolbox.toolIds,
        toolSearch: toolbox.toolSearch,
        guardrailId: toolbox.guardrailId || "",
      })
    );
    setInitialized(true);
  }, [editing, initialized, toolbox]);

  const dirty = useMemo(() => {
    if (!editing) return Boolean(name.trim() || toolIds.length);
    return (
      JSON.stringify({
        name,
        description,
        toolIds,
        toolSearch,
        guardrailId,
      }) !== original
    );
  }, [editing, name, description, toolIds, toolSearch, guardrailId, original]);

  const context: ToolDisplayContext = {
    servers,
    httpTools,
    localSkills,
    catalogSkills,
    toolboxes,
  };
  const included = toolIds.map((id) => describeToolId(id, context));
  const hasWebSearch = toolIds.includes("web-search");

  const endpoint = `${origin}/api/toolboxes/${toolboxId || "<id>"}/call`;
  const callableToolId = toolIds.find(
    (id) =>
      id !== "file-search" &&
      !id.startsWith("skill:") &&
      !id.startsWith("toolbox:")
  );
  const sample = sampleFor(callableToolId);
  const code = codeFor(language, endpoint, sample.name, sample.args);

  if (editing && toolboxLoading && !toolbox) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 80 }}>
          <Spinner /> Loading toolbox…
        </div>
      </div>
    );
  }

  if (editing && !toolboxLoading && !toolbox) {
    return (
      <div className="page">
        <div className="empty" style={{ paddingTop: 80 }}>
          <Wrench20Regular />
          <h2>Toolbox not found</h2>
          <p>It may have been deleted from this workspace.</p>
          <Link href="/build/tools?tab=toolboxes" className="btn btn-primary">
            Back to toolboxes
          </Link>
        </div>
      </div>
    );
  }

  const closePickers = () => {
    setToolPicker(false);
    setSkillPicker(false);
  };

  const addTools = (ids: string[]) => {
    setToolIds((current) => [...new Set([...current, ...ids])]);
    setToolPicker(false);
  };

  const addSkills = (ids: string[]) => {
    setToolIds((current) => [...new Set([...current, ...ids])]);
    setSkillPicker(false);
  };

  const removeTool = (id: string) => {
    setToolIds((current) => current.filter((item) => item !== id));
    setMenuId("");
  };

  const save = async () => {
    if (!name.trim()) {
      setError("Give the toolbox a name.");
      return;
    }
    if (!toolIds.length) {
      setError("At least one tool or one skill is required.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const res = await fetch(
        editing ? `/api/toolboxes/${encodeURIComponent(toolboxId!)}` : "/api/toolboxes",
        {
          method: editing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            description: description.trim(),
            toolIds,
            toolSearch,
            guardrailId: guardrailId || undefined,
          }),
        }
      );
      const json = (await res.json()) as { toolbox?: Toolbox; error?: string };
      if (!res.ok || !json.toolbox)
        throw new Error(json.error || "Could not save the toolbox.");
      toast(
        editing
          ? `${json.toolbox.name} saved`
          : `Toolbox ${json.toolbox.name} created`,
        "success"
      );
      if (editing) {
        refreshToolboxes();
        setOriginal(
          JSON.stringify({
            name: json.toolbox.name,
            description: json.toolbox.description,
            toolIds: json.toolbox.toolIds,
            toolSearch: json.toolbox.toolSearch,
            guardrailId: json.toolbox.guardrailId || "",
          })
        );
      } else {
        router.push(`/build/toolboxes/${encodeURIComponent(json.toolbox.id)}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the toolbox.");
    } finally {
      setSaving(false);
    }
  };

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast(`${label} copied`, "success");
    } catch {
      toast("Could not access the clipboard.", "error");
    }
  };

  return (
    <div className="page toolbox-editor-page">
      <div className="toolbox-editor-head">
        <div className="row" style={{ gap: 10, alignItems: "center", minWidth: 0 }}>
          <Link
            href="/build/tools?tab=toolboxes"
            className="icon-button"
            aria-label="Back"
          >
            <ArrowLeft20Regular />
          </Link>
          <h1 className="page-title truncate">
            {editing ? toolbox?.name || "Toolbox" : "Create toolbox"}
          </h1>
        </div>
        <div className="toolbox-editor-actions">
          {editing && toolbox && (
            <span className="toolbox-version" title="Last saved">
              v{toolbox.version || 1} {formatSaved(toolbox.updatedAt)}
            </span>
          )}
          <button
            className="btn btn-primary"
            onClick={save}
            disabled={
              saving ||
              !name.trim() ||
              toolIds.length === 0 ||
              (editing && !dirty)
            }
          >
            {saving ? <Spinner /> : null}
            {editing ? "Save" : "Create"}
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => router.push("/build/tools?tab=toolboxes")}
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="toolbox-editor-body">
        <section className="editor-section">
          <h2>Basic info</h2>
          <p className="editor-description">
            Name your toolbox and provide a description to help others understand
            its purpose.
          </p>
          <label className="field">
            <span className="field-label">
              Name <span className="required">*</span>
            </span>
            <input
              className="input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. finance-approvals"
              disabled={editing}
              autoFocus={!editing}
            />
          </label>
          <label className="field">
            <span className="field-label">Description</span>
            <textarea
              className="textarea"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Describe what this toolbox is for..."
            />
          </label>
          {editing && toolbox && (
            <p className="editor-meta">
              Last modified {new Date(toolbox.updatedAt).toLocaleString()}
            </p>
          )}
        </section>

        <section className="editor-section">
          <div className="editor-section-head">
            <h2>
              Included ({toolIds.length}) <span className="required">*</span>
            </h2>
            <div style={{ position: "relative" }}>
              <button
                className="btn btn-light add-menu-button"
                onClick={() => setAddOpen((value) => !value)}
                aria-expanded={addOpen}
              >
                <Add20Regular /> Add <ChevronDown20Regular />
              </button>
              {addOpen && (
                <>
                  <div
                    className="menu-scrim"
                    onClick={() => setAddOpen(false)}
                    aria-hidden="true"
                  />
                  <div className="menu-popover add-menu" role="menu">
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        setAddOpen(false);
                        setToolPicker(true);
                      }}
                    >
                      <Wrench20Regular /> Add tool
                    </button>
                    <button
                      className="menu-item"
                      role="menuitem"
                      onClick={() => {
                        setAddOpen(false);
                        setSkillPicker(true);
                      }}
                    >
                      <Sparkle20Regular /> Add skill{" "}
                      <span className="badge purple">Preview</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
          <p className="editor-description">
            Manage the tools and skills in this toolbox.
          </p>

          {error && error !== "At least one tool or one skill is required." && (
            <div className="editor-error">{error}</div>
          )}
          {included.length === 0 && (
            <div className="editor-error">
              At least one tool or one skill is required.
            </div>
          )}

          {included.length > 0 && hasWebSearch && !webNoteDismissed && (
            <div className="editor-callout">
              <Info20Regular />
              <span>
                Web search calls public search endpoints from this computer.
                Results are treated as untrusted context and may be incomplete.
              </span>
              <button
                className="icon-button small"
                aria-label="Dismiss"
                onClick={() => setWebNoteDismissed(true)}
              >
                <Dismiss20Regular />
              </button>
            </div>
          )}

          {included.length > 0 && (
            <div className="included-panel">
              {included.map((item) => (
                <div className="included-row" key={item.id}>
                  <span className="included-icon">
                    <ToolKindIcon tool={item} />
                  </span>
                  <span className="included-main">
                    <span className="included-id">{item.internalId}</span>
                    <span className="included-name">
                      {item.name}
                      {item.badge && (
                        <span className="badge gray">{item.badge}</span>
                      )}
                    </span>
                    <span className="included-type">{item.type}</span>
                  </span>
                  <div className="included-actions">
                    <button
                      className="icon-button small"
                      aria-label={`Actions for ${item.name}`}
                      onClick={() =>
                        setMenuId((current) =>
                          current === item.id ? "" : item.id
                        )
                      }
                    >
                      <MoreHorizontal20Regular />
                    </button>
                    {menuId === item.id && (
                      <>
                        <div
                          className="menu-scrim"
                          onClick={() => setMenuId("")}
                          aria-hidden="true"
                        />
                        <div className="menu-popover included-menu" role="menu">
                          <button
                            className="menu-item"
                            role="menuitem"
                            onClick={() => removeTool(item.id)}
                          >
                            <Dismiss20Regular /> Remove
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              ))}

              <div className="included-tool-search">
                <span className="included-tool-search-label">
                  Tool search
                  <span
                    className="included-info"
                    title="Let the agent find and choose the right tool from this toolbox during execution."
                  >
                    <Info20Regular />
                  </span>
                </span>
                <button
                  type="button"
                  role="switch"
                  className="switch"
                  aria-checked={toolSearch}
                  aria-label="Tool search"
                  onClick={() => setToolSearch((value) => !value)}
                />
              </div>
            </div>
          )}
        </section>

        <section className="editor-section">
          <h2>Guardrail</h2>
          <p className="editor-description">
            Apply a guardrail to tool calls and tool responses when this toolbox
            is used by an agent.{" "}
            <Link href="/build/guardrails" className="link">
              Create a new guardrail
            </Link>
          </p>
          <Select
            className="select"
            value={guardrailId}
            onChange={(event) => setGuardrailId(event.target.value)}
            aria-label="Guardrail"
          >
            <option value="">None</option>
            {guardrails.map((guardrail) => (
              <option key={guardrail.id} value={guardrail.id}>
                {guardrail.name}
              </option>
            ))}
          </Select>
        </section>

        {editing && (
          <section className="editor-section editor-call-section">
            <h2>Call this toolbox</h2>
            <div className="endpoint-label">
              Endpoint
              <span
                className="included-info"
                title="Call any MCP or HTTP tool in this toolbox from local code. Built-in tools are also supported."
              >
                <Info20Regular />
              </span>
            </div>
            <div className="endpoint-row">
              <input className="input mono" readOnly value={endpoint} />
              <button
                className="btn btn-secondary"
                onClick={() => void copy(endpoint, "Endpoint")}
              >
                <Copy20Regular /> Copy endpoint
              </button>
            </div>
            <p className="editor-description">
              Send a JSON body with <span className="mono">name</span> and{" "}
              <span className="mono">arguments</span>. The endpoint runs on this
              computer and has no remote authentication.
            </p>
            {callableToolId ? (
              <>
                <div className="code-sample-head">
                  <label className="field" style={{ width: 220 }}>
                    <span className="field-label">Example</span>
                    <Select
                      className="select"
                      value={language}
                      onChange={(event) => setLanguage(event.target.value)}
                    >
                      <option value="cURL">cURL</option>
                      <option value="TypeScript">TypeScript</option>
                      <option value="Python">Python</option>
                    </Select>
                  </label>
                  <button
                    className="btn btn-secondary"
                    onClick={() => void copy(code, "Code sample")}
                  >
                    <Copy20Regular /> Copy code
                  </button>
                </div>
                <pre className="code-block code-sample">{code}</pre>
              </>
            ) : (
              <div className="banner">
                <Info20Regular />
                <span>
                  This toolbox only contains skills or retrieval tools. Attach it
                  to an agent to use those; the HTTP endpoint calls MCP, HTTP and
                  built-in function tools.
                </span>
              </div>
            )}
          </section>
        )}
      </div>

      <SelectToolDialog
        open={toolPicker}
        mode="select"
        selected={toolIds.filter((id) => !id.startsWith("skill:"))}
        onClose={closePickers}
        onConfirm={addTools}
      />
      <SelectSkillDialog
        open={skillPicker}
        mode="select"
        selected={toolIds.filter((id) => id.startsWith("skill:"))}
        onClose={closePickers}
        onConfirm={addSkills}
      />
    </div>
  );
}
