# Duel Commander Recent Tech Research DB (Google Sheets + Apps Script)

This project defines a **Google Sheets–backed Duel Commander research database** that ingests **recent MTGTop8 Top 8 results only**, normalizes event/deck/card data, and computes an "emerging tech" view for card-level trend discovery.

---

## 1) Purpose

The goal is to maintain a lightweight, analyst-friendly dataset in Google Sheets for tracking:

- Which Duel Commander events recently posted Top 8 lists.
- Which commanders/archetypes are overperforming in recent results.
- Which individual cards are appearing more often (or unusually) in successful decks.

This repo is intended for:

- **Fast iteration** (edit Apps Script logic, redeploy quickly).
- **Low-friction collaboration** (sheet as UI + storage).
- **Incremental ingestion** (new results added without clobbering existing data).

Scope in this guide assumes:

- Source: **MTGTop8 Duel Commander pages**.
- Window: **recent events only**.
- Placement: **Top 8 decks only**.

---

## 2) Architecture Overview

The pipeline is organized into four layers:

1. **Parser layer**
   - Fetches and parses MTGTop8 HTML pages.
   - Extracts event metadata, deck metadata, and card lines from decklists.
   - Applies MTGTop8-specific assumptions and fallbacks.

2. **Ingest orchestrator**
   - Coordinates refresh runs.
   - Loads config, determines ingest window, executes incremental fetch.
   - Performs dedup checks before appending new rows.

3. **Sheets I/O layer**
   - Ensures tabs/headers exist.
   - Reads/writes rows in batch.
   - Keeps schema deterministic and stable for formulas/charts.

4. **Summary layer**
   - Aggregates `cards_raw` into `card_summary` metrics.
   - Computes `emerging_tech` ranking/scoring.
   - Applies tunable weights from `config`.

Data flow:

`MTGTop8 pages -> parser -> normalized rows -> events_raw / decks_raw / cards_raw -> card_summary -> emerging_tech`

---

## 3) Sheet Tab Schema (Exact Columns)

Create tabs with the exact header row below (same spelling and order).

### `config`

| column |
|---|
| key |
| value |
| note |

Suggested initial keys (optional but recommended):

- `enabled` = `TRUE`
- `days_back` = `35`
- `max_events_per_run` = `100`
- `min_card_copies` = `1`
- `emerging_min_decks` = `2`
- `weight_recency` = `0.40`
- `weight_penetration` = `0.35`
- `weight_conversion` = `0.25`
- `last_successful_run_utc` = *(blank initially)*

### `events_raw`

| column |
|---|
| event_id |
| event_url |
| event_name |
| format |
| location |
| event_date |
| event_date_utc |
| source_site |
| source_page |
| ingested_at_utc |

### `decks_raw`

| column |
|---|
| deck_id |
| event_id |
| event_url |
| event_date |
| placement |
| player |
| commander |
| archetype |
| deck_url |
| is_top8 |
| source_site |
| ingested_at_utc |

### `cards_raw`

| column |
|---|
| row_id |
| deck_id |
| event_id |
| event_date |
| placement |
| commander |
| archetype |
| card_name |
| card_qty |
| card_role |
| deck_url |
| source_site |
| ingested_at_utc |

### `card_summary`

| column |
|---|
| card_name |
| decks_with_card |
| total_copies |
| avg_copies_per_deck |
| top8_share |
| winrate_proxy |
| first_seen_date |
| last_seen_date |
| days_since_last_seen |
| trend_7d |
| trend_28d |
| updated_at_utc |

### `emerging_tech`

| column |
|---|
| rank |
| card_name |
| emerging_score |
| confidence |
| sample_decks |
| trend_signal |
| recency_signal |
| penetration_signal |
| conversion_signal |
| notes |
| updated_at_utc |

---

## 4) Setup Instructions (Apps Script Deployment from This Repo)

> You can use either the Google Apps Script web editor or `clasp`. The `clasp` layout below is recommended for version control.

### Option A — `clasp`-compatible (recommended)

1. Install prerequisites:
   - Node.js LTS
   - `npm i -g @google/clasp`
2. Authenticate:
   - `clasp login`
3. Initialize script linkage in this repo:
   - `clasp create --type sheets --title "Duel Commander Recent Tech"`
   - This creates `.clasp.json` (script ID binding).
4. Suggested local structure:

```text
.
├─ README.md
├─ appsscript.json
├─ src/
│  ├─ main.gs              # menu + entrypoints
│  ├─ config.gs            # config loading/defaults
│  ├─ parser_mtgtop8.gs    # HTML parsing
│  ├─ ingest.gs            # orchestration + dedup
│  ├─ sheets_io.gs         # tab/header/read/write helpers
│  └─ summary.gs           # card_summary + emerging_tech
└─ tests/                  # optional local parser tests
```

5. In `.clasp.json`, point `rootDir` to your script source root (commonly `.` or `src` depending how you compile/deploy).
6. Push code:
   - `clasp push`
7. Open project:
   - `clasp open-script`

### Option B — Web editor

1. Open target Google Sheet.
2. Extensions → Apps Script.
3. Paste source files by module.
4. Save and run initialization function once.

---

## 5) Initialization (Create Tabs + Headers Without Deleting Existing Data)

Initialization should be **idempotent** and non-destructive:

- If a required tab does not exist: create it.
- If tab exists but header row is empty: write headers.
- If tab exists and has data: do **not** clear rows.
- If header mismatch is detected: alert/log and only append missing header columns (do not reorder existing data silently).

