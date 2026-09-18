const data = [
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

const restNames = new Set(["BOPENG D LIBRA","CANDE KIAWAN"]);
const groupsEl = document.getElementById("groups");
const searchEl = document.getElementById("search");
const divisionEl = document.getElementById("division");
const statusEl = document.getElementById("status");

function memberRow(name){
  const rest = restNames.has(name);
  return `<div class="member-row" data-name="${name.toLowerCase()}">
    <span class="status-dot ${rest ? "rest" : ""}"></span>
    <div class="member-name">${name}<span>• SETOR</span></div>
    <div class="member-right"><span class="badge ${rest ? "rest" : ""}">${rest ? "REHAT" : "AKTIF"}</span></div>
  </div>`;
}

function render(){
  const q = searchEl.value.trim().toLowerCase();
  const div = divisionEl.value;
  const status = statusEl.value;
  let shown = 0;

  groupsEl.innerHTML = data.map(g => {
    if(div !== "all" && div !== ({
      "COMMANDER":"commander","UNDER OG":"under","PJ BISNIS":"business","HOODPRESS":"member","MEMBER":"member"
    })[g.group]) return "";
    const members = g.members.filter(name => {
      const matchName = !q || name.toLowerCase().includes(q);
      const isRest = restNames.has(name);
      const matchStatus = status === "all" || (status === "rest" ? isRest : !isRest);
      return matchName && matchStatus;
    });
    if(!members.length) return "";
    shown += members.length;
    return `<div class="group"><div class="group-title"><span>${g.group}</span><small>${members.length} anggota</small></div>${members.map(memberRow).join("")}</div>`;
  }).join("");

  document.getElementById("shown").textContent = shown;
}
[searchEl,divisionEl,statusEl].forEach(el => el.addEventListener("input",render));
render();
