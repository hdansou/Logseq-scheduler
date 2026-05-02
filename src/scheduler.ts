import { Cron } from "croner";
import { createScheduledPage, type CreateOptions } from "./page-creator";
import {
  appendFireLog,
  loadLastRuns,
  loadSchedules,
  recordLastRun,
} from "./storage";
import { isScheduleForGraph } from "./schedule-helpers";
import type {
  FireLogEntry,
  FireOutcome,
  GlobalSettings,
  ScheduleEntry,
} from "./types";

/**
 * Scheduler engine.
 *
 * Originally used croner's internal setTimeout-based scheduling. That turned
 * out to be unreliable in Logseq: when the plugin's iframe is hidden, the
 * browser throttles timers heavily and callbacks can be skipped entirely.
 *
 * We now use **polling**: every `POLL_INTERVAL_MS` we iterate through the
 * schedules and compute whether each one should have fired since its last
 * recorded run. If so, we fire it (once per missed window, using the most
 * recent missed fire time). We also listen for `logseq.DB.onChanged` as an
 * additional wake-up signal, so that any user activity in Logseq retriggers
 * the check even if the interval itself is throttled.
 *
 * Croner is still used — but only for *parsing* the cron expression and
 * computing next/previous fire times, never for scheduling callbacks.
 */

const POLL_INTERVAL_MS = 30_000;

export class SchedulerEngine {
  private currentSchedules: ScheduleEntry[] = [];
  private currentSettings: GlobalSettings | null = null;
  private currentGraphName = "";
  private pollTimer: number | null = null;
  private dbOffHook: (() => void) | null = null;
  private heartbeatTimer: number | null = null;
  private dbChangeDebounce: number | null = null;

  /** Expose next-run time for a schedule id (UI uses this to render status). */
  nextRunFor(scheduleId: string): Date | null {
    if (!this.currentSettings) return null;
    const schedule = this.currentSchedules.find((s) => s.id === scheduleId);
    if (!schedule || !schedule.enabled) return null;
    try {
      const job = new Cron(schedule.cron, {
        timezone: this.currentSettings.timezone,
      });
      return job.nextRun();
    } catch {
      return null;
    }
  }

  start(schedules: ScheduleEntry[], settings: GlobalSettings, graphName: string): void {
    this.stop();
    this.currentSchedules = schedules;
    this.currentSettings = settings;
    this.currentGraphName = graphName;

    console.info(
      `[scheduler] Starting engine with ${schedules.length} schedule(s); graph="${graphName}"; timezone=${settings.timezone}; pollInterval=${POLL_INTERVAL_MS}ms`,
    );

    for (const schedule of schedules) {
      if (!schedule.enabled) {
        console.info(`[scheduler]   "${schedule.label}" — disabled, skipped`);
        continue;
      }
      try {
        const job = new Cron(schedule.cron, { timezone: settings.timezone });
        const next = job.nextRun();
        console.info(
          `[scheduler]   "${schedule.label}" cron="${schedule.cron}" next fire=${
            next ? next.toISOString() : "never"
          }`,
        );
      } catch (err) {
        console.error(
          `[scheduler] Failed to parse schedule "${schedule.label}":`,
          err,
        );
      }
    }

    // Poll interval — our primary fire mechanism, robust against throttling.
    this.pollTimer = window.setInterval(() => {
      this.pollAndFire("poll").catch((err) =>
        console.error("[scheduler] poll error:", err),
      );
    }, POLL_INTERVAL_MS);

    // DB activity hook — extra wake-up signal if the interval is throttled
    // but the user is actively using Logseq.
    try {
      this.dbOffHook = logseq.DB.onChanged(() => {
        if (this.dbChangeDebounce !== null) {
          window.clearTimeout(this.dbChangeDebounce);
        }
        this.dbChangeDebounce = window.setTimeout(() => {
          this.dbChangeDebounce = null;
          this.pollAndFire("db-activity").catch((err) =>
            console.error("[scheduler] db-activity poll error:", err),
          );
        }, 5_000);
      });
    } catch (err) {
      console.warn("[scheduler] Could not attach DB.onChanged hook:", err);
    }

    // Heartbeat: periodic log so we can diagnose iframe liveness.
    this.heartbeatTimer = window.setInterval(() => {
      console.info(
        `[scheduler] ♥ heartbeat @ ${new Date().toISOString()} (schedules=${
          this.currentSchedules.length
        })`,
      );
    }, 60_000);

    // Immediate first poll so newly-added schedules get caught up.
    this.pollAndFire("startup").catch((err) =>
      console.error("[scheduler] startup poll error:", err),
    );
  }

  stop(): void {
    if (this.pollTimer !== null) {
      window.clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer !== null) {
      window.clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.dbChangeDebounce !== null) {
      window.clearTimeout(this.dbChangeDebounce);
      this.dbChangeDebounce = null;
    }
    if (this.dbOffHook) {
      try {
        this.dbOffHook();
      } catch {
        /* ignore */
      }
      this.dbOffHook = null;
    }
    this.currentSchedules = [];
    this.currentSettings = null;
  }

