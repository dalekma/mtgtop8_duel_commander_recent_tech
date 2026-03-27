/**
 * Deterministic key utilities for MTGTop8 ingest.
 */

/**
 * Produces a stable event identifier using a source token when available,
 * with canonical URL hash fallback.
 *
 * @param {string} eventUrl
 * @param {string=} explicitToken
 * @return {string}
 */
function buildEventId(eventUrl, explicitToken) {
  var token = (explicitToken || '') || extractUrlToken_(eventUrl, [
    'event',
    'event_id',
    'evt',
    'e',
    'id'
  ]);
  if (token) {
    return 'evt_' + normalizeToken_(token);
  }
  return 'evt_h_' + sha256Hex_(canonicalizeUrl_(eventUrl));
}

/**
 * Produces a stable deck identifier from URL token.
 *
 * @param {string} deckUrl
 * @param {string=} explicitToken
 * @return {string}
 */
function buildDeckId(deckUrl, explicitToken) {
  var token = (explicitToken || '') || extractUrlToken_(deckUrl, [
    'deck',
    'deck_id',
    'did',
    'd',
    'id'
  ]);
  if (token) {
    return 'dek_' + normalizeToken_(token);
  }
  return 'dek_h_' + sha256Hex_(canonicalizeUrl_(deckUrl));
}

/**
 * Canonical fingerprint for a cards_raw row.
 *
 * @param {{deck_id:string, card_role:string, card_name:string, card_qty:(number|string)}} row
 * @return {string}
 */
function buildRowId(row) {
  var normalizedDeckId = normalizeToken_(row.deck_id);
  var normalizedRole = normalizeToken_(row.card_role || 'maindeck');
  var normalizedCard = normalizeToken_(row.card_name);
  var normalizedQty = String(parseInt(row.card_qty, 10) || 0);
  var fingerprint = [
    normalizedDeckId,
    normalizedRole,
    normalizedCard,
    normalizedQty
  ].join('|');
  return 'row_' + sha256Hex_(fingerprint);
}

/**
 * Attempts to extract a URL identifier token from query parameters first,
 * then from the final path segment.
 *
 * @param {string} url
 * @param {string[]} preferredParams
 * @return {string}
 */
function extractUrlToken_(url, preferredParams) {
  var parsed = parseUrl_(url);
  if (!parsed) {
    return '';
  }

  var i;
  for (i = 0; i < preferredParams.length; i++) {
    var value = parsed.params[preferredParams[i]];
    if (value) {
      return value;
    }
  }

  for (i = parsed.pathSegments.length - 1; i >= 0; i--) {
    var segment = parsed.pathSegments[i];
    if (!segment) {
      continue;
    }
    var token = segment.match(/[A-Za-z0-9_-]{5,}/);
    if (token) {
      return token[0];
    }
  }

  return '';
}

/**
 * Canonicalizes URLs for hash fallback keying.
 *
 * @param {string} rawUrl
 * @return {string}
 */
function canonicalizeUrl_(rawUrl) {
  var parsed = parseUrl_(rawUrl);
  if (!parsed) {
    return normalizeToken_(rawUrl);
  }

  var sortedKeys = Object.keys(parsed.params).sort();
  var queryParts = [];
  for (var i = 0; i < sortedKeys.length; i++) {
    var key = sortedKeys[i];
    queryParts.push(key + '=' + normalizeToken_(parsed.params[key]));
  }

  return [
    parsed.origin,
    parsed.path,
    queryParts.join('&')
  ].join('?');
}

/**
 * @param {string} raw
 * @return {{origin:string,path:string,pathSegments:string[],params:Object<string,string>}|null}
 */
function parseUrl_(raw) {
  if (!raw) {
    return null;
  }

  var trimmed = String(raw).trim();
  var noFragment = trimmed.split('#')[0];
  var qIdx = noFragment.indexOf('?');
  var left = qIdx >= 0 ? noFragment.slice(0, qIdx) : noFragment;
  var query = qIdx >= 0 ? noFragment.slice(qIdx + 1) : '';

  var originMatch = left.match(/^(https?:\/\/[^/]+)(\/.*)?$/i);
  var origin = originMatch ? originMatch[1].toLowerCase() : '';
  var path = originMatch ? (originMatch[2] || '/') : left;
  path = path.replace(/\/+$/, '') || '/';

  var params = {};
  if (query) {
    var pairs = query.split('&');
    for (var i = 0; i < pairs.length; i++) {
      if (!pairs[i]) {
        continue;
      }
      var pair = pairs[i].split('=');
      var key = decodeURIComponent(pair[0] || '').trim().toLowerCase();
      var value = decodeURIComponent(pair.slice(1).join('=') || '').trim();
      if (key) {
        params[key] = value;
      }
    }
  }

  var pathSegments = path.split('/').filter(function (segment) {
    return segment;
  });

  return {
    origin: origin,
    path: path,
    pathSegments: pathSegments,
    params: params
  };
}

/**
 * @param {string} value
 * @return {string}
 */
function normalizeToken_(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * @param {string} value
 * @return {string}
 */
function sha256Hex_(value) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8);
  return bytes
    .map(function (b) {
      var n = (b + 256) % 256;
      return (n < 16 ? '0' : '') + n.toString(16);
    })
    .join('');
}
