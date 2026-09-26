/*
 * LIVE MONITOR - no API key
 *
 * Tujuan:
 * - Tidak memakai YouTube Data API / API key / InnerTube key.
 * - Mengambil halaman publik channel /live dan hanya memvalidasi player broadcast yang benar-benar ON AIR.
 * - Beberapa detector dipakai karena format halaman YouTube dapat berubah.
 * - Error jaringan TIDAK dianggap sebagai OFFLINE.
 * - Response diberi CDN cache + stale-while-revalidate agar Vercel tidak
 *   melakukan puluhan request YouTube pada setiap refresh pengunjung.
 */
const STREAMERS = require('../streamers.json');

const TIMEOUT_MS = 10000;
const RETRIES = 1;
const CONCURRENCY = 4;
const CACHE_SECONDS = 45;
const STALE_SECONDS = 180;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function renderedText(t) {
  if (!t) return '';
  if (typeof t === 'string') return t;
  if (t.simpleText) return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map(r => r && r.text || '').join('');
  return '';
}

function cleanTitle(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*[-|]\s*YouTube\s*$/i, '')
    .trim();
}

function validVideoId(id) {
  return typeof id === 'string' && /^[A-Za-z0-9_-]{11}$/.test(id);
}

function extractVideoIds(text) {
  const out = [];
  const seen = new Set();
  const add = id => {
    if (validVideoId(id) && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  };

  // URL video YouTube.
  for (const m of String(text || '').matchAll(/(?:youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/g)) {
    add(m[1]);
  }

  // JSON fields umum di HTML YouTube.
  for (const re of [
    /"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"/g,
    /"videoId":"([A-Za-z0-9_-]{11})"/g
  ]) {
    for (const m of String(text || '').matchAll(re)) add(m[1]);
  }

  return out;
}

function extractTitle(text) {
  const s = String(text || '');
  const patterns = [
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i,
    /<title[^>]*>([\s\S]*?)<\/title>/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && m[1]) return cleanTitle(decodeHtml(m[1]));
  }
  return '';
}

function decodeHtml(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function looksLive(text) {
  const s = String(text || '');
  // Kita sengaja tidak menganggap semua kemunculan kata LIVE sebagai live.
  // Detector ini hanya fallback; video ID + struktur live diprioritaskan.
  return /\bLIVE NOW\b|\bWATCHING LIVE\b|\bIS LIVE\b|\bLIVE\b/i.test(s);
}

function hasLiveMarker(text) {
  const s = String(text || '');
  return [
    /"isLiveNow"\s*:\s*true/i,
    /"isLive"\s*:\s*true/i,
    /"style"\s*:\s*"LIVE"/i,
    /"label"\s*:\s*"LIVE"/i,
    /"text"\s*:\s*"LIVE"/i,
    /LIVE NOW/i
  ].some(re => re.test(s));
}

async function fetchText(url, signal, extraHeaders = {}) {
  const r = await fetch(url, {
    signal,
    redirect: 'follow',
    headers: {
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36',
      'accept-language': 'en-US,en;q=0.9,id;q=0.8',
      'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      ...extraHeaders
    }
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return { status: r.status, url: r.url, text };
}

async function withTimeout(fn) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fn(ctrl.signal);
  } finally {
    clearTimeout(timer);
  }
}

/* Detector: only count a broadcast when YouTube's player data explicitly says it is LIVE. */
async function detectFromLivePage(s) {
  const url = `https://www.youtube.com/channel/${encodeURIComponent(s.id)}/live`;
  const result = await withTimeout(signal => fetchText(url, signal));
  const html = result.text;

  // The /live page can resolve to a scheduled broadcast. Never trust the
  // redirect alone: validate the resulting watch page's player state.
  const redirectedVideoIds = extractVideoIds(result.url);
  if (redirectedVideoIds.length && /(?:youtube(?:-nocookie)?\.com\/watch\?v=|youtu\.be\/)/i.test(result.url)) {
    const watch = await fetchWatchState(redirectedVideoIds[0]);
    if (watch.live) return { live: true, videoId: redirectedVideoIds[0], title: watch.title || extractTitle(html), method: 'watch-isLive' };
    return { live: false, method: watch.scheduled ? 'scheduled-broadcast' : 'watch-not-live' };
  }

  // Strongest no-key signal: YouTube's internal player/broadcast state.
  const ids = extractVideoIds(html);
  const liveId = findExplicitLiveVideoId(html);
  if (liveId) {
    const watch = await fetchWatchState(liveId).catch(() => ({ live: false }));
    if (watch.live) return { live: true, videoId: liveId, title: watch.title || extractTitle(html), method: 'player-isLive' };
  }

  // A plain word "LIVE" is intentionally NOT enough. It is common on
  // scheduled cards, thumbnails, titles and channel metadata.
  return { live: false, method: ids.length ? 'no-active-broadcast' : 'live-page' };
}

function findExplicitLiveVideoId(text) {
  const s = String(text || '');
  // Keep the ID near an explicit isLive/isLiveNow=true marker.
  const patterns = [
    /(?:"videoId"\s*:\s*"([A-Za-z0-9_-]{11})"[\s\S]{0,5000}?"isLive(?:Now)?"\s*:\s*true)/i,
    /(?:"isLive(?:Now)?"\s*:\s*true[\s\S]{0,5000}?"videoId"\s*:\s*"([A-Za-z0-9_-]{11})")/i
  ];
  for (const re of patterns) {
    const m = s.match(re);
    if (m && validVideoId(m[1])) return m[1];
  }
  return null;
}

async function fetchWatchState(videoId) {
  const result = await withTimeout(signal => fetchText(`https://www.youtube.com/watch?v=${videoId}`, signal));
  const html = result.text;
  const live = /"isLive(?:Now)?"\s*:\s*true/i.test(html) &&
    !/"isUpcoming"\s*:\s*true/i.test(html) &&
    !/"isLiveContent"\s*:\s*false/i.test(html);
  const scheduled = /"isUpcoming"\s*:\s*true/i.test(html) ||
    /"upcomingEventData"/i.test(html);
  return { live, scheduled, title: extractTitle(html) };
}

async function checkOnce(s) {
  try {
    const r = await detectFromLivePage(s);
    if (r.live) return { ...s, ok: true, live: true, videoId: r.videoId, title: r.title, method: r.method };
    return { ...s, ok: true, live: false, method: r.method };
  } catch (e) {
    return { ...s, ok: false, live: false, error: String(e && e.message || e) };
  }
}

async function check(s) {
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await checkOnce(s);
    } catch (e) {
      lastErr = e;
      if (attempt < RETRIES) await sleep(350 * (attempt + 1));
    }
  }
  return { ...s, ok: false, live: false, error: String(lastErr && lastErr.message || lastErr || 'unknown') };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

function setHeaders(res) {
  // s-maxage memungkinkan CDN Vercel menyajikan hasil yang sama ke banyak
  // pengunjung tanpa mengulang 70 request ke YouTube.
  res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=${STALE_SECONDS}`);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Live-Monitor', 'no-api-key-v3-live-only');
}

module.exports = async (req, res) => {
  setHeaders(res);

  const url = new URL(req.url, 'http://localhost');
  const debugId = url.searchParams.get('debug');
  const debugOembedId = null;

  if (debugId || debugOembedId) {
    const id = debugId;
    const s = STREAMERS.find(x => x.id === id) || { name: id, id };
    const attempts = [];

    try {
      try { attempts.push({ type: 'live-page', result: await detectFromLivePage(s) }); }
      catch (e) { attempts.push({ type: 'live-page', error: String(e.message || e) }); }
      res.status(200).send(JSON.stringify({ channel: s, attempts }, null, 2));
    } catch (e) {
      res.status(200).send(JSON.stringify({ channel: s, error: String(e.message || e), attempts }, null, 2));
    }
    return;
  }

  const started = Date.now();
  const results = await pool(STREAMERS, CONCURRENCY, check);
  const live = results
    .filter(r => r && r.ok && r.live && validVideoId(r.videoId))
    .map(({ name, id, videoId, title, method }) => ({ name, id, videoId, title: title || '', method }));

  const failed = results.filter(r => !r || !r.ok).length;
  const checked = results.length - failed;

  res.status(200).send(JSON.stringify({
    updated: new Date().toISOString(),
    total: STREAMERS.length,
    checked,
    failed,
    live,
    durationMs: Date.now() - started,
    source: 'public-youtube-no-api-key-live-only'
  }));
};
