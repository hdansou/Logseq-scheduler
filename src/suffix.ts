import type { Frequency } from "./types";

/**
 * Infer a coarse frequency classification from a 5-field cron expression.
 * Cron fields: minute hour day-of-month month day-of-week
 *
 * Heuristics:
 *  - Any use of month field with specific months → quarterly / semi-annual / yearly
 *    (quarterly = 4 months, semi-annual = 2 months, yearly = 1 specific month + 1 specific dom)
 *  - Specific day-of-week → weekly
 *  - Specific day-of-month (no day-of-week) → monthly
 *  - Otherwise → daily
 */
export function detectFrequency(cron: string): Frequency {
  const parts = cron.trim().split(/\s+/);
  if (parts.length !== 5) return "unknown";
  const [, , dom, month, dow] = parts;

  if (month !== "*") {
    const monthsListed = countListed(month);
    if (monthsListed === 1) return "yearly";
    if (monthsListed === 2) return "semi-annual";
    if (monthsListed === 4) return "quarterly";
  }

  if (dow !== "*") return "weekly";
  if (dom !== "*") return "monthly";
  return "daily";
}

function countListed(field: string): number {
  // Handle comma-separated lists like "1,7" or step values like "*/3"
  if (field.includes(",")) return field.split(",").length;
  if (field.startsWith("*/")) {
    const step = parseInt(field.slice(2), 10);
    if (!Number.isFinite(step) || step <= 0) return 0;
    return Math.floor(12 / step);
  }
  return 1;
}

/**
 * Build the page name by appending a frequency-appropriate suffix.
 *
 * Examples:
 *  - daily       → "Daily Log - 2026-04-09"
 *  - weekly      → "Weekly Review - Week 15"
 *  - monthly     → "Monthly Report - April 2026"
 *  - quarterly   → "Quarterly Review - Q2 2026"
 *  - semi-annual → "Half-Year Review - H1 2026"
 *  - yearly      → "Annual Review - 2026"
 */
export function buildPageName(
  basePageName: string,
  frequency: Frequency,
  at: Date,
  timezone: string,
): string {
  const parts = getDateParts(at, timezone);

  switch (frequency) {
    case "daily":
      return `${basePageName} - ${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
    case "weekly": {
      const week = isoWeek(at, timezone);
      return `${basePageName} - Week ${week}`;
    }
    case "monthly":
      return `${basePageName} - ${monthName(parts.month)} ${parts.year}`;
    case "quarterly": {
      const q = Math.floor((parts.month - 1) / 3) + 1;
      return `${basePageName} - Q${q} ${parts.year}`;
    }
    case "semi-annual": {
      const h = parts.month <= 6 ? 1 : 2;
      return `${basePageName} - H${h} ${parts.year}`;
    }
    case "yearly":
      return `${basePageName} - ${parts.year}`;
    case "unknown":
    default:
      return `${basePageName} - ${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
  }
}

/**
 * Extract year/month/day in a given timezone. Uses Intl.DateTimeFormat so
 * we don't pull a full date library.
 */
function getDateParts(
  date: Date,
  timezone: string,
): { year: number; month: number; day: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) =>
    parseInt(parts.find((p) => p.type === type)?.value ?? "0", 10);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * ISO 8601 week number calculation for a Date in a given timezone.
 * ISO weeks start on Monday; week 1 is the week with the year's first Thursday.
 */
function isoWeek(date: Date, timezone: string): number {
  const { year, month, day } = getDateParts(date, timezone);
  // Build UTC date representing that local calendar day at noon to avoid DST edges.
  const utc = new Date(Date.UTC(year, month - 1, day, 12));
  // Thursday of the current ISO week
  const dayNum = (utc.getUTCDay() + 6) % 7; // Monday=0..Sunday=6
  utc.setUTCDate(utc.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(utc.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const diffDays = Math.round(
    (utc.getTime() - firstThursday.getTime()) / (24 * 3600 * 1000),
  );
  return Math.floor(diffDays / 7) + 1;
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function monthName(month: number): string {
  return [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ][month - 1] ?? String(month);
}
