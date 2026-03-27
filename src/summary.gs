function rebuildSummaries() {
  var cards = readRawRows_('cards_raw');
  var decks = readRawRows_('decks_raw');
  var config = getDbConfig();

  var deckIndex = indexDecksById_(decks);
  var aggregates = {};
  var distinctDecks = {};
  var now = new Date();

  for (var i = 0; i < cards.length; i++) {
    var row = mapRow_(TAB_SCHEMAS.cards_raw, cards[i]);
    if (toNumber_(row.card_qty, 0) < config.minCardCopies) {
      continue;
    }

    var cardKey = normalizeSpace_(row.card_name);
    if (!cardKey) {
      continue;
    }

    if (!aggregates[cardKey]) {
      aggregates[cardKey] = {
        card_name: cardKey,
        deckSet: {},
        total_copies: 0,
        placements: [],
        first_seen_date: row.event_date || '',
        last_seen_date: row.event_date || '',
        seen_7d: 0,
        seen_28d: 0
      };
    }

    var agg = aggregates[cardKey];
    agg.deckSet[row.deck_id] = true;
    agg.total_copies += toNumber_(row.card_qty, 0);

    var deck = deckIndex[row.deck_id] || {};
    agg.placements.push(toPlacementScore_(deck.placement || row.placement));

    if (row.event_date && (!agg.first_seen_date || row.event_date < agg.first_seen_date)) {
      agg.first_seen_date = row.event_date;
    }
    if (row.event_date && (!agg.last_seen_date || row.event_date > agg.last_seen_date)) {
      agg.last_seen_date = row.event_date;
    }

    var eventDate = row.event_date ? new Date(row.event_date) : null;
    if (eventDate && !isNaN(eventDate.getTime())) {
      var diffDays = Math.floor((now.getTime() - eventDate.getTime()) / 86400000);
      if (diffDays <= 7) {
        agg.seen_7d += 1;
      }
      if (diffDays <= 28) {
        agg.seen_28d += 1;
      }
    }

    distinctDecks[row.deck_id] = true;
  }

  var deckCount = Math.max(1, Object.keys(distinctDecks).length);
  var cardSummaryRows = [];
  var emergingRows = [];
  var updatedAt = nowIso_();

  Object.keys(aggregates).sort().forEach(function (cardName) {
    var agg = aggregates[cardName];
    var decksWithCard = Object.keys(agg.deckSet).length;
    var avgCopies = decksWithCard ? agg.total_copies / decksWithCard : 0;
    var top8Share = decksWithCard / deckCount;
    var conversion = avg_(agg.placements);
    var trend7d = agg.seen_7d;
    var trend28d = agg.seen_28d;
    var daysSince = agg.last_seen_date ? Math.max(0, Math.floor((now.getTime() - new Date(agg.last_seen_date).getTime()) / 86400000)) : '';

    cardSummaryRows.push([
      cardName,
      decksWithCard,
      agg.total_copies,
      round_(avgCopies),
      round_(top8Share),
      round_(conversion),
      agg.first_seen_date,
      agg.last_seen_date,
      daysSince,
      trend7d,
      trend28d,
      updatedAt
    ]);

    if (decksWithCard < config.emergingMinDecks) {
      return;
    }

    var recencySignal = daysSince === '' ? 0 : 1 / (1 + daysSince);
    var penetrationSignal = top8Share;
    var conversionSignal = conversion / 8;
    var trendSignal = trend28d ? (trend7d / trend28d) : 0;

    var emergingScore =
      config.weightRecency * recencySignal +
      config.weightPenetration * penetrationSignal +
      config.weightConversion * conversionSignal;

    emergingRows.push({
      card_name: cardName,
      emerging_score: round_(emergingScore),
      confidence: round_(Math.min(1, decksWithCard / 8)),
      sample_decks: decksWithCard,
      trend_signal: round_(trendSignal),
      recency_signal: round_(recencySignal),
      penetration_signal: round_(penetrationSignal),
      conversion_signal: round_(conversionSignal),
      notes: trendSignal > 0.5 ? 'accelerating in recent 7d window' : ''
    });
  });

  emergingRows.sort(function (a, b) {
    return b.emerging_score - a.emerging_score;
  });

  var emergingOutput = emergingRows.map(function (row, idx) {
    return [
      idx + 1,
      row.card_name,
      row.emerging_score,
      row.confidence,
      row.sample_decks,
      row.trend_signal,
      row.recency_signal,
      row.penetration_signal,
      row.conversion_signal,
      row.notes,
      updatedAt
    ];
  });

  replaceDerivedRows_('card_summary', cardSummaryRows);
  replaceDerivedRows_('emerging_tech', emergingOutput);

  logInfo_('rebuild_summaries_complete', {
    card_summary_rows: cardSummaryRows.length,
    emerging_rows: emergingOutput.length
  });
}

function indexDecksById_(deckRows) {
  var map = {};
  for (var i = 0; i < deckRows.length; i++) {
    var row = mapRow_(TAB_SCHEMAS.decks_raw, deckRows[i]);
    map[row.deck_id] = row;
  }
  return map;
}

function mapRow_(header, values) {
  var out = {};
  for (var i = 0; i < header.length; i++) {
    out[header[i]] = values[i];
  }
  return out;
}

function toPlacementScore_(placement) {
  var p = parseInt(String(placement || '').replace(/[^0-9]/g, ''), 10);
  if (isNaN(p)) {
    return 0;
  }
  return Math.max(1, 9 - p);
}

function avg_(values) {
  if (!values || values.length === 0) {
    return 0;
  }
  var total = 0;
  for (var i = 0; i < values.length; i++) {
    total += toNumber_(values[i], 0);
  }
  return total / values.length;
}

function round_(n) {
  return Math.round(n * 10000) / 10000;
}
