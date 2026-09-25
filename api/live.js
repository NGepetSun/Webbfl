/* Vercel serverless function: GET /api/live
   Mengecek tiap channel di streamers.json lewat halaman /channel/ID/live.
   Kalau channel sedang live, YouTube mengarahkan halaman itu ke video live-nya.

   CATATAN PERBAIKAN:
   Versi lama menganggap channel "live" hanya dengan mencari teks
   `"isLive":true` di sembarang tempat pada HTML. Masalahnya field itu juga
   muncul untuk video yang cuma "jadwal" (premiere/scheduled yang belum
   mulai) dan bisa ke-cocok ke data video LAIN yang ikut ter-render di
   halaman (rekomendasi, next-up, dll), bukan video utama channel tsb.
   Akibatnya: channel yang baru bikin jadwal live ikut muncul sebagai
   "LIVE", sementara channel yang beneran sedang live kadang tidak
   terdeteksi.

   Perbaikan: ambil objek JSON `ytInitialPlayerResponse` yang tertanam di
   halaman (data resmi video utama), lalu cek status dari situ:
   - microformat.playerMicroformatRenderer.liveBroadcastDetails.isLiveNow
     -> ini flag paling akurat, true HANYA saat siaran sedang berlangsung
        (false untuk jadwal yang belum mulai maupun yang sudah selesai).
   - fallback: videoDetails.isLive === true DAN playabilityStatus.status
     === "OK" (video benar-benar bisa diputar sekarang, bukan halaman
     countdown jadwal). */
const STREAMERS = require('../streamers.json');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const CONCURRENCY = 10;
const TIMEOUT_MS = 9000;
const RETRIES = 1;

/* Ambil objek JSON `var NAMA = {...};` dari HTML dengan menghitung
   pasangan kurung kurawal (aman terhadap tanda kutip/escape di dalam
   string), karena regex biasa gampang salah potong pada JSON sebesar ini. */
function extractJson(html, varName) {
  const markers = [`var ${varName} = `, `window["${varName}"] = `, `${varName} = `];
  let start = -1;
  for (const m of markers) {
    const i = html.indexOf(m);
    if (i !== -1) { start = i + m.length; break; }
  }
  if (start === -1) return null;

  let depth = 0, inStr = false, esc = false, end = -1;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
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
      if (depth === 0) { end = i + 1; break; }
    }
  }
  if (end === -1) return null;
  try { return JSON.parse(html.slice(start, end)); } catch { return null; }
}

async function fetchLivePage(id, signal) {
  const res = await fetch(`https://www.youtube.com/channel/${id}/live`, {
    redirect: 'follow',
    signal,
    headers: {
      'user-agent': UA,
      'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
      cookie: 'CONSENT=YES+1; SOCS=CAI'
    }
  });
  if (!res.ok) throw new Error('bad status ' + res.status);
  return res.text();
}

