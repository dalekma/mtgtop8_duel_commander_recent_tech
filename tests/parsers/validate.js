#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repoRoot = path.resolve(__dirname, '..', '..');

function loadParserRuntime() {
  const context = vm.createContext({
    console,
    Date,
    Logger: { log: function () {} }
  });

  [
    'src/config.js',
    'src/normalization.js',
    'src/parsers/events_parser.js',
    'src/parsers/decks_parser.js',
    'src/parsers/cards_parser.js'
  ].forEach(function (relativePath) {
    const filePath = path.join(repoRoot, relativePath);
    const source = fs.readFileSync(filePath, 'utf8');
    vm.runInContext(source, context, { filename: relativePath });
  });

  if (typeof context.logWarn !== 'function') {
    context.logWarn = function () {};
  }

  return context;
}

function readFixture(name) {
  return fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');
}

function validateEvents(runtime) {
  const sourcePageUrl = 'https://www.mtgtop8.com/format?f=EDH';
  const html = readFixture('format_event_list.html');
  const events = runtime.parseRecentEventRows(html, sourcePageUrl);
  const eventIds = Array.from(events, function (row) { return row.event_id; });
  const eventUrls = Array.from(events, function (row) { return row.event_url; });
  const eventDates = Array.from(events, function (row) { return row.event_date; });

  assert.equal(events.length, 2, 'Expected two recent event rows from fixture');
  assert.deepEqual(eventIds, ['9001', '9002'], 'Event ids should come from event links');
  assert.deepEqual(eventUrls, [
    'https://www.mtgtop8.com/event?e=9001&f=EDH',
    'https://www.mtgtop8.com/event?e=9002&f=EDH'
  ], 'Event urls should be absolute');
  assert.deepEqual(eventDates, ['03/21/2026', '03/14/2026'], 'Event dates should be inferred from row text');
}

function validateTop8(runtime) {
  const eventMeta = {
    event_id: '9001',
    event_url: 'https://www.mtgtop8.com/event?e=9001&f=EDH',
    event_date: '03/21/2026'
  };
  const html = readFixture('event_details_top8.html');
  const decks = runtime.parseTop8DeckRows(html, eventMeta);
  const placements = Array.from(decks, function (row) { return row.placement; });

  assert.equal(decks.length, 8, 'Top 8 parser should output exactly eight deck rows');
  assert.deepEqual(placements, ['1', '2', '3', '4', '5', '6', '7', '8'], 'Placements should cover ranks 1-8 only');
  assert.equal(decks[0].deck_id, '9001|50101', 'Deck id should combine event and mtgtop8 deck id');
  assert.equal(
    decks[0].deck_url,
    'https://www.mtgtop8.com/event?e=9001&d=50101',
    'Deck url should be absolute'
  );
}

function validateCards(runtime) {
  const deckRow = {
    deck_id: '9001|50101',
    event_id: '9001',
    event_date: '03/21/2026',
    placement: '1',
    commander: 'Rograkh, Son of Rohgahh',
    deck_color_identity: '',
    archetype: 'Rograkh // Tevesh Midrange',
    deck_url: 'https://www.mtgtop8.com/event?e=9001&d=50101'
  };

  const html = readFixture('deck_page_sections_cards.html');
  const cards = runtime.parseDeckCards(html, deckRow);

  const byName = new Map(cards.map(function (row) { return [row.card_name, row]; }));

  assert.equal(byName.get('Rograkh, Son of Rohgahh').card_qty, 1, 'Commander quantity should parse');
  assert.equal(byName.get('Rograkh, Son of Rohgahh').card_role, 'commander', 'Commander role should parse from section');

  assert.equal(byName.get('Lightning Bolt').card_qty, 2, 'Main card quantity should parse');
  assert.equal(byName.get('Lightning Bolt').card_role, 'main', 'Main role should parse from section');

  assert.equal(byName.get('Volcanic Island').card_qty, 1, 'Land quantity should parse');
  assert.equal(byName.get('Volcanic Island').card_role, 'land', 'Land role should parse from section');
}

function main() {
  const runtime = loadParserRuntime();
  validateEvents(runtime);
  validateTop8(runtime);
  validateCards(runtime);
  console.log('Parser fixture validation passed.');
}

main();
