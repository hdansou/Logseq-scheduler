import { describe, it, expect } from "vitest";
import {
  filterSchedules,
  searchSchedules,
  computeStats,
  formatCountdown,
} from "../schedule-helpers";
import type { ScheduleEntry } from "../types";

function makeSchedule(overrides: Partial<ScheduleEntry> = {}): ScheduleEntry {
  return {
    id: "sch_1",
    label: "Weekly Review",
    pageName: "Weekly Review",
    tags: ["weekly-review"],
    naturalLanguage: "every Saturday at 11 AM",
    cron: "0 11 * * 6",
    enabled: true,
    createdAt: 0,
    ...overrides,
  };
}

describe("filterSchedules", () => {
  const schedules = [
    makeSchedule({ id: "a", enabled: true }),
    makeSchedule({ id: "b", enabled: false }),
    makeSchedule({ id: "c", enabled: true }),
  ];

  it("returns all schedules for the 'all' tab", () => {
    expect(filterSchedules(schedules, "all")).toHaveLength(3);
  });

  it("returns only enabled schedules for the 'active' tab", () => {
    const result = filterSchedules(schedules, "active");
    expect(result.map((s) => s.id)).toEqual(["a", "c"]);
  });

  it("returns only disabled schedules for the 'paused' tab", () => {
    const result = filterSchedules(schedules, "paused");
    expect(result.map((s) => s.id)).toEqual(["b"]);
  });

  it("returns empty array for empty input on every tab", () => {
    expect(filterSchedules([], "all")).toEqual([]);
    expect(filterSchedules([], "active")).toEqual([]);
    expect(filterSchedules([], "paused")).toEqual([]);
  });
});

describe("searchSchedules", () => {
  const schedules = [
    makeSchedule({ id: "a", label: "Weekly Review" }),
    makeSchedule({ id: "b", label: "Daily Standup" }),
    makeSchedule({ id: "c", label: "Monthly Retro" }),
  ];

  it("returns all schedules when the query is empty", () => {
    expect(searchSchedules(schedules, "")).toHaveLength(3);
  });

  it("returns all schedules when the query is whitespace only", () => {
    expect(searchSchedules(schedules, "   ")).toHaveLength(3);
  });

  it("matches label case-insensitively", () => {
    const result = searchSchedules(schedules, "weekly");
    expect(result.map((s) => s.id)).toEqual(["a"]);
  });

  it("matches a partial label", () => {
    const result = searchSchedules(schedules, "Stand");
    expect(result.map((s) => s.id)).toEqual(["b"]);
  });

  it("returns an empty array when no label matches", () => {
    expect(searchSchedules(schedules, "nonexistent")).toEqual([]);
  });

  it("returns an empty array for empty input", () => {
    expect(searchSchedules([], "anything")).toEqual([]);
  });
});

describe("computeStats", () => {
  it("counts active and paused schedules separately", () => {
    const schedules = [
      makeSchedule({ id: "a", enabled: true }),
      makeSchedule({ id: "b", enabled: true }),
      makeSchedule({ id: "c", enabled: false }),
    ];
    const stats = computeStats(schedules, () => null);
    expect(stats.activeCount).toBe(2);
    expect(stats.pausedCount).toBe(1);
  });

  it("returns zero counts and null soonest for empty input", () => {
    const stats = computeStats([], () => null);
    expect(stats.activeCount).toBe(0);
    expect(stats.pausedCount).toBe(0);
    expect(stats.soonestNextFire).toBeNull();
  });

  it("returns the soonest next-fire across enabled schedules", () => {
    const earlyDate = new Date("2026-04-13T09:30:00Z");
    const lateDate = new Date("2026-04-18T11:00:00Z");
    const schedules = [
      makeSchedule({ id: "a", enabled: true }),
      makeSchedule({ id: "b", enabled: true }),
    ];
    const nextRunFor = (id: string) => {
      if (id === "a") return lateDate;
      if (id === "b") return earlyDate;
      return null;
    };
    const stats = computeStats(schedules, nextRunFor);
    expect(stats.soonestNextFire).toEqual(earlyDate);
  });

  it("ignores disabled schedules when computing soonestNextFire", () => {
    const enabledLate = new Date("2026-04-20T11:00:00Z");
    const disabledEarly = new Date("2026-04-12T08:00:00Z");
    const schedules = [
      makeSchedule({ id: "a", enabled: true }),
      makeSchedule({ id: "b", enabled: false }),
    ];
    const nextRunFor = (id: string) => {
      if (id === "a") return enabledLate;
      if (id === "b") return disabledEarly;
      return null;
    };
    const stats = computeStats(schedules, nextRunFor);
    expect(stats.soonestNextFire).toEqual(enabledLate);
  });

  it("returns null soonestNextFire when no enabled schedule has a next fire", () => {
    const schedules = [
      makeSchedule({ id: "a", enabled: true }),
      makeSchedule({ id: "b", enabled: false }),
    ];
    const stats = computeStats(schedules, () => null);
    expect(stats.soonestNextFire).toBeNull();
  });
});

describe("formatCountdown", () => {
  const now = new Date("2026-04-11T12:00:00Z");

  it("returns an em dash when target is null", () => {
    expect(formatCountdown(null, now)).toBe("—");
  });

  it("returns an em dash when target is in the past", () => {
    const past = new Date("2026-04-10T12:00:00Z");
    expect(formatCountdown(past, now)).toBe("—");
  });

  it("returns 'just now' for sub-minute differences", () => {
    const soon = new Date("2026-04-11T12:00:30Z");
    expect(formatCountdown(soon, now)).toBe("just now");
  });

  it("returns 'in 1 min' for exactly one minute", () => {
    const oneMin = new Date("2026-04-11T12:01:00Z");
    expect(formatCountdown(oneMin, now)).toBe("in 1 min");
  });

  it("returns 'in N min' for sub-hour differences", () => {
    const fiveMin = new Date("2026-04-11T12:05:00Z");
    expect(formatCountdown(fiveMin, now)).toBe("in 5 min");
  });

  it("returns 'in N hr' for sub-day differences", () => {
    const threeHours = new Date("2026-04-11T15:00:00Z");
    expect(formatCountdown(threeHours, now)).toBe("in 3 hr");
  });

  it("returns 'tomorrow' for differences between 24 and 48 hours", () => {
    const tomorrow = new Date("2026-04-12T12:00:00Z");
    expect(formatCountdown(tomorrow, now)).toBe("tomorrow");
  });

  it("returns 'in N days' for multi-day differences within a month", () => {
    const sixDays = new Date("2026-04-17T12:00:00Z");
    expect(formatCountdown(sixDays, now)).toBe("in 6 days");
  });

  it("returns 'in 1 month' for differences just over 30 days", () => {
    const fortyDays = new Date("2026-05-21T12:00:00Z");
    expect(formatCountdown(fortyDays, now)).toBe("in 1 month");
  });

  it("returns plural months for differences >= 60 days", () => {
    const sixtyFiveDays = new Date("2026-06-15T12:00:00Z");
    expect(formatCountdown(sixtyFiveDays, now)).toBe("in 2 months");
  });
});
