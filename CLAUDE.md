# CLAUDE.md — logseq-scheduler

Instructions for Claude when working in this repo. Keep this file short and high-signal; if you need the full picture, read `ARCHITECTURE.md`, `REQUIREMENTS.md`, or `README.md`.

## Project

Logseq DB-graph plugin that creates pages on cron schedules with tags applied as page classes. Natural language → cron parser, frequency detection, date suffixes, polling scheduler with missed-run catch-up, two-pane management UI with search / filter / edit / recent runs.

## Stack

- TypeScript (strict), Vite, `@logseq/libs`
- Plain DOM, **no UI framework** (by design)
- Vitest for pure helpers (UI is validated manually via `logseq-plugin-tester`)
- `croner` is used for cron parsing and `nextRun`/`previousRun` math only, never for tick callbacks

## Layout

| File | Role |
|---|---|
| `src/index.ts` | Plugin bootstrap: settings schema, toolbar button, command palette, theme sync, engine creation, `PanelCallbacks` |
| `src/scheduler.ts` | `SchedulerEngine`. Polls every 30 s, listens to `DB.onChanged` wake-ups, exposes `nextRunFor` and `fire` |
| `src/page-creator.ts` | `createScheduledPage`, `resolveTag` chain (`getTag` → `getTagsByName` → `createTag`) |
| `src/db.ts` | Strict datascript `findPageByTitle` (requires `:logseq.class/Page` membership) |
| `src/storage.ts` | **Cache-first** persistence layer — authoritative in-memory copies, writes through to `logseq.settings` |
| `src/ui.ts` | Two-pane panel renderer and state management (~660 lines — **do not grow**) |
| `src/schedule-helpers.ts` | Pure functions: `filterSchedules`, `searchSchedules`, `computeStats`, `formatCountdown`, `formatPast`. Vitest-covered |
| `src/nl-cron.ts` | Natural language → cron expression |
| `src/suffix.ts` | Frequency detection + `buildPageName` |
| `src/types.ts` | Shared types (`ScheduleEntry`, `FireLogEntry`, `LastRunMap`, etc.) |
| `index.html` | CSS (light + `html.dark` variants, responsive @680 px) |
| `mockups/variant-d-refined.html` | UI reference mockup — the source of truth for layout decisions |

## Workflow

- Before any commit: `npm run typecheck && npm test && npm run build`. Never skip.
- Conventional commit prefixes: `feat`, `fix`, `docs`, `refactor`, `chore`, `style`, `test`.
- Keep `tasks.md`, `CHANGELOG.md`, and `REQUIREMENTS.md` in sync with code changes. For user-facing changes, `README.md` too. For structural changes, update the relevant diagram in `ARCHITECTURE.md`.
- For any multi-step feature (3+ files, new module, architectural decision), write a plan to `tasks/todo.md` first using the `plan-to-code` skill. Do not start coding without user confirmation of the plan.
- For UI validation, use the `logseq-plugin-tester` skill. Prefer delegating the actual click-through to an Agent subagent so the `playwright-cli` noise doesn't fill your main context.

## Repo-specific gotchas (DO NOT UNDO)

These are load-bearing. If you find yourself "simplifying" any of them, stop and re-read the file-level comment in the relevant module.

1. **`storage.ts` is cache-first.** `logseq.updateSettings` is fire-and-forget IPC; reading `logseq.settings` immediately after a write returns stale data. The module-level `schedulesCache` / `lastRunsCache` / `fireLogCache` are the authoritative copies. Reads go to the cache first; `logseq.settings` is consulted only on the very first read after plugin start. **Do not bypass the cache.** Removing it reintroduces the stale-rerender bug where every UI mutation appears frozen until the panel is reopened.

2. **Theme sync in `src/index.ts`.** Logseq's dark mode is a CSS class on the parent `<html>`, not an OS color scheme. The plugin reads `logseq.App.getUserConfigs()` for the initial theme, subscribes to `logseq.App.onThemeModeChanged`, and toggles a `dark` class on the iframe's own `<html>`. CSS uses `html.dark` selectors in `index.html`. **Do not revert to `@media (prefers-color-scheme: dark)`** — it doesn't fire when the user toggles Logseq's theme.

