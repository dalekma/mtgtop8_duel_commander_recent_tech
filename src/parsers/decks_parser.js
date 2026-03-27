/**
 * Pure deck parsing helpers.
 * No SpreadsheetApp usage in this file.
 */

function parseTop8DeckRows(html, eventMeta) {
  const anchors = extractAnchors(html);
  const deckRows = [];
  const seen = {};

  anchors.forEach(function (a) {
    const href = a.href || '';
    const deckMatch = href.match(/event\?e=\d+&d=(\d+)/i) || href.match(/deck\?d=(\d+)/i);
    if (!deckMatch) return;

    const deckId = deckMatch[1];
    if (seen[deckId]) return;
    seen[deckId] = true;

    const label = normalizeText(a.text || '');
    deckRows.push({
      deck_id: deckId,
      event_id: eventMeta.event_id,
      event_url: eventMeta.event_url,
      event_date: eventMeta.event_date,
      placement: inferPlacement(label),
      player: '',
      commander: '',
      archetype: label,
      deck_url: absolutizeMtgtop8Url(href),
      is_top8: true,
      source_site: SOURCE_SITE,
      ingested_at_utc: nowIsoUtc()
    });
  });

  return deckRows.slice(0, 8);
}

function inferPlacement(label) {
  const m = String(label || '').match(/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|[1-8])\b/i);
  return m ? m[1] : '';
}

function deckDedupKey(row) {
  if (row.deck_id) return 'deck:' + row.deck_id;
  return ['fallback', row.event_id, row.placement, row.player, row.commander].join('|').toLowerCase();
}
