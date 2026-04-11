import { describe, it, expect } from "vitest";
import {
  filterSchedules,
  searchSchedules,
  computeStats,
  formatCountdown,
  formatPast,
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

describe("formatPast", () => {
  const now = new Date("2026-04-11T12:00:00Z");

  it("returns 'just now' for sub-minute past", () => {
    expect(formatPast(new Date("2026-04-11T11:59:30Z"), now)).toBe("just now");
  });

  it("returns '1 min ago' for exactly one minute past", () => {
    expect(formatPast(new Date("2026-04-11T11:59:00Z"), now)).toBe("1 min ago");
  });

  it("returns 'N min ago' for sub-hour past", () => {
    expect(formatPast(new Date("2026-04-11T11:55:00Z"), now)).toBe("5 min ago");
  });

  it("returns '1 hr ago' for exactly one hour past", () => {
    expect(formatPast(new Date("2026-04-11T11:00:00Z"), now)).toBe("1 hr ago");
  });

  it("returns 'N hr ago' for sub-day past", () => {
    expect(formatPast(new Date("2026-04-11T09:00:00Z"), now)).toBe("3 hr ago");
  });

  it("returns 'yesterday' for differences between 24 and 48 hours", () => {
    expect(formatPast(new Date("2026-04-10T12:00:00Z"), now)).toBe("yesterday");
  });

  it("returns 'N days ago' for multi-day past within a month", () => {
    expect(formatPast(new Date("2026-04-05T12:00:00Z"), now)).toBe("6 days ago");
  });

  it("falls back to a date string for past further than 30 days", () => {
    const longAgo = new Date("2026-02-01T12:00:00Z");
    const result = formatPast(longAgo, now);
    expect(result).not.toMatch(/ago$/);
    expect(result).not.toBe("yesterday");
  });
});
