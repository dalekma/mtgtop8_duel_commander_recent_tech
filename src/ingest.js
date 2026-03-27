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

  const seenRunEventIds = {};
  const seenRunDeckIds = {};
  const seenRunCardIds = {};
  const counters = createIngestCounters_();

  const newEvents = [];
  const newDecks = [];
  const newCards = [];

  eventCandidates.forEach(function (eventStub) {
    const eventId = normalizeText(eventStub && eventStub.event_id);
    if (!eventId) {
      incrementCounter_(counters.events.failed, 'missing_event_id');
      return;
    }
    if (eventIdSet[eventId]) {
      incrementCounter_(counters.events.skipped, 'existing_event_id');
      return;
    }
    if (seenRunEventIds[eventId]) {
      incrementCounter_(counters.events.skipped, 'duplicate_event_candidate');
      return;
    }
    seenRunEventIds[eventId] = true;

    try {
      const eventHtml = fetchText(eventStub.event_url, { method: 'get' });
      const eventMeta = parseEventMetadata(eventHtml, eventStub.event_url);
      if (!eventMeta.event_id) {
        incrementCounter_(counters.events.failed, 'missing_event_id_after_parse');
        return;
      }
      newEvents.push(eventMeta);
      incrementCounter_(counters.events.imported, 'event_row_ready');

      const deckRows = parseTop8DeckRows(eventHtml, eventMeta);
      deckRows.forEach(function (deckRow) {
        const deckId = normalizeText(deckRow && deckRow.deck_id);
        if (!deckId) {
          incrementCounter_(counters.decks.failed, 'missing_deck_id');
          return;
        }
        if (deckIdSet[deckId]) {
          incrementCounter_(counters.decks.skipped, 'existing_deck_id');
          return;
        }
        if (seenRunDeckIds[deckId]) {
          incrementCounter_(counters.decks.skipped, 'duplicate_deck_candidate');
          return;
        }
        seenRunDeckIds[deckId] = true;

        try {
          const deckHtml = fetchText(deckRow.deck_url, { method: 'get' });
          const cards = parseDeckCards(deckHtml, deckRow).filter(function (cardRow) {
            const rowId = normalizeText(cardRow && cardRow.row_id);
            if (!rowId) {
              incrementCounter_(counters.cards.failed, 'missing_row_id');
              return false;
            }
            if (cardIdSet[rowId]) {
              incrementCounter_(counters.cards.skipped, 'existing_row_id');
              return false;
            }
            if (seenRunCardIds[rowId]) {
              incrementCounter_(counters.cards.skipped, 'duplicate_card_candidate');
              return false;
            }
            seenRunCardIds[rowId] = true;
            return true;
          });

          newDecks.push(deckRow);
          incrementCounter_(counters.decks.imported, 'deck_row_ready');
          Array.prototype.push.apply(newCards, cards);
          if (cards.length) {
            incrementCounter_(counters.cards.imported, 'card_rows_ready', cards.length);
          }
        } catch (deckErr) {
          incrementCounter_(counters.decks.failed, 'deck_fetch_or_parse_failed');
          logWarn('deck_ingest_failed', {
            event_id: eventMeta.event_id,
            deck_id: deckRow.deck_id,
            deck_url: deckRow.deck_url,
            error: deckErr.message
          });
        }
      });
    } catch (eventErr) {
      incrementCounter_(counters.events.failed, 'event_fetch_or_parse_failed');
      logWarn('event_ingest_failed', {
        event_id: eventStub.event_id,
        event_url: eventStub.event_url,
        error: eventErr.message
      });
    }
  });

  const appendResult = appendIngestRows_(newEvents, newDecks, newCards);
  if (appendResult.success) {
    rebuildSummaries();
    setConfigValue('last_successful_run_utc', nowIsoUtc(), 'Updated by refreshRecentTop8');
  } else {
    logWarn('summary_rebuild_skipped', {
      reason: 'append_stage_failed',
      pending_events: newEvents.length,
      pending_decks: newDecks.length,
      pending_cards: newCards.length
    });
  }

  logInfo('refresh_complete', {
    events_added: appendResult.events_appended,
    decks_added: appendResult.decks_appended,
    cards_added: appendResult.cards_appended,
    event_counters: counters.events,
    deck_counters: counters.decks,
    card_counters: counters.cards,
    max_events_per_run: cfg.max_events_per_run
  });
}


function appendIngestRows_(eventsRows, deckRows, cardRows) {
  try {
    return {
      success: true,
      events_appended: appendObjects('events_raw', eventsRows),
      decks_appended: appendObjects('decks_raw', deckRows),
      cards_appended: appendObjects('cards_raw', cardRows)
    };
  } catch (err) {
    logError('append_stage_failed', {
      error: err && err.message ? err.message : String(err),
      event_rows: eventsRows.length,
      deck_rows: deckRows.length,
      card_rows: cardRows.length
    });
    return {
      success: false,
      events_appended: 0,
      decks_appended: 0,
      cards_appended: 0
    };
  }
}

function createIngestCounters_() {
  return {
    events: { imported: {}, skipped: {}, failed: {} },
    decks: { imported: {}, skipped: {}, failed: {} },
    cards: { imported: {}, skipped: {}, failed: {} }
  };
}

function incrementCounter_(bucket, reason, amount) {
  const key = normalizeText(reason) || 'unspecified';
  const delta = Number(amount) || 1;
  bucket[key] = (bucket[key] || 0) + delta;
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
