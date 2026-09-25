/* Vercel serverless function: GET /api/live
   Mengecek tiap channel di streamers.json lewat halaman /channel/ID/live.
   Kalau channel sedang live, YouTube mengarahkan halaman itu ke video live-nya. */
const STREAMERS = require('../streamers.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 16;
const TIMEOUT_MS = 6000;

const decode = (s) => s
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>');

async function check(s) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`https://www.youtube.com/channel/${s.id}/live`, {
      redirect: 'follow',
      signal: ctrl.signal,
      headers: {
        'user-agent': UA,
        'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
        cookie: 'CONSENT=YES+1; SOCS=CAI'
      }
    });
    if (!res.ok) return { ...s, ok: false, live: false };
    const html = await res.text();

    const fromUrl = res.url.match(/[?&]v=([\w-]{11})/);
    const fromCanonical = html.match(/<link rel="canonical" href="https:\/\/www\.youtube\.com\/watch\?v=([\w-]{11})"/);
    const videoId = (fromUrl || fromCanonical || [])[1] || '';
    // Jadwal/premiere yang belum mulai tidak punya "isLive":true
    const live = Boolean(videoId) && /"isLive":true/.test(html);
    if (!live) return { ...s, ok: true, live: false };

    const t = html.match(/<meta property="og:title" content="([^"]*)"/);
    return { ...s, ok: true, live: true, videoId, title: t ? decode(t[1]) : '' };
  } catch (e) {
    return { ...s, ok: false, live: false };
  } finally {
    clearTimeout(timer);
  }
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
