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

## 2.1) Code ownership map

Use this file-level map when making changes so each layer remains isolated:

- **Orchestration layer**
  - `src/main.js` (menu hooks + manual wrappers)
  - `src/ingest.js` (incremental ingest run + trigger lifecycle)
- **Google Sheets I/O layer**
  - `src/sheets_io.gs` (sheet creation, append-only writes, config row reads/writes)
- **Parsing layer**
  - `src/parsers/events_parser.js` (event-list + event metadata parsing)
  - `src/parsers/decks_parser.js` (Top 8 deck row parsing)
  - `src/parsers/cards_parser.js` (deck card-line parsing)
  - `src/fetch.js` (MTGTop8 HTTP retrieval + structured run logs)
- **Normalization layer**
  - `src/config.js` (`SOURCE_SITE`, `TAB_SCHEMAS`, default config constants)
  - `src/normalization.js` (canonical normalization helpers for deck/card fields)
  - shared helper functions in parser modules (`normalizeText`, `normalizeCardName`, stable ID helpers)
- **Summary/reporting layer**
  - `src/summary.js` (`card_summary` + `emerging_tech` rebuild logic)

---

## 3) Sheet Tab Schema (Single Source of Truth)

`TAB_SCHEMAS` in `src/config.js` is the **single authoritative schema map**. The tab names and column order below must match that map exactly.

### `config`

| column |
|---|
| key |
| value |
| note |

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
| deck_color_identity |
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
| deck_color_identity |
| archetype |
| card_name |
| card_qty |
| card_role |
| card_color_identity |
| card_mana_value |
| card_types |
| is_land |
| deck_url |
| source_site |
| ingested_at_utc |

### `card_summary`

| column |
|---|
| card_name |
| card_color_identity |
| card_mana_value |
| card_types |
| is_land |
| total_appearances |
| total_copies |
| distinct_decks |
| distinct_events |
| distinct_commanders |
| deck_colors_seen |
| card_colors_seen |
| avg_copies_per_deck |
| top8_share |
| winrate_proxy |
| first_seen_date |
| last_seen_date |
| days_since_last_seen |
| multi_deck_presence_signal |
| cross_event_spread_signal |
| shell_diversity_signal |
| recency_factor_signal |
| signal_score |
| notes |
| trend_7d |
| trend_28d |
| updated_at_utc |

### `emerging_tech`

| column |
|---|
| rank |
| card_name |
| card_color_identity |
| card_mana_value |
| card_types |
| is_land |
| emerging_score |
| confidence |
| sample_decks |
| sample_events |
| sample_commanders |
| multi_deck_presence_signal |
| cross_event_spread_signal |
| shell_diversity_signal |
| recency_factor_signal |
| why_interesting |
| notes |
| updated_at_utc |

Schema evolution policy:
- append missing columns only,
- never clear `events_raw`, `decks_raw`, or `cards_raw`,
- preserve historical rows.

## 4) Setup Instructions (Apps Script Deployment from This Repo)

> You can use either the Google Apps Script web editor or `clasp`. The `clasp` layout below is recommended for version control.

### Option A — `clasp`-compatible (recommended and canonical in this repo)

1. Install prerequisites:
   - Node.js LTS
   - `npm i -g @google/clasp`
2. Authenticate:
   - `clasp login`
3. Initialize script linkage in this repo:
   - `clasp create --type sheets --title "Duel Commander Recent Tech"`
   - This creates `.clasp.json` (script ID binding).
4. Use `.clasp.json` with `rootDir` set to the repository root (`"."`), so `clasp push` deploys the `src/` tree directly.
5. Files deployed by `clasp` (exact source convention):
   - `src/main.js`
   - `src/config.js`
   - `src/sheets_io.gs`
   - `src/fetch.js`
   - `src/ingest.js`
   - `src/summary.js`
   - `src/parsers/events_parser.js`
   - `src/parsers/decks_parser.js`
   - `src/parsers/cards_parser.js`
   - Legacy `src/*.gs` duplicates were retired to avoid global function collisions.
6. Suggested local structure:

