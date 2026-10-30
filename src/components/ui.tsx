import { useState } from "react";
import { Checkmark20Regular, Copy20Regular } from "@fluentui/react-icons";
import { DottedObject } from "./Logos";

export function Spinner() {
  return <span className="spinner" aria-label="Loading" />;
}

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

export function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      className="icon-button small"
      aria-label={label}
      title={label}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // clipboard can be disabled by the host
        }
      }}
    >
      {copied ? <Checkmark20Regular /> : <Copy20Regular />}
    </button>
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
