"use client";

import { useEffect, useMemo, useState } from "react";
import { Dismiss20Regular } from "@fluentui/react-icons";
import { useToast } from "@/components/Toast";
import { Spinner } from "@/components/ui";
import type { Agent, Routine, RoutineTrigger } from "@/lib/types";
import {
  SCHEDULE_PRESETS,
  WEEKDAYS,
  cronForPreset,
  localTimeZone,
  nextRunForSchedule,
  presetFromCron,
  timeInputValue,
  type SchedulePreset,
} from "@/lib/routines/schedule";

type TriggerType =
  | "schedule"
  | "timer"
  | "webhook"
  | "github_issue"
  | "teams";

const TRIGGER_OPTIONS: { value: TriggerType; label: string }[] = [
  { value: "schedule", label: "Recurring schedule" },
  { value: "timer", label: "One-time schedule" },
  { value: "webhook", label: "Webhook (local event)" },
  { value: "github_issue", label: "GitHub issue" },
  { value: "teams", label: "Teams message (cloud only)" },
];

function tomorrow(): string {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function makeToken(): string {
  try {
    return `wh_${crypto.randomUUID().replace(/-/g, "")}`;
  } catch {
    return `wh_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }
}

export default function RoutineDialog({
  open,
  agents,
  routine,
  onClose,
  onSaved,
}: {
  open: boolean;
  agents: Agent[];
  routine?: Routine | null;
  onClose: () => void;
  onSaved: (routine: Routine) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [agentId, setAgentId] = useState("");
  const [identity, setIdentity] = useState<"agent" | "creator">("agent");
  const [prompt, setPrompt] = useState("");
  const [triggerType, setTriggerType] = useState<TriggerType>("schedule");
  const [preset, setPreset] = useState<SchedulePreset>("Daily");
  const [time, setTime] = useState("09:00");
  const [weekday, setWeekday] = useState(1);
  const [cron, setCron] = useState("0 9 * * *");
  const [timeZone, setTimeZone] = useState(localTimeZone());
  const [date, setDate] = useState(tomorrow());
  const [oneTime, setOneTime] = useState("09:00");
  const [webhookToken, setWebhookToken] = useState(makeToken());
  const [owner, setOwner] = useState("");
  const [repository, setRepository] = useState("");
  const [issueEvent, setIssueEvent] = useState<"opened" | "closed">("opened");
  const [githubToken, setGithubToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    if (routine) {
      setName(routine.name);
      setAgentId(routine.agentId);
      setIdentity(routine.identity);
      setPrompt(routine.prompt);
      setTriggerType(routine.trigger.type);
      const trigger = routine.trigger;
      if (trigger.type === "schedule") {
        setCron(trigger.cron);
        setTimeZone(trigger.timeZone);
        const details = presetFromCron(trigger.cron);
        if (details) {
          setPreset(details.preset);
          setTime(timeInputValue(details.hour, details.minute));
          setWeekday(details.weekday);
        } else {
          setPreset("Custom");
        }
      }
      if (trigger.type === "timer") {
        const at = new Date(trigger.at);
        setDate(
          `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(
            2,
            "0"
          )}-${String(at.getDate()).padStart(2, "0")}`
        );
        setOneTime(
          `${String(at.getHours()).padStart(2, "0")}:${String(
            at.getMinutes()
          ).padStart(2, "0")}`
        );
      }
      if (trigger.type === "webhook") setWebhookToken(trigger.token);
      if (trigger.type === "github_issue") {
        setOwner(trigger.owner);
        setRepository(trigger.repository);
        setIssueEvent(trigger.issueEvent);
        setGithubToken(trigger.token || "");
      }
    } else {
      setName("");
      setAgentId(agents[0]?.id || "");
      setIdentity("agent");
      setPrompt("");
      setTriggerType("schedule");
      setPreset("Daily");
      setTime("09:00");
      setWeekday(1);
      setCron("0 9 * * *");
      setTimeZone(localTimeZone());
      setDate(tomorrow());
      setOneTime("09:00");
      setWebhookToken(makeToken());
      setOwner("");
      setRepository("");
      setIssueEvent("opened");
      setGithubToken("");
    }
  }, [open, routine, agents]);

  const effectiveCron = useMemo(() => {
    if (preset !== "Custom") return cronForPreset(preset, timeToParts(time), weekday);
    return cron;
  }, [preset, cron, time, weekday]);

  const nextRun = useMemo(() => {
    if (triggerType !== "schedule") return null;
    return nextRunForSchedule(effectiveCron, timeZone);
  }, [triggerType, effectiveCron, timeZone]);

  if (!open) return null;

  const buildTrigger = (): RoutineTrigger | null => {
    if (triggerType === "schedule") {
      return {
        type: "schedule",
        cron: effectiveCron.trim(),
        timeZone: timeZone.trim() || "UTC",
      };
    }
    if (triggerType === "timer") {
      const at = new Date(`${date}T${oneTime}:00`);
      if (Number.isNaN(at.getTime())) return null;
      return { type: "timer", at: at.toISOString() };
    }
    if (triggerType === "webhook") {
      return { type: "webhook", token: webhookToken };
    }
    if (triggerType === "github_issue") {
      return {
        type: "github_issue",
        owner: owner.trim(),
        repository: repository.trim(),
        issueEvent,
        ...(githubToken.trim() ? { token: githubToken.trim() } : {}),
      };
    }
    return { type: "teams" };
  };

  const submit = async () => {
    setError("");
    if (!name.trim()) return setError("Enter a routine name.");
    if (!agentId) return setError("Choose an agent.");
    if (!prompt.trim()) return setError("Enter a prompt.");
    if (triggerType === "teams")
      return setError(
        "Teams message triggers need a Microsoft 365 cloud connection. Use the local webhook trigger instead."
      );
    const trigger = buildTrigger();
    if (!trigger) return setError("Enter a valid trigger.");
    if (trigger.type === "github_issue" && (!trigger.owner || !trigger.repository))
      return setError("Enter the GitHub owner and repository.");

    setBusy(true);
    try {
      const res = await fetch(
        routine
          ? `/api/routines/${encodeURIComponent(routine.id)}`
          : "/api/routines",
        {
          method: routine ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            agentId,
            identity,
            prompt: prompt.trim(),
            trigger,
          }),
        }
      );
      const json = (await res.json()) as { routine?: Routine; error?: string };
      if (!res.ok || !json.routine)
        throw new Error(json.error || "Could not save the routine.");
      toast(
        routine ? `${json.routine.name} updated` : `${json.routine.name} created`,
        "success"
      );
      onSaved(json.routine);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not save routine.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="dialog-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div
        className="dialog routine-dialog"
        role="dialog"
        aria-modal="true"
        aria-label={routine ? "Edit routine" : "New routine"}
      >
        <div className="dialog-head">
          <div>
            <h2 className="dialog-title">
              {routine ? "Edit routine" : "New routine"}
            </h2>
            <p className="dialog-sub">
              A routine runs one agent from a schedule or event trigger.
            </p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close"
            disabled={busy}
          >
            <Dismiss20Regular />
          </button>
        </div>

        <div className="dialog-body">
          <label className="field">
            <span className="field-label">
              Name <span className="required">*</span>
            </span>
            <input
              className="input"
              maxLength={128}
              placeholder="Enter the name for the routine"
              value={name}
              onChange={(event) => setName(event.target.value)}
              autoFocus
            />
            {!name.trim() && (
              <span className="field-hint">Enter a routine name.</span>
            )}
          </label>

          <div className="form-grid two">
            <label className="field">
              <span className="field-label">
                Agent <span className="required">*</span>
              </span>
              <select
                className="select"
                value={agentId}
                onChange={(event) => setAgentId(event.target.value)}
              >
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field-label">Authorization</span>
              <select
                className="select"
                value={identity}
                onChange={(event) =>
                  setIdentity(event.target.value as "agent" | "creator")
                }
                disabled={Boolean(routine)}
              >
                <option value="agent">Agent identity</option>
                <option value="creator">Creator identity</option>
              </select>
              <span className="field-hint">
                Locally both options invoke the agent with this workspace&apos;s
                credentials. The choice is stored for parity with the reference.
              </span>
            </label>
          </div>

          <label className="field">
            <span className="field-label">
              Prompt <span className="required">*</span>
            </span>
            <textarea
              className="textarea"
              rows={4}
              placeholder="Enter prompt"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </label>

          <div className="routine-trigger-box">
            <label className="field">
              <span className="field-label">
                Trigger <span className="required">*</span>
              </span>
              <select
                className="select"
                value={triggerType}
                onChange={(event) =>
                  setTriggerType(event.target.value as TriggerType)
                }
              >
                {TRIGGER_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            {triggerType === "schedule" && (
              <>
                <div className="form-grid three">
                  <label className="field">
                    <span className="field-label">Frequency</span>
                    <select
                      className="select"
                      value={preset}
                      onChange={(event) =>
                        setPreset(event.target.value as SchedulePreset)
                      }
                    >
                      {SCHEDULE_PRESETS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  {preset === "Weekly" && (
                    <label className="field">
                      <span className="field-label">Day</span>
                      <select
                        className="select"
                        value={weekday}
                        onChange={(event) => setWeekday(Number(event.target.value))}
                      >
                        {WEEKDAYS.map((day, index) => (
                          <option key={day} value={index}>
                            {day}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {preset !== "Custom" ? (
                    <label className="field">
                      <span className="field-label">Time</span>
                      <input
                        className="input"
                        type="time"
                        value={time}
                        onChange={(event) => setTime(event.target.value)}
                      />
                    </label>
                  ) : (
                    <label className="field">
                      <span className="field-label">CRON</span>
                      <input
                        className="input mono"
                        value={cron}
                        onChange={(event) => setCron(event.target.value)}
                        placeholder="0 9 * * 1-5"
                      />
                    </label>
                  )}
                  <label className="field">
                    <span className="field-label">Time zone</span>
                    <input
                      className="input"
                      value={timeZone}
                      onChange={(event) => setTimeZone(event.target.value)}
                      placeholder="UTC"
                    />
                  </label>
                </div>
                <p className="routine-trigger-note">
                  Schedule: <span className="mono">{effectiveCron}</span>
                  {nextRun
                    ? ` · next run ${nextRun.toLocaleString()}`
                    : " · invalid schedule"}
                </p>
              </>
            )}

            {triggerType === "timer" && (
              <div className="form-grid two">
                <label className="field">
                  <span className="field-label">Run at date</span>
                  <input
                    className="input"
                    type="date"
                    value={date}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(event) => setDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-label">Time</span>
                  <input
                    className="input"
                    type="time"
                    value={oneTime}
                    onChange={(event) => setOneTime(event.target.value)}
                  />
                </label>
              </div>
            )}

            {triggerType === "webhook" && (
              <div className="field">
                <span className="field-label">Webhook URL</span>
                <div className="copy-field">
                  <input
                    className="input mono"
                    readOnly
                    value={`${
                      typeof window === "undefined" ? "" : window.location.origin
                    }/api/routine-events/${webhookToken}`}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => {
                      const url = `${window.location.origin}/api/routine-events/${webhookToken}`;
                      void navigator.clipboard.writeText(url).then(
                        () => toast("Webhook URL copied", "success"),
                        () => toast("Could not copy the URL", "error")
                      );
                    }}
                  >
                    Copy
                  </button>
                </div>
                <span className="field-hint">
                  Any system can POST JSON to this URL to run the routine. The app
                  must be running.
                </span>
              </div>
            )}

            {triggerType === "github_issue" && (
              <div className="form-grid two">
                <label className="field">
                  <span className="field-label">Owner</span>
                  <input
                    className="input"
                    value={owner}
                    onChange={(event) => setOwner(event.target.value)}
                    placeholder="your-org"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Repository</span>
                  <input
                    className="input"
                    value={repository}
                    onChange={(event) => setRepository(event.target.value)}
                    placeholder="your-repo"
                  />
                </label>
                <label className="field">
                  <span className="field-label">Issue event</span>
                  <select
                    className="select"
                    value={issueEvent}
                    onChange={(event) =>
                      setIssueEvent(event.target.value as "opened" | "closed")
                    }
                  >
                    <option value="opened">Opened</option>
                    <option value="closed">Closed</option>
                  </select>
                </label>
                <label className="field">
                  <span className="field-label">GitHub token (optional)</span>
                  <input
                    className="input"
                    type="password"
                    value={githubToken}
                    onChange={(event) => setGithubToken(event.target.value)}
                    placeholder="ghp_…"
                  />
                </label>
                <span className="field-hint">
                  Polls GitHub every 60 seconds while openFoundry is running. A
                  token is required for private repositories and higher limits.
                  It is stored in the local routines file.
                </span>
              </div>
            )}

            {triggerType === "teams" && (
              <div className="banner warning">
                Teams message triggers require a Microsoft 365 connector and
                Microsoft Entra authorization. openFoundry does not emulate that
                cloud connection. Use the local webhook trigger and POST the
                message payload from Teams or Power Automate.
              </div>
            )}
          </div>

          {error && <div className="banner error">{error}</div>}
        </div>

        <div className="dialog-footer">
          <button className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy || triggerType === "teams"}
          >
            {busy ? <Spinner /> : null}
            {routine ? "Save changes" : "Create & start"}
          </button>
        </div>
      </div>
    </div>
  );
}

function timeToParts(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map(Number);
  return {
    hour: Number.isFinite(hour) ? hour : 9,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}
