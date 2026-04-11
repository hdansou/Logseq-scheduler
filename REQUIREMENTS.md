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

## Features

- [ ] **Schedule list** — Multiple schedules, each with: label, page name, tags (array), frequency (natural language + computed cron)
- [ ] **Natural language → cron parser** — Convert phrases like "every Saturday at 11 AM" into a cron expression
- [ ] **Frequency detection** — Infer the frequency (daily/weekly/monthly/quarterly/semi-annual/yearly) from the cron expression
- [ ] **Date suffix generator** — Auto-append the appropriate suffix:
  - Daily: `Page Name - 2026-04-09`
  - Weekly: `Page Name - Week 15` (ISO week)
  - Monthly: `Page Name - April 2026`
  - Quarterly: `Page Name - Q2 2026`
  - Semi-annual: `Page Name - H1 2026`
  - Yearly: `Page Name - 2026`
- [ ] **Page creation** — Create the page (if it doesn't already exist) and apply all schedule tags
- [ ] **Global timezone setting** — Drives all cron evaluations and date math
- [ ] **Configurable startup delay** — In seconds, default 300
- [ ] **Missed schedule catch-up** — On startup (after delay), for each schedule, determine the most recent expected firing time prior to now. If no page exists for that period, create it.
- [ ] **Last-run tracking** — Persist the last fire time per schedule to detect missed runs across app restarts
- [ ] **Schedule management UI** — Main UI panel to add/edit/delete schedules (settings panel is too limited for dynamic lists)

## Technical Approach

- **Plugin type**: Main UI panel for schedule management + background scheduler running inside the iframe
- **Cron engine**: `croner` (lightweight, timezone-aware, browser-compatible)
- **Storage**:
  - `logseq.useSettingsSchema` for global config (timezone, startup delay)
  - `logseq.FileStorage` for the schedule list (JSON) and last-run timestamps
- **Natural language parsing**: Simple in-house parser covering common patterns (every {day}, every day, every month on {nth}, etc.) — not a full NLP system
- **Tag application**: `logseq.Editor.createPage` → `logseq.Editor.addBlockTag` for each tag
- **Frequency detection**: Inspect the cron expression fields (minute/hour/dow/dom/month) to classify
- **DB graph only**: Tags-as-classes is a DB-graph concept; guard with `checkCurrentIsDbGraph`

## Non-Goals (MVP)

- Manual trigger / slash command to fire a schedule on demand
- Additional DB properties on created pages (beyond tags)
- In-plugin page content templating (tags drive template rendering via Logseq)
- Per-schedule timezone overrides
- File graph support
- Schedule import/export
- Notifications when a schedule fires
