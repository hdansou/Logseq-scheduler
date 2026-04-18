## Task List: Graph-Scoped Schedules

Started: 2026-04-11
Status: done

### Spec

#### Goal
Schedules are bound to specific graphs so the engine never creates pages in the wrong graph when the user switches between DB graphs.

#### Users
Logseq users with multiple DB graphs who keep the scheduler plugin active across graph switches.

#### Constraints
- Must: each schedule carries a `graphNames` field (comma-separated graph names, or `"all"`)
- Must: engine skips schedules whose `graphNames` don't include the current graph, logging `"skipped-wrong-graph"` to the fire log and `continue`-ing
- Must: existing schedules (no `graphNames` field) default to `"all"` — preserves current behavior
- Must: UI shows all schedules regardless of current graph, with a graph label on each
- Must: form includes a "Graphs" text input (comma-separated names, or `all`)
- Must: new schedules default to the current graph name
- Must not: break existing storage schema — new field tolerates missing values on load
- Must not: grow `src/ui.ts` beyond ~660 lines (CLAUDE.md constraint)

#### Design Decisions
- **Single pool storage** — one `_schedulesJson` array, filtered at runtime by `graphNames`. Multi-graph schedules and cross-graph visibility make partitioned storage impractical.
- **Match on graph name, not path** — human-readable, portable across machines, what the user types. `logseq.App.getCurrentGraph()` returns `{ name, path }`; we use `name`.
- **`"all"` keyword** — explicit string in the text field. Unambiguous intent. Empty/missing field on legacy schedules also treated as "all".
- **Legacy default is `"all"`** — existing schedules without `graphNames` run everywhere, matching pre-change behavior. Users opt into graph scoping at their own pace.
- **`logseq.App.onCurrentGraphChanged`** — on graph switch, flush storage caches (stale data from prior graph) and restart the engine with the new graph name.
- **Fire log outcome `"skipped-wrong-graph"`** — distinct from `"skipped"` (which means DB-graph check failed). Logged so the user can see when schedules are missed due to graph mismatch.

#### Data Model Change
```typescript
interface ScheduleEntry {
  // ... existing fields ...
  /** Comma-separated graph names this schedule targets, or "all". */
  graphNames: string;
}

type FireOutcome = "created" | "exists" | "skipped" | "skipped-wrong-graph" | "error";
```

Runtime helper `isScheduleForGraph(schedule, currentGraphName)`:
- Returns `true` if `graphNames` is `"all"`, empty, undefined (legacy), or if the comma-split-and-trimmed list includes `currentGraphName` (case-insensitive).

#### Out of Scope (v1)
- Backup / restore (export/import) — tracked in `tasks.md` deferred section
- Auto-discovery of available graph names (user types them manually)
- Per-graph storage partitioning

---

### Tasks

- [x] **1. Update types and add graph-matching helper** — `src/types.ts`, `src/schedule-helpers.ts`, `src/__tests__/schedule-helpers.test.ts`
      Add `graphNames?: string` to `ScheduleEntry`. Add `"skipped-wrong-graph"` to `FireOutcome`.
      Write `isScheduleForGraph(entry, graphName): boolean` in `schedule-helpers.ts`.
      Add Vitest tests: `"all"` → true, missing/empty field → true, single match → true,
      single mismatch → false, multi-graph match → true, whitespace trimming, case-insensitive.
      Test: `npm run typecheck && npm test` pass, new tests cover all cases.
      Est: 15 min

- [x] **2. Wire graph awareness into the engine** — `src/scheduler.ts`, `src/index.ts`
      Add `currentGraphName` param to `SchedulerEngine.start()`.
      In `pollAndFire`, before firing each schedule, call `isScheduleForGraph`; if false,
      log a `"skipped-wrong-graph"` fire log entry and `continue`.
      In `index.ts`, call `logseq.App.getCurrentGraph()` at startup and pass `graph.name`
      to `engine.start()` via `restart()`.
      Test: `npm run typecheck && npm run build` pass, console shows skip messages for non-matching schedules.
      Est: 20 min

- [x] **3. Handle graph switches at runtime** — `src/index.ts`, `src/storage.ts`
      Export `resetCaches()` from `storage.ts` that sets `schedulesCache`, `lastRunsCache`,
      `fireLogCache` back to `null` (next read re-fetches from `logseq.settings`).
      In `index.ts`, subscribe to `logseq.App.onCurrentGraphChanged`: call `resetCaches()`,
      then `restart()` with the new graph name.
      Store `currentGraphName` at module level in `index.ts` so the UI can read it (for form default).
      Test: `npm run typecheck && npm run build` pass, switching graphs in Logseq triggers engine restart with new graph name in logs.
      Est: 15 min

- [x] **4. Add Graphs field to form, graph row to config card, graph badge to sidebar** — `src/ui.ts`, `index.html`
      In `renderScheduleForm`: add a "Graphs" text input between Tags and When.
      Default for new schedules: current graph name (read from `index.ts` export).
      For edits: existing `graphNames` value (or `"all"` if missing).
      On save: read the field and store as `graphNames` on the `ScheduleEntry`.
      In `renderConfigCard`: add `<dt>Graphs</dt><dd>...</dd>` row.
      In `renderSchedItem`: add a small subtitle with the graph name(s), style `"all"` distinctly.
      In `index.html`: CSS for graph badge/subtitle in sidebar items (light + dark).
      Test: panel shows the field, creating a schedule stamps the graph name, editing preserves it, sidebar shows labels.
      Est: 25 min

- [x] **5. Update docs and task tracker** — `tasks.md`, `CHANGELOG.md`, `README.md`, `REQUIREMENTS.md`
      Document the graph-scoping feature. Update storage schema notes.
      Add backup/restore (export/import) to the deferred section of `tasks.md`.
      Test: docs accurately describe the new behavior.
      Est: 10 min

### Progress Log
- 2026-04-11 — Task 1 done: `graphNames?: string` on `ScheduleEntry`, `"skipped-wrong-graph"` on `FireOutcome`, `isScheduleForGraph` helper with 11 tests. Total 44 tests pass.
- 2026-04-11 — Task 2 done: `SchedulerEngine` takes `graphName` in `start()`, `pollAndFire` skips non-matching schedules (only when a fire is due) with fire log + lastRun recording.
- 2026-04-11 — Task 3 done: `resetCaches()` in `storage.ts`, `onCurrentGraphChanged` handler in `index.ts` flushes caches and restarts engine.
- 2026-04-11 — Task 4 done: "Graphs" text field in form (defaults to current graph), graph badge on sidebar items and config card, CSS for light + dark mode, `skipped-wrong-graph` badge colour.
- 2026-04-11 — Task 5 done: CHANGELOG, README, tasks.md updated. Backup/restore added to deferred section.
- 2026-04-11 — **Graph-scoped schedules complete.** 5/5 tasks done. typecheck + 44 tests + build all clean.
