# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Plugin `icon.png` (128×128) so the plugin can be loaded in production.
- `README.md` with installation, usage, supported phrases, settings, and troubleshooting.
- `CHANGELOG.md` tracking notable changes.

### Planned
- Fire-history UI: render recent entries from `_fireLogJson` in the panel, colour-coded by outcome, with a "Clear history" action.
- Edit existing schedules in place (currently add / delete / toggle only).
- Remove the obsolete `startupDelaySeconds` setting.
- Migration: auto-stamp `createdAt` on pre-existing `ScheduleEntry` records, or document the delete + re-add workaround.
- Unit tests for `nl-cron.ts`, `suffix.ts`, and `db.ts`.

## [0.1.0] — 2026-04-10

Initial MVP. Creates pages on cron schedules in Logseq DB graphs with tags applied as page classes.

### Added
- **Schedule management panel** — toolbar button (⏰) and command-palette entry (`Scheduler: Open panel`) open a modal listing schedules with add / delete / toggle / Run Now / Force Run controls.
- **Natural-language → cron parser** (`src/nl-cron.ts`) — supports daily, weekday/weekend, weekly-by-day, monthly-by-nth, quarterly, semi-annual, and yearly patterns with a live cron preview in the add form.
- **Frequency detection + date suffixes** (`src/suffix.ts`) — infers frequency from a 5-field cron expression and appends the matching suffix:
  - Daily → `Page Name - 2026-04-09`
  - Weekly → `Page Name - Week 15` (ISO week)
  - Monthly → `Page Name - April 2026`
  - Quarterly → `Page Name - Q2 2026`
  - Semi-annual → `Page Name - H1 2026`
  - Yearly → `Page Name - 2026`
- **Polling scheduler engine** (`src/scheduler.ts`) — polls every 30 seconds and listens to `logseq.DB.onChanged` (debounced) as a wake-up trigger, so schedules fire reliably even when the plugin iframe is hidden and browser timers are throttled. Croner is used only for parsing and `nextRun`/previous-run math.
- **Missed-run catch-up** — on startup and on each poll, each enabled schedule fires its most recent missed cron time since `max(lastRun, createdAt)`. Newly-added schedules cannot backfill pages for cron times before they were created.
- **Strict page-existence check** (`src/db.ts`) — `findPageByTitle` runs a Datascript query that requires `:logseq.class/Page` membership, avoiding stale or non-page entities returned by `logseq.Editor.getPage`. A permissive fallback query is logged for diagnostics.
- **Tag-as-class application** (`src/page-creator.ts`) — `resolveTag` tries `getTag` → `getTagsByName` → fuzzy match via `getAllTags`, creating the tag if none exists, then attaches it to the page via `addBlockTag(page.uuid, tag.uuid)`. No more `#tag` fallback into a child block.
- **Persistence via `logseq.settings`** (`src/storage.ts`) — schedules, last-run timestamps, and fire-log entries are stored under `_schedulesJson`, `_lastRunJson`, and `_fireLogJson`. (Originally used `logseq.FileStorage`; migrated after the local Logseq build threw `failed to get fs backend`.)
- **Global settings** — `timezone` (IANA, defaults to system timezone) and a heading pointing users to the ⏰ toolbar button for schedule CRUD.
- **Light + dark mode panel styling** via `prefers-color-scheme`, inlined into `index.html` because `provideStyle` targets the Logseq main window rather than the plugin iframe.
- **`createdAt` field on `ScheduleEntry`** — stamped when the user adds a schedule and used as the catch-up floor so new schedules don't retroactively create pages.

### Known gaps
- Visual verification that tags appear in the page header (class assignment) rather than as a child block is still pending.
- Catch-up after a real Logseq restart across a scheduled fire needs end-to-end verification.
- Existing `ScheduleEntry` records from before the `createdAt` field was added fall through to `?? 0` and may backfill on the next poll.

[Unreleased]: #unreleased
[0.1.0]: #010--2026-04-10
