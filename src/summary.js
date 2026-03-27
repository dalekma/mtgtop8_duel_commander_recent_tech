/**
 * Summary/reporting layer.
 */

function rebuildSummaries() {
  const cfg = loadRuntimeConfig();
  const cards = readObjects('cards_raw');
  const decks = readObjects('decks_raw');
  const events = readObjects('events_raw');

  const summaryRows = buildCardSummaryRows(cards, decks, events, cfg);
  replaceSheetData('card_summary', summaryRows);

  const emergingRows = buildEmergingTechRows(summaryRows, cfg);
  replaceSheetData('emerging_tech', emergingRows);
}

function buildCardSummaryRows(cards, decks, events, cfg) {
  const deckContextById = buildDeckContextById_(decks);
  const totalTop8DeckCount = Math.max(countDistinctByField_(decks, 'deck_id', isTop8Deck_), 1);
  const totalEventCount = Math.max(countDistinctByField_(events, 'event_id'), 1);

  const byCard = {};
  cards.forEach(function (row) {
    const cardName = normalizeText(row.card_name);
    if (!cardName) return;

    if (!byCard[cardName]) {
      byCard[cardName] = createCardAccumulator_(cardName, row);
    }

    const acc = byCard[cardName];
    const context = deckContextById[normalizeText(row.deck_id)] || {};
    const deckId = normalizeText(row.deck_id || context.deck_id);
    const eventId = normalizeText(row.event_id || context.event_id);
    const commander = normalizeText(row.commander || context.commander);
    const deckColor = normalizeColorIdentity(row.deck_color_identity || context.deck_color_identity);
    const cardColor = normalizeColorIdentity(row.card_color_identity || acc.card_color_identity);
    const eventDate = normalizeText(row.event_date || context.event_date);

    acc.total_appearances += 1;
    acc.total_copies += Number(row.card_qty) || 0;

    if (deckId && !acc.deck_ids[deckId]) {
      acc.deck_ids[deckId] = true;
      acc.winrate_proxy_sum += placementToScore(row.placement || context.placement);
    }
    if (eventId) acc.event_ids[eventId] = true;
    if (commander) acc.commanders[commander] = true;
    if (deckColor) acc.deck_colors_seen[deckColor] = true;
    if (cardColor) acc.card_colors_seen[cardColor] = true;

    if (eventDate && (!acc.first_seen_date || eventDate < acc.first_seen_date)) acc.first_seen_date = eventDate;
    if (eventDate && (!acc.last_seen_date || eventDate > acc.last_seen_date)) acc.last_seen_date = eventDate;
  });

  return Object.keys(byCard).sort().map(function (cardName) {
    const acc = byCard[cardName];
    const distinctDecks = Object.keys(acc.deck_ids).length;
    const distinctEvents = Object.keys(acc.event_ids).length;
    const distinctCommanders = Object.keys(acc.commanders).length;
    const deckColorsSeen = Object.keys(acc.deck_colors_seen).sort();
    const cardColorsSeen = Object.keys(acc.card_colors_seen).sort();

    const avgCopies = distinctDecks ? acc.total_copies / distinctDecks : 0;
    const top8Share = distinctDecks / totalTop8DeckCount;
    const winrate = distinctDecks ? acc.winrate_proxy_sum / distinctDecks : 0;
    const daysSinceLast = daysBetween(acc.last_seen_date, nowIsoUtc().slice(0, 10));

    const multiDeckSignal = clamp01(top8Share);
    const crossEventSignal = clamp01(distinctEvents / totalEventCount);
    const shellDiversitySignal = computeShellDiversitySignal_(distinctDecks, distinctCommanders, deckColorsSeen.length);
    const recencySignal = recencyFactor_(daysSinceLast, cfg.recency_window_days);

    const signalScore =
      cfg.weight_multi_deck_presence * multiDeckSignal +
      cfg.weight_cross_event_spread * crossEventSignal +
      cfg.weight_shell_diversity * shellDiversitySignal +
      cfg.weight_recency_factor * recencySignal;

    return {
      card_name: acc.card_name,
      card_color_identity: acc.card_color_identity,
      card_mana_value: acc.card_mana_value,
      card_types: acc.card_types,
      is_land: acc.is_land,
      total_appearances: acc.total_appearances,
      total_copies: acc.total_copies,
      distinct_decks: distinctDecks,
      distinct_events: distinctEvents,
      distinct_commanders: distinctCommanders,
      deck_colors_seen: deckColorsSeen.join(','),
      card_colors_seen: cardColorsSeen.join(','),
      avg_copies_per_deck: round4(avgCopies),
      top8_share: round4(top8Share),
      winrate_proxy: round4(winrate),
      first_seen_date: acc.first_seen_date,
      last_seen_date: acc.last_seen_date,
      days_since_last_seen: Number.isFinite(daysSinceLast) ? daysSinceLast : '',
      multi_deck_presence_signal: round4(multiDeckSignal),
      cross_event_spread_signal: round4(crossEventSignal),
      shell_diversity_signal: round4(shellDiversitySignal),
      recency_factor_signal: round4(recencySignal),
      signal_score: round4(signalScore),
      notes: buildSummaryNotes_(distinctEvents, distinctCommanders, deckColorsSeen.length),
      trend_7d: '',
      trend_28d: '',
      updated_at_utc: nowIsoUtc()
    };
  });
}

