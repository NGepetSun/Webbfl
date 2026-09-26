(() => {
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  /* ---------- LIVE (menampilkan streamer yang sedang live, bukan jadwal) ---------- */
  (() => {
    const player = $("player"), listEl = $("liveList");
    const homeLive = $("homeLive"), homeRec = $("homeRec"), homeCount = $("homeLiveCount"), homeNames = $("homeLiveNames");
    const countEl = $("liveCount"), updatedEl = $("liveUpdated");
    const offCountEl = $("offCount"), offListEl = $("offList");
    const refreshBtn = $("liveRefresh");
    const statusEl = $("liveStatus"), titleEl = $("liveTitle"), whoEl = $("liveWho"), openEl = $("liveOpen");
    const singleMeta = $("singleMeta"), multiMeta = $("multiMeta"), multiCountEl = $("multiCount");
    const multiGrid = $("multiGrid");
    const multiOpenBtn = $("multiOpen"), multiEditBtn = $("multiEdit"), multiExitBtn = $("multiExit");
    const multiDialog = $("multiDialog"), multiClose = $("multiClose"), multiSizeOpts = $("multiSizeOpts");
    const multiPick = $("multiPick"), multiStart = $("multiStart"), multiPickHint = $("multiPickHint");
    if (!player) return; // halaman Live tidak ada di DOM ini

    let data = null, selected = null;

    /* ---------- MULTIWATCH ---------- */
    let multiActive = false;      // sedang menampilkan grid multiwatch?
    let multiSize = 4;            // 2 / 4 / 6
    let multiIds = [];            // id channel yang dipilih, urut sesuai slot

    function currentLive() {
      return (data && data.live) || [];
    }

    function multiCellFacade(cell, item) {
      cell.innerHTML = `
        <span class="cell-label">${esc(item.name)}</span>
        <button class="play" type="button" aria-label="Putar live ${esc(item.name)}">
          <img src="https://i.ytimg.com/vi/${esc(item.videoId)}/mqdefault.jpg" alt="" loading="lazy">
          <span class="play-btn"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span>
        </button>`;
      cell.querySelector(".play").addEventListener("click", () => {
        cell.innerHTML = `<span class="cell-label">${esc(item.name)}</span>
          <iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?autoplay=1&rel=0" title="Live ${esc(item.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      });
    }

    function renderMultiGrid() {
      const liveList = currentLive();
      const byId = new Map(liveList.map(l => [l.id, l]));
      multiGrid.dataset.size = String(multiSize);
      multiGrid.innerHTML = "";
      for (let i = 0; i < multiSize; i++) {
        const cell = document.createElement("div");
        cell.className = "multi-cell";
        const chId = multiIds[i];
        const item = chId ? byId.get(chId) : null;
        if (item) {
          multiCellFacade(cell, item);
        } else {
          cell.classList.add("empty");
          cell.textContent = chId ? "Channel ini sudah tidak live" : "Slot kosong";
        }
        multiGrid.appendChild(cell);
      }
      multiCountEl.textContent = multiIds.filter(id => byId.has(id)).length + " / " + multiSize + " layar aktif";
    }

    function enterMultiwatch() {
      multiActive = true;
      player.hidden = true;
      singleMeta.hidden = true;
      multiGrid.hidden = false;
      multiMeta.hidden = false;
      renderMultiGrid();
    }

    function exitMultiwatch() {
      multiActive = false;
      multiGrid.hidden = true;
      multiMeta.hidden = true;
      player.hidden = false;
      singleMeta.hidden = false;
      if (selected) select(selected); else if (currentLive().length) select(currentLive()[0]);
    }

    function setMultiSize(n) {
      multiSize = n;
      [...multiSizeOpts.children].forEach(b => b.classList.toggle("active", Number(b.dataset.size) === n));
      if (multiIds.length > n) multiIds = multiIds.slice(0, n);
      renderPickList();
    }

    function renderPickList() {
      const liveList = currentLive();
      if (!liveList.length) {
        multiPick.innerHTML = `<div class="none">Belum ada yang live untuk dipilih.</div>`;
        multiStart.disabled = true;
        return;
      }
      const pickedSet = new Set(multiIds);
      multiPick.innerHTML = liveList.map(it => {
        const checked = pickedSet.has(it.id);
        const atLimit = !checked && pickedSet.size >= multiSize;
        return `<label class="${atLimit ? "disabled" : ""}">
          <input type="checkbox" value="${esc(it.id)}" ${checked ? "checked" : ""} ${atLimit ? "disabled" : ""}>
          <span>${esc(it.name)}${it.title ? ` <span style="color:var(--muted)">— ${esc(it.title)}</span>` : ""}</span>
        </label>`;
      }).join("");
      multiPick.querySelectorAll("input").forEach(inp => {
        inp.addEventListener("change", () => {
          if (inp.checked) {
            if (!multiIds.includes(inp.value)) multiIds.push(inp.value);
          } else {
            multiIds = multiIds.filter(id => id !== inp.value);
          }
          renderPickList();
        });
      });
      multiPickHint.textContent = `${pickedSet.size} / ${multiSize} dipilih`;
      multiStart.disabled = pickedSet.size === 0;
    }

    function openMultiDialog() {
      renderPickList();
      multiDialog.showModal();
    }

    multiOpenBtn.addEventListener("click", openMultiDialog);
    multiEditBtn.addEventListener("click", openMultiDialog);
    multiClose.addEventListener("click", () => multiDialog.close());
    multiDialog.addEventListener("click", (e) => { if (e.target === multiDialog) multiDialog.close(); });
    multiSizeOpts.addEventListener("click", (e) => {
      const b = e.target.closest(".chip");
      if (b) setMultiSize(Number(b.dataset.size));
    });
    multiStart.addEventListener("click", () => {
      multiDialog.close();
      enterMultiwatch();
    });
    multiExitBtn.addEventListener("click", exitMultiwatch);
    setMultiSize(multiSize);

    const fmtTime = (iso) => {
      try { return new Date(iso).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" }); }
      catch { return ""; }
    };

    function playFacade(item) {
      player.innerHTML = `<button class="play" type="button" aria-label="Putar live ${esc(item.name)}">
        <img src="https://i.ytimg.com/vi/${esc(item.videoId)}/hqdefault.jpg" alt="" loading="lazy">
        <span class="play-btn"><svg viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span></button>`;
      player.firstElementChild.addEventListener("click", () => {
        player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(item.videoId)}?autoplay=1&rel=0" title="Live ${esc(item.name)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
      });
    }

    function showOffline(msg) {
      player.innerHTML = `<div class="offline"><img src="assets/logo.webp" alt="" width="96" height="124"><b>TIDAK ADA YANG LIVE</b><span>${esc(msg || "Belum ada streamer MFL yang siaran saat ini.")}</span></div>`;
      statusEl.className = "status off"; statusEl.textContent = "OFFLINE";
      titleEl.textContent = ""; whoEl.textContent = ""; openEl.hidden = true;
    }

    function select(item) {
      selected = item;
      playFacade(item);
      statusEl.className = "status on"; statusEl.textContent = "LIVE";
      titleEl.textContent = item.title || "(tanpa judul)";
      whoEl.textContent = "oleh " + item.name;
      openEl.hidden = false;
      openEl.href = `https://www.youtube.com/watch?v=${encodeURIComponent(item.videoId)}`;
      [...listEl.children].forEach(el => el.classList.toggle("active", el.dataset.id === item.id));
    }

    function render() {
      const liveList = (data && data.live) || [];
      countEl.textContent = liveList.length;

      listEl.innerHTML = liveList.length ? liveList.map(it => `
        <button type="button" class="live-item" data-id="${esc(it.id)}">
          <span class="thumb"><img src="https://i.ytimg.com/vi/${esc(it.videoId)}/mqdefault.jpg" alt="" loading="lazy"></span>
          <span class="info"><span class="nm">${esc(it.name)}</span><span class="tt">${esc(it.title || "")}</span></span>
        </button>`).join("") : `<div class="none">Belum ada yang live.</div>`;

      listEl.querySelectorAll(".live-item").forEach(el => {
        el.addEventListener("click", () => {
          const it = liveList.find(l => l.id === el.dataset.id);
          if (it) select(it);
        });
      });

      if (multiActive) {
        renderMultiGrid();
      } else if (liveList.length) {
        const keep = selected && liveList.find(l => l.id === selected.id);
        select(keep || liveList[0]);
      } else {
        selected = null;
        showOffline();
      }

      const liveIds = new Set(liveList.map(l => l.id));
      const offline = (typeof STREAMERS !== "undefined" ? STREAMERS : []).filter(s => !liveIds.has(s.id));
      offCountEl.textContent = offline.length;
      offListEl.innerHTML = offline.map(s =>
        `<a href="https://www.youtube.com/channel/${esc(s.id)}" target="_blank" rel="noopener noreferrer">${esc(s.name)}</a>`).join("");

      updatedEl.textContent = data
        ? "Diperbarui " + fmtTime(data.updated) + (data.failed ? ` · ${data.failed} channel gagal dicek` : "")
        : "";

      /* ringkasan di Home */
      if (homeLive) {
        if (liveList.length) {
          homeLive.hidden = false; homeRec.hidden = false;
          homeCount.textContent = liveList.length + " LIVE";
          homeNames.textContent = liveList.slice(0, 3).map(l => l.name).join(", ") + (liveList.length > 3 ? ", ..." : "");
        } else {
          homeLive.hidden = true;
        }
      }
    }

    let loading = false;
    async function load() {
      if (loading) return;
      loading = true;
      if (!data) updatedEl.textContent = "Memeriksa channel...";
      else updatedEl.textContent = "Memperbarui status live...";
      try {
        const res = await fetch("/api/live", { cache: "no-store" });
        if (!res.ok) throw new Error("HTTP " + res.status);
        const next = await res.json();
        if (!next || !Array.isArray(next.live)) throw new Error("payload live tidak valid");
        data = next;
        render();
      } catch (e) {
        if (data) {
          updatedEl.textContent = "Koneksi YouTube bermasalah · menampilkan data terakhir yang valid";
        } else {
          listEl.innerHTML = `<div class="none">Status live belum bisa diperiksa. Coba lagi beberapa saat.</div>`;
          showOffline("Monitor sedang menghubungkan ke YouTube.");
          updatedEl.textContent = "Belum ada data live yang berhasil diambil.";
          offCountEl.textContent = "0";
          offListEl.innerHTML = "";
        }
      } finally {
        loading = false;
      }
    }

    refreshBtn.addEventListener("click", load);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) load(); });
    load();
    setInterval(() => { if (!document.hidden) load(); }, 60000);
  })();

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
