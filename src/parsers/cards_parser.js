/**
 * Pure card parsing helpers.
 * No SpreadsheetApp usage in this file.
 */

function parseDeckCards(html, deckRow) {
  // Brittle selector note: MTGTop8 deck lines are often plain text rows like `4 Card Name`.
  const lines = stripHtml(html).split(/\r?\n/);
  const rows = [];

  lines.forEach(function (line) {
    const parsed = parseCardLine(line);
    if (!parsed) return;

    rows.push({
      row_id: buildCardRowId(deckRow.deck_id, parsed.card_name, parsed.card_role),
      deck_id: deckRow.deck_id,
      event_id: deckRow.event_id,
      event_date: deckRow.event_date,
      placement: deckRow.placement,
      commander: deckRow.commander,
      archetype: deckRow.archetype,
      card_name: parsed.card_name,
      card_qty: parsed.card_qty,
      card_role: parsed.card_role,
      deck_url: deckRow.deck_url,
      source_site: SOURCE_SITE,
      ingested_at_utc: nowIsoUtc()
    });
  });

  return rows;
}

function parseCardLine(line) {
  const txt = normalizeText(line);
  if (!txt) return null;

  const qtyName = txt.match(/^(\d{1,2})\s+(.+)$/);
  if (!qtyName) return null;

  const qty = Number(qtyName[1]);
  const name = normalizeCardName(qtyName[2]);
  if (!name || !Number.isFinite(qty) || qty <= 0) return null;

  return {
    card_qty: qty,
    card_name: name,
    card_role: inferCardRole(name)
  };
}

function inferCardRole(cardName) {
  if (/\bland\b/i.test(cardName)) return 'land';
  return 'main';
}

function normalizeCardName(name) {
  return normalizeText(name).replace(/\s+\(.*\)$/, '');
}

function buildCardRowId(deckId, cardName, cardRole) {
  return [deckId, normalizeText(cardName).toLowerCase(), cardRole || 'main'].join('|');
}
