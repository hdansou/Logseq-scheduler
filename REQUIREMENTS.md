# Logseq Scheduler — Requirements

## Goal

A Logseq DB plugin that creates pages on cron-based schedules, automatically appending a date/period suffix and applying user-defined tags (whose template rendering is handled by Logseq's built-in tag → template association).

## User Stories

1. As a user, I want to define multiple named schedules so I can separate work and personal recurring pages.
2. As a user, I want to describe a schedule in natural language (e.g., "every Saturday at 11 AM") and see the computed cron expression so I can confirm it's correct.
3. As a user, I want the plugin to auto-append a date suffix to the page name based on the schedule's frequency, so pages are unique per period (e.g., `Weekly Review - Week 15`).
4. As a user, I want to assign multiple tags to the page a schedule creates, so template rendering and filtering work across multiple dimensions.
5. As a user, I want to set one global timezone so schedules fire at the expected local time regardless of the machine's clock.
6. As a user, I want missed schedules to be detected and created retroactively after Logseq starts, so I don't lose pages when the app was closed.
7. As a user, I want a configurable startup delay so the catch-up check doesn't race with Logseq's own startup tasks.
8. As a user, I want to edit an existing schedule in place so I don't have to delete and re-add it just to fix a typo.
9. As a user, I want to search and filter my schedules (active, paused) so I can find one quickly when I have many.
10. As a user, I want to see recent fire history per schedule so I can diagnose missed or skipped runs.
11. As a user, I want the plugin panel to follow Logseq's light/dark theme so it doesn't look foreign when I switch themes.
12. As a user, I want the panel to remain usable when the Logseq window is narrow, not only on wide screens.
13. As a user, I want each schedule to target specific graphs so the engine doesn't create pages in the wrong graph when I switch between DB graphs.
14. As a user, I want to assign a schedule to multiple graphs (or all graphs) so I can reuse a schedule across contexts without duplicating it.

## Features

### Core (shipped 0.1.0)
- [x] **Schedule list** — Multiple schedules, each with: label, page name, tags (array), frequency (natural language + computed cron)
- [x] **Natural language → cron parser** — Convert phrases like "every Saturday at 11 AM" into a cron expression
- [x] **Frequency detection** — Infer the frequency (daily/weekly/monthly/quarterly/semi-annual/yearly) from the cron expression
- [x] **Date suffix generator** — Auto-append the appropriate suffix:
  - Daily: `Page Name - 2026-04-09`
  - Weekly: `Page Name - Week 15` (ISO week)
  - Monthly: `Page Name - April 2026`
  - Quarterly: `Page Name - Q2 2026`
  - Semi-annual: `Page Name - H1 2026`
  - Yearly: `Page Name - 2026`
- [x] **Page creation** — Create the page (if it doesn't already exist) and apply all schedule tags
- [x] **Global timezone setting** — Drives all cron evaluations and date math
- [x] **Missed schedule catch-up** — On startup and on each poll, for each schedule, determine the most recent expected firing time prior to now. If no page exists for that period, create it. Polling replaced the `setTimeout`-based catch-up in 0.1.0 because hidden iframes get throttled; `startupDelaySeconds` is retained as a no-op for back-compat.
- [x] **Last-run tracking** — Persist the last fire time per schedule to detect missed runs across app restarts
- [x] **Schedule management UI** — Main UI panel to add/delete schedules (settings panel is too limited for dynamic lists)
- [x] **Manual trigger** — Run Now / Force Run buttons in the panel fire a schedule immediately (see "Two-pane manager UI" below for how they surface in the redesign)

### Two-pane manager UI (shipped 2026-04-11)
Replaces the original single-pane stacked-form panel. Spec and task breakdown
live in `tasks/todo.md`; reference mockup at `mockups/variant-d-refined.html`.

- [x] **Sidebar list with status pills** — label + ON/OFF pill + one-line summary; selected item highlighted; click to select
- [x] **Search by label** — case-insensitive partial match; focus and cursor position preserved across re-renders
- [x] **Filter tabs** — All / Active / Paused with schedule counts that always reflect totals (not the current search)
- [x] **Header stats** — active count, paused count, soonest-next-fire countdown computed from `computeStats` + `formatCountdown`
- [x] **Detail pane view mode** — title row with Run Now / Force Run / Pause-Resume / Edit / Delete, soft-blue next-fire card with live countdown, configuration card with tags as chips, Recent runs card
- [x] **Edit existing schedules in place** — Edit button reuses the create form pre-filled; Save replaces the entry in storage preserving `id` and `createdAt`
- [x] **Recent runs history** — Recent runs card pulls the last 10 entries from the existing fire log filtered by the selected schedule, with relative time, source pill (`cron` / `manual` / `force` / `catch-up`), and colour-coded outcome badge (`created` / `exists` / `skipped` / `error`); error messages as row tooltips
- [x] **New-schedule flow** — "+ New schedule" button in the sidebar opens the form inside the detail pane; form is a real `<form>` so Enter submits; cron preview updates live as the user types in the When field
- [x] **Auto-select first schedule** on panel open; centered empty-state placeholder when no schedules exist
- [x] **Responsive layout at 680px** — panes stack, "← Schedules" back button appears on detail, third header stat hides
- [x] **Follows Logseq's theme** — reads `logseq.App.getUserConfigs` on load and subscribes to `logseq.App.onThemeModeChanged`; CSS uses `html.dark` selectors instead of `prefers-color-scheme`
- [x] **Keyboard accessibility** — sidebar items are real `<button>` elements with `aria-pressed` and focus-visible outline; search input has `aria-label`; Esc closes the panel (two-step in create/edit mode: first Esc cancels the form, second closes)
- [x] **Unit tests** — Vitest suite for the pure helpers in `src/schedule-helpers.ts` (44 tests)

### Graph-scoped schedules (shipped 2026-04-11)
Schedules were stored globally per-plugin via `logseq.settings`, not per-graph.
Switching between DB graphs caused the engine to create pages in the wrong graph.

- [x] **`graphNames` field on `ScheduleEntry`** — comma-separated graph names, or `"all"`. New schedules default to the current graph's name. Legacy schedules (missing the field) are treated as `"all"`, preserving existing behavior with no migration.
- [x] **Graph-aware engine** — `SchedulerEngine` receives the current graph name at start. On each poll, if a fire is due, the engine checks `isScheduleForGraph(schedule, currentGraphName)` before firing. Non-matching schedules get a `skipped-wrong-graph` fire log entry and their `lastRun` is recorded so the skip isn't re-logged on subsequent polls.
- [x] **Graph switch handling** — `logseq.App.onCurrentGraphChanged` flushes storage caches (stale data from the prior graph's session) via `resetCaches()` and restarts the engine with the new graph name.
- [x] **Graphs field in the form** — text input between Tags and When; defaults to current graph name for new schedules, shows existing value for edits. Accepts comma-separated names or `all`.
- [x] **Graph badges in sidebar and config card** — indigo badge for named graphs, grey italic for "all". Visible on every schedule regardless of current graph.
- [x] **`skipped-wrong-graph` fire outcome** — distinct from `"skipped"` (DB-graph check) with its own badge colour in the fire log.
- [x] **Cross-graph visibility** — all schedules are shown in the UI regardless of the current graph, each labelled with its target graph(s).

## Technical Approach

- **Plugin SDK**: `@logseq/libs@0.3.2` — typed DB-graph APIs (`getTag`, `getTagsByName`, `createTag`, `addBlockTag`, `getAllTags`, `checkCurrentIsDbGraph`, `DB.onChanged`). No runtime guards or `as any` casts needed.
- **Plugin type**: Main UI panel for schedule management + background scheduler running inside the iframe
- **Cron engine**: `croner` (lightweight, timezone-aware, browser-compatible) used only for *parsing* and next/previous-fire math, not for scheduling callbacks
- **Scheduler**: polling every 30 s + `logseq.DB.onChanged` (debounced) as a wake-up trigger, because hidden iframes get their timers throttled
- **Storage**:
  - `logseq.useSettingsSchema` for global config (timezone)
  - `logseq.settings` for the schedule list, last-run timestamps, and fire log (originally planned as `logseq.FileStorage` but the local Logseq build threw "failed to get fs backend")
  - In-memory authoritative cache in `src/storage.ts` because `logseq.updateSettings` is fire-and-forget IPC and the local `logseq.settings` getter doesn't reflect writes synchronously
  - `resetCaches()` flushes the in-memory cache on graph switch so stale data from the prior graph doesn't persist
- **Natural language parsing**: Simple in-house parser covering common patterns (every {day}, every day, every month on {nth}, etc.) — not a full NLP system
- **Tag application**: `logseq.Editor.createPage` → `resolveTag` (getTag → getTagsByName → fuzzy match → createTag) → `logseq.Editor.addBlockTag` for each tag so the tag attaches to the *page*, not a child block
- **Frequency detection**: Inspect the cron expression fields (minute/hour/dow/dom/month) to classify
- **Page existence check**: `findPageByTitle` runs a strict Datascript query requiring `:logseq.class/Page` membership, because `logseq.Editor.getPage` returns stale / non-page entities
- **UI**: Plain TypeScript + DOM, no framework. Two-pane layout with full-innerHTML re-rendering driven by module-level state vars (`selectedId`, `searchQuery`, `activeTab`, `paneMode`); `captureFocus`/`restoreFocus` preserve search input focus across re-renders. Theme follows Logseq via `logseq.App.onThemeModeChanged`.
- **Graph scoping**: Each `ScheduleEntry` carries an optional `graphNames` field (comma-separated names or `"all"`). `isScheduleForGraph(entry, graphName)` in `schedule-helpers.ts` handles matching (case-insensitive, whitespace-trimmed, missing/empty = "all"). `logseq.App.getCurrentGraph()` provides the graph name at startup; `logseq.App.onCurrentGraphChanged` triggers cache flush + engine restart on switch. Matching on graph name (not path) for portability across machines.
- **Testing**: Vitest for pure helpers (`src/schedule-helpers.ts`); no DOM tests — UI is validated manually via the `logseq-plugin-tester` skill
- **DB graph only**: Tags-as-classes is a DB-graph concept; guard with `logseq.App.checkCurrentIsDbGraph()` (typed in SDK 0.3.2)

## Non-Goals

- Slash command to fire a schedule on demand (Run Now / Force Run buttons in the panel cover this need)
- Direct cron expression editing — natural-language input only
- Additional DB properties on created pages (beyond tags)
- In-plugin page content templating (tags drive template rendering via Logseq)
- Per-schedule timezone overrides
- File graph support
- Notifications when a schedule fires
- Drag-to-reorder schedules
- Bulk actions on multiple schedules
- Additional keyboard shortcuts beyond Esc-to-close (e.g. `n` for new schedule, `/` to focus search, arrow keys to navigate the list)
