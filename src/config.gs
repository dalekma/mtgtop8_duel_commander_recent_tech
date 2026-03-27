var TAB_SCHEMAS = {
  config: ['key', 'value', 'note'],
  events_raw: [
    'event_id', 'event_url', 'event_name', 'format', 'location',
    'event_date', 'event_date_utc', 'source_site', 'source_page', 'ingested_at_utc'
  ],
  decks_raw: [
    'deck_id', 'event_id', 'event_url', 'event_date', 'placement',
    'player', 'commander', 'archetype', 'deck_url', 'is_top8', 'source_site', 'ingested_at_utc'
  ],
  cards_raw: [
    'row_id', 'deck_id', 'event_id', 'event_date', 'placement', 'commander',
    'archetype', 'card_name', 'card_qty', 'card_role', 'deck_url', 'source_site', 'ingested_at_utc'
  ],
  card_summary: [
    'card_name', 'decks_with_card', 'total_copies', 'avg_copies_per_deck', 'top8_share',
    'winrate_proxy', 'first_seen_date', 'last_seen_date', 'days_since_last_seen',
    'trend_7d', 'trend_28d', 'updated_at_utc'
  ],
  emerging_tech: [
    'rank', 'card_name', 'emerging_score', 'confidence', 'sample_decks',
    'trend_signal', 'recency_signal', 'penetration_signal', 'conversion_signal',
    'notes', 'updated_at_utc'
  ]
};

var DEFAULT_CONFIG = {
  enabled: 'TRUE',
  days_back: '35',
  max_events_per_run: '3',
  min_card_copies: '1',
  emerging_min_decks: '2',
  weight_recency: '0.40',
  weight_penetration: '0.35',
  weight_conversion: '0.25',
  last_successful_run_utc: ''
};

function getDbConfig() {
  var values = getConfigMap_();
  return {
    enabled: toBool_(pickConfig_(values, 'enabled', DEFAULT_CONFIG.enabled)),
    daysBack: toInt_(pickConfig_(values, 'days_back', DEFAULT_CONFIG.days_back), 35),
    maxEventsPerRun: toInt_(pickConfig_(values, 'max_events_per_run', DEFAULT_CONFIG.max_events_per_run), 3),
    minCardCopies: toInt_(pickConfig_(values, 'min_card_copies', DEFAULT_CONFIG.min_card_copies), 1),
    emergingMinDecks: toInt_(pickConfig_(values, 'emerging_min_decks', DEFAULT_CONFIG.emerging_min_decks), 2),
    weightRecency: toFloat_(pickConfig_(values, 'weight_recency', DEFAULT_CONFIG.weight_recency), 0.40),
    weightPenetration: toFloat_(pickConfig_(values, 'weight_penetration', DEFAULT_CONFIG.weight_penetration), 0.35),
    weightConversion: toFloat_(pickConfig_(values, 'weight_conversion', DEFAULT_CONFIG.weight_conversion), 0.25)
  };
}

function pickConfig_(configMap, key, fallback) {
  return Object.prototype.hasOwnProperty.call(configMap, key) ? configMap[key] : fallback;
}

function getConfigMap_() {
  var sheet = ensureSheetWithHeader_('config', TAB_SCHEMAS.config);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {};
  }
  var values = sheet.getRange(2, 1, lastRow - 1, TAB_SCHEMAS.config.length).getValues();
  var map = {};
  for (var i = 0; i < values.length; i++) {
    var key = normalizeSpace_(values[i][0]);
    if (!key) {
      continue;
    }
    map[key] = String(values[i][1] || '').trim();
  }
  return map;
}

function upsertConfigValue_(key, value, note) {
  var sheet = ensureSheetWithHeader_('config', TAB_SCHEMAS.config);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    sheet.appendRow([key, value, note || '']);
    return;
  }
  var values = sheet.getRange(2, 1, lastRow - 1, TAB_SCHEMAS.config.length).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeSpace_(values[i][0]) === key) {
      sheet.getRange(i + 2, 2, 1, 2).setValues([[value, note || values[i][2] || '']]);
      return;
    }
  }
  sheet.appendRow([key, value, note || '']);
}

function toBool_(value) {
  return String(value).toLowerCase() === 'true';
}

function toInt_(value, fallback) {
  var n = parseInt(value, 10);
  return isNaN(n) ? fallback : n;
}

function toFloat_(value, fallback) {
  var n = parseFloat(value);
  return isNaN(n) ? fallback : n;
}
