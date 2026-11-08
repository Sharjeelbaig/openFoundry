// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Agent,
  Deployment,
  DeploymentsResponse,
  KnowledgeBase,
  LocalModel,
  ProviderStatus,
  Trace,
} from "./types";

/**
 * False during the server render and the first client render, true afterwards.
 * Gate anything that reads the wall clock at render time (`new Date()`,
 * `Date.now()`) behind this so the server HTML and the client's first render
 * agree; otherwise a value that includes seconds can differ between the two and
 * React throws a hydration mismatch (error #418).
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

export function useApi<T>(
  url: string,
  intervalMs = 0
): { data: T | null; error: string | null; loading: boolean; refresh: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(url, { cache: "no-store" });
      const json = (await res.json()) as T & { error?: string };
      if (!mounted.current) return;
      if (json.error) setError(json.error);
      else setError(null);
      setData(json);
    } catch (err) {
      if (mounted.current)
        setError(err instanceof Error ? err.message : "Request failed");
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    mounted.current = true;
    void load();
    if (!intervalMs) return () => {
      mounted.current = false;
    };
    const timer = setInterval(() => void load(), intervalMs);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load, intervalMs]);

  return { data, error, loading, refresh: load };
}

export function useModels(intervalMs = 15000) {
  return useApi<{ models: LocalModel[]; providers: ProviderStatus[] }>(
    "/api/models",
    intervalMs
  );
}

export function useDeployments(intervalMs = 4000) {
  return useApi<DeploymentsResponse>("/api/deployments", intervalMs);
}

export function useAgents() {
  return useApi<{ agents: Agent[] }>("/api/agents");
}

export function useKnowledge() {
  return useApi<{ knowledgeBases: KnowledgeBase[] }>("/api/knowledge");
}

export function useTraces(agentId?: string) {
  return useApi<{ traces: Trace[] }>(
    agentId ? `/api/traces?agentId=${encodeURIComponent(agentId)}` : "/api/traces",
    5000
  );
}

export function formatDate(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getMonth() + 1}/${date.getDate()}/${String(
    date.getFullYear()
  ).slice(2)}, ${date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  })}`;
}

export function formatShortDate(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return `${date.getMonth() + 1}/${date.getDate()}/${String(
    date.getFullYear()
  ).slice(2)}`;
}

/** "Today 2:07 AM" / "Yesterday 6:40 PM" / "Mar 5 9:12 AM" — Foundry's version stamp. */
export function formatVersionStamp(value?: string): string {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  const time = date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
  const startOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000);
  if (days === 0) return `Today ${time}`;
  if (days === 1) return `Yesterday ${time}`;
  const month = date.toLocaleString(undefined, { month: "short" });
  return `${month} ${date.getDate()} ${time}`;
}

export function formatBytes(bytes?: number): string {
  if (!bytes || bytes <= 0) return "--";
  const units = ["B", "KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
}

export function formatNumber(value?: number): string {
  if (value == null || Number.isNaN(value)) return "--";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function contextLabel(value?: number): string {
  if (!value) return "--";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return String(value);
}

export function relativeTime(value?: string): string {
  if (!value) return "--";
  const date = new Date(value).getTime();
  if (Number.isNaN(date)) return "--";
  const diff = Date.now() - date;
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return "just now";
  if (diff < hour) return `${Math.floor(diff / minute)}m ago`;
  if (diff < day) return `${Math.floor(diff / hour)}h ago`;
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`;
  return formatShortDate(value);
}

export function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
