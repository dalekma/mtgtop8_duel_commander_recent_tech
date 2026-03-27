/**
 * Google Sheets I/O layer only.
 */

function getSpreadsheet() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getSheetSchema_(tabName) {
  const headers = TAB_SCHEMAS[tabName];
  if (!headers) {
    throw new Error('Unknown tab schema: ' + tabName);
  }
  return headers;
}

function ensureSheet_(tabName) {
  const headers = getSheetSchema_(tabName);
  const ss = getSpreadsheet();
  let sheet = ss.getSheetByName(tabName);
  if (!sheet) {
    sheet = ss.insertSheet(tabName);
  }

  const lastCol = sheet.getLastColumn();
  const existing = lastCol > 0 ? sheet.getRange(1, 1, 1, lastCol).getValues()[0] : [];

  if (!existing[0]) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  } else {
    evolveSheetSchema_(sheet, headers, existing);
  }

  sheet.setFrozenRows(1);
  return sheet;
}

function evolveSheetSchema_(sheet, headers, existingHeaders) {
  const existingMap = {};
  existingHeaders.forEach(function (header) {
    const key = normalizeText(header);
    if (!key) return;
    existingMap[key] = true;
  });

  const missing = headers.filter(function (header) {
    return !existingMap[normalizeText(header)];
  });

  if (missing.length) {
    const appendStart = sheet.getLastColumn() + 1;
    sheet.getRange(1, appendStart, 1, missing.length).setValues([missing]);
    logInfo('schema_columns_appended', {
      tab: sheet.getName(),
      missing_columns: missing
    });
  }
}

function getHeaderIndex_(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const map = {};
  headers.forEach(function (h, idx) {
    map[String(h)] = idx;
  });
  return map;
}

function schemaAlignedRow_(row, headers) {
  return headers.map(function (h) {
    return row[h] !== undefined ? row[h] : '';
  });
}

function readRawRows_(tabName) {
  const headers = getSheetSchema_(tabName);
  const sheet = ensureSheet_(tabName);
  if (sheet.getLastRow() <= 1) {
    return [];
  }

  const allValues = sheet.getRange(2, 1, sheet.getLastRow() - 1, sheet.getLastColumn()).getValues();
  const index = getHeaderIndex_(sheet);

  return allValues.map(function (rawRow) {
    return headers.map(function (header) {
      const col = index[header];
      return col === undefined ? '' : rawRow[col];
    });
  });
}

function readObjects(tabName) {
  const headers = getSheetSchema_(tabName);
  const values = readRawRows_(tabName);
  return values.map(function (row) {
    const obj = {};
    headers.forEach(function (h, idx) {
      obj[h] = row[idx];
    });
    return obj;
  });
}

function readExistingIdSet(tabName, idColumnName) {
  const sheet = ensureSheet_(tabName);
  if (sheet.getLastRow() <= 1) return {};

  const index = getHeaderIndex_(sheet);
  const colIdx = index[idColumnName];
  if (colIdx === undefined) throw new Error('Missing column ' + idColumnName + ' on ' + tabName);

  const values = sheet.getRange(2, colIdx + 1, sheet.getLastRow() - 1, 1).getValues();
  const out = {};
  values.forEach(function (row) {
    const v = normalizeText(row[0]);
    if (v) out[v] = true;
  });
  return out;
}

function appendObjects(tabName, rows) {
  if (!rows || rows.length === 0) return 0;

  const headers = getSheetSchema_(tabName);
  const sheet = ensureSheet_(tabName);
  const values = rows.map(function (row) {
    return schemaAlignedRow_(row, headers);
  });

  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, values.length, headers.length).setValues(values);
  return values.length;
}

function replaceSheetData(tabName, rows) {
  const headers = getSheetSchema_(tabName);
  const sheet = ensureSheet_(tabName);
  const lastRow = sheet.getLastRow();
  if (lastRow > 1) {
    sheet.getRange(2, 1, lastRow - 1, headers.length).clearContent();
  }

  if (!rows || rows.length === 0) return;

  const values = rows.map(function (row) {
    return schemaAlignedRow_(row, headers);
  });
  sheet.getRange(2, 1, values.length, headers.length).setValues(values);
}

function loadRuntimeConfig() {
  const cfg = getDefaultConfig();
  const values = readRawRows_('config');
  if (!values.length) return cfg;

  values.forEach(function (row) {
    const key = normalizeText(row[0]);
    if (!key) return;
    cfg[key] = castConfigValue(row[1], cfg[key]);
  });
  return cfg;
}

function castConfigValue(rawValue, defaultValue) {
  if (typeof defaultValue === 'boolean') {
    return /^(true|1|yes)$/i.test(String(rawValue));
  }
  if (typeof defaultValue === 'number') {
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : defaultValue;
  }
  return rawValue;
}

function setConfigValue(key, value, note) {
  const sheet = ensureSheet_('config');
  const rows = Math.max(sheet.getLastRow() - 1, 0);
  if (rows > 0) {
    const values = sheet.getRange(2, 1, rows, 1).getValues();
    for (var i = 0; i < values.length; i += 1) {
      if (normalizeText(values[i][0]) === key) {
        sheet.getRange(i + 2, 1, 1, 3).setValues([[key, value, note || '']]);
        return;
      }
    }
  }
  sheet.appendRow([key, value, note || '']);
}
