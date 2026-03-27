/**
 * Normalization helpers.
 */

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

function normalizeIdPart(value) {
  return normalizeText(value);
}

function buildEventIdFromUrl(eventUrl, fallbackEventId) {
  const fromArg = String(eventUrl || '').match(/[?&]e=(\d+)/i);
  if (fromArg && fromArg[1]) return normalizeIdPart(fromArg[1]);
  return normalizeIdPart(fallbackEventId || '');
}

function buildDeckId(eventId, mtgtop8DeckId) {
  const normalizedEventId = normalizeIdPart(eventId);
  const normalizedDeckId = normalizeIdPart(mtgtop8DeckId);
  if (!normalizedEventId || !normalizedDeckId) return '';
  return normalizedEventId + '|' + normalizedDeckId;
}

function buildCardRowId(deckId, cardName, section) {
  const normalizedDeckId = normalizeIdPart(deckId);
  const normalizedCardName = normalizeText(cardName).toLowerCase();
  const normalizedSection = normalizeText(section || 'main').toLowerCase();
  return [normalizedDeckId, normalizedCardName, normalizedSection].join('|');
}

function normalizeColorIdentity(raw) {
  const upper = String(raw || '').toUpperCase();
  const symbols = {};

  COLOR_ORDER.forEach(function (c) {
    if (upper.indexOf(c) !== -1 || upper.indexOf('{' + c + '}') !== -1) {
      symbols[c] = true;
    }
  });

  return COLOR_ORDER.filter(function (c) { return symbols[c]; }).join('');
}

function normalizeManaValue(raw) {
  if (raw === '' || raw === null || raw === undefined) return '';
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return '';
  return Math.floor(n);
}

function normalizeCardTypes(raw) {
  return normalizeText(raw)
    .replace(/[—–-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeLandFlag(rawValue, cardTypes, cardRole, cardName) {
  if (typeof rawValue === 'boolean') return rawValue;

  const txt = normalizeText(String(rawValue || ''));
  if (/^(true|1|yes)$/i.test(txt)) return true;
  if (/^(false|0|no)$/i.test(txt)) return false;

  const typeText = normalizeText(cardTypes).toLowerCase();
  if (/(^|\s)land(\s|$)/.test(typeText)) return true;

  if (String(cardRole || '').toLowerCase() === 'land') return true;
  if (/\bland\b/i.test(String(cardName || ''))) return true;

  return false;
}

function normalizeDeckColorIdentity(rawDeckColorIdentity, commander, archetype) {
  return normalizeColorIdentity(rawDeckColorIdentity || commander || archetype || '');
}
