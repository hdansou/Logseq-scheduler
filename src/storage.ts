import type { FireLogEntry, LastRunMap, ScheduleEntry } from "./types";

/**
 * Persistence layer.
 *
 * We store schedules and last-run timestamps as JSON strings on
 * `logseq.settings`. FileStorage was the natural choice but it requires a
 * filesystem backend that isn't exposed on all Logseq builds (notably DB
 * graphs on web/nightly, which throw "failed to get fs backend").
 *
 * `logseq.settings` is always available and persists across reloads.
 */

const SCHEDULES_KEY = "_schedulesJson";
const LAST_RUN_KEY = "_lastRunJson";
const FIRE_LOG_KEY = "_fireLogJson";
const FIRE_LOG_LIMIT = 50;

type SettingsBag = Record<string, unknown>;

function settings(): SettingsBag {
  return (logseq.settings ?? {}) as SettingsBag;
}

export async function loadSchedules(): Promise<ScheduleEntry[]> {
  try {
    const raw = settings()[SCHEDULES_KEY];
    if (typeof raw !== "string" || !raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ScheduleEntry[]) : [];
  } catch (err) {
    console.error("[scheduler] Failed to load schedules:", err);
    return [];
  }
}

export async function saveSchedules(schedules: ScheduleEntry[]): Promise<void> {
  logseq.updateSettings({ [SCHEDULES_KEY]: JSON.stringify(schedules) });
}

export async function loadLastRuns(): Promise<LastRunMap> {
  try {
    const raw = settings()[LAST_RUN_KEY];
    if (typeof raw !== "string" || !raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as LastRunMap) : {};
  } catch (err) {
    console.error("[scheduler] Failed to load last-runs:", err);
    return {};
  }
}

export async function saveLastRuns(map: LastRunMap): Promise<void> {
  logseq.updateSettings({ [LAST_RUN_KEY]: JSON.stringify(map) });
}

export async function recordLastRun(scheduleId: string, at: number): Promise<void> {
  const map = await loadLastRuns();
  map[scheduleId] = at;
  await saveLastRuns(map);
}

export async function loadFireLog(): Promise<FireLogEntry[]> {
  try {
    const raw = settings()[FIRE_LOG_KEY];
    if (typeof raw !== "string" || !raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as FireLogEntry[]) : [];
  } catch (err) {
    console.error("[scheduler] Failed to load fire log:", err);
    return [];
  }
}

export async function appendFireLog(entry: FireLogEntry): Promise<void> {
  const log = await loadFireLog();
  log.unshift(entry);
  // Keep newest N entries
  const trimmed = log.slice(0, FIRE_LOG_LIMIT);
  logseq.updateSettings({ [FIRE_LOG_KEY]: JSON.stringify(trimmed) });
}
