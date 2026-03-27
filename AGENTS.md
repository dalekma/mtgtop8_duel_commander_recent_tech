# Contributor Guide

## Project Purpose
- This repository exists to build a **Duel Commander deck-building research database** from MTGTop8 data.
- Treat this as a research/data-engineering workflow, not a generic web-scraping project.
- Every implementation choice should prioritize reproducibility and analytical usefulness for Duel Commander deck trends.

## Architectural Boundaries
Keep responsibilities separated and avoid cross-layer coupling:
- **Parsing layer**: Extract raw fields from source pages.
- **Normalization layer**: Convert parsed values into canonical, deterministic schema values.
- **Google Sheets I/O layer**: Read/write tabular data only; no parsing logic embedded here.
- **Orchestration layer**: Coordinate runs, incremental ingest, retries, and task sequencing.
- **Summary/reporting layer**: Derive aggregate outputs and human-facing summaries from normalized data.

Do not merge these concerns into single “do everything” functions.

## Data Integrity Rules
- Raw ingestion tabs are **append-only**.
- Ingest must be **incremental** (process only new/unseen events/decks whenever possible).
- Do **not** perform destructive rewrites, backfills that overwrite history, or tab resets unless explicitly requested by a human reviewer.
- Prefer idempotent operations and stable keys so reruns do not corrupt existing records.

## Parser Extension Rules
- Isolate MTGTop8 selector logic by page type (e.g., event list, event details, deck page).
- Keep selector definitions localized so a site change affects minimal code.
- Add comments for brittle selectors (dynamic classes, fragile DOM position assumptions, inferred labels).
- When selector/parsing logic changes, update or add fixtures/tests in the same change.

## Coding Style and Reliability
- Favor small, composable functions with a single responsibility.
- Keep transforms deterministic: same input should produce same output.
- Use explicit, structured logging with enough context (event URL/ID, deck URL/ID, stage, error reason).
- Fail safely at per-event/per-deck granularity:
  - Skip and log problematic records.
  - Continue processing remaining records.
  - Avoid full-run crashes caused by one malformed page.

## Scope Guardrails (MVP)
- MVP scope is **Duel Commander only**.
- Do not add OCR-based extraction.
- Do not introduce a backend service/API.
- Do not build a UI application.
- Focus on reliable ingest, normalization, and analysis-ready dataset generation.
