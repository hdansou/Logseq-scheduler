# Refactor Backlog

Items spotted during code review that aren't blocking any current merge but represent real debt worth addressing in a dedicated refactor session.

---

## [R-001] Split `src/ui.ts` into smaller modules

**Smell:** God object — `src/ui.ts` is now ~660 lines and handles rendering, event wiring, form management, focus management, and module-level state in one file. Past the 300-line "single responsibility" threshold.

**Files affected:** `src/ui.ts`

**Impact:** Hard to navigate, hard to test in isolation, every change has to read the whole file. Will get worse as new features land (notifications, keyboard shortcuts, etc.).

**Suggested split:**
- `src/ui/state.ts` — module vars + `seedInitialSelection` + `cleanupStaleSelection` + `PaneMode` / `PanelCallbacks` types
- `src/ui/sidebar.ts` — `renderSidebar`, `renderSchedItem`, sidebar event wiring (search input, filter tabs, sched-item clicks, + New)
- `src/ui/detail.ts` — `renderDetail`, `renderNextFireCard`, `renderConfigCard`, `renderRunsCard`, `renderRunRow`, view-mode wiring (run/force/toggle/edit/delete)
- `src/ui/form.ts` — `renderScheduleForm`, `wireUpScheduleForm`
- `src/ui/focus.ts` — `captureFocus`, `restoreFocus`, `FocusInfo`
- `src/ui/index.ts` — `renderPanel`, `rerender`, `panelShell`, `renderHeader`, top-level `wireUp` orchestration

**Spotted:** code review on the two-pane redesign (commit `b4fd8d2` era), 2026-04-11. The merge of tasks 5/6 and the addition of tasks 13/14 (create/edit forms) pushed the file past the threshold.
