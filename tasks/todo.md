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

- [x] **1. Add Vitest** — `package.json`, `vitest.config.ts`
      Add `vitest` as devDep, add `"test": "vitest"` script, minimal config (node env, no jsdom).
      Done when: `npm test` runs and reports "No test files found".
      Est: 10 min

### Phase 2 — Pure helpers (test-first)

- [x] **2. [RED] Tests for schedule helpers** — `src/__tests__/schedule-helpers.test.ts`
      Cases: filter by tab (all/active/paused); search by label (case-insensitive, partial, empty query returns all); stats (active count, paused count, soonest next-fire across enabled schedules with mixed nulls); countdown formatter (just-now / minutes / hours / days / "tomorrow" / past / null).
      Done when: tests exist, all FAIL.
      Est: 25 min

- [x] **3. [GREEN] Implement schedule helpers** — `src/schedule-helpers.ts`
      Pure functions: `filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`. No DOM, no logseq, no side effects.
      Done when: all tests from task 2 pass; `tsc --noEmit` clean.
      Est: 25 min

### Phase 3 — UI plumbing

- [x] **4. Replace CSS in index.html** — `index.html`
      Port Variant D styles: panel grid, header with stats, sidebar (search, tabs, sched-item, +new button), detail pane (next-fire card, config card, field-grid, chips), recent-runs list, dark-mode variants, 680px responsive breakpoint.
      Done when: opening the dev build shows the new layout (with placeholder content); dark mode looks right.
      Est: 30 min

- [x] **5. UI state, re-render skeleton, sidebar list with selection** — `src/ui.ts`
      _Merged with task 6 — see Progress Log._ Module-level vars (`selectedId`, `searchQuery`, `activeTab`, `paneMode`, `cachedSchedules`, `callbacks`). Helper render functions (`renderHeader`, `renderSidebar`, `renderSchedItem`, `renderDetail`). Sidebar list with status pills and click-to-select. `captureFocus`/`restoreFocus` helpers for the search input. Detail pane has a placeholder for view mode.
      Done when: clicking a schedule highlights it; basic shell renders. Done.
      Est: 20 min

### Phase 4 — Sidebar

- [x] **6. Sidebar list with status pills and summaries** — `src/ui.ts`
      _Done as part of task 5 — see Progress Log._ Note: relative next-fire summary in `row2` is still TODO; today it shows the natural-language string. Will be filled in by task 15 (header stats) which adds the formatter wiring.
      Est: 20 min

- [x] **7. Search input** — `src/ui.ts`
      Search box at top of sidebar. `onInput` updates `searchQuery` and re-renders. After re-render, `restoreFocus()` keeps focus and cursor position. Sidebar list filters via `searchSchedules`.
      Done when: typing filters the list without losing focus or cursor position.
      Est: 15 min

- [x] **8. Filter tabs** — `src/ui.ts`
      Three buttons: All (n) / Active (n) / Paused (n). Counts come from the unfiltered list. Click sets `activeTab` and re-renders. Sidebar list filters via `filterSchedules`.
      Done when: tabs filter correctly; counts always reflect totals, not filtered totals.
      Est: 15 min

- [x] **9. "+ New schedule" button** — `src/ui.ts`
      Button at the bottom of the sidebar. Click sets `paneMode="create"` and `selectedId=null`, re-renders.
      Done when: clicking + New shows the (still empty) create form in the detail pane.
      Est: 10 min

### Phase 5 — Detail pane

- [x] **10. Detail pane view mode** — `src/ui.ts`
      Title row (label + subtitle + actions: ▶ Run Now / ⟳ Force Run / Pause/Resume / Edit / Delete), next-fire card (hidden when paused or no next-fire), configuration card (label, page name, tags as chips, schedule text, cron in `<code>`, status). Wire Run Now / Force Run / Pause-Resume / Delete to existing callbacks. Edit sets `paneMode="edit"` (placeholder until task 14).
      Done when: selecting any schedule shows full details; all five buttons work.
      Est: 30 min

- [x] **11. Zero-state placeholder** — `src/ui.ts`
      _Done as part of task 5 — see Progress Log._ Sidebar shows "No schedules yet"; detail pane shows centered placeholder with ⏰ icon and a hint to click + New schedule.
      Est: 10 min

