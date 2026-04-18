# Logseq Scheduler — Task Tracker

**Last Updated:** 2026-04-18 (SDK upgrade complete)

## Current Sprint

### Chore: Upgrade @logseq/libs 0.0.17 → 0.3.2 (completed 2026-04-18)
Motivation: the new SDK version types all DB-graph APIs (`getTag`, `getTagsByName`,
`createTag`, `addBlockTag`, `getAllTags`, `checkCurrentIsDbGraph`, `DB.onChanged`)
that we currently call via `as any` casts and runtime feature detection. The upgrade
is purely additive — no breaking signature changes for our usage. Removing the casts
improves type safety and catches regressions at compile time.

Approach: TDD — write type-level regression tests first (verify the typed API surface
compiles without casts), then remove the casts and guards, then verify existing tests
+ typecheck + build pass.

- [x] Bump `@logseq/libs` from `"^0.0.17"` to `"0.3.2"` in `package.json`, `npm install`
- [x] Remove `as any` casts and `typeof` guards in `src/page-creator.ts` (tag APIs now typed)
- [x] Remove `as any` cast on `DB.onChanged` and dynamic `checkCurrentIsDbGraph` cast in `src/scheduler.ts`
- [x] `npm run typecheck && npm test && npm run build` — all green
- [x] CHANGELOG entry under `[Unreleased]`

Detailed task breakdown: `tasks/todo.md`

---

### Feature: Graph-Scoped Schedules (completed 2026-04-11)
Motivation: schedules were stored globally per-plugin, not per-graph. Switching
between DB graphs caused the engine to create pages in the wrong graph.

- [x] `graphNames?: string` field on `ScheduleEntry` (comma-separated names, or `"all"`)
- [x] `"skipped-wrong-graph"` fire outcome when a schedule doesn't target the active graph
- [x] `isScheduleForGraph` pure helper with 11 Vitest cases (all, legacy, single, multi, case, whitespace)
- [x] Engine tracks `currentGraphName`, skips non-matching schedules (only when a fire is actually due), logs skip + records lastRun
- [x] `logseq.App.onCurrentGraphChanged` handler: flushes storage caches, restarts engine with new graph name
- [x] `resetCaches()` export in `storage.ts`
- [x] "Graphs" text field in the create/edit form, defaulting to current graph name
- [x] Graph badge on sidebar items and config card (indigo for named graphs, grey italic for "all")
- [x] CSS for graph badge in light + dark mode
- [x] `skipped-wrong-graph` badge colour in fire log (indigo, matching graph badge)
- [x] Legacy schedules (missing `graphNames`) treated as "all" — no migration needed
- [x] Docs: CHANGELOG, README (features, usage, how-firings-work), tasks.md

### Feature: End-to-End Verification (open)
The plugin compiles and runs, but several behaviors still need a green test
in a real Logseq DB graph before this can be called done.

- [x] Page creation works (verified — pages "temp - Week 14" and "temp - Week 15" created)
- [x] Tag application via `addBlockTag` succeeds (verified in console: `addBlockTag OK`)
- [x] Polling engine fires schedules with the panel open (verified — `(poll) firing missed run` log lines)
- [ ] **Visual verification: tag appears in the page header (class assignment), not as a child block**
- [ ] **Verify polling fires reliably with the panel CLOSED for more than a minute**
- [ ] **Verify catch-up after Logseq restart** — close Logseq across a scheduled fire, reopen, confirm the missed page is created exactly once
- [ ] Verify "Run Now twice in a row" → second correctly says "already exists" (no duplicate)
- [ ] Verify "Force Run" deletes and recreates without ghost residue

### Feature: Fire History UI
The fire history is already persisted in `logseq.settings._fireLogJson` (created,
exists, skipped, error outcomes per fire).

- [x] Persist fire log entries via `appendFireLog`
- [x] Render the most recent N entries in the schedule panel (now a "Recent runs" card in the detail pane, last 10 entries; not collapsible, but filtered by the selected schedule)
- [x] Color-code outcomes (green=created, gray=exists, amber=skipped, red=error; see `badge.*` styles in `index.html`)
- [ ] "Clear history" button

### Feature: Polish & Production Readiness
- [x] **`icon.png` 128×128** — generated from `icon.svg` via `rsvg-convert`, lives at repo root next to `package.json`
- [x] README.md with install / usage / settings / supported phrases / troubleshooting
- [x] CHANGELOG.md covering 0.1.0 MVP
- [x] Edit existing schedules — detail pane has an Edit button that reuses the create form pre-filled; Save replaces the entry in place, preserving `id` and `createdAt`
- [ ] Remove the obsolete `startupDelaySeconds` setting (no longer used by the polling engine — currently kept as a no-op for back-compat)
- [ ] Migration: existing `ScheduleEntry` records in settings are missing the new `createdAt` field, so they will fall through to `?? 0` and may backfill on the next poll. Either auto-stamp them on load or document the "delete + re-add" workaround.

