"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  Add20Regular,
  ArrowDownload20Regular,
  Beaker20Regular,
  Code20Regular,
  Dismiss20Regular,
  DocumentText20Regular,
  Info20Regular,
  Play20Regular,
  Table20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { DottedObject, Spinner } from "@/components/ui";
import type { Agent, Trace } from "@/lib/types";

type Tab = "Datasets" | "Jobs";
type Source = "traces" | "agents" | "custom";

const SAMPLE = `{"messages":[{"role":"user","content":"What should I pack for a rainy hike?"},{"role":"assistant","content":"Bring a waterproof shell, quick-dry layers, and a dry bag for electronics."}]}
{"messages":[{"role":"user","content":"How do I season a cast iron pan?"},{"role":"assistant","content":"Coat it thinly with oil and bake it upside down at 450°F for an hour, then cool it slowly."}]}`;

export default function FineTunePage() {
  const { toast } = useToast();
  const { data: traceData } = useApi<{ traces: Trace[] }>("/api/traces", 10000);
  const { data: agentData } = useApi<{ agents: Agent[] }>("/api/agents");

  const traces = traceData?.traces ?? [];
  const agents = agentData?.agents ?? [];

  const [tab, setTab] = useState<Tab>("Datasets");
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState(
    `instruct-${new Date().toISOString().slice(0, 10)}`
  );
  const [source, setSource] = useState<Source>("traces");
  const [agentId, setAgentId] = useState("");
  const [custom, setCustom] = useState(SAMPLE);
  const [minLength, setMinLength] = useState(40);

  const rows = useMemo(() => {
    if (source === "agents") {
      return agents.map((agent) => ({
        messages: [
          { role: "system", content: agent.instructions },
          {
            role: "user",
            content: `Describe how ${agent.name} should respond to a new customer.`,
          },
          {
            role: "assistant",
            content: agent.instructions.slice(0, 400) || "Follow the system instructions.",
          },
        ],
      }));
    }
    if (source === "custom") {
      return custom
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean)
        .flatMap((line) => {
          try {
            const parsed = JSON.parse(line) as { messages?: unknown };
            return parsed.messages ? [parsed] : [];
          } catch {
            return [];
          }
        });
    }
    return traces
      .filter(
        (trace) =>
          !trace.error &&
          trace.response.length >= minLength &&
          (!agentId || trace.agentId === agentId)
      )
      .map((trace) => ({
        messages: [
          { role: "user", content: trace.prompt },
          { role: "assistant", content: trace.response },
        ],
      }));
  }, [source, agents, custom, traces, agentId, minLength]);

  const jsonl = rows.map((row) => JSON.stringify(row)).join("\n");

  const download = () => {
    if (!jsonl) {
      toast("No rows to export. Adjust the source or filters.", "error");
      return;
    }
    const blob = new Blob([jsonl], { type: "application/jsonl" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name || "dataset"}.jsonl`;
    anchor.click();
    URL.revokeObjectURL(url);
    toast(`Exported ${rows.length} rows to ${anchor.download}`, "success");
    setCreateOpen(false);
  };

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title">Fine-tune</h1>
          <p className="page-subtitle">
            Build instruction datasets from local runs and export them for a trainer
            you control.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
            <Add20Regular /> New dataset
          </button>
        </div>
      </div>

      <div className="tabbar mt-8">
        {(["Datasets", "Jobs"] as Tab[]).map((item) => (
          <button
            key={item}
            className={`tab${tab === item ? " active" : ""}`}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      {tab === "Datasets" && (
        <>
          <div className="banner info mt-12 mb-16">
            <Info20Regular />
            <span>
              This build does not train adapters. A fine-tune job needs a GPU training
              runtime that is not part of Foundry Local. What it can do is turn your
              real traces into a clean JSONL dataset for Ollama, MLX, Axolotl or any
              other trainer on this machine.
            </span>
          </div>

          <div className="metric-grid">
            <div className="operate-card">
              <span className="metric-label">Usable traces</span>
              <span className="metric-value">
                {traces.filter((trace) => !trace.error && trace.response.length >= 40).length}
              </span>
              <span className="metric-note">Non-empty, error-free responses</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Agents as seeds</span>
              <span className="metric-value">{agents.length}</span>
              <span className="metric-note">Instruction-derived examples</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Training runtimes</span>
              <span className="metric-value" style={{ fontSize: 18 }}>
                None detected
              </span>
              <span className="metric-note">Export and train externally</span>
            </div>
            <div className="operate-card">
              <span className="metric-label">Format</span>
              <span className="metric-value" style={{ fontSize: 18 }}>
                JSONL
              </span>
              <span className="metric-note">OpenAI messages schema</span>
            </div>
          </div>

          <div className="dataset-list">
            {[
              {
                name: "Agent run traces",
                detail: `${traces.length} recorded prompts and responses from the playground, agents and routines.`,
                source: "traces" as Source,
              },
              {
                name: "Agent instructions",
                detail: `${agents.length} agents, each converted into a system/user/assistant example.`,
                source: "agents" as Source,
              },
              {
                name: "Custom JSONL",
                detail: "Start from the sample and paste your own messages array per line.",
                source: "custom" as Source,
              },
            ].map((dataset) => (
              <div className="operate-card dataset-card" key={dataset.source}>
                <span className="kb-icon">
                  {dataset.source === "custom" ? <Code20Regular /> : <Table20Regular />}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <strong className="text-14">{dataset.name}</strong>
                  <p className="muted text-12" style={{ lineHeight: "18px" }}>
                    {dataset.detail}
                  </p>
                </div>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => {
                    setSource(dataset.source);
                    setName(
                      `${dataset.source}-${new Date().toISOString().slice(0, 10)}`
                    );
                    setAgentId(agents[0]?.id || "");
                    setCreateOpen(true);
                  }}
                >
                  Build dataset
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "Jobs" && (
        <>
          <div className="empty" style={{ paddingTop: 36 }}>
            <DottedObject />
            <h2>No fine-tune jobs</h2>
            <p>
              No local trainer is configured, so no job can be started from the portal.
              Export a dataset and run training with a tool that can use your hardware.
            </p>
            <div className="row mt-12" style={{ gap: 8 }}>
              <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
                <ArrowDownload20Regular /> Build a dataset
              </button>
              <Link href="/build/evaluations" className="btn btn-secondary">
                Evaluate a model
              </Link>
            </div>
          </div>
          <div className="manage-section-title">Bring your own trainer</div>
          <div className="endpoint-grid">
            <div className="operate-card">
              <h3 className="mb-8">Ollama</h3>
              <pre className="code-block">{`# after exporting dataset.jsonl and writing a Modelfile
ollama create my-tuned-model -f Modelfile`}</pre>
            </div>
            <div className="operate-card">
              <h3 className="mb-8">MLX (Apple Silicon)</h3>
              <pre className="code-block">{`python -m mlx_lm.lora \\
  --model <hf-model> \\
  --train \\
  --data ./data`}</pre>
            </div>
          </div>
          <div className="banner mt-16">
            <Beaker20Regular />
            <span>
              After training, register the adapter as an Ollama model. It will appear in
              Discover → Models like any other local runtime model.
            </span>
          </div>
        </>
      )}

      {createOpen && (
        <div
          className="dialog-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreateOpen(false);
          }}
        >
          <div className="dialog wide" role="dialog" aria-modal="true" aria-label="Build dataset">
            <div className="dialog-head">
              <div>
                <h2 className="dialog-title">Build instruction dataset</h2>
                <p className="dialog-sub">
                  Preview the exact lines before downloading. Nothing is uploaded.
                </p>
              </div>
              <button className="icon-button" onClick={() => setCreateOpen(false)} aria-label="Close">
                <Dismiss20Regular />
              </button>
            </div>
            <div className="dialog-body">
              <div className="form-grid">
                <label className="field">
                  <span className="field-label">Dataset name</span>
                  <input
                    className="input"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Source</span>
                  <select
                    className="select"
                    value={source}
                    onChange={(event) => setSource(event.target.value as Source)}
                  >
                    <option value="traces">Recorded traces</option>
                    <option value="agents">Agent instructions</option>
                    <option value="custom">Custom JSONL</option>
                  </select>
                </label>
              </div>

              {source === "traces" && (
                <div className="form-grid">
                  <label className="field">
                    <span className="field-label">Agent</span>
                    <select
                      className="select"
                      value={agentId}
                      onChange={(event) => setAgentId(event.target.value)}
                    >
                      <option value="">All agents</option>
                      {agents.map((agent) => (
                        <option key={agent.id} value={agent.id}>
                          {agent.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-label">Minimum response length</span>
                    <input
                      className="input"
                      type="number"
                      min={0}
                      value={minLength}
                      onChange={(event) => setMinLength(Number(event.target.value))}
                    />
                  </label>
                </div>
              )}

              {source === "custom" && (
                <label className="field">
                  <span className="field-label">JSONL</span>
                  <textarea
                    className="textarea mono"
                    style={{ minHeight: 170, fontSize: 12 }}
                    value={custom}
                    onChange={(event) => setCustom(event.target.value)}
                  />
                  <span className="field-hint">
                    One JSON object per line with a messages array. Invalid lines are
                    skipped.
                  </span>
                </label>
              )}

              <div className="row between">
                <span className="field-label" style={{ margin: 0 }}>
                  Preview · {rows.length} rows
                </span>
                <span className="muted text-12">{jsonl.length.toLocaleString()} characters</span>
              </div>
              <pre className="code-block" style={{ maxHeight: 220 }}>
                {jsonl || "No rows match the current source and filters."}
              </pre>
              {source === "traces" && rows.length === 0 && (
                <div className="banner">
                  <Play20Regular />
                  <span>
                    Run a prompt in the{" "}
                    <Link href="/playground" className="link">
                      playground
                    </Link>{" "}
                    to create traces, or use the agent-instructions source.
                  </span>
                </div>
              )}
            </div>
            <div className="dialog-footer">
              <button className="btn btn-secondary" onClick={() => setCreateOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" onClick={download} disabled={rows.length === 0}>
                <ArrowDownload20Regular /> Download JSONL
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="table-footer">
        <span className="row" style={{ gap: 6 }}>
          <DocumentText20Regular /> Datasets are generated in your browser
        </span>
        <span className="muted">
          Last trace {traces[0] ? formatDate(traces[0].at) : "—"}
        </span>
      </div>
    </div>
  );
}