- [x] **12. Recent runs card** — `src/ui.ts`
      Below the configuration card. Pulls from `loadFireLog()` filtered by `selectedId`, last 10 entries. Each row: relative time via new `formatPast` helper, source pill, outcome badge with color. Error message becomes a tooltip on the row. Added 8 unit tests for `formatPast`.
      Done when: a freshly-fired schedule shows the run in the card; old runs render with right colors.
      Est: 25 min

- [x] **13. Detail pane create mode** — `src/ui.ts`
      When `paneMode === "create"`: shared `renderScheduleForm(null)` shows empty fields. Save creates a new entry with a fresh id and `createdAt`, switches to view, selects the new schedule.
      Done when: creating a schedule via the form works end-to-end and the new schedule is selected after save.
      Est: 25 min

- [x] **14. Detail pane edit mode** — `src/ui.ts`
      Edit button on view mode sets `paneMode="edit"` and `renderScheduleForm(selected)` pre-fills inputs. Save replaces the existing entry in storage (same id, same createdAt), switches back to view. `cb.onChange()` triggers an engine restart that picks up the new cron.
      Done when: editing label/pageName/tags/when persists correctly and the engine picks up the new cron.
      Est: 25 min

### Phase 6 — Header and responsive

- [x] **15. Header stats** — `src/ui.ts`
      `Scheduler` title, then stats row: active count with green dot, paused count, "Next {countdown}" via `computeStats` + `formatCountdown`. Re-renders along with the rest.
      Done when: stats reflect current state and update on add/delete/toggle.
      Est: 15 min

- [x] **16. Narrow-width back button** — `src/ui.ts`, `index.html`
      Back button rendered in detail pane (already part of task 5/10/13/14). CSS hides it at wide widths and shows it at narrow widths. Click clears `selectedId` AND `paneMode = "view"` (so create/edit also drop back to the list cleanly). Refactored auto-select-first into a separate `seedInitialSelection` that only runs on panel open, so the back button doesn't fight with auto-re-selection. Delete handler now explicitly picks the next schedule.
      Done when: at <=680px, sidebar is primary, selecting a schedule shows detail with back button that returns to sidebar.
      Est: 20 min

### Phase 7 — Validation

- [x] **17. Typecheck + tests + build** — terminal
      Run `npm run typecheck`, `npm test`, `npm run build`. Fix anything that errors.
      Done when: all three pass clean.
      Est: 10 min

- [ ] **18. Manual test in Logseq** — `logseq-plugin-tester` skill
      Load the plugin against localhost:3001, verify happy path: open panel, add new schedule, edit it, run now, force run, delete, search filter, tab filter, dark mode, responsive at narrow width, recent runs visible after a fire.
      Done when: full happy path works without console errors.
      Est: 20 min

- [x] **19. Code review pass** — `code-review` skill
      Run code-review against the diff. Address flagged issues.
      Done when: review checklist clear.
      Est: 15 min

**Total estimate:** ~6 hours focused work.

---

## Progress Log

