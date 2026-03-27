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
}
