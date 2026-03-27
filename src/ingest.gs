/**
 * Incremental append for parser outputs with deterministic IDs.
 *
 * Expected payload shape:
 * {
 *   events: [{ event_url, event_name, ... }],
 *   decks: [{ deck_url, event_url, placement, ... }],
 *   cards: [{ deck_url, section, card_name, qty, ... }]
 * }
 *
 * @param {{events:Object[], decks:Object[], cards:Object[]}} parsed
 * @return {{events:Object, decks:Object, cards:Object}}
 */
function appendParsedBatchIncremental_(parsed) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = {
    events: ss.getSheetByName('events_raw'),
    decks: ss.getSheetByName('decks_raw'),
    cards: ss.getSheetByName('cards_raw')
  };

  if (!tabs.events || !tabs.decks || !tabs.cards) {
    throw new Error('Missing one or more raw tabs: events_raw, decks_raw, cards_raw');
  }

  var nowUtc = new Date().toISOString();
  var stats = {
    events: { fetched: 0, new_count: 0, skipped_duplicate: 0, failed: 0 },
    decks: { fetched: 0, new_count: 0, skipped_duplicate: 0, failed: 0 },
    cards: { fetched: 0, new_count: 0, skipped_duplicate: 0, failed: 0 }
  };

  var existing = loadExistingRawIds_(tabs);
  var eventIdByUrl = {};
  var deckIdByUrl = {};

  var eventRows = [];
  var events = parsed.events || [];
  stats.events.fetched = events.length;
  events.forEach(function (event) {
    try {
      var eventId = buildEventId(event.event_url, event.event_id_token);
      eventIdByUrl[event.event_url] = eventId;

      if (existing.eventIds[eventId]) {
        stats.events.skipped_duplicate++;
        return;
      }

      existing.eventIds[eventId] = true;
      stats.events.new_count++;
      eventRows.push([
        eventId,
        event.event_url || '',
        event.event_name || '',
        event.format || '',
        event.location || '',
        event.event_date || '',
        event.event_date_utc || '',
        event.source_site || 'mtgtop8',
        event.source_page || '',
        nowUtc
      ]);
    } catch (error) {
      stats.events.failed++;
      console.error('[events_raw] failed row', {
        event_url: event.event_url,
        reason: error.message
      });
    }
  });

  var deckRows = [];
  var decks = parsed.decks || [];
  stats.decks.fetched = decks.length;
  decks.forEach(function (deck) {
    try {
      var eventId = deck.event_id || eventIdByUrl[deck.event_url] || buildEventId(deck.event_url, deck.event_id_token);
      var deckId = buildDeckId(deck.deck_url, deck.deck_id_token);
      deckIdByUrl[deck.deck_url] = deckId;

      if (existing.deckIds[deckId]) {
        stats.decks.skipped_duplicate++;
        return;
      }

      existing.deckIds[deckId] = true;
      stats.decks.new_count++;
      deckRows.push([
        deckId,
        eventId,
        deck.event_url || '',
        deck.event_date || '',
        deck.placement || '',
        deck.player || '',
        deck.commander || '',
        deck.archetype || '',
        deck.deck_url || '',
        String(deck.is_top8 !== false),
        deck.source_site || 'mtgtop8',
        nowUtc
      ]);
    } catch (error) {
      stats.decks.failed++;
      console.error('[decks_raw] failed row', {
        deck_url: deck.deck_url,
        reason: error.message
      });
    }
  });

  var cardRows = [];
  var cards = parsed.cards || [];
  stats.cards.fetched = cards.length;
  cards.forEach(function (card) {
    try {
      var eventId = card.event_id || eventIdByUrl[card.event_url] || buildEventId(card.event_url, card.event_id_token);
      var deckId = card.deck_id || deckIdByUrl[card.deck_url] || buildDeckId(card.deck_url, card.deck_id_token);
      var normalizedCard = {
        deck_id: deckId,
        card_role: card.section || card.card_role || 'maindeck',
        card_name: card.card_name,
        card_qty: card.qty || card.card_qty
      };
      var rowId = buildRowId(normalizedCard);

      if (existing.rowIds[rowId]) {
        stats.cards.skipped_duplicate++;
        return;
      }

      existing.rowIds[rowId] = true;
      stats.cards.new_count++;
      cardRows.push([
        rowId,
        deckId,
        eventId,
        card.event_date || '',
        card.placement || '',
        card.commander || '',
        card.archetype || '',
        card.card_name || '',
        Number(card.qty || card.card_qty || 0),
        card.section || card.card_role || 'maindeck',
        card.deck_url || '',
        card.source_site || 'mtgtop8',
        nowUtc
      ]);
    } catch (error) {
      stats.cards.failed++;
      console.error('[cards_raw] failed row', {
        deck_url: card.deck_url,
        card_name: card.card_name,
        reason: error.message
      });
    }
  });

  appendRows_(tabs.events, eventRows);
  appendRows_(tabs.decks, deckRows);
  appendRows_(tabs.cards, cardRows);

  console.info('Ingest counts', stats);
  return stats;
}

/**
 * Loads existing deterministic IDs into lookup maps.
 *
 * @param {{events:GoogleAppsScript.Spreadsheet.Sheet,decks:GoogleAppsScript.Spreadsheet.Sheet,cards:GoogleAppsScript.Spreadsheet.Sheet}} tabs
 * @return {{eventIds:Object<string,boolean>, deckIds:Object<string,boolean>, rowIds:Object<string,boolean>}}
 */
function loadExistingRawIds_(tabs) {
  return {
    eventIds: loadIdColumnAsMap_(tabs.events, 'event_id'),
    deckIds: loadIdColumnAsMap_(tabs.decks, 'deck_id'),
    rowIds: loadIdColumnAsMap_(tabs.cards, 'row_id')
  };
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {string} headerName
 * @return {Object<string,boolean>}
 */
function loadIdColumnAsMap_(sheet, headerName) {
  var idSet = {};
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var idx = header.indexOf(headerName);
  if (idx < 0 || sheet.getLastRow() < 2) {
    return idSet;
  }

  var values = sheet.getRange(2, idx + 1, sheet.getLastRow() - 1, 1).getValues();
  values.forEach(function (row) {
    var id = row[0];
    if (id) {
      idSet[String(id)] = true;
    }
  });
  return idSet;
}

/**
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet
 * @param {Array<Array<*>>} rows
 */
function appendRows_(sheet, rows) {
  if (!rows.length) {
    return;
  }
  var start = sheet.getLastRow() + 1;
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}
