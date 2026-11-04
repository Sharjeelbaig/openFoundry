// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 Sharjeel Baig

import { CronExpressionParser } from "cron-parser";
import type { RoutineTrigger } from "@/lib/types";

export const SCHEDULE_PRESETS = [
  "Hourly",
  "Daily",
  "Weekly",
  "Weekdays",
  "Weekends",
  "Custom",
] as const;

export type SchedulePreset = (typeof SCHEDULE_PRESETS)[number];

export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isValidTimeZone(timeZone: string): boolean {
  if (!timeZone) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function isValidCron(cron: string): boolean {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return false;
  try {
    CronExpressionParser.parse(cron, { tz: "UTC" });
    return true;
  } catch {
    return false;
  }
}

export function cronForPreset(
  preset: SchedulePreset,
  time: { hour: number; minute: number },
  weekday = 1
): string {
  const { hour, minute } = time;
  switch (preset) {
    case "Hourly":
      return `${minute} * * * *`;
    case "Daily":
      return `${minute} ${hour} * * *`;
    case "Weekly":
      return `${minute} ${hour} * * ${weekday}`;
    case "Weekdays":
      return `${minute} ${hour} * * 1-5`;
    case "Weekends":
      return `${minute} ${hour} * * 0,6`;
    case "Custom":
    default:
      return `${minute} ${hour} * * *`;
  }
}

export function nextRunForSchedule(
  cron: string,
  timeZone: string,
  from: Date = new Date()
): Date | null {
  try {
    const interval = CronExpressionParser.parse(cron, {
      currentDate: from,
      tz: timeZone,
    });
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export function nextRunForTrigger(
  trigger: RoutineTrigger,
  from: Date = new Date()
): Date | null {
  if (trigger.type === "schedule") {
    return nextRunForSchedule(trigger.cron, trigger.timeZone, from);
  }
  if (trigger.type === "timer") {
    const at = new Date(trigger.at);
    if (Number.isNaN(at.getTime()) || at.getTime() <= from.getTime()) return null;
    return at;
  }
  return null;
}

function clock(hour: number, minute: number): string {
  const date = new Date(2000, 0, 1, hour, minute);
  return date.toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });
}

function scheduleLabel(cron: string): string {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return cron;
  const [minute, hour, day, month, weekday] = fields;
  if (!/^\d+$/.test(minute)) return `CRON ${cron}`;
  const min = Number(minute);
  if (hour === "*" && day === "*" && month === "*" && weekday === "*")
    return `Hourly at minute ${min}`;
  if (!/^\d+$/.test(hour)) return `CRON ${cron}`;
  const time = clock(Number(hour), min);
  if (day === "*" && month === "*" && weekday === "*") return `Daily at ${time}`;
  if (day === "*" && month === "*" && weekday === "1-5")
    return `Weekdays at ${time}`;
  if (day === "*" && month === "*" && weekday === "0,6")
    return `Weekends at ${time}`;
  if (day === "*" && month === "*" && /^[0-6]$/.test(weekday))
    return `Weekly on ${WEEKDAYS[Number(weekday)]} at ${time}`;
  return `CRON ${cron}`;
}

export function formatTrigger(trigger: RoutineTrigger): string {
  switch (trigger.type) {
    case "schedule":
      return scheduleLabel(trigger.cron);
    case "timer":
      return new Date(trigger.at).toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        year: "2-digit",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
      });
    case "webhook":
      return "Webhook";
    case "github_issue":
      return `GitHub ${trigger.owner}/${trigger.repository} · issue ${trigger.issueEvent}`;
    case "teams":
      return "Teams message (cloud only)";
    default:
      return "Unknown";
  }
}

/** Parse an <input type="time"> value without depending on a date. */
export function parseTimeValue(value: string): { hour: number; minute: number } {
  const [hour, minute] = value.split(":").map((part) => Number(part));
  return {
    hour: Number.isFinite(hour) ? Math.max(0, Math.min(23, hour)) : 9,
    minute: Number.isFinite(minute) ? Math.max(0, Math.min(59, minute)) : 0,
  };
}

export function timeInputValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function localTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}


export interface CronPresetDetails {
  preset: SchedulePreset;
  hour: number;
  minute: number;
  weekday: number;
}

/** Infer the dialog's preset from a stored CRON expression. */
export function presetFromCron(cron: string): CronPresetDetails | null {
  const fields = cron.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minute, hour, day, month, weekday] = fields;
  if (!/^\d+$/.test(minute)) return null;
  const min = Number(minute);
  if (hour === "*" && day === "*" && month === "*" && weekday === "*")
    return { preset: "Hourly", hour: 0, minute: min, weekday: 1 };
  if (!/^\d+$/.test(hour)) return null;
  const hourValue = Number(hour);
  if (day !== "*" || month !== "*")
    return { preset: "Custom", hour: hourValue, minute: min, weekday: 1 };
  if (weekday === "*")
    return { preset: "Daily", hour: hourValue, minute: min, weekday: 1 };
  if (weekday === "1-5")
    return { preset: "Weekdays", hour: hourValue, minute: min, weekday: 1 };
  if (weekday === "0,6")
    return { preset: "Weekends", hour: hourValue, minute: min, weekday: 0 };
  if (/^[0-6]$/.test(weekday))
    return {
      preset: "Weekly",
      hour: hourValue,
      minute: min,
      weekday: Number(weekday),
    };
  return { preset: "Custom", hour: hourValue, minute: min, weekday: 1 };
}

export function describeSchedule(cron: string, timeZone: string): string {
  const next = nextRunForSchedule(cron, timeZone);
  if (!next) return `Invalid schedule (${cron})`;
  return `${cron} · ${timeZone} · next ${next.toLocaleString()}`;
}
