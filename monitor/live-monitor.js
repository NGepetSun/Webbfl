/*
 * BFL YouTube Live Monitor - NO API KEY
 *
 * Runs outside Vercel (GitHub Actions) and writes data/live-status.json.
 * Detection path:
 *   1. YouTube public channel RSS -> recent video candidates
 *   2. YouTube watch page -> ytInitialPlayerResponse / liveBroadcastDetails
 *   3. Channel /live page -> fallback candidate, then the same watch-page check
 *
 * A failed check is NEVER treated as offline. Previous confirmed LIVE state is
 * retained for a short stale window so a temporary network/YouTube failure does
 * not make a real live stream disappear.
 */
const fs = require('fs');
const path = require('path');

const STREAMERS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'streamers.json'), 'utf8'));
const OUT = path.join(__dirname, '..', 'data', 'live-status.json');

const CONCURRENCY = 6;
const TIMEOUT_MS = 12000;
const RETRIES = 1;
const RSS_LIMIT = 8;
const STALE_MS = 12 * 60 * 1000;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/131 Safari/537.36';

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchText(url, opts = {}) {
  let last;
  for (let i = 0; i <= RETRIES; i++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        ...opts,
        signal: controller.signal,
        headers: {
          'user-agent': UA,
          'accept-language': 'en-US,en;q=0.9,id;q=0.8',
          ...(opts.headers || {})
        }
      });
      const text = await r.text();
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return text;
    } catch (e) {
      last = e;
      if (i < RETRIES) await sleep(400 + i * 500);
    } finally {
      clearTimeout(timer);
    }
  }
  throw last || new Error('request failed');
}

