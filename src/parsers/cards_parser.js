/**
 * Pure card parsing helpers.
 * No SpreadsheetApp usage in this file.
 */

function parseDeckCards(html, deckRow) {
  const rows = [];
  const seenRowId = {};

  try {
    const sections = extractDeckSections_(html);
    sections.forEach(function (section) {
      parseSectionCardLines_(section).forEach(function (parsed, lineIndex) {
        try {
          const rowId = buildCardRowId(deckRow.deck_id, parsed.card_name, parsed.card_role);
          if (seenRowId[rowId]) return;
          seenRowId[rowId] = true;

          rows.push({
            row_id: rowId,
            deck_id: deckRow.deck_id,
            event_id: deckRow.event_id,
            event_date: deckRow.event_date,
            placement: deckRow.placement,
            commander: deckRow.commander,
            deck_color_identity: normalizeDeckColorIdentity(deckRow.deck_color_identity, deckRow.commander, deckRow.archetype),
            archetype: deckRow.archetype,
            card_name: parsed.card_name,
            card_qty: parsed.card_qty,
            card_role: parsed.card_role,
            card_color_identity: normalizeColorIdentity(parsed.card_color_identity),
            card_mana_value: normalizeManaValue(parsed.card_mana_value),
            card_types: normalizeCardTypes(parsed.card_types),
            is_land: normalizeLandFlag(parsed.is_land, parsed.card_types, parsed.card_role, parsed.card_name),
            deck_url: deckRow.deck_url,
            source_site: SOURCE_SITE,
            ingested_at_utc: nowIsoUtc()
          });
        } catch (rowErr) {
          logWarn('card_row_build_failed', {
            event_id: deckRow && deckRow.event_id,
            deck_id: deckRow && deckRow.deck_id,
            deck_url: deckRow && deckRow.deck_url,
            section_role: section.role,
            line_index: lineIndex,
            error: rowErr && rowErr.message ? rowErr.message : String(rowErr)
          });
        }
      });
    });
  } catch (err) {
    logWarn('deck_card_parse_failed', {
      event_id: deckRow && deckRow.event_id,
      deck_id: deckRow && deckRow.deck_id,
      deck_url: deckRow && deckRow.deck_url,
      error: err && err.message ? err.message : String(err)
    });
  }

  return rows;
}

function extractDeckSections_(html) {
  const source = String(html || '');
  const sections = [];

  // Brittle selector note: section headers are inferred from presentational tags in deck pages.
  const headerRegex = /<(?:b|strong|h2|h3|h4|div|span)[^>]*>\s*(main deck|main|lands?|spells?|creatures?|artifacts?|enchantments?|planeswalkers?|commander|companions?|sideboard)\s*<\/(?:b|strong|h2|h3|h4|div|span)>/gi;
  const headers = [];
  let m;
  while ((m = headerRegex.exec(source)) !== null) {
    headers.push({
      label: normalizeText(m[1]),
      start: m.index,
      contentStart: headerRegex.lastIndex
    });
  }

  if (!headers.length) {
    sections.push({ role: 'main', html: source });
    return sections;
  }

  headers.forEach(function (header, idx) {
    const nextStart = idx + 1 < headers.length ? headers[idx + 1].start : source.length;
    const block = source.slice(header.contentStart, nextStart);
    sections.push({
      role: normalizeSectionRole_(header.label),
      html: block
    });
  });

  return sections;
}

function parseSectionCardLines_(section) {
  const entries = extractQtyCardEntriesFromHtml_(section.html);
  const parsed = [];

  entries.forEach(function (entry) {
    const line = normalizeText(entry.qty + ' ' + entry.name);
    const card = parseCardLine(line, section.role);
    if (card) {
      parsed.push(card);
    }
  });

  return parsed;
}

function extractQtyCardEntriesFromHtml_(html) {
  const source = String(html || '');
  const entries = [];

  // Brittle selector note: this regex expects qty and card link/name to appear within the same row block.
  const rowRegex = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let rowMatch;
  while ((rowMatch = rowRegex.exec(source)) !== null) {
    const rowHtml = rowMatch[1];
    const rowText = normalizeText(htmlToTextWithBreaks_(rowHtml));
    const parsed = parseCardLine(rowText);
    if (parsed) {
      entries.push({ qty: parsed.card_qty, name: parsed.card_name });
    }
  }

  if (entries.length) return entries;

  const textLines = htmlToTextWithBreaks_(source)
    .split(/\r?\n/)
    .map(function (line) { return normalizeText(line); })
    .filter(function (line) { return !!line; });

  textLines.forEach(function (line) {
    const parsed = parseCardLine(line);
    if (!parsed) return;
    entries.push({ qty: parsed.card_qty, name: parsed.card_name });
  });

  return entries;
}

function parseCardLine(line, forcedRole) {
  const txt = normalizeText(line);
  if (!txt) return null;

  // Brittle selector note: quantity/name extraction assumes leading count format (`1 Card Name`).
  const qtyName = txt.match(/^(\d{1,2})\s*[xX]?\s+(.+)$/);
  if (!qtyName) return null;

  const qty = Number(qtyName[1]);
  const name = normalizeCardName(qtyName[2]);
  if (!name || !Number.isFinite(qty) || qty <= 0) return null;

  const inferredType = inferCardTypeFromLine(txt, name, forcedRole);

  return {
    card_qty: qty,
    card_name: name,
    card_role: forcedRole || inferCardRole(name, inferredType),
    card_color_identity: inferColorIdentityFromCardName(name),
    card_mana_value: inferManaValueFromLine(txt),
    card_types: inferredType,
    is_land: /(^|\s)land(\s|$)/i.test(inferredType)
  };
}

function normalizeSectionRole_(label) {
  const txt = normalizeText(label).toLowerCase();
  if (/^land/.test(txt)) return 'land';
  if (/^commander/.test(txt)) return 'commander';
  if (/^sideboard/.test(txt)) return 'sideboard';
  return 'main';
}

function inferCardRole(cardName, cardTypes) {
  if (/(^|\s)land(\s|$)/i.test(cardTypes || '') || /\bland\b/i.test(cardName)) return 'land';
  return 'main';
}

function inferColorIdentityFromCardName() {
  return '';
}

function inferManaValueFromLine() {
  return '';
}

function inferCardTypeFromLine(line, cardName, forcedRole) {
  if (forcedRole === 'land') return 'Land';
  if (/\bland\b/i.test(line) || /\bland\b/i.test(cardName)) {
    return 'Land';
  }
  return '';
}

function normalizeCardName(name) {
  return normalizeText(name)
    // Brittle selector note: mtgtop8 appends set/code hints in parentheses; we strip them heuristically.
    .replace(/\s+\(.*\)$/, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}
