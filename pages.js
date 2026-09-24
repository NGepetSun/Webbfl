(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  /* ---------- LIVE ---------- */
  const L = SITE.live;
  const yt = $("ytChannel");
  if (L.channelUrl) { yt.href = L.channelUrl; yt.removeAttribute("data-action"); }
  const player = $("player");
  if (L.videoId) {
    // Facade: iframe YouTube baru dimuat saat diklik, jadi halaman tetap ringan.
    player.innerHTML = `<button class="play" type="button" aria-label="Putar video">
      <img src="https://i.ytimg.com/vi/${esc(L.videoId)}/hqdefault.jpg" alt="" loading="lazy">
      <span class="play-btn"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span></button>`;
    player.firstElementChild.addEventListener("click", () => {
      player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(L.videoId)}?autoplay=1&rel=0" title="Live stream MFL" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
    });
  } else {
    player.innerHTML = `<div class="offline"><img src="assets/logo.webp" alt="" width="120" height="155"><b>OFFLINE</b><span>Belum ada siaran. Cek jadwal di samping.</span></div>`;
  }
  $("liveStatus").className = "status " + (L.isLive ? "on" : "off");
  $("liveStatus").textContent = L.isLive ? "LIVE" : "OFFLINE";
  $("liveTitle").textContent = L.title;
  $("scheduleList").innerHTML = L.schedule.length
    ? L.schedule.map(s => `<div class="sch"><div class="sch-day"><b>${esc(s.day)}</b><small>${esc(s.date || "")}</small></div><div><strong>${esc(s.title)}</strong><span>${esc(s.time)}</span></div></div>`).join("")
    : `<div class="none">Jadwal belum tersedia.</div>`;

  /* ---------- GALLERY ---------- */
  const items = SITE.gallery;
  const cats = ["Semua", ...new Set(items.map(i => i.cat).filter(Boolean))];
  let cat = "Semua", visible = [], cur = 0;
  const grid = $("galleryGrid"), lb = $("lightbox");

  function renderGallery() {
    visible = items.filter(i => cat === "Semua" || i.cat === cat);
    $("chips").innerHTML = cats.map(c => `<button type="button" class="chip${c === cat ? " active" : ""}" data-cat="${esc(c)}">${esc(c)}</button>`).join("");
    grid.innerHTML = visible.length ? visible.map((it, i) => `
      <figure class="tile${it.src ? "" : " ph"}" data-i="${i}" ${it.src ? 'tabindex="0" role="button"' : ""}>
        ${it.src ? `<img src="${esc(it.src)}" alt="${esc(it.title)}" loading="lazy" decoding="async">` : `<img class="wm" src="assets/logo.webp" alt="" loading="lazy">`}
        <figcaption><span>${esc(it.cat || "")}</span>${esc(it.title)}</figcaption>
      </figure>`).join("") : `<div class="none">Galeri masih kosong.</div>`;
  }
  $("chips").addEventListener("click", e => { const b = e.target.closest(".chip"); if (b) { cat = b.dataset.cat; renderGallery(); } });
  function open(i) {
    const withImg = visible.filter(v => v.src);
    cur = withImg.indexOf(visible[i]);
    show(withImg); if (!lb.open) lb.showModal();
  }
  function show(list) {
    const it = list[(cur + list.length) % list.length]; cur = list.indexOf(it);
    $("lbImg").src = it.src; $("lbImg").alt = it.title; $("lbCap").textContent = it.title;
  }
  const step = (d) => { const l = visible.filter(v => v.src); cur += d; show(l); };
  grid.addEventListener("click", e => { const t = e.target.closest(".tile"); if (t && !t.classList.contains("ph")) open(+t.dataset.i); });
  grid.addEventListener("keydown", e => { if (e.key === "Enter") { const t = e.target.closest(".tile"); if (t && !t.classList.contains("ph")) open(+t.dataset.i); } });
  $("lbClose").onclick = () => lb.close();
  $("lbPrev").onclick = () => step(-1);
  $("lbNext").onclick = () => step(1);
  lb.addEventListener("click", e => { if (e.target === lb) lb.close(); });
  lb.addEventListener("keydown", e => { if (e.key === "ArrowLeft") step(-1); if (e.key === "ArrowRight") step(1); });
  renderGallery();

  /* ---------- HISTORY ---------- */
  $("timeline").innerHTML = SITE.history.map(h => `
    <li><span class="node"></span><div class="card"><small>${esc(h.year)}</small><h3>${esc(h.title)}</h3><p>${esc(h.text)}</p></div></li>`).join("");
})();
