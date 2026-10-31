"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Checkmark16Filled, ChevronDown20Regular } from "@fluentui/react-icons";
import { ModelLogo } from "@/components/Logos";
import type { Deployment, LocalModel } from "@/lib/types";

/**
 * The agent model picker, matching Microsoft Foundry's playground control:
 * a `Model:` combobox that opens a grouped listbox with a Deployments group, a
 * Models group and a trailing "Browse more models" row.
 *
 * The split is real, not cosmetic: Deployments lists the deployments this
 * computer serves (each one resolves to the local model behind it), and Models
 * lists every installed model that can answer a chat (Ollama, Foundry Local,
 * ...). Choosing either one maps back to a single model key the playground runs.
 */

export interface ModelSelectProps {
  deployments: Deployment[];
  models: LocalModel[];
  value: string;
  onChange: (modelKey: string) => void;
  onBrowseMore?: () => void;
  label?: string;
}

export default function ModelSelect({
  deployments,
  models,
  value,
  onChange,
  onBrowseMore,
  label = "Model:",
}: ModelSelectProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const current = useMemo(() => models.find((m) => m.key === value), [models, value]);

  /** Installed models that can hold a conversation. */
  const chatModels = useMemo(
    () => models.filter((m) => m.cached && (m.task === "chat" || m.task === "vision")),
    [models]
  );

  /** Each deployment, resolved to the local model that backs it. */
  const deploymentRows = useMemo(
    () =>
      deployments.map((deployment) => ({
        deployment,
        model:
          models.find((m) => m.id === deployment.modelId) ||
          models.find((m) => m.name === deployment.modelName) ||
          models.find((m) => m.key === `${deployment.provider}:${deployment.modelId}`),
      })),
    [deployments, models]
  );

  const currentDeployment = useMemo(
    () => deploymentRows.find((row) => row.model?.key === value)?.deployment,
    [deploymentRows, value]
  );

  useEffect(() => {
    if (!open) return;
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (key: string) => {
    onChange(key);
    setOpen(false);
  };

  const badge = currentDeployment
    ? `${currentDeployment.sku} deployment`
    : current?.providerLabel;

  return (
    <div className="model-select" ref={rootRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-label={label}
        className="model-select-trigger"
        onClick={() => setOpen((o) => !o)}
      >
        <span className="model-select-trigger-content">
          <span className="model-select-label">{label}</span>
          <span className="model-select-value" title={current?.displayName}>
            {current?.displayName || "Select a model"}
          </span>
          {badge && <span className="model-select-badge">{badge}</span>}
        </span>
        <ChevronDown20Regular className="model-select-chevron" />
      </button>

      {open && (
        <div className="model-select-popover" role="listbox" aria-label={label}>
          {deploymentRows.length > 0 && (
            <div role="group" className="model-select-group">
              <span role="presentation" className="model-select-group-label">
                Deployments
              </span>
              {deploymentRows.map(({ deployment, model }) => {
                const selected = Boolean(model && model.key === value);
                return (
                  <div
                    key={deployment.id}
                    role="option"
                    aria-selected={selected}
                    className={`model-select-option model-select-option-deployment${
                      selected ? " selected" : ""
                    }${model ? "" : " disabled"}`}
                    onClick={() => model && choose(model.key)}
                  >
                    <span className="model-select-check">
                      {selected && <Checkmark16Filled />}
                    </span>
                    <ModelLogo
                      publisher={model?.publisher || deployment.providerLabel}
                      name={deployment.modelName}
                      size={16}
                    />
                    <span className="model-select-option-text">{deployment.name}</span>
                  </div>
                );
              })}
            </div>
          )}

          {chatModels.length > 0 && (
            <div role="group" className="model-select-group">
              <span role="presentation" className="model-select-group-label">
                Models
              </span>
              {chatModels.map((model) => {
                const selected = model.key === value;
                return (
                  <div
                    key={model.key}
                    role="option"
                    aria-selected={selected}
                    className={`model-select-option${selected ? " selected" : ""}`}
                    onClick={() => choose(model.key)}
                  >
                    <span className="model-select-check">
                      {selected && <Checkmark16Filled />}
                    </span>
                    <ModelLogo
                      publisher={model.publisher}
                      name={model.displayName}
                      size={16}
                    />
                    <span className="model-select-option-text">{model.displayName}</span>
                  </div>
                );
              })}
            </div>
          )}

          {onBrowseMore && (
            <div
              role="option"
              aria-selected={false}
              className="model-select-option model-select-browse"
              onClick={() => {
                setOpen(false);
                onBrowseMore();
              }}
            >
              <span className="model-select-check" />
              Browse more models
            </div>
          )}
        </div>
      )}
    </div>
  );
}
