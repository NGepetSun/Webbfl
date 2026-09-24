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

  const row = (name) => {
    const isRest = REST_NAMES.has(name);
    return `<div class="member-row"><span class="status-dot ${isRest ? "rest" : ""}"></span>` +
      `<div class="member-name">${esc(name)}<span>• SETOR</span></div>` +
      `<span class="badge ${isRest ? "rest" : ""}">${isRest ? "REHAT" : "AKTIF"}</span></div>`;
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
      html += `<div class="group"><div class="group-title"><span>${g.group}</span><small>${list.length} anggota</small></div>${list.map(row).join("")}</div>`;
    }
    groupsEl.innerHTML = html || `<div class="none">Tidak ada member yang cocok.</div>`;
    $("shown").textContent = shown;
  }

  let t;
  searchEl.addEventListener("input", () => { clearTimeout(t); t = setTimeout(render, 120); });
  divisionEl.addEventListener("change", render);
  statusEl.addEventListener("change", render);
  $("recruit").addEventListener("click", () => window.showToast && window.showToast("Fitur rekrut belum tersedia."));
  render();
})();
