/**
 * Pure MTGTop8 event parsing helpers.
 * No SpreadsheetApp usage in this file.
 */

function parseRecentEventRows(html, sourcePageUrl) {
  // Brittle selector note: MTGTop8 embeds event links with `event?e=` query ids.
  const anchors = extractAnchors(html);
  const seen = {};
  const rows = [];

  anchors.forEach(function (a) {
    const href = a.href || '';
    const idMatch = href.match(/event\?e=(\d+)/i);
    if (!idMatch) return;

    const eventId = idMatch[1];
    if (seen[eventId]) return;
    seen[eventId] = true;

    const eventName = normalizeText(a.text || '');
    if (!eventName) return;

    rows.push({
      event_id: eventId,
      event_url: absolutizeMtgtop8Url(href),
      event_name: eventName,
      format: 'Duel Commander',
      location: '',
      event_date: '',
      event_date_utc: '',
      source_site: SOURCE_SITE,
      source_page: sourcePageUrl,
      ingested_at_utc: nowIsoUtc()
    });
  });

  return rows;
}

function parseEventMetadata(html, eventUrl) {
  const eventIdMatch = eventUrl.match(/[?&]e=(\d+)/i);
  const eventId = eventIdMatch ? eventIdMatch[1] : '';
  const title = extractTitle(html);

  return {
    event_id: eventId,
    event_url: eventUrl,
    event_name: title || 'Unknown Event',
    format: htmlContainsDuelCommander(html) ? 'Duel Commander' : '',
    location: '',
    event_date: '',
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
  const m = String(html || '').match(/<title>([^<]+)<\/title>/i);
  return m ? normalizeText(m[1]) : '';
}

function extractAnchors(html) {
  const source = String(html || '');
  const re = /<a\s+[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi;
  const out = [];
  let m;
  while ((m = re.exec(source)) !== null) {
    out.push({ href: m[1], text: stripHtml(m[2]) });
  }
  return out;
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

function normalizeText(str) {
  return String(str || '').replace(/\s+/g, ' ').trim();
}
