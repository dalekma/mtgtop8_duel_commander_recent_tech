/**
 * UrlFetch wrappers with simple retries and structured logging.
 */
function fetchText(url, options) {
  const params = Object.assign(
    {
      muteHttpExceptions: true,
      followRedirects: true,
      validateHttpsCertificates: true
    },
    options || {}
  );

  const maxAttempts = INGEST_LIMITS.MAX_HTTP_ATTEMPTS;
  let lastErr = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = UrlFetchApp.fetch(url, params);
      const code = response.getResponseCode();
      if (code >= 200 && code < 300) {
        return response.getContentText();
      }

      lastErr = new Error('HTTP ' + code + ' for ' + url);
      logWarn('fetch_non_2xx', { url: url, status: code, attempt: attempt });
    } catch (err) {
      lastErr = err;
      logWarn('fetch_exception', {
        url: url,
        attempt: attempt,
        error: err && err.message ? err.message : String(err)
      });
    }

    if (attempt < maxAttempts) {
      Utilities.sleep(INGEST_LIMITS.RETRY_SLEEP_MS * attempt);
    }
  }

  throw lastErr || new Error('Failed to fetch URL: ' + url);
}

function logInfo(event, context) {
  Logger.log(JSON.stringify({ level: 'INFO', event: event, context: context || {}, at: nowIsoUtc() }));
}

function logWarn(event, context) {
  Logger.log(JSON.stringify({ level: 'WARN', event: event, context: context || {}, at: nowIsoUtc() }));
}

function logError(event, context) {
  Logger.log(JSON.stringify({ level: 'ERROR', event: event, context: context || {}, at: nowIsoUtc() }));
}