async function checkOnce(s) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const html = await fetchLivePage(s.id, ctrl.signal);

    const playerResponse = extractJson(html, 'ytInitialPlayerResponse');
    if (!playerResponse) return { ...s, ok: true, live: false };

    const details = playerResponse.videoDetails || {};
    const status = playerResponse.playabilityStatus || {};
    const microformat = playerResponse.microformat && playerResponse.microformat.playerMicroformatRenderer;
    const liveDetails = microformat ? microformat.liveBroadcastDetails : null;

    const videoId = details.videoId || '';

    // Sinyal paling akurat: isLiveNow. Kalau tidak tersedia, fallback ke
    // kombinasi isLive + status "OK" (video benar-benar playable sekarang,
    // bukan halaman jadwal/countdown).
    const isLiveNow = liveDetails
      ? Boolean(liveDetails.isLiveNow)
      : Boolean(details.isLive) && status.status === 'OK';

    if (!videoId || !isLiveNow) return { ...s, ok: true, live: false };

    return { ...s, ok: true, live: true, videoId, title: details.title || '' };
  } catch (e) {
    throw e;
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
  const debugId = url.searchParams.get('debug');
  const debugInnertube = url.searchParams.get('debugInnertube');

  if (debugInnertube) {
    // Mode diagnostik #2: coba lewat API internal (InnerTube) YouTube dengan
    // menyamar sebagai aplikasi Android, alih-alih scraping halaman web biasa.
    // Endpoint "browse" tab Home channel biasanya menonjolkan siaran yang
    // sedang berlangsung lewat channelFeaturedContentRenderer / badge LIVE.
    const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const r = await fetch(`https://www.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}`, {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'content-type': 'application/json',
          'user-agent': 'com.google.android.youtube/19.09.37 (Linux; U; Android 13) gzip',
          'x-youtube-client-name': '3',
          'x-youtube-client-version': '19.09.37'
        },
        body: JSON.stringify({
          context: { client: { clientName: 'ANDROID', clientVersion: '19.09.37', androidSdkVersion: 33, hl: 'en', gl: 'US' } },
          browseId: debugInnertube
        })
      });
      clearTimeout(timer);
      const text = await r.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      const hasLiveBadge = /"style"\s*:\s*"LIVE"|"text"\s*:\s*"LIVE NOW"|isLiveNow/i.test(text);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify({
        requestedId: debugInnertube,
        httpStatus: r.status,
        textLength: text.length,
        parsedOk: Boolean(json),
        topLevelKeys: json ? Object.keys(json) : [],
        hasErrorField: json ? Boolean(json.error) : null,
        errorMessage: json && json.error ? json.error.message : null,
        hasLiveBadgeGuess: hasLiveBadge,
        snippet: text.slice(0, 500)
      }, null, 2));
    } catch (e) {
      res.status(200).send(JSON.stringify({ requestedId: debugInnertube, error: String(e.message || e) }, null, 2));
    }
    return;
  }

  if (debugId) {
    // Mode diagnostik: cek SATU channel dan tampilkan apa yang sebenarnya
    // diterima dari YouTube, supaya ketahuan kalau responsnya diblokir/
    // dialihkan ke halaman consent/captcha alih-alih halaman live asli.
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
      const r = await fetch(`https://www.youtube.com/channel/${debugId}/live`, {
        redirect: 'follow',
        signal: ctrl.signal,
        headers: {
          'user-agent': UA,
          'accept-language': 'id-ID,id;q=0.9,en;q=0.8',
          cookie: 'CONSENT=YES+1; SOCS=CAI'
        }
      });
      clearTimeout(timer);
      const html = await r.text();
      const playerResponse = extractJson(html, 'ytInitialPlayerResponse');
      const details = playerResponse && playerResponse.videoDetails;
      const status = playerResponse && playerResponse.playabilityStatus;
      const microformat = playerResponse && playerResponse.microformat && playerResponse.microformat.playerMicroformatRenderer;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(200).send(JSON.stringify({
        requestedId: debugId,
        finalUrl: r.url,
        httpStatus: r.status,
        htmlLength: html.length,
        looksLikeConsentWall: html.includes('consent.youtube.com') || html.includes('Before you continue'),
        looksLikeUnusualTraffic: html.includes('unusual traffic') || html.includes('/sorry/'),
        foundPlayerResponse: Boolean(playerResponse),
        playerResponseKeys: playerResponse ? Object.keys(playerResponse) : [],
        playabilityStatus_status: status ? status.status : null,
        playabilityStatus_reason: status ? status.reason : null,
        videoId: details ? details.videoId : null,
        videoTitle: details ? details.title : null,
        isLive_fromVideoDetails: details ? Boolean(details.isLive) : null,
        isLiveNow_fromMicroformat: microformat && microformat.liveBroadcastDetails ? Boolean(microformat.liveBroadcastDetails.isLiveNow) : null,
        htmlSnippet: html.slice(0, 600)
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
