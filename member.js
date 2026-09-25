const MEMBER_DATA = [
  {group:"COMMANDER", members:["MATTHEW B WELLINGTON","NATHAN D CASTILLO"]},
  {group:"UNDER OG", members:["ASEP OGYN","JEIXY T LIBRA","KEVIN LIBRA"]},
  {group:"PJ BISNIS", members:["ABIGEL D LIBRA","GAMAS SUDIRO","KUROME NEGAMI","MASH JACK","NOAHAHAY","RURU WANSUW"]},
  {group:"HOODPRESS", members:["EKO D LIBRA","LILIANA SALVADORA"]},
  {group:"MEMBER", members:[
    "AHMAD KUYZIN","ALBERTO FORLAN","Alex De Lucas","Alexandria Pradipta","AMAT HINAMORI",
    "ARLECHINO | ORCHID","Ashley C Berlingham","BENGBENG","BERYL O DHE","BIMA ALVAREZ",
    "Blek Blekki","BOPENG D LIBRA","BOWIE FR","CANDE KIAWAN","Cikko F Libra","CIPUNGG",
    "CLAY ZHANG","DARKO LIBRA","DEAN LIBRA","DION","DREX","EL PRESIDENTE","FELIX","FIRMAN",
    "GIO","HENRY","JAY","KAYZEN","KENZO","LUX","MARCEL","NANDO","RAFA","REX","RIZKY","RYAN"
  ]}
];
const REST_NAMES = new Set(["BOPENG D LIBRA","CANDE KIAWAN"]);

(() => {
  const $ = (id) => document.getElementById(id);
  const groupsEl = $("groups"), searchEl = $("search"), divisionEl = $("division"), statusEl = $("status");
  const esc = (s) => s.replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

  const all = MEMBER_DATA.reduce((n, g) => n + g.members.length, 0);
  const rest = MEMBER_DATA.reduce((n, g) => n + g.members.filter(m => REST_NAMES.has(m)).length, 0);
  const active = all - rest;
  const ratio = all ? Math.round(active / all * 100) : 0;
  $("total").textContent = all;
  $("active").textContent = active;
  $("rest").textContent = rest;
  $("ratio").textContent = ratio + "%";
  $("progress").style.width = ratio + "%";
  $("all").textContent = all;

  const initials = (name) => {
    const parts = name.replace(/[^A-Za-z ]/g, " ").trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return "?";
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  };

  const card = (name, group) => {
    const isRest = REST_NAMES.has(name);
    return `<div class="member-card">` +
      `<div class="avatar ${isRest ? "rest" : ""}"><span>${esc(initials(name))}</span><i class="status-dot ${isRest ? "rest" : ""}"></i></div>` +
      `<div class="card-name">${esc(name)}</div>` +
      `<div class="card-role">${esc(group)}</div>` +
      `</div>`;
  };

  function render(){
    const q = searchEl.value.trim().toLowerCase();
    const div = divisionEl.value, st = statusEl.value;
    let shown = 0, html = "";
    for (const g of MEMBER_DATA) {
      if (div !== "all" && div !== g.group) continue;
      const list = g.members.filter(n =>
        (!q || n.toLowerCase().includes(q)) &&
        (st === "all" || (st === "rest") === REST_NAMES.has(n)));
      if (!list.length) continue;
      shown += list.length;
      html += `<div class="group"><div class="group-title"><span>${g.group}</span><small>${list.length} anggota</small></div>` +
        `<div class="group-grid">${list.map(n => card(n, g.group)).join("")}</div></div>`;
    }
    groupsEl.innerHTML = html || `<div class="none">Tidak ada member yang cocok.</div>`;
    $("shown").textContent = shown;
  }

  let t;
  searchEl.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });
  divisionEl.addEventListener("change", render);
  statusEl.addEventListener("change", render);
  $("recruit").addEventListener("click", () => window.showToast && window.showToast("Fitur rekrut belum tersedia."));

  /* ---------- 3D tilt di kartu member (hover = miring ikut kursor, tekan = pop) ---------- */
  const TILT_MAX = 16;
  function tiltFor(card, clientX, clientY, pressed){
    const r = card.getBoundingClientRect();
    const px = (clientX - r.left) / r.width;   // 0..1
    const py = (clientY - r.top) / r.height;   // 0..1
    const rotY = (px - 0.5) * TILT_MAX * 2;
    const rotX = (0.5 - py) * TILT_MAX * 2;
    const scale = pressed ? 0.93 : 1.05;
    const lift = pressed ? -2 : -8;
    card.style.transform = `perspective(700px) rotateX(${rotX}deg) rotateY(${rotY}deg) translateY(${lift}px) scale(${scale})`;
  }
  function resetTilt(card){
    card.style.transform = "";
    card.classList.remove("hovered", "pressed");
  }
  groupsEl.addEventListener("pointerenter", (e) => {
    const card = e.target.closest(".member-card");
    if (card) card.classList.add("hovered");
  }, true);
  groupsEl.addEventListener("pointerleave", (e) => {
    const card = e.target.closest(".member-card");
    if (card) resetTilt(card);
  }, true);
  groupsEl.addEventListener("pointermove", (e) => {
    const card = e.target.closest(".member-card");
    if (!card || e.pointerType === "touch") return;
    tiltFor(card, e.clientX, e.clientY, card.classList.contains("pressed"));
  });
  groupsEl.addEventListener("pointerdown", (e) => {
    const card = e.target.closest(".member-card");
    if (!card) return;
    card.classList.add("pressed");
    tiltFor(card, e.clientX, e.clientY, true);
  });
  const releasePress = (e) => {
    const card = e.target && e.target.closest ? e.target.closest(".member-card") : null;
    groupsEl.querySelectorAll(".member-card.pressed").forEach(c => {
      c.classList.remove("pressed");
      if (c === card && c.classList.contains("hovered")) tiltFor(c, e.clientX, e.clientY, false);
      else resetTilt(c);
    });
  };
  groupsEl.addEventListener("pointerup", releasePress);
  groupsEl.addEventListener("pointercancel", releasePress);

  render();
})();