### Feature: Test Coverage (deferred until features stabilize)
- [ ] Unit tests for `nl-cron.ts` (every supported phrase pattern)
- [ ] Unit tests for `suffix.ts` (frequency detection + ISO week + Q/H math + DST edges)
- [ ] Unit tests for `db.ts` (mock `logseq.DB.datascriptQuery`)

### Deferred / Out of MVP
- [ ] Per-schedule timezone overrides
- [ ] Slash command to fire a schedule manually (Run Now button covers this need for now)
- [ ] Schedule backup / restore: Export and Import buttons in the UI to download/upload schedules as JSON. Covers cross-machine transfer and disaster recovery. Auto-backup to graph directory deferred further due to filesystem access limitations on DB graphs (web/nightly builds throw "failed to get fs backend").
- [ ] Notifications when a schedule fires
- [ ] Document supported natural language phrases in REQUIREMENTS.md

---

## Completed

### Feature: Two-Pane UI Redesign (completed 2026-04-11)
Motivation: the original single-pane stacked-form panel didn't scale past a handful
of schedules and had no room for per-schedule detail, edit, or run history.
Spec and task breakdown live in `tasks/todo.md`; reference mockup at
`mockups/variant-d-refined.html`.

- [x] Sidebar + detail pane layout with full re-render and `captureFocus` / `restoreFocus` so typing in search doesn't drop focus
- [x] Module-level UI state (`selectedId`, `searchQuery`, `activeTab`, `paneMode`) survives innerHTML rebuilds
- [x] Sidebar search (case-insensitive label match) with counts-stay-totals behaviour
- [x] All / Active / Paused filter tabs with schedule counts
- [x] Sidebar schedule list with ON/OFF status pills; items are `<button>` elements with `aria-pressed` and focus-visible outline
- [x] Header stats (active count, paused count, "Next in N days" via `computeStats` + `formatCountdown`)
- [x] Detail pane view mode with title row, Run Now / Force Run / Pause-Resume / Edit / Delete buttons, soft-blue next-fire card with live countdown, configuration card (tags as chips), Recent runs card
- [x] Detail pane create mode (+ New schedule button in sidebar; form lives in the detail pane, Save is a real `<form>` submit so Enter works)
- [x] Detail pane edit mode (reuses the create form pre-filled; replaces entry in place preserving `id` and `createdAt`)
- [x] Empty state ("No schedules yet" + ⏰ icon) and auto-select-first on panel open
- [x] Responsive breakpoint at 680px: panes stack, back button appears on detail, third stat hides
- [x] Escape key closes the panel; when in create/edit mode Esc first cancels the form back to view mode (two-step), matching the Cancel button semantics
- [x] Dark mode now follows Logseq's theme via `logseq.App.getUserConfigs` + `logseq.App.onThemeModeChanged` (was `prefers-color-scheme` which doesn't fire for Logseq's CSS-class-based dark mode)
- [x] Vitest unit-test suite for pure helpers — `filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`, `formatPast` (33 tests)
- [x] Storage now holds an in-memory authoritative cache so reads after writes return fresh data (fixes the stale-rerender bug where `logseq.updateSettings` is fire-and-forget IPC)
- [x] `PanelCallbacks.runNow` passes `"manual"` or `"force"` to `engine.fire` so the fire log records the right source
- [x] Code review pass, all 🟡 issues fixed (accessibility, error handling, form Enter-to-submit, stale btn ref, escapeHtml single-quote)
- [x] Manual test in Logseq via the `logseq-plugin-tester` skill — two passes; first surfaced three bugs, second confirmed fixes

Refactor backlog: `REFACTOR_BACKLOG.md` item `[R-001]` — `src/ui.ts` is ~660 lines, split into `ui/state.ts`, `ui/sidebar.ts`, `ui/detail.ts`, `ui/form.ts`, `ui/focus.ts` in a dedicated session.

### Feature: Project Scaffold (completed 2026-04-09)
- [x] REQUIREMENTS.md
- [x] `tasks.md`
- [x] Vite + TypeScript + `@logseq/libs` boilerplate
- [x] `npm install`, `npm run typecheck`, `npm run build` all clean

### Feature: Natural Language → Cron Parser (completed 2026-04-09)
- [x] `src/nl-cron.ts` parses daily, weekly (incl. weekday/weekend), monthly, quarterly, semi-annual, yearly
- [x] Lives at `parseNaturalLanguage(input)` with helpful error messages
- [x] Live cron preview in the panel as the user types

