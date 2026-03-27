function normalizeSpace_(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function normalizeDateString_(value) {
  var text = normalizeSpace_(value);
  return text;
}

function makeStableId_(parts) {
  var base = parts.map(function (part) {
    return normalizeSpace_(part).toLowerCase();
  }).join('|');
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, base, Utilities.Charset.UTF_8);
  var hex = bytes.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
  return hex.substring(0, 20);
}

function buildEventId_(eventUrl, eventName, eventDate) {
  var mtgEventId = extractQueryParam_(eventUrl, 'e');
  if (mtgEventId) {
    return 'mtgtop8:event:' + mtgEventId;
  }
  return 'mtgtop8:event:' + makeStableId_([eventUrl, eventName, eventDate]);
}

function buildDeckId_(eventId, deckUrl, placement, player, commander) {
  var mtgDeckId = extractQueryParam_(deckUrl, 'd');
  if (mtgDeckId) {
    return eventId + ':deck:' + mtgDeckId;
  }
  return eventId + ':deck:' + makeStableId_([deckUrl, placement, player, commander]);
}

function buildCardRowId_(deckId, cardName, cardRole) {
  return deckId + ':card:' + makeStableId_([cardName, cardRole]);
}

function extractQueryParam_(url, key) {
  var re = new RegExp('[?&]' + key + '=([^&#]+)');
  var match = String(url || '').match(re);
  return match ? decodeURIComponent(match[1]) : '';
}

function nowIso_() {
  return new Date().toISOString();
}

function toIsoDate_(value) {
  if (!value) {
    return '';
  }
  var date = new Date(value);
  if (isNaN(date.getTime())) {
    return '';
  }
  return date.toISOString().substring(0, 10);
}

function toNumber_(value, fallback) {
  var n = Number(value);
  return isNaN(n) ? (fallback || 0) : n;
}

function escapeRegExp_(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
