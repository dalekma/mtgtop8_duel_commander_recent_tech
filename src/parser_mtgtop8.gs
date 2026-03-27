var MTGTOP8_DUEL_FORMAT_URL = 'https://www.mtgtop8.com/format?f=EDH';

function fetchText_(url) {
  var response = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; DuelCommanderResearchBot/1.0)'
    }
  });
  var code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('HTTP_' + code + ' for url=' + url);
  }
  return response.getContentText();
}

function fetchRecentDuelCommanderEvents_(limit) {
  var html = fetchText_(MTGTOP8_DUEL_FORMAT_URL);
  var events = parseEventListPage_(html).slice(0, limit || 3);
  logInfo_('parsed_recent_events', { count: events.length, source_page: MTGTOP8_DUEL_FORMAT_URL });
  return events;
}

function parseEventListPage_(html) {
  var anchors = [];
  var anchorRegex = /<a[^>]*href="([^"]*event\?e=[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  var match;
  while ((match = anchorRegex.exec(html)) !== null) {
    var href = absolutizeMtgtop8Url_(match[1]);
    var title = cleanHtmlText_(match[2]);
    if (!title) {
      continue;
    }
    anchors.push({ href: href, title: title });
  }

  var uniqueByUrl = {};
  var events = [];
  for (var i = 0; i < anchors.length; i++) {
    if (uniqueByUrl[anchors[i].href]) {
      continue;
    }
    uniqueByUrl[anchors[i].href] = true;

    var eventDate = findNearbyDate_(html, anchors[i].href);
    var location = findNearbyLocation_(html, anchors[i].href);

    events.push({
      event_url: anchors[i].href,
      event_name: anchors[i].title,
      event_date: eventDate,
      location: location,
      format: 'Duel Commander',
      source_site: 'mtgtop8',
      source_page: MTGTOP8_DUEL_FORMAT_URL
    });
  }

  return events;
}

function parseEventTop8Decks_(eventUrl) {
  var html = fetchText_(eventUrl);
  var deckRows = [];

  // brittle selector note: MTGTop8 event page stores deck links with ?d=... and placement/player nearby in table cells.
  var rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  var rowMatch;
  while ((rowMatch = rowRegex.exec(html)) !== null) {
    var rowHtml = rowMatch[1];
    var deckLinkMatch = rowHtml.match(/href="([^"]*\?d=\d+[^"]*)"/i);
    if (!deckLinkMatch) {
      continue;
    }

    var placement = normalizeSpace_((rowHtml.match(/>([1-8](?:st|nd|rd|th)?|[1-8])<\//i) || [])[1] || '');
    if (!placement) {
      placement = String(deckRows.length + 1);
    }

    var player = cleanHtmlText_((rowHtml.match(/player[^>]*>([\s\S]*?)<\//i) || [])[1] || '');
    var commander = cleanHtmlText_((rowHtml.match(/commander[^>]*>([\s\S]*?)<\//i) || [])[1] || '');
    var archetype = cleanHtmlText_((rowHtml.match(/archetype[^>]*>([\s\S]*?)<\//i) || [])[1] || '');

    deckRows.push({
      placement: placement,
      player: player,
      commander: commander,
      archetype: archetype,
      deck_url: absolutizeMtgtop8Url_(deckLinkMatch[1]),
      is_top8: true
    });

    if (deckRows.length >= 8) {
      break;
    }
  }

  if (deckRows.length === 0) {
    throw new Error('No Top8 deck entries parsed for event=' + eventUrl);
  }

  return deckRows.slice(0, 8);
}

function parseDeckCards_(deckUrl) {
  var html = fetchText_(deckUrl);
  return parseDeckCardsFromHtml_(html);
}

function parseDeckCardsFromHtml_(html) {
  var lines = cleanHtmlText_(html).split('\n').map(normalizeSpace_).filter(Boolean);
  var cards = [];
  var role = 'mainboard';
  var qtyLineRegex = /^(\d+)\s+(.+)$/;

  for (var i = 0; i < lines.length; i++) {
    var line = lines[i];
    if (/^sideboard$/i.test(line) || /^maybeboard$/i.test(line)) {
      role = 'sideboard';
      continue;
    }
    var cardMatch = line.match(qtyLineRegex);
    if (!cardMatch) {
      continue;
    }
    var qty = parseInt(cardMatch[1], 10);
    var name = normalizeSpace_(cardMatch[2]);
    if (!name || isNaN(qty)) {
      continue;
    }
    cards.push({ card_name: name, card_qty: qty, card_role: role });
  }

  if (cards.length === 0) {
    throw new Error('No card rows parsed from deck page');
  }
  return cards;
}

function cleanHtmlText_(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/tr>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\r/g, '')
    .replace(/\t/g, ' ')
    .replace(/ +/g, ' ')
    .trim();
}

function absolutizeMtgtop8Url_(href) {
  if (!href) {
    return '';
  }
  if (/^https?:\/\//i.test(href)) {
    return href;
  }
  if (href.charAt(0) === '/') {
    return 'https://www.mtgtop8.com' + href;
  }
  return 'https://www.mtgtop8.com/' + href;
}

function findNearbyDate_(html, eventHref) {
  var escaped = escapeRegExp_(eventHref);
  var re = new RegExp(escaped + '[\\s\\S]{0,300}?([0-3]?\\d[\\/-][01]?\\d[\\/-](?:20)?\\d\\d)', 'i');
  var match = String(html).match(re);
  return match ? normalizeDateString_(match[1]) : '';
}

function findNearbyLocation_(html, eventHref) {
  var escaped = escapeRegExp_(eventHref);
  var re = new RegExp(escaped + '[\\s\\S]{0,300}?<td[^>]*>([^<]{2,80})<\\/td>', 'i');
  var match = String(html).match(re);
  return match ? normalizeSpace_(cleanHtmlText_(match[1])) : '';
}
