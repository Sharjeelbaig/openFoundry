// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { newId } from "@/lib/store";
import type { RoutineTrigger } from "@/lib/types";
import {
  isValidCron,
  isValidTimeZone,
  nextRunForSchedule,
  nextRunForTrigger,
} from "./schedule";

export interface TriggerResult {
  trigger?: RoutineTrigger;
  nextRunAt?: string;
  error?: string;
}

const MIN_INTERVAL_MS = 5 * 60_000;

export function validateTrigger(input: unknown): TriggerResult {
  if (!input || typeof input !== "object")
    return { error: "Choose a trigger type." };
  const raw = input as Record<string, unknown>;
  const type = String(raw.type || "");

  if (type === "schedule") {
    const cron = String(raw.cron || "").trim();
    const timeZone = String(raw.timeZone || "").trim();
    if (!isValidCron(cron))
      return { error: "Enter a valid five-field CRON expression." };
    if (!isValidTimeZone(timeZone))
      return { error: "Enter a valid IANA time zone, such as UTC." };
    const first = nextRunForSchedule(cron, timeZone);
    if (!first) return { error: "That schedule never runs." };
    const second = nextRunForSchedule(cron, timeZone, new Date(first.getTime() + 1000));
    if (second && second.getTime() - first.getTime() < MIN_INTERVAL_MS)
      return { error: "Recurring schedules must be at least five minutes apart." };
    return {
      trigger: { type, cron, timeZone },
      nextRunAt: first.toISOString(),
    };
  }

  if (type === "timer") {
    const at = String(raw.at || "");
    const date = new Date(at);
    if (Number.isNaN(date.getTime()))
      return { error: "Choose a valid date and time." };
    if (date.getTime() <= Date.now())
      return { error: "A one-time schedule must be in the future." };
    return {
      trigger: { type, at: date.toISOString() },
      nextRunAt: date.toISOString(),
    };
  }

  if (type === "webhook") {
    const token =
      typeof raw.token === "string" && raw.token.trim()
        ? raw.token.trim()
        : newId("wh");
    return { trigger: { type, token } };
  }

  if (type === "github_issue") {
    const owner = String(raw.owner || "").trim();
    const repository = String(raw.repository || "").trim();
    const issueEvent = String(raw.issueEvent || "");
    const token = String(raw.token || "").trim();
    if (!owner || !repository)
      return { error: "Enter the GitHub owner and repository." };
    if (issueEvent !== "opened" && issueEvent !== "closed")
      return { error: "Choose whether the issue is opened or closed." };
    return {
      trigger: {
        type,
        owner,
        repository,
        issueEvent,
        ...(token ? { token } : {}),
      },
    };
  }

  if (type === "teams") {
    return {
      error:
        "Teams message triggers require a Microsoft 365 cloud connection. Use the local webhook trigger instead.",
    };
  }

  return { error: "Unknown trigger type." };
}

export function initialNextRun(trigger: RoutineTrigger): string | undefined {
  return nextRunForTrigger(trigger)?.toISOString();
}

export function normalizeName(value: unknown): string {
  return String(value || "").trim().slice(0, 128);
}
