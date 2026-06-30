# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Czech-language work calendar ("Pracovní kalendář") that overlays ClickUp time-tracking data and Czech public holidays onto a monthly grid / daily timeline, comparing logged hours against a per-day target. It is a **single self-contained `index.html`** — vanilla HTML/CSS/JS, no build step, no dependencies, no framework, no tests, not a git repo.

## Running it

```bash
docker compose up        # serves index.html via nginx at http://localhost:30100
```

The container just bind-mounts `index.html` read-only into nginx — edits are picked up on browser refresh, no rebuild needed. You can equally open `index.html` directly in a browser; everything runs client-side.

**After each change, run `docker compose up -d --force-recreate`** as the final step (user preference).

## Architecture

Everything lives in the one `<script>` block at the bottom of `index.html`. Key structure:

- **`state` (global object)** is the single source of truth: current view, month/day cursors, fetched `holidays`, per-day aggregated `entries` (regular logged hours) and `onCall` hours, raw `dayEntries` for the timeline, and `config`. Mutate `state`, then call `render()`.
- **Two views**, toggled by the tab buttons: month grid (`renderMonth`) and day timeline (`renderDay`). `render()` dispatches based on `state.view`. The active view is persisted both to `localStorage` (`calendar.view.v1`) and the URL hash (`#month`/`#day`), kept in sync by `setView`.
- **Data flow:** `refresh()` calls `beginLoading()` → `render()` (shows skeleton immediately) → fetches data in parallel → `endLoading()` → `render()` again with real data. `loading` is a counter so concurrent loads don't clear the spinner early.

### External integrations (called directly from the browser)

- **ClickUp REST API v2** via `cuFetch`. The user's personal token is stored only in `localStorage` (key `calendar.clickup.v1`) and sent as the `Authorization` header. `cuLoadTimeEntries` aggregates a month's entries into `state.entries` by day; `cuLoadDayEntries` keeps raw entries for the timeline. `cuReady()` gates all calls on having both a token and a team selected.
- **svatkyapi.cz** (`loadHolidays`) for Czech public holidays, fetched per visible month with `force-cache`.

### Conventions baked into the code

- **Week starts Monday.** Use `mondayIndex(date)` (0=Mon…6=Sun); indices ≥5 are the weekend. ISO week numbers via `isoWeekNumber`. The grid is a 9-column layout: week-number column + 7 days + week-total column.
- **Day keys** are local-date ISO strings from `iso(date)` (`YYYY-MM-DD`); used as Map keys throughout. Hours are stored as decimal numbers (ms ÷ 3,600,000).
- **A "workday"** = in-month, not weekend, not holiday. Targets/diffs only count workdays. For the current month, the diff stat compares against target *up to today*, not the whole month.
- **Localization** is hard-coded Czech: the `*_CS` constant arrays near the top of the script (`WEEKDAYS_CS`, `MONTHS_CS`, `MONTHS_GEN_CS`, etc.). All UI strings are Czech.

### On Call feature

`config.onCallTasks` is a list of task names (entered semicolon-separated in Settings). In `cuLoadTimeEntries`, entries whose task name matches (case-insensitive, exact, via `isOnCallTask`) are split into `state.onCall` instead of `state.entries`, so On Call time is deducted from the displayed logged hours, week totals, and the header stat, and surfaced separately in a per-cell footer and an "On Call" stat card. This split currently applies to the **month view only** — the day timeline still shows On Call entries as normal blocks.

## Working notes

- DOM is accessed via the `$ = id => document.getElementById(id)` helper and built imperatively (`document.createElement`); element IDs in the HTML are the contract between markup and script.
- When adding a stat card or settings field, wire it in all of: the HTML, `renderMonth`/`renderDay`, `loadConfig` defaults, `syncSettingsUI`, `saveSettings`, and `clearSettings`.