### Feature: Frequency Detection + Date Suffix (completed 2026-04-09)
- [x] `detectFrequency(cron)` infers daily / weekly / monthly / quarterly / semi-annual / yearly from a 5-field cron
- [x] `buildPageName` appends the right suffix per frequency:
  - daily → `Page Name - 2026-04-09`
  - weekly → `Page Name - Week 15` (ISO week)
  - monthly → `Page Name - April 2026`
  - quarterly → `Page Name - Q2 2026`
  - semi-annual → `Page Name - H1 2026`
  - yearly → `Page Name - 2026`
- [x] Timezone-aware via `Intl.DateTimeFormat`

### Feature: Persistence Layer (completed 2026-04-09)
- [x] `src/storage.ts` originally used `logseq.FileStorage`
- [x] Migrated to `logseq.settings` after FileStorage threw "failed to get fs backend" on this Logseq build
- [x] Stores schedules, last-run timestamps, fire history under `_schedulesJson`, `_lastRunJson`, `_fireLogJson`

### Feature: Schedule Management UI (completed 2026-04-09)
- [x] Toolbar button (⏰) and command palette entry to open the panel
- [x] Add form: label, page name, tags, natural-language schedule input
- [x] Live cron preview as user types
- [x] Inline error display (replaces the unreliable `logseq.UI.showMsg` toasts)
- [x] Schedule list with toggle / delete / Run Now / Force Run
- [x] "Next fire" timestamp displayed per schedule
- [x] Modal styling (CSS lives in `index.html` because `provideStyle` targets the wrong document)
- [x] Light + dark mode support (originally via `prefers-color-scheme`; later changed to follow Logseq's theme via `logseq.App.onThemeModeChanged` — see the 2026-04-11 redesign entry above)

### Feature: Datascript-Based Page Existence Check (completed 2026-04-10)
- [x] Identified root cause: `logseq.Editor.getPage()` returned stale / non-page entities
- [x] New `src/db.ts` with `findPageByTitle(title)` using a strict Datascript query that requires `:logseq.class/Page` membership
- [x] Permissive fallback query logged for diagnostics when strict returns nothing
- [x] Replaced the `getPage` check in `src/page-creator.ts`

### Feature: Native Settings Heading — Option B (completed 2026-04-10)
- [x] Added `heading`-type setting pointing users to the ⏰ toolbar button for schedule CRUD
- [x] Kept custom panel for the dynamic schedule list (native settings schema can't render dynamic lists)
- [x] Globals (`timezone`, `startupDelaySeconds`) remain in native settings

### Feature: Polling-Based Scheduler Engine (completed 2026-04-10)
Motivation: croner's internal `setTimeout` ticking didn't fire when the
plugin's iframe was hidden (browser timer throttling). User reported that
manual Run Now worked but scheduled cron times never created pages.

- [x] Rewrote `SchedulerEngine` to poll every 30 seconds
- [x] On each poll, walk schedules and fire any with a missed run since `lastRun`
- [x] Hooked `logseq.DB.onChanged` (debounced 5s) as an extra wake-up trigger when the user is active in Logseq
- [x] Added 60-second heartbeat log so we can diagnose iframe liveness from the console
- [x] Croner kept only for *parsing* and `nextRun` / previous-run math, never for ticking
- [x] Removed the now-redundant separate `setTimeout` catch-up block from `index.ts`
- [x] Verified pages are created from the poll source (not just manual triggers)

### Feature: Tag Application as Page Class (completed 2026-04-10)
Motivation: previous fallback wrote `#tagname` into a child block, which
attached the tag to the BLOCK, not the PAGE. The page wasn't actually a
class instance of the tag.

- [x] Removed the `appendBlockInPage("#tag")` fallback (wrong semantics)
- [x] New `resolveTag` helper tries `getTag` → `getTagsByName` → fuzzy match via `getAllTags` (case + separator insensitive)
- [x] If no tag entity exists, `createTag(name)` creates one
- [x] Then `addBlockTag(page.uuid, tag.uuid)` links the tag to the page as a class
- [x] Verified in console: `addBlockTag OK (tagged page with "fast-page")`

### Feature: Prevent Retroactive Backfill on New Schedules (completed 2026-04-10)
Motivation: a freshly added "every Friday at 17:03" schedule fired
immediately for last Friday's cron time, creating an unwanted historical
page (Week 14 in addition to Week 15).

- [x] Added `createdAt: number` field to `ScheduleEntry`
- [x] UI stamps `createdAt = Date.now()` when the user adds a schedule
- [x] Polling walker uses `max(lastRun, createdAt)` as the floor → schedules can never fire for cron times before they were created
- [x] Existing-schedule catch-up still works (lastRun ≥ createdAt for any schedule that has fired before)