function buildEmergingTechRows(cardSummaryRows, cfg) {
  const filtered = cardSummaryRows.filter(function (row) {
    return Number(row.distinct_decks) >= cfg.emerging_min_decks;
  });

  const scored = filtered.map(function (row) {
    const multiDeckSignal = Number(row.multi_deck_presence_signal) || 0;
    const crossEventSignal = Number(row.cross_event_spread_signal) || 0;
    const shellDiversitySignal = Number(row.shell_diversity_signal) || 0;
    const recencySignal = Number(row.recency_factor_signal) || 0;

    const score =
      cfg.weight_multi_deck_presence * multiDeckSignal +
      cfg.weight_cross_event_spread * crossEventSignal +
      cfg.weight_shell_diversity * shellDiversitySignal +
      cfg.weight_recency_factor * recencySignal;

    return {
      card_name: row.card_name,
      card_color_identity: normalizeColorIdentity(row.card_color_identity),
      card_mana_value: normalizeManaValue(row.card_mana_value),
      card_types: normalizeCardTypes(row.card_types),
      is_land: normalizeLandFlag(row.is_land, row.card_types),
      emerging_score: round4(score),
      confidence: confidenceFromSamples(Number(row.distinct_decks)),
      sample_decks: Number(row.distinct_decks),
      sample_events: Number(row.distinct_events),
      sample_commanders: Number(row.distinct_commanders),
      multi_deck_presence_signal: round4(multiDeckSignal),
      cross_event_spread_signal: round4(crossEventSignal),
      shell_diversity_signal: round4(shellDiversitySignal),
      recency_factor_signal: round4(recencySignal),
      why_interesting: buildWhyInteresting_(
        multiDeckSignal,
        crossEventSignal,
        shellDiversitySignal,
        recencySignal,
        cfg
      ),
      notes: row.notes || '',
      updated_at_utc: nowIsoUtc()
    };
  });

  scored.sort(function (a, b) {
    if (b.emerging_score !== a.emerging_score) return b.emerging_score - a.emerging_score;
    return a.card_name.localeCompare(b.card_name);
  });

  return scored.map(function (row, idx) {
    return {
      rank: idx + 1,
      card_name: row.card_name,
      card_color_identity: row.card_color_identity,
      card_mana_value: row.card_mana_value,
      card_types: row.card_types,
      is_land: row.is_land,
      emerging_score: row.emerging_score,
      confidence: row.confidence,
      sample_decks: row.sample_decks,
      sample_events: row.sample_events,
      sample_commanders: row.sample_commanders,
      multi_deck_presence_signal: row.multi_deck_presence_signal,
      cross_event_spread_signal: row.cross_event_spread_signal,
      shell_diversity_signal: row.shell_diversity_signal,
      recency_factor_signal: row.recency_factor_signal,
      why_interesting: row.why_interesting,
      notes: row.notes,
      updated_at_utc: row.updated_at_utc
    };
  });
}

function buildDeckContextById_(decks) {
  const byId = {};
  decks.forEach(function (deck) {
    const deckId = normalizeText(deck.deck_id);
    if (!deckId || byId[deckId]) return;
    byId[deckId] = {
      deck_id: deckId,
      event_id: normalizeText(deck.event_id),
      event_date: normalizeText(deck.event_date),
      commander: normalizeText(deck.commander),
      deck_color_identity: normalizeColorIdentity(deck.deck_color_identity),
      placement: normalizeText(deck.placement),
      is_top8: deck.is_top8
    };
  });
  return byId;
}

