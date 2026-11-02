"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Checkmark16Filled, ChevronDown20Regular } from "@fluentui/react-icons";
import {
  deploymentLayerFor,
  deploymentTypesByLayer,
  type DeploymentLayer,
} from "@/lib/deployment-types";

/**
 * The deployment-type picker, built as a custom combobox in the same style as
 * the agent builder's model picker. Types are grouped into three layers —
 * local, simulate a production deployment, and cloud-only — so the picker
 * leads with what actually runs on this computer instead of a flat Foundry SKU
 * list.
 *
 * The popover is portalled to the body and positioned with fixed coordinates
 * because the deploy drawer body scrolls; an absolutely positioned list would
 * be clipped inside it.
 */

export interface DeploymentTypeSelectProps {
  value: string;
  onChange: (label: string) => void;
  label?: string;
}

const LAYER_BADGE: Record<DeploymentLayer, string> = {
  local: "Local",
  simulate: "Simulated",
  export: "Cloud-only",
};

interface PopoverRect {
  top: number;
  left: number;
  width: number;
}

export default function DeploymentTypeSelect({
  value,
  onChange,
  label = "Deployment type",
}: DeploymentTypeSelectProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<PopoverRect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const groups = useMemo(() => deploymentTypesByLayer(), []);
  const allTypes = useMemo(() => groups.flatMap((group) => group.types), [groups]);
  const current = allTypes.find((type) => type.label === value) ?? allTypes[0];
  const currentLayer = current ? deploymentLayerFor(current) : "local";

  const measure = useCallback(() => {
    const el = rootRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setRect({ top: box.bottom + 4, left: box.left, width: box.width });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [open, measure]);

  const choose = (typeLabel: string) => {
    onChange(typeLabel);
    setOpen(false);
  };

  return (
    <div className="deployment-type-select" ref={rootRef}>
      <button
        type="button"
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? "deployment-type-listbox" : undefined}
        aria-label={label}
        className="deployment-type-trigger"
        onClick={() => {
          if (!open) measure();
          setOpen((o) => !o);
        }}
      >
        <span className="deployment-type-trigger-content">
          <span className="deployment-type-value" title={current?.label}>
            {current?.label || "Select a type"}
          </span>
          {current && (
            <span className={`deployment-type-badge layer-${currentLayer}`}>
              {LAYER_BADGE[currentLayer]}
            </span>
          )}
        </span>
        <ChevronDown20Regular className="deployment-type-chevron" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            id="deployment-type-listbox"
            className="deployment-type-popover"
            role="listbox"
            aria-label={label}
            style={{ top: rect.top, left: rect.left, width: rect.width }}
          >
            {groups.map((group) => (
              <div
                key={group.layer}
                role="group"
                aria-label={group.title}
                className="deployment-type-group"
              >
                <div className="deployment-type-group-head">
                  <span className="deployment-type-group-title">{group.title}</span>
                  <span className="deployment-type-group-hint">{group.hint}</span>
                </div>
                {group.types.map((type) => {
                  const selected = type.label === value;
                  return (
                    <div
                      key={type.label}
                      role="option"
                      aria-selected={selected}
                      aria-disabled={!type.available}
                      className={`deployment-type-option${selected ? " selected" : ""}${
                        type.available ? "" : " disabled"
                      }`}
                      onClick={() => type.available && choose(type.label)}
                    >
                      <span className="deployment-type-check">
                        {selected && <Checkmark16Filled />}
                      </span>
                      <span className="deployment-type-option-text">
                        <span className="deployment-type-option-label">{type.label}</span>
                        <span className="deployment-type-option-meta">
                          {type.servingMode} serving · {type.scope} scope
                        </span>
                        {!type.available && type.unavailableReason && (
                          <span className="deployment-type-option-reason">
                            {type.unavailableReason}
                          </span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>,
          document.body
        )}
    </div>
  );
}
