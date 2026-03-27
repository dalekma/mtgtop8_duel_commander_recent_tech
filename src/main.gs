function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Duel Commander DB')
    .addItem('Initialize Sheets', 'initializeSheets')
    .addItem('Refresh Recent Top8', 'refreshRecentTop8')
    .addItem('Rebuild Summaries', 'rebuildSummaries')
    .addToUi();
}