  /**
   * Walk each active schedule, find any fire times that are due
   * (i.e. next expected fire ≤ now AND later than lastRun), and fire them.
   * Only the most recent missed fire per schedule is materialized to avoid
   * creating many stale pages in one sweep.
   */
  private async pollAndFire(
    source: FireLogEntry["source"] | "poll" | "startup" | "db-activity",
  ): Promise<void> {
    if (!this.currentSettings) return;
    const now = new Date();
    // Reload from storage so we see any edits made since start() was called.
    const schedules = await loadSchedules();
    this.currentSchedules = schedules;

    const lastRuns = await loadLastRuns();

    for (const schedule of schedules) {
      if (!schedule.enabled) continue;
      // Floor at max(lastRun, createdAt) so a newly-added schedule never
      // backfills dates that pre-date its own creation.
      const lastRun = lastRuns[schedule.id] ?? 0;
      const floor = Math.max(lastRun, schedule.createdAt ?? 0);
      const mostRecent = computeMostRecentFire(
        schedule.cron,
        this.currentSettings.timezone,
        now,
        floor,
      );
      if (!mostRecent) continue;
      if (mostRecent.getTime() <= floor) continue;

      if (!isScheduleForGraph(schedule, this.currentGraphName)) {
        console.info(
          `[scheduler] (${source}) skipping "${schedule.label}" — not for graph "${this.currentGraphName}"`,
        );
        await appendFireLog({
          at: mostRecent.getTime(),
          scheduleId: schedule.id,
          scheduleLabel: schedule.label,
          source: "cron",
          outcome: "skipped-wrong-graph",
        });
        await recordLastRun(schedule.id, mostRecent.getTime());
        continue;
      }

      console.info(
        `[scheduler] (${source}) firing missed run for "${schedule.label}" @ ${mostRecent.toISOString()}`,
      );
      const normalizedSource: FireLogEntry["source"] =
        source === "startup" || source === "db-activity" ? "catch-up" : "cron";
      await this.fire(schedule, this.currentSettings, mostRecent, {}, normalizedSource);
    }
  }

  /** Execute one schedule firing. Safe to call from catch-up or live cron. */
  async fire(
    schedule: ScheduleEntry,
    settings: GlobalSettings,
    firedAt: Date,
    opts: CreateOptions = {},
    source: FireLogEntry["source"] = "cron",
  ): Promise<void> {
    console.info(
      `[scheduler] FIRE "${schedule.label}" at ${firedAt.toISOString()} (source=${source})`,
    );
    let outcome: FireOutcome = "skipped";
    let pageName: string | undefined;
    let errorMsg: string | undefined;
    try {
      // Guard: tags-as-classes is a DB-graph feature.
      const isDb = await logseq.App.checkCurrentIsDbGraph();
      if (!isDb) {
        console.warn(
          "[scheduler] Current graph is not a DB graph; skipping page creation.",
        );
        outcome = "skipped";
        return;
      }
      const result = await createScheduledPage(
        schedule,
        firedAt,
        settings.timezone,
        opts,
      );
      pageName = result.pageName;
      outcome = result.created ? "created" : "exists";
      await recordLastRun(schedule.id, firedAt.getTime());
      if (result.created) {
        console.info(
          `[scheduler] Created page "${result.pageName}" for schedule "${schedule.label}"`,
        );
      } else {
        console.info(
          `[scheduler] Page "${result.pageName}" already exists; skipped.`,
        );
      }
    } catch (err: unknown) {
      outcome = "error";
      errorMsg = err instanceof Error ? err.message : String(err);
      console.error(
        `[scheduler] Error firing schedule "${schedule.label}":`,
        err,
      );
    } finally {
      await appendFireLog({
        at: firedAt.getTime(),
        scheduleId: schedule.id,
        scheduleLabel: schedule.label,
        source,
        outcome,
        pageName,
        error: errorMsg,
      });
    }
  }

}

/**
 * Compute the most recent scheduled firing time that should have occurred
 * at or before `now`, by walking forward from a start point with `nextRun`.
 *
 * `lastRecorded` anchors the walk so we don't have to scan from the epoch.
 * If there is no recorded last run, fall back to 400 days before now — long
 * enough to catch any yearly schedule that fired before a cold start.
 */
function computeMostRecentFire(
  cron: string,
  timezone: string,
  now: Date,
  lastRecorded: number,
): Date | null {
  const start =
    lastRecorded > 0
      ? new Date(lastRecorded)
      : new Date(now.getTime() - 400 * 24 * 3600 * 1000);

  const job = new Cron(cron, { timezone });
  let previous: Date | null = null;
  let cursor: Date | null = start;

  // Hard cap to avoid runaway loops on malformed crons.
  for (let i = 0; i < 10_000; i++) {
    const next = job.nextRun(cursor);
    if (!next) break;
    if (next.getTime() > now.getTime()) break;
    previous = next;
    cursor = next;
  }
  return previous;
}
