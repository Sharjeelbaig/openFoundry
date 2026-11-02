import { describe, expect, it } from "vitest";
import {
  cronForPreset,
  isValidCron,
  nextRunForSchedule,
  parseTimeValue,
  presetFromCron,
} from "@/lib/routines/schedule";
import { validateTrigger } from "@/lib/routines/validate";

describe("routine schedules", () => {
  it("builds preset cron expressions", () => {
    expect(cronForPreset("Daily", { hour: 9, minute: 0 })).toBe("0 9 * * *");
    expect(cronForPreset("Weekly", { hour: 9, minute: 30 }, 1)).toBe(
      "30 9 * * 1"
    );
    expect(cronForPreset("Weekdays", { hour: 7, minute: 0 })).toBe(
      "0 7 * * 1-5"
    );
  });

  it("computes the next run in a time zone", () => {
    const from = new Date("2026-11-02T12:00:00Z");
    const next = nextRunForSchedule("0 9 * * *", "UTC", from);
    expect(next?.toISOString()).toBe("2026-11-03T09:00:00.000Z");
  });

  it("validates cron and rejects sub-five-minute schedules", () => {
    expect(isValidCron("0 9 * * *")).toBe(true);
    expect(isValidCron("bad")).toBe(false);
    expect(
      validateTrigger({
        type: "schedule",
        cron: "* * * * *",
        timeZone: "UTC",
      }).error
    ).toMatch(/five minutes/);
  });

  it("accepts one-time timers in the future and rejects the past", () => {
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    expect(validateTrigger({ type: "timer", at: future }).trigger?.type).toBe(
      "timer"
    );
    expect(
      validateTrigger({ type: "timer", at: "2020-01-01T00:00:00Z" }).error
    ).toMatch(/future/);
  });

  it("parses time inputs", () => {
    expect(parseTimeValue("09:30")).toEqual({ hour: 9, minute: 30 });
  });

  it("infers the edit dialog preset from CRON", () => {
    expect(presetFromCron("0 9 * * *")?.preset).toBe("Daily");
    expect(presetFromCron("30 7 * * 1-5")?.preset).toBe("Weekdays");
    expect(presetFromCron("15 6 * * 2")?.preset).toBe("Weekly");
    expect(presetFromCron("15 8 1 * *")?.preset).toBe("Custom");
  });
});
