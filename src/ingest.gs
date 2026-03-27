function refreshRecentTop8() {
  initializeSheets();
  var config = getDbConfig();
  if (!config.enabled) {
    logInfo_('refresh_skipped', { reason: 'config disabled' });
    return;
  }

  var ingestedAt = nowIso_();
  var existingEventIds = getExistingKeys_('events_raw', 'event_id');

  var events = fetchRecentDuelCommanderEvents_(3);
  var selectedEvents = events.slice(0, 3);

  var eventsRows = [];
  var decksRows = [];
  var cardsRows = [];
  var failures = [];
  var processed = 0;

  for (var i = 0; i < selectedEvents.length; i++) {
    var event = selectedEvents[i];
    var eventId = buildEventId_(event.event_url, event.event_name, event.event_date);

    if (existingEventIds[eventId]) {
      logInfo_('event_skipped_existing', { event_id: eventId, event_url: event.event_url });
      continue;
    }

    try {
      var decks = parseEventTop8Decks_(event.event_url);

      var normalizedEventDate = toIsoDate_(event.event_date);
      eventsRows.push([
        eventId,
        event.event_url,
        event.event_name,
        event.format,
        event.location,
        event.event_date,
        normalizedEventDate,
        event.source_site,
        event.source_page,
        ingestedAt
      ]);

      for (var d = 0; d < decks.length; d++) {
        var deck = decks[d];
        var deckId = buildDeckId_(eventId, deck.deck_url, deck.placement, deck.player, deck.commander);

        decksRows.push([
          deckId,
          eventId,
          event.event_url,
          normalizedEventDate,
          deck.placement,
          deck.player,
          deck.commander,
          deck.archetype,
          deck.deck_url,
          true,
          'mtgtop8',
          ingestedAt
        ]);

        var cards = parseDeckCards_(deck.deck_url);
        for (var c = 0; c < cards.length; c++) {
          var card = cards[c];
          cardsRows.push([
            buildCardRowId_(deckId, card.card_name, card.card_role),
            deckId,
            eventId,
            normalizedEventDate,
            deck.placement,
            deck.commander,
            deck.archetype,
            card.card_name,
            card.card_qty,
            card.card_role,
            deck.deck_url,
            'mtgtop8',
            ingestedAt
          ]);
        }
      }

      processed += 1;
      logInfo_('event_processed', { event_id: eventId, decks: decks.length, event_url: event.event_url });
    } catch (error) {
      failures.push({
        event_url: event.event_url,
        event_name: event.event_name,
        reason: String(error)
      });
      logError_('event_failed_continue', {
        event_url: event.event_url,
        event_name: event.event_name,
        reason: String(error)
      });
    }
  }

  appendRows_('events_raw', eventsRows);
  appendRows_('decks_raw', decksRows);
  appendRows_('cards_raw', cardsRows);

  rebuildSummaries();
  upsertConfigValue_('last_successful_run_utc', ingestedAt, 'updated by refreshRecentTop8');

  logInfo_('refresh_complete', {
    selected_events: selectedEvents.length,
    processed_events: processed,
    failed_events: failures.length,
    events_appended: eventsRows.length,
    decks_appended: decksRows.length,
    cards_appended: cardsRows.length,
    failures: JSON.stringify(failures)
  });
}

function logInfo_(message, context) {
  Logger.log(JSON.stringify({ level: 'INFO', message: message, context: context || {}, ts: nowIso_() }));
}

function logError_(message, context) {
  Logger.log(JSON.stringify({ level: 'ERROR', message: message, context: context || {}, ts: nowIso_() }));
}