```text
.
├─ README.md
├─ appsscript.json
├─ src/
│  ├─ main.js                  # menu hooks + entrypoints
│  ├─ config.js                # constants + schema + defaults
│  ├─ sheets.js                # Google Sheets I/O only
│  ├─ fetch.js                 # UrlFetch wrappers/logging
│  ├─ ingest.js                # orchestration + incremental ingest
│  ├─ summary.js               # card_summary + emerging_tech rebuild
│  └─ parsers/
│     ├─ events_parser.js      # event-list/event metadata parsing
│     ├─ decks_parser.js       # top8 deck parsing
│     └─ cards_parser.js       # deck card-line parsing
└─ tests/
   └─ parsers/
      ├─ fixtures/             # representative static MTGTop8 HTML pages
      └─ validate.js           # static parser validation assertions
```

7. Push code:
   - `clasp push`
8. Open project:
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
5. Recompute `card_summary` and `emerging_tech` **only after append stage succeeds**.
6. Persist `last_successful_run_utc` after successful append + summary rebuild.

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

Implementation note in this repo:

- `src/keying.gs` provides deterministic key builders:
  - `buildEventId(eventUrl, token?)` → `event_id`
  - `buildDeckId(deckUrl, token?)` → `deck_id`
  - `buildRowId({deck_id, card_role, card_name, card_qty})` → `row_id`
- `src/ingest.gs` loads existing `event_id`/`deck_id`/`row_id` values into in-memory maps before append and skips duplicates while logging `fetched`, `new_count`, `skipped_duplicate`, and `failed` counters.

---

## 9) Summary + Emerging-Tech Logic (with Tunable Scoring)

`card_summary` is built from `cards_raw` joined with deck/event context (`decks_raw`, `events_raw`):

- `total_appearances`: total card-line appearances across ingested decks.
- `total_copies`: sum of `card_qty`.
- `distinct_decks`, `distinct_events`, `distinct_commanders`: breadth metrics.
- `deck_colors_seen`, `card_colors_seen`: deterministic comma-separated observed identities.
- `first_seen_date` / `last_seen_date` + recency-derived fields.
- `signal_score`: weighted summary signal used downstream.
- `notes`: deterministic compact context (`events:X | commanders:Y | deck_colors:Z`).

`emerging_tech` uses an explicit weighted heuristic:

```text
emerging_score =
  weight_multi_deck_presence * multi_deck_presence_signal +
  weight_cross_event_spread * cross_event_spread_signal +
  weight_shell_diversity * shell_diversity_signal +
  weight_recency_factor * recency_factor_signal
```

Signal definitions:

- `multi_deck_presence_signal`: normalized distinct-deck presence.
- `cross_event_spread_signal`: normalized spread across distinct events.
- `shell_diversity_signal`: blend of commander diversity and deck-color diversity.
- `recency_factor_signal`: inverse-age signal using `recency_window_days`.

`why_interesting` is deterministic and short: it describes the top 1-2 weighted signal contributors (for example, “high multi-deck presence; moderate cross-event spread”).

### Default scoring config keys

- `emerging_min_decks`: `2`
- `recency_window_days`: `30`
- `weight_multi_deck_presence`: `0.35`
- `weight_cross_event_spread`: `0.25`
- `weight_shell_diversity`: `0.20`
- `weight_recency_factor`: `0.20`

Tuning notes:

- Increase `weight_multi_deck_presence` to emphasize broad multi-deck adoption.
- Increase `weight_cross_event_spread` to emphasize cross-tournament reproducibility.
- Increase `weight_shell_diversity` to emphasize commander/color-shell flexibility.
- Increase `weight_recency_factor` or lower `recency_window_days` to prioritize newer spikes.
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

### Static parser fixture validation (local)

Run this quick parser-only check before shipping parser changes:

```bash
node tests/parsers/validate.js
```

What it validates:

- event-list parsing (`event_id`, `event_url`, `event_date`)
- event-details Top 8 extraction (exactly 8 rows)
- deck-card extraction (`card_qty`, `card_name`, section-derived `card_role`)

Fixture update policy:

- Any parser selector change in `src/parsers/*.js` must include corresponding fixture updates in `tests/parsers/fixtures/` and matching assertion updates in `tests/parsers/validate.js`.

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
