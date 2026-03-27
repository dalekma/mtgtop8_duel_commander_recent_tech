/**
 * Summary/reporting layer.
 */

function rebuildSummaries() {
  const cfg = loadRuntimeConfig();
  const cards = readObjects('cards_raw');
  const decks = readObjects('decks_raw');

  const summaryRows = buildCardSummaryRows(cards, decks);
  replaceSheetData('card_summary', summaryRows);

  const emergingRows = buildEmergingTechRows(summaryRows, cfg);
  replaceSheetData('emerging_tech', emergingRows);
}


function buildCardSummaryRows(cards, decks) {
  const totalDecks = {};
  decks.forEach(function (d) {
    if (String(d.is_top8).toLowerCase() === 'true' || d.is_top8 === true) {
      totalDecks[d.deck_id] = true;
    }
  });
  const totalTop8DeckCount = Math.max(Object.keys(totalDecks).length, 1);

  const byCard = {};
  cards.forEach(function (row) {
    const name = normalizeText(row.card_name);
    if (!name) return;

    if (!byCard[name]) {
      byCard[name] = {
        card_name: name,
        card_color_identity: normalizeColorIdentity(row.card_color_identity),
        card_mana_value: normalizeManaValue(row.card_mana_value),
        card_types: normalizeCardTypes(row.card_types),
        is_land: normalizeLandFlag(row.is_land, row.card_types, row.card_role, row.card_name),
        deck_ids: {},
        decks_with_card: 0,
        total_copies: 0,
        winrate_proxy_sum: 0,
        first_seen_date: row.event_date || '',
        last_seen_date: row.event_date || ''
      };
    }

    const acc = byCard[name];
    acc.total_copies += Number(row.card_qty) || 0;
    if (!acc.deck_ids[row.deck_id]) {
      acc.deck_ids[row.deck_id] = true;
      acc.decks_with_card += 1;
      acc.winrate_proxy_sum += placementToScore(row.placement);
    }

    if (row.event_date && (!acc.first_seen_date || row.event_date < acc.first_seen_date)) acc.first_seen_date = row.event_date;
    if (row.event_date && (!acc.last_seen_date || row.event_date > acc.last_seen_date)) acc.last_seen_date = row.event_date;
  });

  return Object.keys(byCard).sort().map(function (name) {
    const c = byCard[name];
    const avgCopies = c.decks_with_card ? c.total_copies / c.decks_with_card : 0;
    const top8Share = c.decks_with_card / totalTop8DeckCount;
    const winrate = c.decks_with_card ? c.winrate_proxy_sum / c.decks_with_card : 0;
    const daysSinceLast = daysBetween(c.last_seen_date, nowIsoUtc().slice(0, 10));

    return {
      card_name: c.card_name,
      card_color_identity: c.card_color_identity,
      card_mana_value: c.card_mana_value,
      card_types: c.card_types,
      is_land: c.is_land,
      decks_with_card: c.decks_with_card,
      total_copies: c.total_copies,
      avg_copies_per_deck: round4(avgCopies),
      top8_share: round4(top8Share),
      winrate_proxy: round4(winrate),
      first_seen_date: c.first_seen_date,
      last_seen_date: c.last_seen_date,
      days_since_last_seen: Number.isFinite(daysSinceLast) ? daysSinceLast : '',
      trend_7d: '',
      trend_28d: '',
      updated_at_utc: nowIsoUtc()
    };
  });
}

function buildEmergingTechRows(cardSummaryRows, cfg) {
  const filtered = cardSummaryRows.filter(function (row) {
    return Number(row.decks_with_card) >= cfg.emerging_min_decks;
  });

  const scored = filtered.map(function (row) {
    const recencySignal = 1 / (1 + Number(row.days_since_last_seen || 999));
    const penetrationSignal = Number(row.top8_share) || 0;
    const conversionSignal = Number(row.winrate_proxy) || 0;
    const trendSignal = Number(row.trend_7d) || 0;

    const score =
      cfg.weight_recency * recencySignal +
      cfg.weight_penetration * penetrationSignal +
      cfg.weight_conversion * conversionSignal;

    return {
      card_name: row.card_name,
      card_color_identity: normalizeColorIdentity(row.card_color_identity),
      card_mana_value: normalizeManaValue(row.card_mana_value),
      card_types: normalizeCardTypes(row.card_types),
      is_land: normalizeLandFlag(row.is_land, row.card_types),
      emerging_score: round4(score),
      confidence: confidenceFromSamples(Number(row.decks_with_card)),
      sample_decks: Number(row.decks_with_card),
      trend_signal: round4(trendSignal),
      recency_signal: round4(recencySignal),
      penetration_signal: round4(penetrationSignal),
      conversion_signal: round4(conversionSignal),
      notes: '',
      updated_at_utc: nowIsoUtc()
    };
  });

  scored.sort(function (a, b) { return b.emerging_score - a.emerging_score; });

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
      trend_signal: row.trend_signal,
      recency_signal: row.recency_signal,
      penetration_signal: row.penetration_signal,
      conversion_signal: row.conversion_signal,
      notes: row.notes,
      updated_at_utc: row.updated_at_utc
    };
  });
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