<!-- Updated as tasks complete -->
- 2026-04-11 — Task 1 done: Vitest 2.1.9 installed, `npm test` reports "No test files found" as expected. Exit code 1 will flip to 0 once task 2 adds the first test file.
- 2026-04-11 — Task 2 done (RED): 25 tests written across `filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`. Suite fails to load because `src/schedule-helpers.ts` doesn't exist.
- 2026-04-11 — Task 3 done (GREEN): `src/schedule-helpers.ts` implemented with 4 pure functions. All 25 tests pass on first run, `tsc --noEmit` clean.
- 2026-04-11 — Task 4 done: `index.html` `<style>` block fully replaced with Variant D layout (panel grid, header, sidebar, detail pane, next-fire card, config card, recent-runs styles, detail-form styles for create/edit, 680px responsive breakpoint, full dark-mode variants). `npm run typecheck` and `npm run build` both clean. Note: panel will render visually broken until task 5+ rewrites `ui.ts` rendering — old class names (`scheduler-panel`, `scheduler-row`, etc.) no longer have CSS. Intentional intermediate state.
- 2026-04-11 — Tasks 7 + 8 done: Search input wired with `onInput → searchQuery → rerender → restoreFocus`. Filter tabs wired with click handler that sets `activeTab`. Tab counts always show totals (not filtered totals). Sidebar list now uses `searchSchedules(filterSchedules(cachedSchedules, activeTab), searchQuery)`. New "No schedules match" empty state for when filtering produces no results.
- 2026-04-11 — Task 9 done: + New schedule button wired. Sets `paneMode="create"`, `selectedId=null`. Detail pane shows a form placeholder until task 13.
- 2026-04-11 — Task 10 done: Detail pane view mode renders the rich layout — title row with action buttons (Run Now, Force Run, Pause/Resume, Edit, Delete), next-fire card with `formatCountdown`, configuration card with tags as chips. All actions wired: Run Now / Force Run reuse the existing button-feedback pattern (Running… → Done ✓ → reset). Delete clears `selectedId` so `ensureValidSelection` picks the next item. Edit currently routes to a placeholder. Toggle is now a button in the title-actions row instead of a checkbox in the sidebar (the sidebar shows the ON/OFF pill as a passive indicator). New `ensureValidSelection` helper centralises the auto-select-first logic for both initial render and post-delete cleanup.
- 2026-04-11 — Tasks 11 + 12 + 15 done: Zero-state was already in place from task 5. Added `formatPast` helper to `schedule-helpers.ts` (with 8 unit tests, total now 33). Recent runs card renders below the configuration card, pulls from cached fire log filtered by `selectedId`, shows last 10 entries with relative time / source pill / colored outcome badge. Error messages surface as tooltips. Header stats now show active count with green dot, paused count, and "Next {countdown}" computed from `computeStats(cachedSchedules, callbacks.nextRunFor)`. `rerender` now loads schedules and fire log in parallel via `Promise.all`.
- 2026-04-11 — Tasks 13 + 14 done: One shared `renderScheduleForm(initial)` powers both create and edit. Create mode passes null for empty fields; edit mode passes the selected schedule for pre-fill. The cron preview updates live as the user types in the When field via a direct DOM update (no rerender, so focus is preserved naturally). Submit handler reads inputs, validates, parses NL → cron, and either pushes a new entry or replaces the existing one in-place (preserves id and createdAt for edit). On save: switches to view mode, sets selectedId to the new/edited entry, calls `cb.onChange()` to restart the engine. Cancel just flips paneMode without saving. Errors show in the form-error block at the bottom.
- 2026-04-11 — Task 16 done: Back button click handler now resets both `selectedId = null` AND `paneMode = "view"` so back from create/edit drops cleanly to the sidebar. Surfaced a bug while wiring this up: `ensureValidSelection` was running on every rerender and immediately re-selecting the first schedule after the user clicked back, defeating the back button. Refactored into two functions: `seedInitialSelection` runs only on panel open (controlled by a `needsInitialSeed` flag set in `renderPanel`), and `cleanupStaleSelection` only clears the selection if the schedule was deleted in another tab. Delete handler now explicitly picks the next schedule (`list[0]?.id ?? null`) instead of relying on auto-selection.
- 2026-04-11 — Tasks 17 + 19 done: typecheck, 33 tests, and build all clean. Code review (task 19) ran via the `code-review` skill against `ddf1c54..HEAD`. No must-fix issues. Applied seven 🟡 fixes in one batch: removed unused `_cb` parameter from `wireUp`, added try/catch + console.error to toggle and delete handlers, fixed stale `btn` reference in `attachRunHandler` (no more dead-callback cleanup on success path; failure path still restores in place), wrapped detail form in `<form>` so Enter submits, converted sidebar items to `<button class="sched-item">` with `aria-pressed` and CSS button reset for keyboard accessibility, added `aria-label="Search schedules"` to the search input, added `:focus-visible` outline on `.sched-item`. Also extended `escapeHtml` to escape single quotes for latent-XSS safety. File-size split (`src/ui.ts` ~660 lines) deferred to `REFACTOR_BACKLOG.md` as `[R-001]`.
- 2026-04-11 — Tasks 5 + 6 done (merged): Realised on contact with implementation that pure "state vars only" couldn't ship without sidebar list rendering — the state plumbing is meaningless without something selectable. Combined into one logical change. New `src/ui.ts` has: module-level state (`selectedId`/`searchQuery`/`activeTab`/`paneMode`/`cachedSchedules`/`callbacks`), helper render functions (`renderHeader`/`renderSidebar`/`renderSchedItem`/`renderDetail`), sidebar list with click-to-select, detail-pane placeholder, `captureFocus`/`restoreFocus` for the search input, `has-selection` class on the panel for the responsive layout. Existing add/delete/run-now/force-run/toggle handlers removed — they come back in tasks 12 (recent runs needs nothing extra), 13 (create), 14 (edit), and partially in task 10 (view-mode actions). Bundle dropped 4kB. Typecheck/test/build all clean. Filter tabs / search input / +new button render in the DOM but don't have handlers yet — wired by tasks 7/8/9.
