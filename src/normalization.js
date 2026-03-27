/**
 * Normalization helpers.
 */

const COLOR_ORDER = ['W', 'U', 'B', 'R', 'G'];

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
