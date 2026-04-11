export type Frequency =
  | "daily"
  | "weekly"
  | "monthly"
  | "quarterly"
  | "semi-annual"
  | "yearly"
  | "unknown";

export interface ScheduleEntry {
  /** Stable unique id (uuid-ish string). */
  id: string;
  /** User-facing label used in the settings UI to distinguish schedules. */
  label: string;
  /** Prefix of the page to create; a frequency-appropriate suffix is appended. */
  pageName: string;
  /** One or more tag names to apply to the created page. */
  tags: string[];
  /** Natural-language description of the schedule as typed by the user. */
  naturalLanguage: string;
  /** Computed cron expression (5-field, minute-hour-dom-month-dow). */
  cron: string;
  /** Whether the schedule is currently active. */
  enabled: boolean;
  /**
   * Creation time in ms since epoch. Used as a floor for the catch-up walker
   * so that newly-added schedules never fire retroactively for dates that
   * pre-date the schedule itself.
   */
  createdAt: number;
}

export interface GlobalSettings {
  /** IANA timezone used for cron evaluation and date math, e.g., "America/Chicago". */
  timezone: string;
  /** Delay in seconds before the plugin runs startup catch-up checks. */
  startupDelaySeconds: number;
}

export interface LastRunMap {
  /** Map of schedule id → last successful fire time (ms since epoch). */
  [scheduleId: string]: number;
}

export type FireOutcome = "created" | "exists" | "skipped" | "error";

export interface FireLogEntry {
  /** When the fire was attempted (ms since epoch). */
  at: number;
  /** Schedule id and human-readable label at time of fire. */
  scheduleId: string;
  scheduleLabel: string;
  /** Source of the invocation. */
  source: "cron" | "manual" | "force" | "catch-up";
  outcome: FireOutcome;
  /** Name of the page that would have been / was created. */
  pageName?: string;
  /** Error message if the outcome was 'error'. */
  error?: string;
}
