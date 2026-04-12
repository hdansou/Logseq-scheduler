# Logseq Scheduler

Cron-based page creation for Logseq DB graphs. Define named schedules in plain English, attach tags, and the plugin creates a dated page on each firing — with missed-run catch-up when Logseq has been closed.

> **DB graphs only.** This plugin uses tag-as-class semantics, which is a DB-graph feature. File graphs are not supported.

## Features

### Scheduling engine
- **Named schedules** — each schedule has a label, page name, tag list, and a natural-language frequency.
- **Natural language → cron** — phrases like `every Saturday at 11 AM`, `every day at 08:00`, or `every month on the 1st` are parsed into cron expressions, with a live preview as you type.
- **Automatic date suffix** — the frequency is inferred from the cron expression and the matching suffix is appended to the page name:
  | Frequency    | Example page name              |
  | ------------ | ------------------------------ |
  | Daily        | `Daily Note - 2026-04-09`      |
  | Weekly       | `Weekly Review - Week 15`      |
  | Monthly      | `Monthly Report - April 2026`  |
  | Quarterly    | `Quarterly Plan - Q2 2026`     |
  | Semi-annual  | `Half-Year Review - H1 2026`   |
  | Yearly       | `Annual Review - 2026`         |
- **Tags as page classes** — each tag is resolved (or created) via `createTag` and attached to the new page with `addBlockTag`, so Logseq's tag-template rendering fires automatically.
- **Polling engine** — the scheduler polls every 30 seconds and also listens to `DB.onChanged` as a wake-up, so firings are reliable even when the plugin iframe is hidden.
- **Missed-run catch-up** — on startup, each schedule's most recent expected firing (since the later of its last run or its creation time) is fired once. Schedules never backfill pages for cron times before they were created.
- **Run Now / Force Run** — fire a schedule on demand; Force Run deletes an existing page for the current period and recreates it.

### Manager UI
- **Two-pane layout** — sidebar list of schedules on the left, detail pane for the selected schedule on the right.
- **Search and filters** — search by label (case-insensitive, partial match) and filter by All / Active / Paused tabs with counts.
- **Header stats** — active count, paused count, and the soonest next-fire countdown at a glance.
- **Edit in place** — change a schedule's label, page name, tags, or cadence without deleting and re-adding. The edit form reuses the create form pre-filled and preserves `id` and `createdAt`.
- **Pause / Resume** — toggle a schedule from the detail pane without losing its definition.
- **Recent runs history** — the detail pane shows the last 10 fire-log entries for the selected schedule with a relative timestamp, source pill (`cron` / `manual` / `force` / `catch-up`), and a colour-coded outcome badge (`created` / `exists` / `skipped` / `error`). Error messages surface as row tooltips.
- **Follows Logseq's theme** — the panel picks up Logseq's current light/dark mode via `logseq.App.onThemeModeChanged` and updates live when you switch.
- **Responsive** — below ~680 px the panes stack, a "← Schedules" back button appears on the detail pane, and the third header stat hides so the header doesn't wrap.
- **Keyboard** — the create/edit form submits on <kbd>Enter</kbd>; <kbd>Esc</kbd> closes the panel (in create/edit mode the first <kbd>Esc</kbd> cancels the form, a second <kbd>Esc</kbd> closes).

## Installation

### From source

```bash
git clone <repo-url> logseq-scheduler
cd logseq-scheduler
npm install
npm run build
```

Then in Logseq: `Settings → Plugins → Load unpacked plugin` and pick the `logseq-scheduler` directory.

### Development

```bash
npm run dev        # Vite dev server
npm run build      # production build into dist/
npm run typecheck  # tsc --noEmit
npm test           # Vitest — unit tests for pure helpers in src/schedule-helpers.ts
```

## Usage

Click the ⏰ icon in the Logseq toolbar, or run **Scheduler: Open panel** from the command palette. The manager panel opens centred over Logseq with a sidebar on the left and a detail pane on the right. If you already have schedules, the first one is selected automatically.

### Creating a schedule

