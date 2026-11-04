// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useState } from "react";
import { Checkmark20Regular, Copy20Regular, Info20Regular } from "@fluentui/react-icons";
import { useToast } from "./Toast";
import { DottedObject as OwnDottedObject } from "./Logos";

export function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "Running" || status === "Ready" || status === "Online"
      ? ""
      : status === "Creating" || status === "Indexing"
      ? "warning"
      : status === "Failed" || status === "Stopped"
      ? "danger"
      : "muted";
  return (
    <span className="status">
      <span className={`status-dot ${tone}`} />
      {status}
    </span>
  );
}

export function Spinner({ large = false }: { large?: boolean }) {
  return <span className={`spinner${large ? " lg" : ""}`} aria-label="Loading" />;
}

export function CopyButton({
  value,
  label = "Copy",
  className = "icon-button small",
}: {
  value: string;
  label?: string;
  className?: string;
}) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  return (
    <button
      className={className}
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast("Copied to clipboard", "success");
          setTimeout(() => setCopied(false), 1600);
        } catch {
          toast("Clipboard access was denied", "error");
        }
      }}
    >
      {copied ? <Checkmark20Regular /> : <Copy20Regular />}
    </button>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span title={text} style={{ display: "inline-flex", color: "var(--fg-3)" }}>
      <Info20Regular style={{ width: 13, height: 13 }} />
    </span>
  );
}

export function DottedObject({ className = "empty-illustration" }: { className?: string }) {
  return <OwnDottedObject className={className} />;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1 className="page-title">{title}</h1>
        {subtitle && <div className="page-subtitle">{subtitle}</div>}
      </div>
      {actions && <div className="page-header-actions">{actions}</div>}
    </div>
  );
}

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: React.ReactNode;
  required?: boolean;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {required && <span className="required">*</span>}
      </span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  );
}

export function EmptyState({
  title,
  description,
  action,
  illustration,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  illustration?: React.ReactNode;
}) {
  return (
    <div className="empty">
      {illustration ?? <DottedObject />}
      <h2>{title}</h2>
      {description && <p>{description}</p>}
      {action && <div className="mt-12">{action}</div>}
    </div>
  );
}
