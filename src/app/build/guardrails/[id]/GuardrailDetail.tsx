"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft20Regular,
  Delete20Regular,
} from "@fluentui/react-icons";
import { formatDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Spinner, StatusBadge } from "@/components/ui";
import type { Agent, Deployment, Guardrail } from "@/lib/types";

interface GuardrailsResponse {
  guardrails: Guardrail[];
  agents: Agent[];
  deployments: Deployment[];
}

export default function GuardrailDetail({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { data, loading, refresh } = useApi<GuardrailsResponse>("/api/guardrails");
  const guardrail = data?.guardrails.find((entry) => entry.id === id);
  const agents = data?.agents ?? [];
  const deployments = data?.deployments ?? [];

  const remove = async () => {
    if (!guardrail) return;
    const res = await fetch("/api/guardrails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete", id: guardrail.id }),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      toast(json.error || "Could not delete the guardrail", "error");
      return;
    }
    toast(`${guardrail.name} deleted`, "success");
    refresh();
    router.push("/build/guardrails");
  };

  if (!guardrail) {
    return (
      <div className="page">
        {loading ? (
          <div className="row" style={{ gap: 8, color: "var(--fg-3)" }}>
            <Spinner /> Loading guardrail...
          </div>
        ) : (
          <>
            <div className="banner error">Guardrail not found.</div>
            <Link href="/build/guardrails" className="btn btn-secondary mt-16">
              Back to guardrails
            </Link>
          </>
        )}
      </div>
    );
  }

  const enabled = guardrail.controls.filter((control) => control.enabled);
  const groups = new Map<string, typeof enabled>();
  for (const control of enabled) {
    const list = groups.get(control.group) || [];
    list.push(control);
    groups.set(control.group, list);
  }

  return (
    <div className="page" style={{ paddingTop: 18 }}>
      <div className="page-header">
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Link className="icon-button" href="/build/guardrails" aria-label="Back">
            <ArrowLeft20Regular />
          </Link>
          <div>
            <h1 className="page-title">{guardrail.name}</h1>
            <div className="page-subtitle row" style={{ gap: 8 }}>
              {guardrail.builtIn && <StatusBadge status="Built-in" />}
              <span>Streaming mode: {guardrail.streamingMode}</span>
              <span>·</span>
              <span>{enabled.length} controls</span>
              <span>·</span>
              <span>Updated {formatDate(guardrail.updatedAt)}</span>
            </div>
          </div>
        </div>
        {!guardrail.builtIn && (
          <div className="page-header-actions">
            <button className="btn btn-danger" onClick={remove}>
              <Delete20Regular /> Delete
            </button>
          </div>
        )}
      </div>

      <div className="kb-form">
        <section className="kb-form-section">
          <h2 className="kb-form-heading">Applied to</h2>
          <div className="facts-list">
            <div className="fact-row">
              <span>Models</span>
              <span>
                {guardrail.deployments.length
                  ? guardrail.deployments
                      .map((did) => deployments.find((d) => d.id === did)?.name || did)
                      .join(", ")
                  : "--"}
              </span>
            </div>
            <div className="fact-row">
              <span>Agents</span>
              <span>
                {guardrail.agents.length
                  ? guardrail.agents
                      .map((aid) => agents.find((a) => a.id === aid)?.name || aid)
                      .join(", ")
                  : "--"}
              </span>
            </div>
          </div>
        </section>

        <section className="kb-form-section">
          <h2 className="kb-form-heading">Controls</h2>
          {[...groups.entries()].map(([group, controls]) => (
            <div className="guardrail-group" key={group}>
              <div className="guardrail-group-head">
                {group} ({controls.length})
              </div>
              <div className="guardrail-table">
                <div className="guardrail-row head">
                  <span>Risk type</span>
                  <span>Intervention point</span>
                  <span>Action</span>
                </div>
                {controls.map((control) => (
                  <div className="guardrail-row" key={control.id}>
                    <span className="risk">{control.riskType}</span>
                    <span>{control.intervention}</span>
                    <span>{control.action}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
          {enabled.length === 0 && (
            <p className="muted">No controls are enabled on this guardrail.</p>
          )}
        </section>
      </div>
    </div>
  );
}
