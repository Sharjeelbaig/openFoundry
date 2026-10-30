"use client";

import Link from "next/link";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowDownload20Regular,
  CheckmarkCircle20Regular,
  ChevronDown20Regular,
  ChevronUp20Regular,
  Dismiss20Regular,
  ErrorCircle20Regular,
  Open20Regular,
  Stop20Regular,
} from "@fluentui/react-icons";
import { useToast } from "./Toast";
import { ModelLogo } from "./Logos";
import { formatBytes } from "@/lib/client";
import type { DownloadJob } from "@/lib/types";

interface DownloadContextValue {
  jobs: DownloadJob[];
  activeJobs: DownloadJob[];
  panelOpen: boolean;
  startDownload: (modelKey: string) => Promise<DownloadJob | null>;
  setPanelOpen: (open: boolean) => void;
  dismiss: (id: string) => void;
  cancel: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

const DownloadContext = createContext<DownloadContextValue>({
  jobs: [],
  activeJobs: [],
  panelOpen: false,
  startDownload: async () => null,
  setPanelOpen: () => undefined,
  dismiss: () => undefined,
  cancel: async () => undefined,
  refresh: async () => undefined,
});

export function useDownloads() {
  return useContext(DownloadContext);
}

function isActive(job: DownloadJob): boolean {
  return job.status === "queued" || job.status === "running";
}

export function DownloadProvider({ children }: { children: React.ReactNode }) {
  const { toast } = useToast();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);
  const knownStatus = useRef<Map<string, DownloadJob["status"]>>(new Map());

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/models/download", { cache: "no-store" });
      if (!res.ok) return;
      const json = (await res.json()) as { jobs?: DownloadJob[] };
      const next = json.jobs || [];
      setJobs(next);
      for (const job of next) {
        const previous = knownStatus.current.get(job.id);
        if (previous && previous !== job.status) {
          if (job.status === "complete") {
            toast(`${job.modelName} downloaded. It is ready to run.`, "success");
            window.dispatchEvent(new CustomEvent("foundry:downloads-changed"));
          } else if (job.status === "error") {
            toast(
              job.error || `${job.modelName} could not be downloaded.`,
              "error"
            );
          }
        }
        knownStatus.current.set(job.id, job.status);
      }
    } catch {
      // A transient failure should not clear the visible progress.
    }
  }, [toast]);

  useEffect(() => {
    void refresh();
    const onChanged = () => void refresh();
    window.addEventListener("foundry:downloads-refresh", onChanged);
    return () => window.removeEventListener("foundry:downloads-refresh", onChanged);
  }, [refresh]);

  const visibleJobs = useMemo(
    () => jobs.filter((job) => !hidden.includes(job.id)),
    [jobs, hidden]
  );
  const activeJobs = useMemo(() => visibleJobs.filter(isActive), [visibleJobs]);

  useEffect(() => {
    if (activeJobs.length === 0) return;
    const timer = setInterval(() => void refresh(), 1200);
    return () => clearInterval(timer);
  }, [activeJobs.length, refresh]);

  const startDownload = useCallback(
    async (modelKey: string): Promise<DownloadJob | null> => {
      try {
        const res = await fetch("/api/models/download", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelKey }),
        });
        const json = (await res.json()) as {
          job?: DownloadJob;
          cached?: boolean;
          error?: string;
        };
        if (!res.ok || !json.job)
          throw new Error(json.error || "Could not start download");
        knownStatus.current.set(json.job.id, json.job.status);
        setJobs((current) => [
          json.job as DownloadJob,
          ...current.filter((job) => job.id !== json.job!.id),
        ]);
        setHidden((current) => current.filter((id) => id !== json.job!.id));
        setPanelOpen(true);
        if (json.cached || json.job.status === "complete") {
          toast(`${json.job.modelName} is already downloaded.`, "success");
        }
        void refresh();
        return json.job;
      } catch (error) {
        toast(error instanceof Error ? error.message : "Download failed", "error");
        return null;
      }
    },
    [refresh, toast]
  );

  const cancel = useCallback(async (id: string) => {
    try {
      const res = await fetch(`/api/models/download/${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = (await res.json()) as { job?: DownloadJob; error?: string };
      if (!res.ok || !json.job) throw new Error(json.error || "Cancel failed");
      setJobs((current) =>
        current.map((job) => (job.id === id ? (json.job as DownloadJob) : job))
      );
    } catch {
      // The polling loop will reconcile the status.
    }
  }, []);

  const dismiss = useCallback((id: string) => {
    setJobs((current) => current.filter((job) => job.id !== id));
    setHidden((current) => [...current, id]);
  }, []);

  const value = useMemo(
    () => ({
      jobs: visibleJobs,
      activeJobs,
      panelOpen,
      startDownload,
      setPanelOpen,
      dismiss,
      cancel,
      refresh,
    }),
    [visibleJobs, activeJobs, panelOpen, startDownload, dismiss, cancel, refresh]
  );

  return (
    <DownloadContext.Provider value={value}>
      {children}
      <DownloadCenter jobs={visibleJobs} />
    </DownloadContext.Provider>
  );
}

function formatJobMeta(job: DownloadJob): string {
  if (job.status === "complete") return "Ready";
  if (job.status === "cancelled") return "Cancelled";
  if (job.status === "error") return "Needs attention";
  if (job.bytesDownloaded && job.bytesTotal)
    return `${formatBytes(job.bytesDownloaded)} of ${formatBytes(job.bytesTotal)}`;
  if (job.progress > 0) return `${Math.round(job.progress)}%`;
  return "Starting…";
}

function DownloadCenter({ jobs }: { jobs: DownloadJob[] }) {
  const { panelOpen, setPanelOpen, dismiss, cancel } = useDownloads();
  const active = jobs.filter(isActive);
  const done = jobs.filter((job) => !isActive(job));
  const [expanded, setExpanded] = useState<string | null>(null);

  if (jobs.length === 0) return null;

  const newest = active[0] || done[0];
  const aggregate =
    active.length > 0
      ? active.reduce((sum, job) => sum + job.progress, 0) / active.length
      : 100;

  return (
    <aside
      className={`download-center${panelOpen ? " open" : " collapsed"}`}
      aria-label="Model downloads"
    >
      <button
        className="download-center-head"
        onClick={() => setPanelOpen(!panelOpen)}
        aria-expanded={panelOpen}
      >
        <span className={`download-center-glyph${active.length ? " active" : ""}`}>
          {active.length ? (
            <ArrowDownload20Regular />
          ) : (
            <CheckmarkCircle20Regular />
          )}
        </span>
        <span className="download-center-title">
          <strong>
            {active.length
              ? active.length === 1
                ? `Downloading ${newest.modelName}`
                : `Downloading ${active.length} models`
              : jobs.some((job) => job.status === "error")
              ? "Download needs attention"
              : "Downloads complete"}
          </strong>
          <span>
            {active.length
              ? `${Math.round(aggregate)}% · ${newest.providerLabel}`
              : `${jobs.length} recent ${jobs.length === 1 ? "download" : "downloads"}`}
          </span>
        </span>
        {active.length > 0 && (
          <span
            className="download-ring"
            style={{ "--download-progress": `${aggregate * 3.6}deg` } as React.CSSProperties}
            aria-hidden="true"
          />
        )}
        {panelOpen ? <ChevronDown20Regular /> : <ChevronUp20Regular />}
      </button>

      {panelOpen && (
        <div className="download-center-body">
          {jobs.map((job) => {
            const activeJob = isActive(job);
            const isExpanded = expanded === job.id;
            return (
              <div className={`download-row ${job.status}`} key={job.id}>
                <div className="download-row-top">
                  <ModelLogo publisher={job.publisher} name={job.modelName} size={28} />
                  <span className="download-row-name">
                    <strong>{job.modelName}</strong>
                    <small>
                      {job.providerLabel} · {formatJobMeta(job)}
                    </small>
                  </span>
                  {activeJob && (
                    <button
                      className="icon-button small"
                      onClick={() => void cancel(job.id)}
                      title="Cancel download"
                      aria-label={`Cancel ${job.modelName} download`}
                    >
                      <Stop20Regular />
                    </button>
                  )}
                  {!activeJob && (
                    <button
                      className="icon-button small"
                      onClick={() => dismiss(job.id)}
                      title="Dismiss"
                      aria-label={`Dismiss ${job.modelName} download`}
                    >
                      <Dismiss20Regular />
                    </button>
                  )}
                </div>
                {activeJob && (
                  <div
                    className={`download-bar${job.progress > 0 ? "" : " indeterminate"}`}
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(job.progress)}
                    aria-label={`${job.modelName} download progress`}
                  >
                    <span style={{ width: `${Math.max(3, job.progress)}%` }} />
                  </div>
                )}
                {job.status === "error" && (
                  <p className="download-error">
                    <ErrorCircle20Regular /> {job.error || job.message}
                  </p>
                )}
                <div className="download-row-actions">
                  <button
                    className="btn btn-sm btn-ghost"
                    onClick={() => setExpanded(isExpanded ? null : job.id)}
                    aria-expanded={isExpanded}
                  >
                    {isExpanded ? "Hide details" : "Details"}
                  </button>
                  <Link
                    href={`/discover/models/${encodeURIComponent(job.modelKey)}`}
                    className="btn btn-sm btn-ghost"
                    onClick={() => setPanelOpen(false)}
                  >
                    <Open20Regular /> Model
                  </Link>
                  {job.status === "complete" && (
                    <span className="download-complete-note">
                      <CheckmarkCircle20Regular /> Available now
                    </span>
                  )}
                </div>
                {isExpanded && (
                  <div className="download-log">
                    {job.logs.length ? (
                      job.logs.slice(-10).map((line, index) => (
                        <span key={`${line}-${index}`}>{line}</span>
                      ))
                    ) : (
                      <span>{job.message}</span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          <p className="download-center-note">
            Downloads run through the local runtime. Nothing is uploaded.
          </p>
        </div>
      )}
    </aside>
  );
}
