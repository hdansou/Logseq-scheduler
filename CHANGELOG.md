# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] — 2026-05-02

First public release. Cron-based page creation for Logseq DB graphs with named schedules, natural language input, automatic date suffixes, tag-as-class application, and a two-pane manager UI.

### Added
- **Named schedules** with label, page name, tag list, and natural-language frequency.
- **Natural-language → cron parser** — phrases like `every Saturday at 11 AM`, `every day at 08:00`, or `every month on the 1st` are parsed into cron expressions, with a live preview as you type.
- **Automatic date suffixes** — frequency inferred from the cron expression, matching suffix appended: daily (`2026-04-09`), weekly (`Week 15`), monthly (`April 2026`), quarterly (`Q2 2026`), semi-annual (`H1 2026`), yearly (`2026`).
- **Tags as page classes** — each tag is resolved (or created) via `createTag` and attached to the page with `addBlockTag`, so Logseq's tag-template rendering fires automatically.
- **Polling scheduler engine** — polls every 30 seconds and listens to `DB.onChanged` as a wake-up, so firings are reliable even when the plugin iframe is hidden.
- **Missed-run catch-up** — on startup, each schedule's most recent expected firing (since the later of its last run or its creation time) is fired once. Schedules never backfill pages for cron times before they were created.
- **Graph-scoped schedules** — each schedule targets specific graphs by name (comma-separated), or `all` to run on every graph. New schedules default to the current graph. On graph switch, the engine restarts and only fires matching schedules.
- **Two-pane manager UI** — sidebar list with search, All/Active/Paused filter tabs, header stats, detail pane with next-fire countdown, configuration card, and recent runs history.
- **Edit existing schedules** in place — preserves `id` and `createdAt`.
- **Run Now / Force Run** — fire a schedule on demand; Force Run deletes and recreates the current-period page.
- **Responsive layout at 680px** — panes stack, back button appears.
- **Keyboard accessibility** — sidebar items are real buttons, form submits on Enter, Esc closes (two-step in edit mode).
- **Dark mode follows Logseq's theme** via `onThemeModeChanged`, not OS colour scheme.
- **Strict page-existence check** via Datascript query requiring `:logseq.class/Page` membership.
- **44 Vitest unit tests** for pure helpers (`filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`, `formatPast`, `isScheduleForGraph`).
- **Global timezone setting** — drives all cron evaluations and date math.
- **Fire log** — persisted history of all firings with source, outcome, and error details.

### Technical
- `@logseq/libs@0.3.2` — fully typed DB-graph APIs, no `as any` casts.
- Cache-first storage layer — in-memory authoritative cache over `logseq.settings` to avoid stale-rerender bugs from fire-and-forget IPC.
- npm overrides for transitive dependency vulnerabilities (`dompurify`, `lodash-es`, `postcss`).

### Known limitations
- `startupDelaySeconds` setting is a no-op (retained for backwards compatibility).
- Existing schedules missing the `createdAt` field fall through to `?? 0` and may backfill on the next poll.
- `src/ui.ts` is ~693 lines — split deferred to a future release.

[Unreleased]: https://github.com/hdansou/Logseq-scheduler/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/hdansou/Logseq-scheduler/releases/tag/v1.0.0