Recommended callable:

- `initializeSheets()`

Expected behavior:

1. Validate all required tab names.
2. Ensure exact headers from Section 3 exist.
3. Freeze row 1 on each tab.
4. Write run metadata to logs.

---

## 6) Manual Run Instructions

Expose both menu-driven and direct callable execution.

### Custom menu

Implement an `onOpen()` menu, e.g.:

- **Duel Commander DB → Initialize Sheets** (`initializeSheets`)
- **Duel Commander DB → Refresh Recent Top8** (`refreshRecentTop8`)
- **Duel Commander DB → Rebuild Summaries** (`rebuildSummaries`)
- **Duel Commander DB → Install/Update Weekly Trigger** (`installOrUpdateWeeklyTrigger`)
- **Duel Commander DB → Remove Weekly Trigger** (`removeWeeklyTrigger`)

### Callable refresh function

Primary orchestrator entrypoint:

- `refreshRecentTop8()`

Run path:

1. Load config and validate run enabled.
2. Determine window (`days_back`) and event cap (`max_events_per_run`).
3. Parse MTGTop8 recent Duel Commander Top 8 events.
4. Incrementally append unseen events/decks/cards.
5. Recompute `card_summary` and `emerging_tech`.
6. Persist `last_successful_run_utc`.

---

## 7) Weekly Trigger Behavior (Install / Update / Remove Safely)

Recommended schedule:

- **Weekly trigger**, low-traffic hour (e.g., Monday 06:00 UTC), running `refreshRecentTop8`.

### Safe trigger install/update

Use `installOrUpdateWeeklyTrigger()` that:

1. Finds existing project triggers for `refreshRecentTop8`.
2. Deletes duplicates/stale schedules.
3. Creates exactly one weekly trigger with desired schedule.
4. Logs trigger ID + next fire time (if available).

### Safe trigger removal

Use `removeWeeklyTrigger()` that:

1. Enumerates triggers for `refreshRecentTop8`.
2. Deletes all matches.
3. Leaves unrelated triggers untouched.

---

## 8) Incremental Ingest + Dedup Behavior

Dedup should happen at each raw layer with stable natural keys:

- `events_raw`: dedup by `event_id` (fallback `event_url`).
- `decks_raw`: dedup by `deck_id` (fallback `event_id + placement + player + commander`).
- `cards_raw`: dedup by `deck_id + card_name + card_role`.

Best practices:

- Normalize names/case before keying.
- Strip extra whitespace and HTML artifacts.
- Batch-read existing key columns into sets/maps.
- Append only new rows.
- Keep ingest append-only in raw tabs; recompute summary tabs deterministically.

---

## 9) Summary + Emerging-Tech Logic (with Tunable Scoring)

`card_summary` is built from `cards_raw` (+ deck/event context):

- `decks_with_card`: count distinct decks containing card.
- `total_copies`: sum of `card_qty`.
- `avg_copies_per_deck`: `total_copies / decks_with_card`.
- `top8_share`: `decks_with_card / distinct_top8_decks_in_window`.
- `winrate_proxy`: placement-weighted score proxy (example: 1st>2nd>3rd-4th>5th-8th).
- `trend_7d` / `trend_28d`: short vs medium window deltas.

`emerging_tech` rank should combine normalized signals:

- `recency_signal` (how recently card appeared).
- `penetration_signal` (share of Top 8 decks).
- `conversion_signal` (placement quality proxy).
- `trend_signal` (growth acceleration / momentum).

Example score:

```text
emerging_score =
  weight_recency * recency_signal +
  weight_penetration * penetration_signal +
  weight_conversion * conversion_signal
```

Optional: fold `trend_signal` into recency or as additional weighted term.

Tuning notes:

- Increase `weight_recency` to favor newly spiking cards.
- Increase `weight_penetration` to favor broad adoption.
- Increase `weight_conversion` to favor cards tied to higher finishes.
- Enforce minimum sample with `emerging_min_decks` to reduce noise.

---

## 10) Known Limitations & MTGTop8 Parsing Assumptions

Because source is HTML pages not a formal API, expect occasional parser drift.

Assumptions:

- Event/deck/card fields are extractable from current MTGTop8 page structure.
- Deck pages include stable identifiers or URLs suitable for keying.
- Quantities and card lines are parseable into integer + card name.
- Only Duel Commander events and Top 8 placements are included.

Limitations:

- Site layout changes can break selectors.
- Missing or inconsistent player/archetype labels may reduce quality.
- Event timezone/date normalization may be approximate.
- Summary metrics are observational (not causal).
- `winrate_proxy` is a placement proxy, not match-level win rate.

Mitigations:

- Keep selector logic centralized in parser layer.
- Add parse-failure logs and row-level skip reasons.
- Version scoring config in `config` tab notes.
- Periodically audit dedup keys against real data anomalies.

---

## Suggested First-Run Checklist

1. Deploy script and authorize scopes.
2. Run `initializeSheets()`.
3. Confirm required tabs and exact headers exist.
4. Run `refreshRecentTop8()` manually once.
5. Verify rows landed in `events_raw`, `decks_raw`, `cards_raw`.
6. Verify `card_summary` and `emerging_tech` populated.
7. Install weekly trigger.
8. Re-check after next scheduled run.

---

## Operational Notes

- Treat `events_raw`, `decks_raw`, and `cards_raw` as append-only audit history.
- Treat `card_summary` and `emerging_tech` as rebuildable derived views.
- Keep config changes documented in `config.note` for reproducibility.