1. Click **+ New schedule** at the bottom of the sidebar. The create form appears in the detail pane.
2. Fill in the fields:
   - **Label** — human-friendly name (e.g., `Personal Weekly Review`).
   - **Page name** — prefix; the date suffix is appended automatically based on the detected frequency.
   - **Tags** — comma-separated. Each tag is created if it doesn't already exist.
   - **When** — natural language. The computed cron expression updates beneath the field as you type.
3. Press <kbd>Enter</kbd> or click **Save**. The new schedule appears in the sidebar, is selected automatically, and the detail pane switches to its view mode.

### Working with existing schedules

Click a schedule in the sidebar to select it. The detail pane shows:

- Title row with the label, next-fire subtitle, and action buttons.
- **Next fire** card with the formatted timestamp and a live countdown (hidden while the schedule is paused).
- **Configuration** card with label, page name, tags as chips, the natural-language schedule, the cron expression, and current status.
- **Recent runs** card with the last ten fire-log entries for this schedule.

From the action buttons you can:

- **▶ Run Now** — fire the schedule immediately; skipped silently if the target page already exists.
- **⟳ Force Run** — delete and recreate the current-period page.
- **Pause / Resume** — toggle the schedule off or on. Paused schedules stay in the list with an **OFF** pill and don't fire.
- **Edit** — reopens the form pre-filled with the current values. Save replaces the entry in place (same `id`, same `createdAt`). <kbd>Enter</kbd> submits.
- **Delete** — removes the schedule. The next schedule in the list is selected, or the empty state is shown if it was the last one.

### Finding schedules

- Type in the **search** box at the top of the sidebar to filter by label (case-insensitive, partial match). Focus and cursor position are preserved across re-renders.
- Click **All / Active / Paused** to filter by state. The numbers in the tab labels always reflect the total counts, not the current search.

### Closing the panel

Click **Close** in the header or press <kbd>Esc</kbd>. If you press <kbd>Esc</kbd> while filling in the create or edit form, the form is cancelled back to view mode first — a second <kbd>Esc</kbd> closes the panel.

## Supported natural-language phrases

The in-house parser recognises common recurrence patterns. Examples:

- `every day at 08:00`
- `every weekday at 9am`
- `every Saturday at 11 AM`
- `every month on the 1st at 07:30`
- `every quarter`
- `every 6 months`
- `every year on January 1st`

If a phrase can't be parsed, the panel shows the error inline — rewrite the phrase or use a supported pattern.

## Settings

Open `Settings → Plugin Settings → Scheduler`:

- **Timezone** (IANA) — used for all cron evaluations and suffix math. Defaults to the system timezone.
- **Schedules** heading — a pointer to the ⏰ toolbar button; the schedule list itself is managed in the panel because native settings schemas can't render dynamic lists.

Schedules, last-run timestamps, and fire-history entries are persisted in `logseq.settings` under internal keys (`_schedulesJson`, `_lastRunJson`, `_fireLogJson`). The fire history is surfaced in the panel's **Recent runs** card so you rarely need to inspect these directly.

## How firings work

1. The engine polls every 30 seconds and walks each enabled schedule.
2. For each schedule it computes the most recent expected cron time prior to `now`, using `max(lastRun, createdAt)` as the floor.
3. If that time is more recent than the recorded `lastRun`, the schedule fires: the target page name is built (prefix + date suffix), the page is looked up via a strict Datascript query (`:logseq.class/Page` membership), created if missing, then each tag is resolved (or created) and attached via `addBlockTag`.
4. The `lastRun` timestamp and a fire-log entry are written back to settings.

## Troubleshooting

- **Nothing fires** — open the browser console and filter for `[scheduler]`. You should see a heartbeat log every 60 seconds and `(poll)` lines on each walk.
- **Schedule fires twice for the same period** — shouldn't happen; the duplicate-page check and `lastRun` guard both prevent it. Report with the fire-log entries.
- **Tag appears as a child block instead of on the page header** — this is the old behaviour and has been removed. Ensure you're on the latest build; tags are now attached via `addBlockTag` only.
- **`startupDelaySeconds` setting** — historical no-op kept for backwards compatibility. Will be removed in a future release.

## License

MIT