function xmlDecode(s) {
  return String(s || '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
}

function parseRss(xml) {
  const entries = [];
  const re = /<entry>([\s\S]*?)<\/entry>/g;
  let m;
  while ((m = re.exec(xml)) && entries.length < RSS_LIMIT) {
    const b = m[1];
    const id = (b.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    const title = (b.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
    const published = (b.match(/<published>([^<]+)<\/published>/) || [])[1];
    const updated = (b.match(/<updated>([^<]+)<\/updated>/) || [])[1];
    if (id) entries.push({ videoId: id, title: xmlDecode(title), published, updated });
  }
  return entries;
}

function extractBalancedObject(text, marker) {
  const start = text.indexOf(marker);
  if (start < 0) return null;
  const brace = text.indexOf('{', start + marker.length);
  if (brace < 0) return null;
  let depth = 0, inStr = false, esc = false;
  for (let i = brace; i < text.length; i++) {
    const c = text[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(text.slice(brace, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function playerFromHtml(html) {
  return extractBalancedObject(html, 'ytInitialPlayerResponse') || extractBalancedObject(html, 'var ytInitialPlayerResponse =');
}

function inspectPlayer(html, expectedChannelId, fallbackVideoId) {
  const p = playerFromHtml(html);
  const video = p && p.videoDetails;
  const micro = p && p.microformat && p.microformat.playerMicroformatRenderer;
  const live = micro && micro.liveBroadcastDetails;
  const channelId = video && video.channelId;
  const videoId = (video && video.videoId) || fallbackVideoId;
  const isLiveNow = live && live.isLiveNow === true;
  const isUpcoming = live && live.isUpcoming === true;
  const authorMatch = channelId === expectedChannelId;

  return {
    ok: Boolean(p),
    videoId,
    title: (video && video.title) || (micro && micro.title && (micro.title.simpleText || (micro.title.runs || []).map(x => x.text).join(''))) || '',
    channelId,
    authorMatch,
    isLiveNow,
    isUpcoming,
    isLiveContent: Boolean(video && video.isLiveContent),
    thumbnail: micro && micro.thumbnail && micro.thumbnail.thumbnails ? micro.thumbnail.thumbnails.at(-1).url : null
  };
}

async function checkVideo(videoId, channelId) {
  const html = await fetchText(`https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&hl=en`);
  return inspectPlayer(html, channelId, videoId);
}

async function findLiveFromChannelPage(channelId) {
  const html = await fetchText(`https://www.youtube.com/channel/${encodeURIComponent(channelId)}/live?hl=en`);
  const ids = [];
  const seen = new Set();
  const re = /(?:watch\?v=|"videoId"\s*:\s*")([A-Za-z0-9_-]{11})/g;
  let m;
  while ((m = re.exec(html)) && ids.length < 8) {
    if (!seen.has(m[1])) { seen.add(m[1]); ids.push(m[1]); }
  }
  return ids;
}

async function checkStreamer(s, previous) {
  const base = { name: s.name, id: s.id };
  try {
    const rss = await fetchText(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(s.id)}`);
    const candidates = parseRss(rss);
    let sawValidCandidate = false;

    for (const c of candidates) {
      try {
        const p = await checkVideo(c.videoId, s.id);
        if (!p.ok || !p.authorMatch) continue;
        sawValidCandidate = true;
        if (p.isLiveNow && !p.isUpcoming) {
          return {
            ...base,
            state: 'LIVE', ok: true, live: true,
            videoId: p.videoId, title: p.title || c.title,
            thumbnail: p.thumbnail || null,
            checkedAt: new Date().toISOString(),
            source: 'rss+watch'
          };
        }
      } catch (_) {}
    }

    // RSS can lag. Try the channel's /live page as a candidate source.
    try {
      const ids = await findLiveFromChannelPage(s.id);
      for (const id of ids) {
        try {
          const p = await checkVideo(id, s.id);
          if (!p.ok || !p.authorMatch) continue;
          sawValidCandidate = true;
          if (p.isLiveNow && !p.isUpcoming) {
            return {
              ...base,
              state: 'LIVE', ok: true, live: true,
              videoId: p.videoId, title: p.title,
              thumbnail: p.thumbnail || null,
              checkedAt: new Date().toISOString(),
              source: 'channel-live+watch'
            };
          }
        } catch (_) {}
      }
    } catch (_) {}

    if (sawValidCandidate) {
      return { ...base, state: 'OFFLINE', ok: true, live: false, checkedAt: new Date().toISOString(), source: 'watch-confirmed' };
    }

    // RSS itself was reachable, but all candidates were unusable. This is
    // unknown rather than offline because a live can start between feed updates.
    throw new Error('no confirmable candidate');
  } catch (e) {
    const now = Date.now();
    const prevTime = previous && Date.parse(previous.checkedAt || previous.lastConfirmedAt || '') || 0;
    if (previous && previous.state === 'LIVE' && previous.videoId && now - prevTime < STALE_MS) {
      return {
        ...previous,
        state: 'LIVE', live: true, ok: false, stale: true,
        checkedAt: new Date().toISOString(),
        error: String(e.message || e)
      };
    }
    return {
      ...base,
      state: 'UNKNOWN', ok: false, live: false,
      checkedAt: new Date().toISOString(),
      error: String(e.message || e)
    };
  }
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

function loadPrevious() {
  try { return JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { return { channels: [] }; }
}

(async () => {
  const previous = loadPrevious();
  const prevMap = new Map((previous.channels || []).map(x => [x.id, x]));
  const results = await pool(STREAMERS, CONCURRENCY, s => checkStreamer(s, prevMap.get(s.id)));
  const live = results.filter(x => x.state === 'LIVE').map(x => ({
    name: x.name, id: x.id, videoId: x.videoId, title: x.title || '',
    thumbnail: x.thumbnail || null, stale: Boolean(x.stale), source: x.source || null
  }));
  const failed = results.filter(x => !x.ok).length;
  const unknown = results.filter(x => x.state === 'UNKNOWN').length;

  const payload = {
    version: 2,
    updated: new Date().toISOString(),
    total: STREAMERS.length,
    checked: results.length,
    failed,
    unknown,
    live,
    channels: results
  };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n');
  console.log(JSON.stringify({ updated: payload.updated, total: payload.total, checked: payload.checked, failed, unknown, live: live.map(x => x.name) }, null, 2));
})();
