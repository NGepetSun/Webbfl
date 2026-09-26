/* BFL Live Monitor - no YouTube API key
 *
 * Detection strategy:
 *  - Query every currently listed, trusted Invidious public instance for each
 *    configured channel.
 *  - A channel is LIVE when ANY healthy source reports liveNow=true AND the
 *    returned authorId exactly matches the configured channel ID.
 *  - Scheduled streams are rejected with isUpcoming=true.
 *  - A source saying "not live" does not cancel another source saying LIVE;
 *    this is important because public instances can have stale channel data.
 *  - Per-instance failures are counted separately from channel results.
 *
 * This deliberately uses no YouTube API key. Invidious documents the streams
 * endpoint and liveNow/isUpcoming fields, and its official instance list is
 * used below.
 */
const STREAMERS = require('../streamers.json');

const INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si'
];

const CHANNEL_CONCURRENCY = 12;
const SOURCE_CONCURRENCY = 5;
const TIMEOUT_MS = 3500;
const CACHE_SECONDS = 20;

function cleanText(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v.simpleText === 'string') return v.simpleText;
  if (v && Array.isArray(v.runs)) return v.runs.map(x => x.text || '').join('');
  return '';
}

function thumb(v) {
  const a = Array.isArray(v && v.videoThumbnails) ? v.videoThumbnails : [];
  return a.length ? a[a.length - 1].url : null;
}

function isLive(v, channelId) {
  return !!(
    v && v.videoId &&
    String(v.authorId || '') === String(channelId) &&
    v.liveNow === true &&
    v.isUpcoming !== true
  );
}

async function fetchJson(url, signal) {
  const r = await fetch(url, {
    signal,
    headers: {
      accept: 'application/json',
      'user-agent': 'BFL-Live-Monitor/2.0'
    }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function checkSource(s, instance) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const url = `${instance}/api/v1/channels/${encodeURIComponent(s.id)}/streams?sort_by=newest`;
    const data = await fetchJson(url, ctrl.signal);
    const videos = data && Array.isArray(data.videos) ? data.videos : [];
    const live = videos.find(v => isLive(v, s.id));
    return {
      instance,
      ok: true,
      live: !!live,
      video: live ? {
        videoId: live.videoId,
        title: cleanText(live.title) || '(tanpa judul)',
        thumbnail: thumb(live),
        authorId: live.authorId
      } : null
    };
  } finally {
    clearTimeout(timer);
  }
}

async function sourcePool(s, size, onResult) {
  const out = new Array(INSTANCES.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, INSTANCES.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= INSTANCES.length) return;
      try {
        const r = await checkSource(s, INSTANCES[i]);
        out[i] = r;
        if (r.live && r.video) onResult(r);
      } catch (e) {
        out[i] = { instance: INSTANCES[i], ok: false, live: false, error: String(e && e.message || e) };
      }
    }
  }));
  return out;
}

async function checkChannel(s) {
  const attempts = await sourcePool(s, SOURCE_CONCURRENCY, () => {});
  const liveAttempt = attempts.find(x => x && x.ok && x.live && x.video);
  const okCount = attempts.filter(x => x && x.ok).length;
  const failedCount = attempts.filter(x => !x || !x.ok).length;

  if (liveAttempt) {
    return {
      ...s,
      ok: true,
      live: true,
      videoId: liveAttempt.video.videoId,
      title: liveAttempt.video.title,
      thumbnail: liveAttempt.video.thumbnail,
      authorId: liveAttempt.video.authorId,
      sourcesChecked: attempts.length,
      sourcesOk: okCount,
      sourcesFailed: failedCount
    };
  }

  // A channel is considered confirmed offline if at least one source answered
  // successfully. It is considered unknown/failed only when every source failed.
  if (okCount > 0) {
    return { ...s, ok: true, live: false, sourcesChecked: attempts.length, sourcesOk: okCount, sourcesFailed: failedCount };
  }

  return { ...s, ok: false, live: false, error: 'Semua sumber gagal', sourcesChecked: attempts.length, sourcesOk: 0, sourcesFailed: failedCount };
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

function send(res, body, status = 200, cache = CACHE_SECONDS) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${cache}, stale-while-revalidate=90`);
  res.status(status).send(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const debugId = url.searchParams.get('debug');

  if (debugId) {
    const s = STREAMERS.find(x => String(x.id) === String(debugId));
    if (!s) return send(res, { ok: false, error: 'Channel ID tidak ada di streamers.json', requestedId: debugId }, 404, 0);
    const attempts = await sourcePool(s, SOURCE_CONCURRENCY, () => {});
    const live = attempts.find(x => x && x.ok && x.live && x.video);
    return send(res, {
      ok: true,
      requestedId: s.id,
      streamer: s.name,
      live: !!live,
      result: live ? { ...s, videoId: live.video.videoId, title: live.video.title, thumbnail: live.video.thumbnail, authorId: live.video.authorId } : null,
      attempts
    }, 200, 0);
  }

  const results = await pool(STREAMERS, CHANNEL_CONCURRENCY, checkChannel);
  const live = results.filter(r => r && r.live && r.videoId && String(r.authorId) === String(r.id))
    .map(({ name, id, videoId, title, thumbnail }) => ({ name, id, videoId, title, thumbnail }));

  const failed = results.filter(r => !r || !r.ok).length;
  const checked = results.length;
  const sourceFailures = results.reduce((n, r) => n + (r && r.sourcesFailed || 0), 0);

  return send(res, {
    updated: new Date().toISOString(),
    total: STREAMERS.length,
    checked,
    failed,
    sourceFailures,
    live
  });
};
