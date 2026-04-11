# Scheduler UI Redesign — Two-Pane Manager

**Spec:** below
**Prototype:** `mockups/variant-d-refined.html`
**Started:** 2026-04-11
**Status:** planning

---

## Spec

### Goal
Replace the current single-pane stacked-form scheduler UI with a two-pane manager (sidebar list + detail pane) that scales as more schedules are added and surfaces edit and run-history capabilities.

### Users
Single-user Logseq plugin. The user opens the panel via the ⏰ toolbar button or the "Scheduler: Open panel" command. Primary jobs to be done:
- See at a glance which schedules are active and when the next one fires
- Add, edit, pause/resume, delete a schedule
- Manually trigger a schedule (Run Now or Force Run)
- Inspect recent run history for debugging missed or skipped fires

### Constraints
- **Must:** preserve all current behavior of add/delete/toggle/run-now/force-run; storage format unchanged; engine and callbacks unchanged
- **Must:** light and dark mode both look right
- **Must:** responsive at panel widths down to ~360px
- **Must not:** introduce a UI framework (no React/Preact/lit-html); plain TS + DOM only
- **Must not:** change the scheduler/storage/engine layer beyond what's needed for new features

### Design Decisions

1. **Run history is in scope.** `appendFireLog` already persists the last 50 fire events to `logseq.settings._fireLogJson`. Surfacing it is render-only.
2. **Edit reuses the new-schedule form.** Edit button on a schedule opens the same form as create, pre-filled. Saving replaces the existing entry (same id, same createdAt). One form to maintain.
3. **Auto-select first schedule on open.** When the panel opens with at least one schedule, the first item is selected. Zero-schedules state shows a placeholder pointing at "+ New schedule."
4. **Full re-render with module-level state.** Keep the `renderPanel` pattern. Module-level vars: `selectedId`, `searchQuery`, `activeTab`, `paneMode`. After re-render, restore search input value and focus.
5. **New-schedule form lives in the detail pane.** Three pane modes: `view`, `edit`, `create`. No modal overlay.
6. **Test pure helpers only with Vitest.** Filter, search, stats, countdown formatter. No DOM tests, no jsdom.

### Data Model
No changes to `ScheduleEntry`, `FireLogEntry`, or storage shape. New module-level UI state in `ui.ts`:

```ts
type PaneMode = "view" | "edit" | "create";
type FilterTab = "all" | "active" | "paused";

let selectedId: string | null = null;
let searchQuery = "";
let activeTab: FilterTab = "all";
let paneMode: PaneMode = "view";
```

### Out of Scope (v1)
- Per-schedule timezone overrides
- Schedule import/export
- Notifications when a schedule fires
- Keyboard shortcuts (Esc to cancel, etc.)
- Drag-to-reorder, bulk actions
- Direct cron expression editing (natural-language only)

### Open Questions
None at planning time. Add here if any surface during implementation.

---

## Task List

Each task is ≤30 minutes. `[RED]` writes failing tests; `[GREEN]` makes them pass.

### Phase 1 — Setup

- [ ] **1. Add Vitest** — `package.json`, `vitest.config.ts`
      Add `vitest` as devDep, add `"test": "vitest"` script, minimal config (node env, no jsdom).
      Done when: `npm test` runs and reports "No test files found".
      Est: 10 min

### Phase 2 — Pure helpers (test-first)

- [ ] **2. [RED] Tests for schedule helpers** — `src/__tests__/schedule-helpers.test.ts`
      Cases: filter by tab (all/active/paused); search by label (case-insensitive, partial, empty query returns all); stats (active count, paused count, soonest next-fire across enabled schedules with mixed nulls); countdown formatter (just-now / minutes / hours / days / "tomorrow" / past / null).
      Done when: tests exist, all FAIL.
      Est: 25 min

- [ ] **3. [GREEN] Implement schedule helpers** — `src/schedule-helpers.ts`
      Pure functions: `filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`. No DOM, no logseq, no side effects.
      Done when: all tests from task 2 pass; `tsc --noEmit` clean.
      Est: 25 min

### Phase 3 — UI plumbing

- [ ] **4. Replace CSS in index.html** — `index.html`
      Port Variant D styles: panel grid, header with stats, sidebar (search, tabs, sched-item, +new button), detail pane (next-fire card, config card, field-grid, chips), recent-runs list, dark-mode variants, 680px responsive breakpoint.
      Done when: opening the dev build shows the new layout (with placeholder content); dark mode looks right.
      Est: 30 min

- [ ] **5. UI state and re-render skeleton** — `src/ui.ts`
      Module-level vars (`selectedId`, `searchQuery`, `activeTab`, `paneMode`). Refactor `renderPanel` to call helper render functions (`renderHeader`, `renderSidebar`, `renderDetail`). Add `restoreFocus()` helper that re-focuses the search input and restores cursor position if it had focus.
      Done when: panel still renders today's content but with the new state plumbing in place (no visible change yet).
      Est: 20 min

### Phase 4 — Sidebar

