import type { ScheduleEntry } from "./types";

export type FilterTab = "all" | "active" | "paused";

export interface ScheduleStats {
  activeCount: number;
  pausedCount: number;
  soonestNextFire: Date | null;
}

export function filterSchedules(
  schedules: ScheduleEntry[],
  tab: FilterTab,
): ScheduleEntry[] {
  if (tab === "all") return schedules;
  if (tab === "active") return schedules.filter((s) => s.enabled);
  return schedules.filter((s) => !s.enabled);
}

export function searchSchedules(
  schedules: ScheduleEntry[],
  query: string,
): ScheduleEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return schedules;
  return schedules.filter((s) => s.label.toLowerCase().includes(needle));
}

export function computeStats(
  schedules: ScheduleEntry[],
  nextRunFor: (id: string) => Date | null,
): ScheduleStats {
  let activeCount = 0;
  let pausedCount = 0;
  let soonest: Date | null = null;
  for (const s of schedules) {
    if (s.enabled) {
      activeCount++;
      const next = nextRunFor(s.id);
      if (next && (!soonest || next < soonest)) {
        soonest = next;
      }
    } else {
      pausedCount++;
    }
  }
  return { activeCount, pausedCount, soonestNextFire: soonest };
}

const MIN_MS = 60_000;
const HOUR_MS = 60 * MIN_MS;
const DAY_MS = 24 * HOUR_MS;
const MONTH_MS = 30 * DAY_MS;

export function formatCountdown(target: Date | null, now: Date): string {
  if (!target) return "—";
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return "—";
  if (diff < MIN_MS) return "just now";
  if (diff < HOUR_MS) {
    const min = Math.floor(diff / MIN_MS);
    return `in ${min} min`;
  }
  if (diff < DAY_MS) {
    const hr = Math.floor(diff / HOUR_MS);
    return `in ${hr} hr`;
  }
  if (diff < 2 * DAY_MS) return "tomorrow";
  if (diff < MONTH_MS) {
    const days = Math.floor(diff / DAY_MS);
    return `in ${days} days`;
  }
  const months = Math.floor(diff / MONTH_MS);
  return months === 1 ? "in 1 month" : `in ${months} months`;
}

export function formatPast(target: Date, now: Date): string {
  const diff = now.getTime() - target.getTime();
  if (diff < 0) return target.toLocaleString();
  if (diff < MIN_MS) return "just now";
  if (diff < HOUR_MS) {
    const min = Math.floor(diff / MIN_MS);
    return min === 1 ? "1 min ago" : `${min} min ago`;
  }
  if (diff < DAY_MS) {
    const hr = Math.floor(diff / HOUR_MS);
    return hr === 1 ? "1 hr ago" : `${hr} hr ago`;
  }
  if (diff < 2 * DAY_MS) return "yesterday";
  if (diff < MONTH_MS) {
    const days = Math.floor(diff / DAY_MS);
    return `${days} days ago`;
  }
  return target.toLocaleDateString();
}
