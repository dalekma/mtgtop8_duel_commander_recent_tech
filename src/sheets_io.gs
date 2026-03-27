/**
 * Backward-compatible initializer used by existing orchestration code.
 */
function initializeSheets() {
  var result = initializeSheetSchema();
  logInfo_('initialize_sheets_complete', {
    tabs_created: result.tabsCreated.length,
    tabs_existing: result.tabsExisting.length,
    headers_written: result.headersWritten.length,
    headers_existing: result.headersExisting.length,
    config_seeded: result.configSeeded.length,
    config_existing: result.configExisting.length
  });
}

/**
 * Ensures required tabs/header rows exist and seeds missing default config keys.
 *
 * @return {{tabsCreated: string[], tabsExisting: string[], headersWritten: string[], headersExisting: string[], configSeeded: string[], configExisting: string[]}}
 */
function initializeSheetSchema() {
  var spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  var result = {
    tabsCreated: [],
    tabsExisting: [],
    headersWritten: [],
    headersExisting: [],
    configSeeded: [],
    configExisting: []
  };

  for (var tabName in TAB_SCHEMAS) {
    if (!Object.prototype.hasOwnProperty.call(TAB_SCHEMAS, tabName)) {
      continue;
    }

    var expectedHeader = TAB_SCHEMAS[tabName];
    var sheet = spreadsheet.getSheetByName(tabName);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(tabName);
      result.tabsCreated.push(tabName);
    } else {
      result.tabsExisting.push(tabName);
    }

    var shouldWriteHeader = isHeaderMissingOrBlank_(sheet, expectedHeader.length);
    if (shouldWriteHeader) {
      sheet.getRange(1, 1, 1, expectedHeader.length).setValues([expectedHeader]);
      result.headersWritten.push(tabName);
    } else {
      var current = sheet.getRange(1, 1, 1, Math.max(expectedHeader.length, sheet.getLastColumn())).getValues()[0];
      var added = false;
      for (var i = 0; i < expectedHeader.length; i++) {
        if (!current[i]) {
          sheet.getRange(1, i + 1).setValue(expectedHeader[i]);
          added = true;
        }
      }
      if (added) {
        result.headersWritten.push(tabName);
      } else {
        result.headersExisting.push(tabName);
      }
    }

    if (sheet.getFrozenRows() < 1) {
      sheet.setFrozenRows(1);
    }
  }

  seedDefaultConfigWithResult_(result);
  return result;
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

function isHeaderMissingOrBlank_(sheet, expectedHeaderLength) {
  var headerValues = sheet.getRange(1, 1, 1, expectedHeaderLength).getValues()[0];
  for (var i = 0; i < headerValues.length; i++) {
    if (String(headerValues[i]).trim() !== '') {
      return false;
    }
  }
  return true;
}

function seedDefaultConfig_() {
  seedDefaultConfigWithResult_(null);
}

function seedDefaultConfigWithResult_(result) {
  var configMap = getConfigMap_();
  for (var key in DEFAULT_CONFIG) {
    if (!Object.prototype.hasOwnProperty.call(DEFAULT_CONFIG, key)) {
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(configMap, key)) {
      upsertConfigValue_(key, DEFAULT_CONFIG[key], 'seeded default');
      if (result) {
        result.configSeeded.push(key);
      }
    } else if (result) {
      result.configExisting.push(key);
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
}