- [ ] **6. Sidebar list with status pills and summaries** — `src/ui.ts`
      For each schedule: label, ON/OFF pill, one-line summary (cadence + relative next-fire). Selected item gets the accent border. Click selects (sets `selectedId`, `paneMode="view"`, re-renders).
      Done when: clicking a schedule highlights it and changes the detail pane (still placeholder content in detail).
      Est: 20 min

- [ ] **7. Search input** — `src/ui.ts`
      Search box at top of sidebar. `onInput` updates `searchQuery` and re-renders. After re-render, `restoreFocus()` keeps focus and cursor position. Sidebar list filters via `searchSchedules`.
      Done when: typing filters the list without losing focus or cursor position.
      Est: 15 min

- [ ] **8. Filter tabs** — `src/ui.ts`
      Three buttons: All (n) / Active (n) / Paused (n). Counts come from the unfiltered list. Click sets `activeTab` and re-renders. Sidebar list filters via `filterSchedules`.
      Done when: tabs filter correctly; counts always reflect totals, not filtered totals.
      Est: 15 min

- [ ] **9. "+ New schedule" button** — `src/ui.ts`
      Button at the bottom of the sidebar. Click sets `paneMode="create"` and `selectedId=null`, re-renders.
      Done when: clicking + New shows the (still empty) create form in the detail pane.
      Est: 10 min

### Phase 5 — Detail pane

- [ ] **10. Detail pane view mode** — `src/ui.ts`
      Title row (label + subtitle + actions: ▶ Run Now / ⟳ Force Run / Edit / Delete), next-fire card (icon + label + formatted time + countdown via `formatCountdown`, hidden when paused or null), configuration card (label, page name, tags as chips, schedule text, cron in `<code>`, enabled toggle). Wire Run Now / Force Run / Delete to existing callbacks.
      Done when: selecting any schedule shows full details; all four buttons work.
      Est: 30 min

- [ ] **11. Zero-state placeholder** — `src/ui.ts`
      When `schedules.length === 0`, sidebar shows "No schedules yet" message and detail pane shows a centered placeholder pointing at + New schedule.
      Done when: deleting the last schedule transitions cleanly to placeholder; + New schedule from the placeholder works.
      Est: 10 min

- [ ] **12. Recent runs card** — `src/ui.ts`
      Below the configuration card. Pulls from `loadFireLog()` filtered by `selectedId`, last 10 entries. Each row: relative time, source pill (`cron`/`manual`/`force`/`catch-up`), outcome badge (`created` green / `exists` gray / `skipped` amber / `error` red). Empty state: "No runs yet."
      Done when: a freshly-fired schedule shows the run in the card; old runs render with right colors.
      Est: 25 min

- [ ] **13. Detail pane create mode** — `src/ui.ts`
      When `paneMode === "create"`: form with Label / Page Name / Tags / When inputs, cron preview, Save / Cancel. Save validates via the existing `readForm` logic, persists via `saveSchedules`, sets `selectedId` to new id, switches `paneMode` to `view`, calls `cb.onChange()`. Cancel switches back to `view`.
      Done when: creating a schedule via the form works end-to-end and the new schedule is selected after save.
      Est: 25 min

- [ ] **14. Detail pane edit mode** — `src/ui.ts`
      Edit button on view mode sets `paneMode="edit"` and pre-fills inputs from selected schedule. Save replaces the existing entry in storage (same id, same createdAt), switches back to view. Cancel switches back without saving. Engine restart via `cb.onChange()` picks up the new cron.
      Done when: editing label/pageName/tags/when persists correctly and the engine picks up the new cron.
      Est: 25 min

### Phase 6 — Header and responsive

- [ ] **15. Header stats** — `src/ui.ts`
      `Scheduler` title, then stats row: active count with green dot, paused count, "Next in N days" via `computeStats` + `formatCountdown`. Re-renders along with the rest.
      Done when: stats reflect current state and update on add/delete/toggle.
      Est: 15 min

- [ ] **16. Narrow-width back button** — `src/ui.ts`, `index.html`
      A "← Schedules" button at the top of the detail pane, hidden by CSS at wide widths and shown at narrow. Click clears `selectedId` and triggers the sidebar view.
      Done when: at <=680px, sidebar is the primary view, selecting a schedule shows detail with a back button that returns to sidebar.
      Est: 20 min

### Phase 7 — Validation

- [ ] **17. Typecheck + tests + build** — terminal
      Run `npm run typecheck`, `npm test`, `npm run build`. Fix anything that errors.
      Done when: all three pass clean.
      Est: 10 min

- [ ] **18. Manual test in Logseq** — `logseq-plugin-tester` skill
      Load the plugin against localhost:3001, verify happy path: open panel, add new schedule, edit it, run now, force run, delete, search filter, tab filter, dark mode, responsive at narrow width, recent runs visible after a fire.
      Done when: full happy path works without console errors.
      Est: 20 min

- [ ] **19. Code review pass** — `code-review` skill
      Run code-review against the diff. Address flagged issues.
      Done when: review checklist clear.
      Est: 15 min

**Total estimate:** ~6 hours focused work.

---

## Progress Log

<!-- Updated as tasks complete -->
- (none yet)
