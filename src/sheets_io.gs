function initializeSheets() {
  for (var tabName in TAB_SCHEMAS) {
    if (!Object.prototype.hasOwnProperty.call(TAB_SCHEMAS, tabName)) {
      continue;
    }
    ensureSheetWithHeader_(tabName, TAB_SCHEMAS[tabName]);
  }
  seedDefaultConfig_();
  logInfo_('initialize_sheets_complete', { tabs: Object.keys(TAB_SCHEMAS).length });
}

function ensureSheetWithHeader_(sheetName, expectedHeader) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  var existingHeader = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0];
  var hasAnyHeader = existingHeader.join('').trim().length > 0;

  if (!hasAnyHeader) {
    sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
  } else {
    var current = sheet.getRange(1, 1, 1, Math.max(expectedHeader.length, sheet.getLastColumn())).getValues()[0];
    for (var i = 0; i < expectedHeader.length; i++) {
      if (!current[i]) {
        sheet.getRange(1, i + 1).setValue(expectedHeader[i]);
      }
    }
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function seedDefaultConfig_() {
  var configMap = getConfigMap_();
  for (var key in DEFAULT_CONFIG) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(configMap, key)) {
      upsertConfigValue_(key, DEFAULT_CONFIG[key], 'seeded default');
    }
  }
}

function getExistingKeys_(sheetName, keyColumnName) {
  var sheet = ensureSheetWithHeader_(sheetName, TAB_SCHEMAS[sheetName]);
  var header = sheet.getRange(1, 1, 1, TAB_SCHEMAS[sheetName].length).getValues()[0];
  var colIndex = header.indexOf(keyColumnName);
  if (colIndex < 0 || sheet.getLastRow() < 2) {
    return {};
  }

  var values = sheet.getRange(2, colIndex + 1, sheet.getLastRow() - 1, 1).getValues();
  var set = {};
  for (var i = 0; i < values.length; i++) {
    var key = normalizeSpace_(values[i][0]);
    if (key) {
      set[key] = true;
    }
  }
  return set;
}

function appendRows_(sheetName, rows) {
  if (!rows || rows.length === 0) {
    return;
  }
  var sheet = ensureSheetWithHeader_(sheetName, TAB_SCHEMAS[sheetName]);
  var nextRow = sheet.getLastRow() + 1;
  sheet.getRange(nextRow, 1, rows.length, TAB_SCHEMAS[sheetName].length).setValues(rows);
}

function replaceDerivedRows_(sheetName, rows) {
  var sheet = ensureSheetWithHeader_(sheetName, TAB_SCHEMAS[sheetName]);
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, TAB_SCHEMAS[sheetName].length).clearContent();
  }
  appendRows_(sheetName, rows);
}

