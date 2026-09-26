/* Vercel serverless function: GET /api/live
   Mengecek tiap channel di streamers.json lewat API internal YouTube
   (InnerTube "browse", endpoint yang sama dipakai aplikasi/situs YouTube
   sendiri) untuk melihat apakah channel itu sedang live sekarang.

   RIWAYAT PERBAIKAN:
   1) Versi awal scraping HTML `/channel/ID/live` + cari `isLive:true` di
      teks -> salah tangkap video lain yang ikut ter-render di halaman.
   2) Diperbaiki pakai `ytInitialPlayerResponse.microformat...isLiveNow`,
      lebih akurat -> tapi ternyata YouTube memblokir IP server Vercel
      dengan tembok "Login untuk mengonfirmasi Anda bukan bot"
      (playabilityStatus.status === "LOGIN_REQUIRED"), jadi request selalu
      "berhasil" (200) tapi tidak pernah dapat data video asli.
   3) Solusi saat ini: panggil endpoint InnerTube `/youtubei/v1/browse`
      (API internal yang sama dipakai aplikasi resmi), bukan scraping
      halaman web -> tidak kena tembok anti-bot yang sama. Kita minta tab
      Home channel, lalu cari `channelFeaturedContentRenderer` / video
      manapun yang overlay atau badge-nya menandakan "LIVE" saat ini. */
const STREAMERS = require('../streamers.json');

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
const INNERTUBE_CLIENT_VERSION = '2.20210330.08.00';
const CONCURRENCY = 10;
const TIMEOUT_MS = 9000;
const RETRIES = 1;

async function fetchBrowse(channelId, signal) {
  const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}`, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      origin: 'https://www.youtube.com',
      referer: 'https://www.youtube.com'
    },
    body: JSON.stringify({
      context: {
        client: {
          hl: 'en',
          gl: 'US',
          clientName: 'WEB',
          clientVersion: INNERTUBE_CLIENT_VERSION
        }
      },
      browseId: channelId
    })
  });
  if (!r.ok) throw new Error('bad status ' + r.status);
  const json = await r.json();
  if (json && json.error) throw new Error(json.error.message || 'innertube error');
  return json;
}

function renderedText(t) {
  if (!t) return '';
  if (t.simpleText) return t.simpleText;
  if (Array.isArray(t.runs)) return t.runs.map((r) => r.text).join('');
  return '';
}

/* Telusuri seluruh pohon JSON hasil browse untuk mencari videoRenderer /
   gridVideoRenderer yang punya penanda "sedang LIVE sekarang" (bukan
   sekadar video biasa atau jadwal live yang belum mulai). */
function findLiveVideos(root) {
  const found = [];
  const seen = new Set();

  function isLiveMarked(vr) {
    const overlays = vr.thumbnailOverlays || [];
    const overlayLive = overlays.some((o) => {
      const t = o && o.thumbnailOverlayTimeStatusRenderer;
      return t && (t.style === 'LIVE' || /live/i.test(renderedText(t.text)));
    });
    const badges = vr.badges || [];
    const badgeLive = badges.some((b) => {
      const m = b && b.metadataBadgeRenderer;
      return m && /LIVE/i.test(m.style || '');
    });
    return overlayLive || badgeLive;
  }

  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const item of node) walk(item); return; }

    const vr = node.videoRenderer || node.gridVideoRenderer;
    if (vr && vr.videoId && !seen.has(vr.videoId) && isLiveMarked(vr)) {
      seen.add(vr.videoId);
      found.push({ videoId: vr.videoId, title: renderedText(vr.title) });
    }
    for (const key of Object.keys(node)) walk(node[key]);
  }

  walk(root);
  return found;
}

async function checkOnce(s) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const data = await fetchBrowse(s.id, ctrl.signal);
    const liveVideos = findLiveVideos(data);
    if (!liveVideos.length) return { ...s, ok: true, live: false };
    return { ...s, ok: true, live: true, videoId: liveVideos[0].videoId, title: liveVideos[0].title };
  } finally {
    clearTimeout(timer);
  }
}

async function check(s) {
  let lastErr = null;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await checkOnce(s);
    } catch (e) {
      lastErr = e;
    }
  }
  return { ...s, ok: false, live: false, error: lastErr ? String(lastErr.message || lastErr) : 'unknown' };
}

async function pool(items, size, fn) {
  const out = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: size }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

module.exports = async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const debugId = url.searchParams.get('debug') || url.searchParams.get('debugInnertube');

  if (debugId) {
    // Mode diagnostik: cek SATU channel dan tampilkan detail mentahnya,
    // supaya gampang ditelusuri kalau ada channel yang hasilnya meleset.
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      let data, errMsg = null;
      try {
        data = await fetchBrowse(debugId, ctrl.signal);
      } catch (e) {
        errMsg = String(e.message || e);
      }
      clearTimeout(timer);
      const liveVideos = data ? findLiveVideos(data) : [];
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify({
        requestedId: debugId,
        fetchError: errMsg,
        topLevelKeys: data ? Object.keys(data) : [],
        liveVideosFound: liveVideos
      }, null, 2));
    } catch (e) {
      res.status(200).send(JSON.stringify({ requestedId: debugId, error: String(e.message || e) }, null, 2));
    }
    return;
  }

  const results = await pool(STREAMERS, CONCURRENCY, check);
  const live = results.filter((r) => r.live).map(({ name, id, videoId, title }) => ({ name, id, videoId, title }));
  const failed = results.filter((r) => !r.ok).length;

  res.setHeader('Cache-Control', 'public, s-maxage=45, stale-while-revalidate=120');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.status(200).send(JSON.stringify({
    updated: new Date().toISOString(),
    total: STREAMERS.length,
    failed,
    live
  }));
};
