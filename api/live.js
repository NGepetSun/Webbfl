/* BFL Live Monitor - no YouTube API key
 *
 * Primary detector: Invidious public API /channels/:id/streams
 * Why: the previous YouTube InnerTube browse detector could miss active
 * broadcasts because a channel browse response does not guarantee that the
 * currently-live broadcast is present in the rendered video list.
 *
 * We only accept a result when:
 *   - video.liveNow === true
 *   - video.isUpcoming !== true
 *   - video.authorId === requested channel id
 * This prevents scheduled streams and streams from another channel from
 * being shown as LIVE.
 *
 * Public instances are used only as metadata sources; the actual player still
 * opens the normal YouTube watch URL in the frontend.
 */
const STREAMERS = require('../streamers.json');

const INSTANCES = [
  'https://inv.nadeko.net',
  'https://invidious.nerdvpn.de',
  'https://yt.chocolatemoo53.com',
  'https://invidious.tiekoetter.com',
  'https://invidious.f5.si'
];

const CONCURRENCY = 5;
const TIMEOUT_MS = 7000;
const RETRIES = 2;
const CACHE_SECONDS = 30;

function cleanText(v) {
  if (typeof v === 'string') return v;
  if (v && typeof v.simpleText === 'string') return v.simpleText;
  if (v && Array.isArray(v.runs)) return v.runs.map(x => x.text || '').join('');
  return '';
}

function isCurrentLive(v, channelId) {
  if (!v || typeof v !== 'object') return false;
  if (!v.videoId) return false;
  if (String(v.authorId || '') !== String(channelId)) return false;
  if (v.liveNow !== true) return false;
  if (v.isUpcoming === true) return false;
  return true;
}

function thumbnail(v) {
  const list = Array.isArray(v.videoThumbnails) ? v.videoThumbnails : [];
  return list.length ? list[list.length - 1].url : null;
}

async function fetchJson(url, signal) {
  const r = await fetch(url, {
    signal,
    headers: {
      accept: 'application/json',
      'user-agent': 'BFL-Live-Monitor/1.0'
    }
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return await r.json();
}

async function fetchStreams(instance, channelId, signal) {
  const url = `${instance}/api/v1/channels/${encodeURIComponent(channelId)}/streams?sort_by=newest`;
  const data = await fetchJson(url, signal);
  if (!data || typeof data !== 'object') throw new Error('invalid response');
  const videos = Array.isArray(data.videos) ? data.videos : [];
  return videos;
}

async function checkWithInstance(s, instance) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const videos = await fetchStreams(instance, s.id, ctrl.signal);
    const live = videos.find(v => isCurrentLive(v, s.id));
    if (!live) {
      return { ...s, ok: true, live: false, source: instance };
    }
    return {
      ...s,
      ok: true,
      live: true,
      source: instance,
      videoId: live.videoId,
      title: cleanText(live.title) || '(tanpa judul)',
      authorId: live.authorId,
      thumbnail: thumbnail(live)
    };
  } finally {
    clearTimeout(timer);
  }
}

async function check(s) {
  let lastError = 'unknown';
  const start = (Math.abs(hash(s.id)) % INSTANCES.length);

  // Try different public instances on retries. This spreads load and also
  // prevents one unhealthy instance from making many channels disappear.
  for (let attempt = 0; attempt < Math.min(RETRIES + 1, INSTANCES.length); attempt++) {
    const instance = INSTANCES[(start + attempt) % INSTANCES.length];
    try {
      return await checkWithInstance(s, instance);
    } catch (e) {
      lastError = String(e && e.message || e);
    }
  }

  return {
    ...s,
    ok: false,
    live: false,
    error: lastError
  };
}

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
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

function send(res, body, status = 200) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=90`);
  res.status(status).send(JSON.stringify(body));
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const debugId = url.searchParams.get('debug');

  // Debug a single configured channel. Useful for verifying a streamer that
  // is known to be live without scanning all 73 channels.
  if (debugId) {
    const s = STREAMERS.find(x => x.id === debugId);
    if (!s) return send(res, { ok: false, error: 'Channel ID tidak ada di streamers.json', requestedId: debugId }, 404);

    const attempts = [];
    for (const instance of INSTANCES) {
      try {
        const result = await checkWithInstance(s, instance);
        attempts.push({ instance, ok: true, live: result.live, videoId: result.videoId || null, title: result.title || null });
        if (result.live) return send(res, { requestedId: debugId, streamer: s.name, result, attempts });
      } catch (e) {
        attempts.push({ instance, ok: false, error: String(e && e.message || e) });
      }
    }
    return send(res, { requestedId: debugId, streamer: s.name, live: false, attempts });
  }

  const results = await pool(STREAMERS, CONCURRENCY, check);
  const live = results
    .filter(r => r && r.live === true && r.videoId && String(r.authorId) === String(r.id))
    .map(({ name, id, videoId, title, thumbnail, source }) => ({ name, id, videoId, title, thumbnail, source }));

  const failed = results.filter(r => !r || !r.ok).length;

  return send(res, {
    updated: new Date().toISOString(),
    total: STREAMERS.length,
    failed,
    live
  });
};
