// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";
import Select from "@/components/Select";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  ArrowLeft20Regular,
  ChevronDown20Regular,
  Info20Regular,
} from "@fluentui/react-icons";
import { formatShortDate, useApi } from "@/lib/client";
import { useToast } from "@/components/Toast";
import { Field, Spinner } from "@/components/ui";
import type { Agent, Deployment, Guardrail, GuardrailControl } from "@/lib/types";

interface GuardrailsResponse {
  guardrails: Guardrail[];
  agents: Agent[];
  deployments: Deployment[];
}

const GROUP_ORDER = [
  "Jailbreak",
  "Network",
  "Indirect prompt injections",
  "Content harms",
  "Protected materials",
  "Sensitive data leakage",
  "Task drift",
];

const GROUP_HINT: Record<string, string> = {
  Network:
    "Network controls only apply to hosted agents. Prompt-based agents and models won't be affected by these settings.",
};

export default function GuardrailCreatePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { data } = useApi<GuardrailsResponse>("/api/guardrails");
  const template = useMemo(
    () => data?.guardrails?.[0]?.controls ?? [],
    [data?.guardrails]
  );
  const agents = data?.agents ?? [];
  const deployments = data?.deployments ?? [];

  const [step, setStep] = useState(1);
  const [name, setName] = useState("");
  const [streamingMode, setStreamingMode] =
    useState<Guardrail["streamingMode"]>("Default");
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [selectedDeployments, setSelectedDeployments] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [overrides, setOverrides] = useState<
    Record<string, { enabled?: boolean; action?: string }>
  >({});
  const [busy, setBusy] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<string, GuardrailControl[]>();
    for (const control of template) {
      const list = map.get(control.group) || [];
      list.push(control);
      map.set(control.group, list);
    }
    return [...map.entries()].sort(
      (a, b) => GROUP_ORDER.indexOf(a[0]) - GROUP_ORDER.indexOf(b[0])
    );
  }, [template]);

  const isEnabled = (control: GuardrailControl) =>
    overrides[control.id]?.enabled ?? control.defaulted;

  const actionFor = (control: GuardrailControl) =>
    overrides[control.id]?.action ?? control.action;

  const setControl = (
    control: GuardrailControl,
    patch: { enabled?: boolean; action?: string }
  ) =>
    setOverrides((current) => ({
      ...current,
      [control.id]: { ...current[control.id], ...patch },
    }));

  const toggleGroup = (controls: GuardrailControl[], enabled: boolean) => {
    setOverrides((current) => {
      const next = { ...current };
      for (const control of controls) {
        if (control.defaulted) continue;
        next[control.id] = { ...next[control.id], enabled };
      }
      return next;
    });
  };

  const activeControls = template
    .filter((control) => isEnabled(control))
    .map((control) => ({ ...control, action: actionFor(control) }));

  const toggle = (list: string[], set: (value: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((entry) => entry !== id) : [...list, id]);

  const create = async () => {
    if (!name.trim()) {
      toast("Give the guardrail a name", "error");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/guardrails", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create",
          name: name.trim(),
          streamingMode,
          controls: activeControls,
          agents: selectedAgents,
          deployments: selectedDeployments,
        }),
      });
      const json = (await res.json()) as { guardrail?: Guardrail; error?: string };
      if (!res.ok || !json.guardrail)
        throw new Error(json.error || "Could not create the guardrail");
      toast("Guardrail created", "success");
      router.push("/build/guardrails");
    } catch (error) {
      toast(error instanceof Error ? error.message : "Create failed", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: 18, paddingBottom: 120 }}>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="row" style={{ gap: 10, alignItems: "center" }}>
          <Link className="icon-button" href="/build/guardrails" aria-label="Back">
            <ArrowLeft20Regular />
          </Link>
          <h1 className="page-title">Create guardrail</h1>
        </div>
      </div>

      <div className="guardrail-wizard">
        {step === 1 && (
          <>
            <p className="guardrail-intro">
              A guardrail is a collection of controls assigned to specific agents or
              models. Select and configure controls to add them to your guardrail.
              Some controls are added by default and may not be removed from your
              guardrail.
            </p>

            {grouped.map(([group, controls]) => {
              const open = !collapsed[group];
              const enabledCount = controls.filter(isEnabled).length;
              return (
                <div className="guardrail-group" key={group}>
                  <button
                    className="guardrail-group-head"
                    onClick={() =>
                      setCollapsed((current) => ({ ...current, [group]: open }))
                    }
                    aria-expanded={open}
                  >
                    <ChevronDown20Regular
                      style={{ transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}
                    />
                    {group} ({enabledCount}) <Info20Regular className="info-icon" />
                  </button>
                  {open && (
                    <>
                      {GROUP_HINT[group] && (
                        <div className="guardrail-error">
                          <Info20Regular />
                          <span>{GROUP_HINT[group]}</span>
                        </div>
                      )}
                      <div className="guardrail-table">
                        <div className="guardrail-row head">
                          <input
                            type="checkbox"
                            aria-label={`Select all ${group} controls`}
                            checked={
                              controls.every(isEnabled) &&
                              controls.some((control) => !control.defaulted)
                            }
                            onChange={(event) =>
                              toggleGroup(controls, event.target.checked)
                            }
                          />
                          <span>Risk type</span>
                          <span>Intervention point</span>
                          <span>Action</span>
                        </div>
                        {controls.map((control) => (
                          <div className="guardrail-row" key={control.id}>
                            <input
                              type="checkbox"
                              aria-label={control.riskType}
                              checked={isEnabled(control)}
                              disabled={control.defaulted}
                              onChange={(event) =>
                                setControl(control, { enabled: event.target.checked })
                              }
                            />
                            <span className="risk">
                              {control.riskType}
                              {control.defaulted && " *"}
                              {control.severity && (
                                <div>
                                  <div className="slider-track">
                                    <input
                                      type="range"
                                      min={0}
                                      max={2}
                                      defaultValue={1}
                                      aria-label={`${control.riskType} severity`}
                                    />
                                  </div>
                                  <span className="muted text-12">
                                    {control.severity}
                                  </span>
                                </div>
                              )}
                            </span>
                            <span>{control.intervention}</span>
                            {control.id === "egress-rules" ? (
                              <span className="row" style={{ gap: 8 }}>
                                <button className="btn btn-sm btn-outline">Add rules</button>
                                <Select className="select" value={actionFor(control)} disabled>
                                  <option>Deny</option>
                                </Select>
                              </span>
                            ) : (
                              <Select
                                className="select"
                                value={actionFor(control)}
                                onChange={(event) =>
                                  setControl(control, { action: event.target.value })
                                }
                              >
                                {[
                                  "Block",
                                  "On",
                                  "Off",
                                  "Deny",
                                  "Redact",
                                  "Mask",
                                  "Hash",
                                ].includes(actionFor(control)) ? null : (
                                  <option>{actionFor(control)}</option>
                                )}
                                <option>Block</option>
                                <option>On</option>
                                <option>Off</option>
                                {control.id === "pii" && (
                                  <>
                                    <option>Redact</option>
                                    <option>Mask</option>
                                    <option>Hash</option>
                                  </>
                                )}
                              </Select>
                            )}
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </>
        )}

        {step === 2 && (
          <>
            <p className="guardrail-intro">
              Select which agents and models you want this guardrail to be applied to.
            </p>

            <div className="guardrail-review-title">Agents</div>
            <div className="guardrail-pick">
              <div className="guardrail-pick-row head">
                <span />
                <span>Name</span>
                <span>Version</span>
                <span>Type</span>
                <span>Created</span>
              </div>
              {agents.map((agent) => (
                <div className="guardrail-pick-row" key={agent.id}>
                  <input
                    type="checkbox"
                    aria-label={agent.name}
                    checked={selectedAgents.includes(agent.id)}
                    onChange={() => toggle(selectedAgents, setSelectedAgents, agent.id)}
                  />
                  <span className="cell-strong">{agent.name}</span>
                  <span>v{agent.version}</span>
                  <span>Single agent</span>
                  <span>{formatShortDate(agent.createdAt)}</span>
                </div>
              ))}
              {agents.length === 0 && (
                <div className="guardrail-pick-row muted">No agents in this project.</div>
              )}
            </div>

            <div className="guardrail-review-title">Models</div>
            <div className="guardrail-pick">
              <div className="guardrail-pick-row head">
                <span />
                <span>Deployment name</span>
                <span>Model version</span>
                <span>Model</span>
                <span>Created</span>
              </div>
              {deployments.map((deployment) => (
                <div className="guardrail-pick-row" key={deployment.id}>
                  <input
                    type="checkbox"
                    aria-label={deployment.name}
                    checked={selectedDeployments.includes(deployment.id)}
                    onChange={() =>
                      toggle(selectedDeployments, setSelectedDeployments, deployment.id)
                    }
                  />
                  <span className="cell-strong">{deployment.name}</span>
                  <span>{deployment.modelVersion || "--"}</span>
                  <span>{deployment.modelName}</span>
                  <span>{formatShortDate(deployment.createdAt)}</span>
                </div>
              ))}
              {deployments.length === 0 && (
                <div className="guardrail-pick-row muted">No deployments yet.</div>
              )}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p className="guardrail-intro">
              Give it a descriptive name, verify your control and assignment
              settings, then create your guardrail.
            </p>
            <div className="guardrail-review">
              <Field label="Guardrail name" required>
                <input
                  className="input"
                  placeholder="guardrail-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </Field>
              <label className="field">
                <span className="field-label">Streaming mode</span>
                <Select
                  className="select"
                  value={streamingMode}
                  onChange={(event) =>
                    setStreamingMode(event.target.value as Guardrail["streamingMode"])
                  }
                >
                  <option value="Default">Default</option>
                  <option value="Off">Off</option>
                </Select>
              </label>
              <div className="guardrail-review-block">
                <div className="guardrail-review-title">Models</div>
                <span className="muted">
                  {selectedDeployments.length
                    ? selectedDeployments
                        .map(
                          (id) =>
                            deployments.find((d) => d.id === id)?.name || id
                        )
                        .join(", ")
                    : "No models selected"}
                </span>
              </div>
              <div className="guardrail-review-block">
                <div className="guardrail-review-title">Agents</div>
                <span className="muted">
                  {selectedAgents.length
                    ? selectedAgents
                        .map((id) => agents.find((a) => a.id === id)?.name || id)
                        .join(", ")
                    : "No agents selected"}
                </span>
              </div>
              <div className="guardrail-review-block">
                <div className="guardrail-review-title">Controls</div>
                {activeControls.length === 0 ? (
                  <span className="muted">No controls selected</span>
                ) : (
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Risk type</th>
                        <th>Intervention point</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activeControls.map((control) => (
                        <tr key={control.id}>
                          <td className="cell-strong">{control.riskType}</td>
                          <td>{control.intervention}</td>
                          <td>{control.action}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <div className="guardrail-steps">
        <span className={`guardrail-step${step === 1 ? " active" : ""}`}>
          <span className="guardrail-step-num">1</span> Add controls
        </span>
        <span className={`guardrail-step${step === 2 ? " active" : ""}`}>
          <span className="guardrail-step-num">2</span> Select agents and models
        </span>
        <span className={`guardrail-step${step === 3 ? " active" : ""}`}>
          <span className="guardrail-step-num">3</span> Review
        </span>
        <div className="guardrail-steps-actions">
          {step > 1 && (
            <button className="btn btn-secondary" onClick={() => setStep(step - 1)}>
              Back
            </button>
          )}
          {step < 3 ? (
            <button className="btn btn-primary" onClick={() => setStep(step + 1)}>
              Next
            </button>
          ) : (
            <button className="btn btn-primary" disabled={busy} onClick={create}>
              {busy && <Spinner />} Create
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
