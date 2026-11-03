"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight20Regular, Key20Regular } from "@fluentui/react-icons";
import { OpenFoundryLogo } from "./Logos";

export default function SignInForm({ next }: { next: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/sign-in", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: { message?: string } | string;
      };
      if (!response.ok) {
        setError(
          typeof payload.error === "string"
            ? payload.error
            : payload.error?.message || "That access code is not valid."
        );
        return;
      }
      router.replace(next.startsWith("/") ? next : "/");
      router.refresh();
    } catch {
      setError("Could not reach openFoundry. Is the server still running?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="signin-screen">
      <form className="signin-card" onSubmit={submit}>
        <div className="signin-brand">
          <OpenFoundryLogo size={32} />
          <div>
            <strong>
              <span className="setup-brand-open">open</span>Foundry
            </strong>
            <span>This install is private</span>
          </div>
        </div>

        <h1>Enter your access code</h1>
        <p className="signin-lead">
          An owner of this install gives you a code. It looks like
          <span className="mono"> 7Q4M-XR2A-K9WP-3FJH</span>.
        </p>

        <label className="field">
          <span className="field-label">Access code</span>
          <span className="signin-input">
            <Key20Regular />
            <input
              className="input"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
          </span>
        </label>

        {error && <p className="signin-error">{error}</p>}

        <button className="btn btn-primary signin-submit" disabled={busy || !code.trim()}>
          {busy ? "Checking…" : "Continue"} <ArrowRight20Regular />
        </button>
      </form>
    </div>
  );
}
