/**
 * Ingest orchestration layer.
 */

function refreshRecentTop8() {
  const cfg = loadRuntimeConfig();
  if (!cfg.enabled) {
    logInfo('refresh_skipped_disabled', {});
    return;
  }

  initializeSheetSchema();

  const listHtml = fetchText(URLS.RECENT_DUEL_COMMANDER, { method: 'get' });
  const eventCandidates = parseRecentEventRows(listHtml, URLS.RECENT_DUEL_COMMANDER)
    .slice(0, cfg.max_events_per_run);

  const eventIdSet = readExistingIdSet('events_raw', 'event_id');
  const deckIdSet = readExistingIdSet('decks_raw', 'deck_id');
  const cardIdSet = readExistingIdSet('cards_raw', 'row_id');

  const newEvents = [];
  const newDecks = [];
  const newCards = [];

  eventCandidates.forEach(function (eventStub) {
    if (eventIdSet[eventStub.event_id]) return;

    try {
      const eventHtml = fetchText(eventStub.event_url, { method: 'get' });
      const eventMeta = parseEventMetadata(eventHtml, eventStub.event_url);
      newEvents.push(eventMeta);

      const deckRows = parseTop8DeckRows(eventHtml, eventMeta);
      deckRows.forEach(function (deckRow) {
        if (deckIdSet[deckRow.deck_id]) return;

        try {
          const deckHtml = fetchText(deckRow.deck_url, { method: 'get' });
          const cards = parseDeckCards(deckHtml, deckRow).filter(function (c) {
            return !cardIdSet[c.row_id];
          });

          newDecks.push(deckRow);
          Array.prototype.push.apply(newCards, cards);
        } catch (deckErr) {
          logWarn('deck_ingest_failed', {
            event_id: eventMeta.event_id,
            deck_id: deckRow.deck_id,
            deck_url: deckRow.deck_url,
            error: deckErr.message
          });
        }
      });
    } catch (eventErr) {
      logWarn('event_ingest_failed', {
        event_id: eventStub.event_id,
        event_url: eventStub.event_url,
        error: eventErr.message
      });
    }
  });

  appendObjects('events_raw', newEvents);
  appendObjects('decks_raw', newDecks);
  appendObjects('cards_raw', newCards);

  rebuildSummaries();
  setConfigValue('last_successful_run_utc', nowIsoUtc(), 'Updated by refreshRecentTop8');

  logInfo('refresh_complete', {
    events_added: newEvents.length,
    decks_added: newDecks.length,
    cards_added: newCards.length
  });
}

function installOrUpdateWeeklyTrigger() {
  const handler = 'refreshRecentTop8';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });

  ScriptApp.newTrigger(handler)
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.MONDAY)
    .atHour(6)
    .create();

  logInfo('weekly_trigger_installed', { handler: handler, day: 'MONDAY', hour_utc: 6 });
}

function removeWeeklyTrigger() {
  const handler = 'refreshRecentTop8';
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === handler) {
      ScriptApp.deleteTrigger(trigger);
    }
  });
  logInfo('weekly_trigger_removed', { handler: handler });
}
