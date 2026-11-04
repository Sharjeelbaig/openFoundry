// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Checkmark16Filled, ChevronDown20Regular } from "@fluentui/react-icons";

/**
 * A custom dropdown that replaces the native `<select>` control across the
 * workspace, matching the agent builder's model picker.
 *
 * It is a drop-in for the native element: pass `<option>` children and the same
 * `value` / `onChange` handler, and the handler receives an event whose
 * `target.value` is the chosen option. That keeps every existing call site
 * working while the menu is rendered, styled and positioned by us.
 *
 * The popover is portalled to the body so it is never clipped by a scrolling
 * drawer, modal or table cell.
 */

interface OptionInfo {
  value: string;
  label: React.ReactNode;
  text: string;
  disabled: boolean;
}

export type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "children"
> & {
  children?: React.ReactNode;
};

function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (typeof node === "object" && "props" in node) {
    return nodeText((node as { props?: { children?: React.ReactNode } }).props?.children);
  }
  return "";
}

function collectOptions(
  children: React.ReactNode,
  out: OptionInfo[] = []
): OptionInfo[] {
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    const type = child.type;
    if (type === React.Fragment) {
      collectOptions(
        (child.props as { children?: React.ReactNode }).children,
        out
      );
      return;
    }
    if (type === "optgroup") {
      collectOptions(
        (child.props as { children?: React.ReactNode }).children,
        out
      );
      return;
    }
    if (type === "option") {
      const props = child.props as {
        value?: string | number;
        disabled?: boolean;
        children?: React.ReactNode;
      };
      const text = nodeText(props.children);
      out.push({
        value: props.value != null ? String(props.value) : text,
        label: props.children,
        text,
        disabled: Boolean(props.disabled),
      });
    }
  });
  return out;
}

export default function Select({
  value,
  onChange,
  children,
  className,
  style,
  disabled,
  id,
  title,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ top: number; left: number; width: number } | null>(
    null
  );
  const [internalValue, setInternalValue] = useState<string | undefined>(undefined);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const options = useMemo(() => collectOptions(children), [children]);

  const controlled = value !== undefined;
  const currentValue = controlled
    ? Array.isArray(value)
      ? String(value[0] ?? "")
      : String(value ?? "")
    : internalValue;
  const selected =
    options.find((option) => option.value === currentValue) ?? options[0];

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const box = el.getBoundingClientRect();
    setRect({
      top: box.bottom + 4,
      left: box.left,
      width: Math.max(box.width, 180),
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    measure();
    const onDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
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

  const choose = (option: OptionInfo) => {
    if (option.disabled) return;
    if (!controlled) setInternalValue(option.value);
    setOpen(false);
    if (!onChange) return;
    const event = {
      target: { value: option.value },
      currentTarget: { value: option.value },
    } as unknown as React.ChangeEvent<HTMLSelectElement>;
    onChange(event);
  };

  return (
    <span className="custom-select">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-haspopup="listbox"
        aria-label={ariaLabel}
        aria-describedby={ariaDescribedBy}
        className={`custom-select-trigger${className ? ` ${className}` : ""}`}
        style={style}
        disabled={disabled}
        title={title ?? (selected?.text || undefined)}
        onClick={() => {
          if (disabled) return;
          if (!open) measure();
          setOpen((value) => !value);
        }}
      >
        <span className="custom-select-value">{selected?.label ?? null}</span>
        <ChevronDown20Regular className="custom-select-chevron" />
      </button>

      {open &&
        rect &&
        createPortal(
          <div
            ref={popoverRef}
            id={listId}
            role="listbox"
            className="custom-select-popover"
            style={{ top: rect.top, left: rect.left, minWidth: rect.width }}
          >
            {options.length === 0 ? (
              <div className="custom-select-empty">No options</div>
            ) : (
              options.map((option, index) => {
                const isSelected = option.value === selected?.value;
                return (
                  <div
                    key={`${option.value}-${index}`}
                    role="option"
                    aria-selected={isSelected}
                    aria-disabled={option.disabled}
                    className={`custom-select-option${isSelected ? " selected" : ""}${
                      option.disabled ? " disabled" : ""
                    }`}
                    onClick={() => choose(option)}
                  >
                    <span className="custom-select-check">
                      {isSelected && <Checkmark16Filled />}
                    </span>
                    <span className="custom-select-option-text">{option.label}</span>
                  </div>
                );
              })
            )}
          </div>,
          document.body
        )}
    </span>
  );
}
