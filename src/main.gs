function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Duel Commander DB')
    .addItem('Initialize Sheets', 'initializeSheets')
    .addItem('Refresh Recent Top8', 'refreshRecentTop8')
    .addItem('Rebuild Summaries', 'rebuildSummaries')
    .addToUi();
}
/**
 * Adds custom menu entries for manual operations.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Duel Commander DB')
    .addItem('Initialize Sheet Schema', 'menuInitializeSheetSchema')
    .addToUi();
}

/**
 * Menu action wrapper for initializeSheetSchema.
 */
function menuInitializeSheetSchema() {
  const result = initializeSheetSchema();
  SpreadsheetApp.getUi().alert(
    'initializeSheetSchema complete.\n\n' +
      'Tabs created: ' + result.tabsCreated.length + '\n' +
      'Headers written: ' + result.headersWritten.length + '\n' +
      'Config defaults seeded: ' + result.configSeeded.length
  );
}