function createCardAccumulator_(cardName, row) {
  return {
    card_name: cardName,
    card_color_identity: normalizeColorIdentity(row.card_color_identity),
    card_mana_value: normalizeManaValue(row.card_mana_value),
    card_types: normalizeCardTypes(row.card_types),
    is_land: normalizeLandFlag(row.is_land, row.card_types, row.card_role, row.card_name),
    deck_ids: {},
    event_ids: {},
    commanders: {},
    deck_colors_seen: {},
    card_colors_seen: {},
    total_appearances: 0,
    total_copies: 0,
    winrate_proxy_sum: 0,
    first_seen_date: normalizeText(row.event_date) || '',
    last_seen_date: normalizeText(row.event_date) || ''
  };
}

function countDistinctByField_(rows, fieldName, predicate) {
  const seen = {};
  rows.forEach(function (row) {
    if (predicate && !predicate(row)) return;
    const value = normalizeText(row[fieldName]);
    if (value) seen[value] = true;
  });
  return Object.keys(seen).length;
}

function isTop8Deck_(deckRow) {
  return String(deckRow && deckRow.is_top8).toLowerCase() === 'true' || deckRow.is_top8 === true;
}

function computeShellDiversitySignal_(distinctDecks, distinctCommanders, distinctDeckColors) {
  const deckDenominator = Math.max(distinctDecks, 1);
  const commanderSpread = clamp01(distinctCommanders / deckDenominator);
  const colorSpread = clamp01(distinctDeckColors / 5);
  return round4((commanderSpread + colorSpread) / 2);
}

function recencyFactor_(daysSinceLastSeen, recencyWindowDays) {
  const days = Number(daysSinceLastSeen);
  if (!Number.isFinite(days) || days < 0) return 0;
  const window = Math.max(Number(recencyWindowDays) || 30, 1);
  return clamp01(1 / (1 + days / window));
}

function buildSummaryNotes_(distinctEvents, distinctCommanders, distinctDeckColors) {
  return [
    'events:' + distinctEvents,
    'commanders:' + distinctCommanders,
    'deck_colors:' + distinctDeckColors
  ].join(' | ');
}

function buildWhyInteresting_(multiDeckSignal, crossEventSignal, shellDiversitySignal, recencySignal, cfg) {
  const contributions = [
    {
      key: 'multi_deck_presence',
      weighted: cfg.weight_multi_deck_presence * multiDeckSignal,
      message: describeSignal_('multi-deck presence', multiDeckSignal)
    },
    {
      key: 'cross_event_spread',
      weighted: cfg.weight_cross_event_spread * crossEventSignal,
      message: describeSignal_('cross-event spread', crossEventSignal)
    },
    {
      key: 'shell_diversity',
      weighted: cfg.weight_shell_diversity * shellDiversitySignal,
      message: describeSignal_('commander/shell diversity', shellDiversitySignal)
    },
    {
      key: 'recency_factor',
      weighted: cfg.weight_recency_factor * recencySignal,
      message: describeSignal_('recency', recencySignal)
    }
  ];

  contributions.sort(function (a, b) {
    if (b.weighted !== a.weighted) return b.weighted - a.weighted;
    return a.key.localeCompare(b.key);
  });

  const top = contributions.filter(function (item) { return item.weighted > 0; }).slice(0, 2);
  if (!top.length) return 'Low signal confidence';
  return top.map(function (item) { return item.message; }).join('; ');
}

function describeSignal_(label, rawSignal) {
  if (rawSignal >= 0.67) return 'high ' + label;
  if (rawSignal >= 0.34) return 'moderate ' + label;
  return 'low ' + label;
}

function clamp01(n) {
  const value = Number(n);
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function confidenceFromSamples(n) {
  if (n >= 12) return 'high';
  if (n >= 6) return 'medium';
  return 'low';
}

function placementToScore(placement) {
  const value = String(placement || '').toLowerCase();
  if (value === '1st' || value === '1') return 1;
  if (value === '2nd' || value === '2') return 0.75;
  if (value === '3rd' || value === '4th' || value === '3' || value === '4') return 0.5;
  if (/^[5-8](th)?$/.test(value)) return 0.25;
  return 0;
}

function daysBetween(dateA, dateB) {
  const a = new Date(dateA);
  const b = new Date(dateB);
  if (!a.getTime() || !b.getTime()) return NaN;
  return Math.floor((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function round4(n) {
  return Math.round((Number(n) || 0) * 10000) / 10000;
}
