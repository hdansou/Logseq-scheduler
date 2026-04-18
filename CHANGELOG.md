# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed
- **Upgraded `@logseq/libs` from 0.0.17 to 0.3.2.** The new SDK types all DB-graph APIs (`getTag`, `getTagsByName`, `createTag`, `addBlockTag`, `getAllTags`, `checkCurrentIsDbGraph`, `DB.onChanged`) that were previously called via `as any` casts and runtime `typeof` guards. All casts and feature-detection code removed — the typed interface is now used directly. No runtime behavior changes; purely a type-safety improvement.

### Added
- **Graph-scoped schedules.** Each schedule now carries a `graphNames` field (comma-separated graph names, or `"all"`). New schedules default to the current graph's name. The engine skips schedules that don't target the active graph, logging `skipped-wrong-graph` to the fire log. On graph switch, storage caches are flushed and the engine restarts with the new graph context. Existing schedules without the field are treated as `"all"` (runs on every graph), preserving current behavior.
- **Graph badges in the UI.** Sidebar schedule items and the detail-pane configuration card show the target graph(s) as a badge. The create/edit form includes a "Graphs" text field defaulting to the current graph name.
- **Two-pane schedule manager UI.** Replaces the single-pane stacked-form layout with a sidebar list + detail pane, built from the approved Variant D mockup in `mockups/variant-d-refined.html`. Sidebar has search, All/Active/Paused filter tabs with counts, schedule items with ON/OFF pills, and a "+ New schedule" button at the bottom. Detail pane renders the selected schedule's full configuration, a live next-fire countdown, and recent runs — or the create/edit form when adding or modifying a schedule.
- **Edit existing schedules.** The detail pane's Edit button reuses the create form pre-filled; saving replaces the schedule in place while preserving `id` and `createdAt`. Previously the only way to change a schedule was to delete and re-add it.
- **Search schedules** by label (case-insensitive, partial match) directly from the sidebar. Input focus and cursor position are preserved across re-renders.
- **Filter tabs** (All / Active / Paused) with counts that always reflect totals, not the current search.
- **Header stats row** showing active schedule count, paused count, and the soonest next-fire countdown across all enabled schedules.
- **Recent runs card** in the detail pane: last 10 fire-log entries for the selected schedule, each with a relative time, a source pill (`cron` / `manual` / `force` / `catch-up`), and a colour-coded outcome badge (`created` / `exists` / `skipped` / `error`). Error messages surface as row tooltips.
- **Responsive layout at 680px.** Below the breakpoint the panes stack, a "← Schedules" back button appears on the detail pane, and the third header stat hides to prevent wrapping.
- **Keyboard accessibility.** Sidebar items are real `<button>` elements with `aria-pressed` and a focus-visible outline. Search input has an `aria-label`. The create/edit form is a real `<form>` so Enter submits from any field. Pressing <kbd>Esc</kbd> closes the panel; when in create/edit mode the first <kbd>Esc</kbd> cancels the form back to view mode, so a second press is needed to close (matches the Cancel button semantics and protects against accidentally losing form input).
- **Vitest unit-test suite** for pure helpers (`src/schedule-helpers.ts`, 44 tests covering `filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`, `formatPast`, `isScheduleForGraph`). New `npm test` script.
- **Plugin `icon.png`** (128×128) so the plugin can be loaded in production.
- **`README.md`** with installation, usage, supported phrases, settings, and troubleshooting.
- **`CHANGELOG.md`** tracking notable changes.

### Changed
- **Dark mode follows Logseq's theme** instead of the OS colour scheme. Previously the plugin iframe used `@media (prefers-color-scheme: dark)`, which doesn't react to Logseq's CSS-class-based dark mode. `src/index.ts` now reads `logseq.App.getUserConfigs()` for the initial theme and subscribes to `logseq.App.onThemeModeChanged` to toggle a `dark` class on the iframe's `<html>`; the CSS uses `html.dark` selectors. Switches live without reopening the panel.
- **Storage layer holds an in-memory authoritative cache.** `logseq.updateSettings` is fire-and-forget IPC, so `logseq.settings` doesn't reflect a write synchronously — reads immediately after writes returned stale data and made every mutation appear to do nothing until the panel was reopened. `src/storage.ts` now caches schedules, last-runs, and the fire log in module-level state; `logseq.settings` is only consulted on the first read after plugin start.

### Fixed
- **Run Now source mislabeled as `cron`.** `PanelCallbacks.runNow` in `src/index.ts` called `engine.fire` without passing the source argument, so fire-log entries for manual triggers got the default `cron`. Now passes `"manual"` or `"force"` based on the `force` flag.

### Planned
- Remove the obsolete `startupDelaySeconds` setting.
- Migration: auto-stamp `createdAt` on pre-existing `ScheduleEntry` records, or document the delete + re-add workaround.
- "Clear history" action for the Recent runs card.
- Split `src/ui.ts` (~660 lines) into focused submodules — tracked in `REFACTOR_BACKLOG.md` as `[R-001]`.
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
