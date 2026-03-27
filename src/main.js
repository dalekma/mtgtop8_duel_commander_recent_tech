/**
 * Entrypoints and menu hooks.
 */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Duel Commander DB')
    .addItem('Initialize Sheets', 'initializeSheets')
    .addItem('Refresh Recent Top8', 'refreshRecentTop8')
    .addItem('Rebuild Summaries', 'rebuildSummaries')
    .addSeparator()
    .addItem('Install/Update Weekly Trigger', 'installOrUpdateWeeklyTrigger')
    .addItem('Remove Weekly Trigger', 'removeWeeklyTrigger')
    .addToUi();
}

function runManualRefresh() {
  refreshRecentTop8();
}

function runSummaryOnly() {
  rebuildSummaries();
}
