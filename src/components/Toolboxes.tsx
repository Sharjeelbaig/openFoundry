"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Add20Regular,
  Dismiss20Regular,
  Sparkle20Regular,
} from "@fluentui/react-icons";
import { useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Guardrail, Toolbox } from "@/lib/types";

interface ToolboxesProps {
  agents?: unknown[];
}

export default function Toolboxes({}: ToolboxesProps) {
  const { toast } = useToast();
  const { data, refresh, loading } = useApi<{ toolboxes: Toolbox[] }>(
    "/api/toolboxes",
    10000
  );
  const { data: guardrailData } = useApi<{ guardrails: Guardrail[] }>(
    "/api/guardrails"
  );
  const toolboxes = data?.toolboxes ?? [];
  const guardrails = guardrailData?.guardrails ?? [];
  const [busyId, setBusyId] = useState("");

  const guardrailName = (id?: string) =>
    id ? guardrails.find((item) => item.id === id)?.name || "Guardrail" : "None";

  const remove = async (toolbox: Toolbox) => {
    if (!window.confirm(`Remove toolbox "${toolbox.name}"?`)) return;
    setBusyId(toolbox.id);
    try {
      const res = await fetch(`/api/toolboxes/${encodeURIComponent(toolbox.id)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Delete failed.");
      refresh();
      toast(`${toolbox.name} removed`, "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Delete failed.", "error");
    } finally {
      setBusyId("");
    }
  };

  return (
    <section>
      <div className="page-header" style={{ marginBottom: 8 }}>
        <div>
          <h2 className="page-title" style={{ fontSize: 20 }}>
            Toolboxes
          </h2>
          <p className="page-subtitle">
            Bundle your tools, skills and agents into one governed endpoint. Tool
            search can reduce token use when the agent runs.
          </p>
        </div>
        <div className="page-header-actions">
          <Link href="/build/tools/createToolbox" className="btn btn-primary">
            <Add20Regular /> Create toolbox
          </Link>
        </div>
      </div>

      <div className="tool-comparison mt-16">
        <div className="operate-card">
          <strong className="text-14">Individual Tools</strong>
          <p className="muted text-13" style={{ margin: "6px 0 10px" }}>
            Based on an average of 600+ tools
          </p>
          <div className="facts-list">
            <div className="fact-row">
              <span>Input tokens per call</span>
              <span>313k+</span>
            </div>
            <div className="fact-row">
              <span>Tool selection accuracy</span>
              <span>48.2%</span>
            </div>
          </div>
        </div>
        <div className="operate-card">
          <strong className="text-14">Toolbox</strong>
          <p className="muted text-13" style={{ margin: "6px 0 10px" }}>
            Based on an average of 600+ tools with tool search
          </p>
          <div className="facts-list">
            <div className="fact-row">
              <span>Input tokens per call</span>
              <span>18k</span>
            </div>
            <div className="fact-row">
              <span>Tool selection accuracy</span>
              <span>94%</span>
            </div>
          </div>
        </div>
      </div>

      {loading && toolboxes.length === 0 ? (
        <div className="empty" style={{ paddingTop: 40 }}>
          <Spinner /> Loading toolboxes…
        </div>
      ) : toolboxes.length === 0 ? (
        <div className="empty" style={{ paddingTop: 40 }}>
          <Sparkle20Regular />
          <h2>No toolboxes yet</h2>
          <p>
            Bundle tools, skills and agents into one governed endpoint. Tool
            search can reduce token use when the agent runs.
          </p>
          <Link href="/build/tools/createToolbox" className="btn btn-primary">
            <Add20Regular /> Create toolbox
          </Link>
        </div>
      ) : (
        <div className="tool-detail-grid" style={{ marginTop: 16 }}>
          {toolboxes.map((toolbox) => (
            <div className="operate-card tool-detail-card" key={toolbox.id}>
              <div className="row between">
                <span className="row" style={{ gap: 10 }}>
                  <span className="kb-icon">
                    <Sparkle20Regular />
                  </span>
                  <span>
                    <strong className="text-14">{toolbox.name}</strong>
                    <div className="muted text-12">
                      {toolbox.toolIds.length} tools ·{" "}
                      {toolbox.toolSearch ? "Tool search on" : "Tool search off"}
                    </div>
                  </span>
                </span>
                <span
                  className={`badge ${toolbox.toolSearch ? "green" : "gray"}`}
                >
                  {toolbox.toolSearch ? "Recommended" : "Manual"}
                </span>
              </div>
              {toolbox.description && (
                <p className="text-13 muted" style={{ lineHeight: "20px" }}>
                  {toolbox.description}
                </p>
              )}
              <div className="facts-list">
                <div className="fact-row">
                  <span>Guardrail</span>
                  <span>{guardrailName(toolbox.guardrailId)}</span>
                </div>
                <div className="fact-row">
                  <span>Created</span>
                  <span>
                    {new Date(toolbox.createdAt).toLocaleDateString()}
                  </span>
                </div>
              </div>
              <div className="row mt-8" style={{ gap: 8, flexWrap: "wrap" }}>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => void remove(toolbox)}
                  disabled={busyId === toolbox.id}
                >
                  <Dismiss20Regular /> Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
