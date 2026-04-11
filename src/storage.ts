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

// In-memory caches.
//
// `logseq.updateSettings` is fire-and-forget IPC: the local `logseq.settings`
// getter does not reflect the new value synchronously. Reading back from
// `logseq.settings` immediately after a write returns stale data, which made
// the panel appear frozen until reopened. We hold the authoritative copy in
// memory and only fall through to `logseq.settings` on the first read after
// plugin start.
let schedulesCache: ScheduleEntry[] | null = null;
let lastRunsCache: LastRunMap | null = null;
let fireLogCache: FireLogEntry[] | null = null;

export async function loadSchedules(): Promise<ScheduleEntry[]> {
  if (schedulesCache !== null) return schedulesCache;
  try {
    const raw = settings()[SCHEDULES_KEY];
    if (typeof raw !== "string" || !raw) {
      schedulesCache = [];
      return schedulesCache;
    }
    const parsed = JSON.parse(raw);
    schedulesCache = Array.isArray(parsed) ? (parsed as ScheduleEntry[]) : [];
    return schedulesCache;
  } catch (err) {
    console.error("[scheduler] Failed to load schedules:", err);
    schedulesCache = [];
    return schedulesCache;
  }
}

export async function saveSchedules(schedules: ScheduleEntry[]): Promise<void> {
  schedulesCache = [...schedules];
  logseq.updateSettings({ [SCHEDULES_KEY]: JSON.stringify(schedules) });
}

export async function loadLastRuns(): Promise<LastRunMap> {
  if (lastRunsCache !== null) return lastRunsCache;
  try {
    const raw = settings()[LAST_RUN_KEY];
    if (typeof raw !== "string" || !raw) {
      lastRunsCache = {};
      return lastRunsCache;
    }
    const parsed = JSON.parse(raw);
    lastRunsCache =
      parsed && typeof parsed === "object" ? (parsed as LastRunMap) : {};
    return lastRunsCache;
  } catch (err) {
    console.error("[scheduler] Failed to load last-runs:", err);
    lastRunsCache = {};
    return lastRunsCache;
  }
}

export async function saveLastRuns(map: LastRunMap): Promise<void> {
  lastRunsCache = { ...map };
  logseq.updateSettings({ [LAST_RUN_KEY]: JSON.stringify(map) });
}

export async function recordLastRun(scheduleId: string, at: number): Promise<void> {
  const map = await loadLastRuns();
  map[scheduleId] = at;
  await saveLastRuns(map);
}

export async function loadFireLog(): Promise<FireLogEntry[]> {
  if (fireLogCache !== null) return fireLogCache;
  try {
    const raw = settings()[FIRE_LOG_KEY];
    if (typeof raw !== "string" || !raw) {
      fireLogCache = [];
      return fireLogCache;
    }
    const parsed = JSON.parse(raw);
    fireLogCache = Array.isArray(parsed) ? (parsed as FireLogEntry[]) : [];
    return fireLogCache;
  } catch (err) {
    console.error("[scheduler] Failed to load fire log:", err);
    fireLogCache = [];
    return fireLogCache;
  }
}

export async function appendFireLog(entry: FireLogEntry): Promise<void> {
  const log = await loadFireLog();
  const next = [entry, ...log].slice(0, FIRE_LOG_LIMIT);
  fireLogCache = next;
  logseq.updateSettings({ [FIRE_LOG_KEY]: JSON.stringify(next) });
}