function readRawRows_(sheetName) {
  var sheet = ensureSheetWithHeader_(sheetName, TAB_SCHEMAS[sheetName]);
  if (sheet.getLastRow() < 2) {
    return [];
  }
  return sheet.getRange(2, 1, sheet.getLastRow() - 1, TAB_SCHEMAS[sheetName].length).getValues();
/**
 * Required sheet schema keyed by tab name.
 * Keep this deterministic to preserve stable column positions.
 */
const REQUIRED_SHEET_SCHEMA = {
  config: ['key', 'value', 'note'],
  events_raw: [
    'event_id',
    'event_url',
    'event_name',
    'format',
    'location',
    'event_date',
    'event_date_utc',
    'source_site',
    'source_page',
    'ingested_at_utc',
  ],
  decks_raw: [
    'deck_id',
    'event_id',
    'event_url',
    'event_date',
    'placement',
    'player',
    'commander',
    'archetype',
    'deck_url',
    'is_top8',
    'source_site',
    'ingested_at_utc',
  ],
  cards_raw: [
    'row_id',
    'deck_id',
    'event_id',
    'event_date',
    'placement',
    'commander',
    'archetype',
    'card_name',
    'card_qty',
    'card_role',
    'deck_url',
    'source_site',
    'ingested_at_utc',
  ],
  card_summary: [
    'card_name',
    'decks_with_card',
    'total_copies',
    'avg_copies_per_deck',
    'top8_share',
    'winrate_proxy',
    'first_seen_date',
    'last_seen_date',
    'days_since_last_seen',
    'trend_7d',
    'trend_28d',
    'updated_at_utc',
  ],
  emerging_tech: [
    'rank',
    'card_name',
    'emerging_score',
    'confidence',
    'sample_decks',
    'trend_signal',
    'recency_signal',
    'penetration_signal',
    'conversion_signal',
    'notes',
    'updated_at_utc',
  ],
};

/**
 * Minimal defaults required for a first-time run.
 */
const MINIMAL_CONFIG_DEFAULTS = [
  ['format', 'duel_commander', 'Target format for ingestion scope'],
  ['events_to_fetch', '3', 'Recent events requested during manual ingest runs'],
  ['base_url', 'https://www.mtgtop8.com', 'MTGTop8 base URL'],
  ['event_list_url', 'https://www.mtgtop8.com/format?f=EDH', 'Duel Commander event listing URL'],
];

/**
 * Ensures required tabs and header rows exist without clearing historical data.
 * Also seeds minimal config rows when keys are missing.
 *
 * @return {{tabsCreated: string[], tabsExisting: string[], headersWritten: string[], headersExisting: string[], configSeeded: string[], configExisting: string[]}}
 */
function initializeSheetSchema() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  const result = {
    tabsCreated: [],
    tabsExisting: [],
    headersWritten: [],
    headersExisting: [],
    configSeeded: [],
    configExisting: [],
  };

  Object.keys(REQUIRED_SHEET_SCHEMA).forEach(function (tabName) {
    const expectedHeaders = REQUIRED_SHEET_SCHEMA[tabName];
    let sheet = spreadsheet.getSheetByName(tabName);

    if (!sheet) {
      sheet = spreadsheet.insertSheet(tabName);
      result.tabsCreated.push(tabName);
      Logger.log('Created missing tab: %s', tabName);
    } else {
      result.tabsExisting.push(tabName);
      Logger.log('Tab already exists: %s', tabName);
    }

    const shouldWriteHeader = isHeaderMissingOrBlank_(sheet, expectedHeaders.length);
    if (shouldWriteHeader) {
      sheet.getRange(1, 1, 1, expectedHeaders.length).setValues([expectedHeaders]);
      result.headersWritten.push(tabName);
      Logger.log('Wrote missing/blank header row on tab: %s', tabName);
    } else {
      result.headersExisting.push(tabName);
      Logger.log('Header already present on tab: %s', tabName);
    }

    if (sheet.getFrozenRows() < 1) {
      sheet.setFrozenRows(1);
    }
  });

  seedConfigDefaults_(spreadsheet.getSheetByName('config'), result);

  Logger.log('Schema initialization summary: %s', JSON.stringify(result));
  return result;
}

/**
 * Returns true when row 1 has no non-empty cells in the expected header span.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {number} headerLength
 * @return {boolean}
 */
function isHeaderMissingOrBlank_(sheet, headerLength) {
  const headerValues = sheet.getRange(1, 1, 1, headerLength).getValues()[0];
  return headerValues.every(function (cell) {
    return String(cell).trim() === '';
  });
}

/**
 * Seeds minimal config defaults only for missing keys.
 *
 * @param {GoogleAppsScript.Spreadsheet.Sheet} configSheet
 * @param {{configSeeded: string[], configExisting: string[]}} result
 */
function seedConfigDefaults_(configSheet, result) {
  const lastRow = configSheet.getLastRow();
  const existingKeys = new Set();

  if (lastRow >= 2) {
    const existingKeyValues = configSheet.getRange(2, 1, lastRow - 1, 1).getValues();
    existingKeyValues.forEach(function (row) {
      const key = String(row[0]).trim();
      if (key) {
        existingKeys.add(key);
      }
    });
  }

  const rowsToAppend = [];
  MINIMAL_CONFIG_DEFAULTS.forEach(function (configRow) {
    const key = configRow[0];
    if (existingKeys.has(key)) {
      result.configExisting.push(key);
      Logger.log('Config key already exists: %s', key);
      return;
    }

    rowsToAppend.push(configRow);
    result.configSeeded.push(key);
    Logger.log('Seeded config default key: %s', key);
  });

  if (rowsToAppend.length > 0) {
    const startRow = Math.max(configSheet.getLastRow() + 1, 2);
    configSheet.getRange(startRow, 1, rowsToAppend.length, 3).setValues(rowsToAppend);
  }
}