3. **`engine.fire(...)` source must be passed explicitly.** `PanelCallbacks.runNow` in `src/index.ts` passes `"manual"` or `"force"` as the 5th argument. The engine default is `"cron"`, which would mislabel manual triggers in the fire log.

4. **Polling, not callbacks.** `SchedulerEngine` polls every 30 s and uses `DB.onChanged` as a debounced wake-up. `croner` is used only for parsing and `nextRun`/`previousRun` math. Hidden-iframe timer throttling silently drops croner's internal `setTimeout` ticks. **Do not convert to callback-based scheduling.**

5. **`max(lastRun, createdAt)` catch-up floor.** The engine uses this as the floor for "missed run" detection. A new "every Friday" schedule created on Saturday does NOT backfill last Friday — `createdAt` is the floor. Do not weaken this.

6. **Strict page lookup.** `src/db.ts` uses a datascript query requiring `:logseq.class/Page` membership because `logseq.Editor.getPage` returns stale / non-page entities. Do not switch back to `getPage`.

## Do-not-touch lines

- **No UI framework.** Plain TypeScript + DOM. No React, Preact, lit-html, Svelte, Alpine, etc. The pattern is: module-level state, full `innerHTML` re-renders, `captureFocus`/`restoreFocus` for input focus preservation.
- **`src/ui.ts` is already past the file-size threshold.** Do not grow it. If you need to add UI, do `REFACTOR_BACKLOG.md` item `[R-001]` (split into `ui/state.ts`, `ui/sidebar.ts`, `ui/detail.ts`, `ui/form.ts`, `ui/focus.ts`) first.
- **Don't change the storage schema without a migration.** Existing users have `_schedulesJson` / `_lastRunJson` / `_fireLogJson` keys in `logseq.settings`. New fields on `ScheduleEntry` must tolerate missing values on load.
- **Don't edit `src/scheduler.ts` without reading its file-level comment first.** It explains why the engine polls, why croner is parse-only, and why `DB.onChanged` is a wake-up trigger.

## Testing

- **Pure helpers** live in `src/schedule-helpers.ts` and MUST have Vitest coverage (`src/__tests__/schedule-helpers.test.ts`, currently 33 cases). If you add a pure helper, add tests in the same commit.
- **UI rendering is not unit-tested.** Validate manually via the `logseq-plugin-tester` skill by loading the plugin against a running Logseq at `http://localhost:3001` and clicking through the panel.
- **The fire log is the integration test.** After exercising a feature, check `logseq.settings._fireLogJson` for the expected `created` / `exists` / `skipped` / `error` entries with the right source labels.
- **Known test gaps** tracked in `tasks.md`: unit tests for `nl-cron.ts`, `suffix.ts`, and `db.ts`.

## Where to look

- `ARCHITECTURE.md` — four Mermaid diagrams (module map, cron fire sequence, UI state machine, create flow) with reading notes
- `REQUIREMENTS.md` — product spec, user stories, features, technical approach, non-goals
- `README.md` — user-facing install / usage / supported phrases
- `tasks.md` — open work and completed feature history
- `tasks/todo.md` — current sprint's task breakdown (only present during active multi-step work)
- `REFACTOR_BACKLOG.md` — deferred refactoring items (`[R-NNN]` format)
- `CHANGELOG.md` — version history
- `mockups/variant-d-refined.html` — visual reference for the two-pane UI

## Opening the panel manually

1. Start the dev server: `npx vite` in the repo root → serves `http://localhost:8080`
2. In Logseq (`http://localhost:3001`): More (…) → Plugins → ⋮ → Load plugin from web url → `http://localhost:8080`
3. Click the ⏰ toolbar button, or run **Scheduler: Open panel** from the command palette

After code changes, reload by toggling the plugin off and on in the Plugins panel. Full loop is documented in the `logseq-plugin-tester` skill.
