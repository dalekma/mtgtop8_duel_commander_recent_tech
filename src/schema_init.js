/**
 * Schema/bootstrap module for sheet initialization.
 */

const REQUIRED_SHEET_SCHEMA = TAB_SCHEMAS;

function initializeSheetSchema() {
  Object.keys(REQUIRED_SHEET_SCHEMA).forEach(function (tabName) {
    ensureSheet_(tabName);
  });
  seedConfigDefaults_();
  logInfo('initialize_sheet_schema_complete', { tabs: Object.keys(REQUIRED_SHEET_SCHEMA).length });
}

function seedConfigDefaults_() {
  const defaults = getDefaultConfig();
  const current = loadRuntimeConfig();

  Object.keys(defaults).forEach(function (key) {
    if (current[key] === undefined || current[key] === null || current[key] === '') {
      setConfigValue(key, defaults[key], 'Seeded default config value');
    }
  });
}

// Backward-compatible entrypoint for existing trigger/menu bindings.
function initializeSheets() {
  initializeSheetSchema();
}
