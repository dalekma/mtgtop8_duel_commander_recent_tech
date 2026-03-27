/**
 * Centralized project configuration/constants.
 */
const SOURCE_SITE = 'mtgtop8';

const URLS = Object.freeze({
  BASE: 'https://www.mtgtop8.com',
  RECENT_DUEL_COMMANDER: 'https://www.mtgtop8.com/format?f=EDH'
});

const TAB_SCHEMAS = Object.freeze({
  config: [
    'key', 'value', 'note'
  ],
  events_raw: [
    'event_id', 'event_url', 'event_name', 'format', 'location',
    'event_date', 'event_date_utc', 'source_site', 'source_page', 'ingested_at_utc'
  ],
  decks_raw: [
    'deck_id', 'event_id', 'event_url', 'event_date', 'placement',
    'player', 'commander', 'deck_color_identity', 'archetype', 'deck_url',
    'is_top8', 'source_site', 'ingested_at_utc'
  ],
  cards_raw: [
    'row_id', 'deck_id', 'event_id', 'event_date', 'placement',
    'commander', 'deck_color_identity', 'archetype', 'card_name', 'card_qty',
    'card_role', 'card_color_identity', 'card_mana_value', 'card_types', 'is_land',
    'deck_url', 'source_site', 'ingested_at_utc'
  ],
  card_summary: [
    'card_name', 'card_color_identity', 'card_mana_value', 'card_types', 'is_land',
    'decks_with_card', 'total_copies', 'avg_copies_per_deck',
    'top8_share', 'winrate_proxy', 'first_seen_date', 'last_seen_date',
    'days_since_last_seen', 'trend_7d', 'trend_28d', 'updated_at_utc'
  ],
  emerging_tech: [
    'rank', 'card_name', 'card_color_identity', 'card_mana_value', 'card_types', 'is_land',
    'emerging_score', 'confidence', 'sample_decks',
    'trend_signal', 'recency_signal', 'penetration_signal', 'conversion_signal',
    'notes', 'updated_at_utc'
  ]
});

const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  days_back: 35,
  max_events_per_run: 3,
  min_card_copies: 1,
  emerging_min_decks: 2,
  weight_recency: 0.4,
  weight_penetration: 0.35,
  weight_conversion: 0.25,
  last_successful_run_utc: ''
});

const INGEST_LIMITS = Object.freeze({
  MAX_HTTP_ATTEMPTS: 3,
  RETRY_SLEEP_MS: 500,
  FETCH_TIMEOUT_SECONDS: 25
});

function getDefaultConfig() {
  return Object.assign({}, DEFAULT_CONFIG);
}

function nowIsoUtc() {
  return new Date().toISOString();
}
