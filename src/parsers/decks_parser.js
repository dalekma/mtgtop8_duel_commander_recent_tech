/**
 * Pure deck parsing helpers.
 * No SpreadsheetApp usage in this file.
 */

function parseTop8DeckRows(html, eventMeta) {
  const rows = [];
  const seen = {};

  extractTableRows(html).forEach(function (rowHtml, rowIndex) {
    if (rows.length >= 8) return;

    try {
      const parsed = parseTop8DeckRow_(rowHtml, eventMeta, rowIndex);
      if (!parsed || !parsed.deck_id || seen[parsed.deck_id]) return;
      seen[parsed.deck_id] = true;
      rows.push(parsed);
    } catch (err) {
      logWarn('top8_row_parse_failed', {
        event_id: eventMeta && eventMeta.event_id,
        event_url: eventMeta && eventMeta.event_url,
        row_index: rowIndex,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  return rows;
}

function parseTop8DeckRow_(rowHtml, eventMeta, rowIndex) {
  const rowText = normalizeText(htmlToTextWithBreaks_(rowHtml));
  const rank = inferPlacement(rowText);
  if (!rank || Number(rank) < 1 || Number(rank) > 8) return null;

  // Brittle selector note: MTGTop8 deck links encode deck id as `&d=<id>` or `deck?d=<id>`.
  const deckAnchor = firstAnchorMatch_(rowHtml, /(?:[?&]d=\d+)/i);
  if (!deckAnchor) return null;

  const deckMatch = (deckAnchor.href || '').match(/[?&]d=(\d+)/i);
  if (!deckMatch) return null;
  const deckId = buildDeckId(eventMeta.event_id, deckMatch[1]);
  if (!deckId) return null;

  const cells = extractTableCells_(rowHtml).map(function (cellHtml) {
    return normalizeText(htmlToTextWithBreaks_(cellHtml));
  });

  const commander = inferCommander_(cells, deckAnchor.text || '', rowText);
  const player = inferPlayer_(cells, commander);
  const archetype = normalizeText(deckAnchor.text || commander || rowText);
  const inferredShell = inferShellFromCommander_(commander, archetype);

  return {
    deck_id: deckId,
    event_id: eventMeta.event_id,
    event_url: eventMeta.event_url,
    event_date: eventMeta.event_date,
    placement: rank,
    player: player,
    commander: commander,
    deck_color_identity: normalizeDeckColorIdentity('', commander, archetype),
    inferred_shell: inferredShell,
    archetype: archetype,
    deck_url: absolutizeMtgtop8Url(deckAnchor.href),
    is_top8: true,
    source_site: SOURCE_SITE,
    ingested_at_utc: nowIsoUtc(),
    parse_row_index: rowIndex
  };
}

function inferPlacement(label) {
  // Brittle selector note: rank is inferred from human-readable text (`1st`, `#1`, etc.).
  const m = String(label || '').match(/(?:^|\s|#)([1-8])(?:st|nd|rd|th)?(?:\s|$)/i);
  return m ? String(Number(m[1])) : '';
}

function inferCommander_(cells, anchorText, rowText) {
  const anchor = normalizeText(anchorText);
  if (anchor && !/\b(1st|2nd|3rd|4th|5th|6th|7th|8th|top\s*8|deck|list)\b/i.test(anchor)) {
    return anchor;
  }

  for (var i = 0; i < cells.length; i += 1) {
    const cell = cells[i];
    if (!cell) continue;

    // Brittle selector note: commander labels are inferred from translated keywords.
    const cmdMatch = cell.match(/(?:commander|general|commandant)\s*[:\-]?\s*(.+)$/i);
    if (cmdMatch && normalizeText(cmdMatch[1])) {
      return normalizeText(cmdMatch[1]);
    }
  }

  const rowCommander = rowText.match(/(?:commander|general|commandant)\s*[:\-]?\s*(.+)$/i);
  return rowCommander ? normalizeText(rowCommander[1]) : '';
}

function inferPlayer_(cells, commander) {
  for (var i = 0; i < cells.length; i += 1) {
    const candidate = normalizeText(cells[i]);
    if (!candidate) continue;
    if (/^(?:[1-8](?:st|nd|rd|th)?|top\s*8)$/i.test(candidate)) continue;
    if (commander && candidate === commander) continue;
    if (/\b(?:players?|deck|duel|commander|event|result)\b/i.test(candidate)) continue;

    // Brittle selector note: player detection relies on free-text name-shape heuristics.
    if (/^[\p{L}][\p{L}'\-.\s]{1,40}$/u.test(candidate)) {
      return candidate;
    }
  }
  return '';
}

function inferShellFromCommander_(commander, archetype) {
  const text = normalizeText(commander || archetype).toLowerCase();
  if (!text) return '';

  // Brittle selector note: these shell mappings are heuristic and based on commander naming conventions.
  if (/\b(stax|hatebears?)\b/.test(text)) return 'stax';
  if (/\b(control|tempo)\b/.test(text)) return 'control';
  if (/\b(midrange|value)\b/.test(text)) return 'midrange';
  if (/\b(combo|storm|reanimator)\b/.test(text)) return 'combo';
  if (/\b(aggro|burn|zoo)\b/.test(text)) return 'aggro';

  return '';
}

function extractTableCells_(rowHtml) {
  // Brittle selector note: relies on `<td>` cell boundaries remaining stable.
  const re = /<td\b[^>]*>([\s\S]*?)<\/td>/gi;
  const cells = [];
  let m;
  while ((m = re.exec(String(rowHtml || ''))) !== null) {
    cells.push(m[1]);
  }
  return cells;
}

function deckDedupKey(row) {
  if (row.deck_id) return 'deck:' + row.deck_id;
  return ['fallback', row.event_id, row.placement, row.player, row.commander].join('|').toLowerCase();
}
