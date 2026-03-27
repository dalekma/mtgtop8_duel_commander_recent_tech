/**
 * Pure MTGTop8 event parsing helpers.
 * No SpreadsheetApp usage in this file.
 */

function parseRecentEventRows(html, sourcePageUrl) {
  const rows = [];
  const seen = {};

  extractTableRows(html).forEach(function (rowHtml, rowIndex) {
    try {
      const parsed = parseRecentEventRow_(rowHtml, sourcePageUrl);
      if (!parsed || !parsed.event_id || seen[parsed.event_id]) return;
      seen[parsed.event_id] = true;
      rows.push(parsed);
    } catch (err) {
      logWarn('recent_event_row_parse_failed', {
        source_page: sourcePageUrl,
        row_index: rowIndex,
        error: err && err.message ? err.message : String(err)
      });
    }
  });

  return rows;
}

function parseRecentEventRow_(rowHtml, sourcePageUrl) {
  // Brittle selector note: event-list rows expose event id in `event?e=<id>` links.
  const eventLink = firstAnchorMatch_(rowHtml, /event\?e=(\d+)(?:&|$)/i, function (href) {
    // Brittle selector note: reject deck links that include `&d=` because they are deck pages.
    return !/[?&]d=\d+/i.test(href);
  });
  if (!eventLink) return null;

  const eventId = buildEventIdFromUrl(eventLink.href, '');
  if (!eventId) return null;

  const eventName = normalizeText(eventLink.text || '');
  if (!eventName) return null;

  const rowText = normalizeText(htmlToTextWithBreaks_(rowHtml));
  const eventDate = inferEventDate_(rowText);
  const playersCount = inferPlayersCount_(rowText);

  return {
    event_id: eventId,
    event_url: absolutizeMtgtop8Url(eventLink.href),
    event_name: eventName,
    format: 'Duel Commander',
    location: '',
    event_date: eventDate,
    event_date_utc: '',
    players_count: playersCount,
    source_site: SOURCE_SITE,
    source_page: sourcePageUrl,
    ingested_at_utc: nowIsoUtc()
  };
}

function parseEventMetadata(html, eventUrl) {
  const eventId = buildEventIdFromUrl(eventUrl, '');
  const title = extractTitle(html);

  return {
    event_id: eventId,
    event_url: eventUrl,
    event_name: title || 'Unknown Event',
    format: htmlContainsDuelCommander(html) ? 'Duel Commander' : '',
    location: '',
    event_date: inferEventDate_(normalizeText(htmlToTextWithBreaks_(html))),
    event_date_utc: '',
    source_site: SOURCE_SITE,
    source_page: URLS.RECENT_DUEL_COMMANDER,
    ingested_at_utc: nowIsoUtc()
  };
}

function htmlContainsDuelCommander(html) {
  return /duel\s*commander/i.test(html || '');
}

function extractTitle(html) {
  // Brittle selector note: relies on static `<title>` markup from MTGTop8 pages.
  const m = String(html || '').match(/<title>([^<]+)<\/title>/i);
  return m ? normalizeText(m[1]) : '';
}

function extractAnchors(html) {
  const source = String(html || '');
  // Brittle selector note: regex-based anchor extraction may break if HTML is malformed.
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    out.push({ href: m[1], text: stripHtml(m[2]) });
  }
  return out;
}

function extractTableRows(html) {
  const source = String(html || '');
  // Brittle selector note: this assumes the page emits explicit `<tr>...</tr>` rows.
  const re = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  const rows = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    rows.push(m[1]);
  }
  return rows;
}

function firstAnchorMatch_(html, hrefRegex, hrefFilter) {
  const anchors = extractAnchors(html);
  for (var i = 0; i < anchors.length; i += 1) {
    const a = anchors[i];
    if (!hrefRegex.test(a.href || '')) continue;
    if (hrefFilter && !hrefFilter(a.href || '')) continue;
    return a;
  }
  return null;
}

function inferEventDate_(text) {
  const source = String(text || '');
  // Brittle selector note: date extraction is regex-inferred from row text and locale-dependent.
  const dateMatch = source.match(/\b(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4})\b/);
  return dateMatch ? normalizeText(dateMatch[1]) : '';
}

function inferPlayersCount_(text) {
  const source = String(text || '');
  // Brittle selector note: players count label may vary (`players`, `player`, `joueurs`).
  const match = source.match(/\b(\d{1,4})\s*(?:players?|joueurs?)\b/i);
  return match ? Number(match[1]) : '';
}

function absolutizeMtgtop8Url(href) {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  const path = href.charAt(0) === '/' ? href : '/' + href;
  return URLS.BASE + path;
}

function stripHtml(str) {
  return String(str || '').replace(/<[^>]+>/g, ' ');
}

function htmlToTextWithBreaks_(html) {
  return String(html || '')
    // Brittle selector note: these replacements approximate text layout from HTML blocks.
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\s*\/(?:tr|td|th|p|div|li|h1|h2|h3|h4|h5|h6)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/\r/g, '');
}

function normalizeText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}
