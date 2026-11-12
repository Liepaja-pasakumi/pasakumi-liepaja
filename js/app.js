/* =========================================================
   Pasākumi Liepājā – lapas loģika
   ========================================================= */

/* ---------- 1. Datu ielāde no Supabase ----------
   Publishable atslēga ir PUBLISKA (to drīkst likt lapā) – tā ļauj tikai lasīt
   apstiprinātos pasākumus. Slepeno (secret) atslēgu šeit NEKAD neliek! */
const SUPABASE_URL = "https://vajibazlcehbalkrkqfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_0FCc4zYqkBgw3rG2qIqZ3A_bNk66EF3";
const SAVED_KEY = "pasakumi-saglabatie";

// Kur dati nākuši: "supabase", "saglabatie" (bez interneta) vai "demo"
let dataSource = "supabase";

async function loadEvents() {
  // Ielādē pasākumus no 60 dienām atpakaļ un visus nākamos
  const d = new Date();
  d.setDate(d.getDate() - 60);
  const from = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const url = SUPABASE_URL + "/rest/v1/public_events?select=*" +
    "&or=(date.gte." + from + ",end_date.gte." + from + ")&order=date,time";
  try {
    const res = await fetch(url, { headers: { apikey: SUPABASE_KEY } });
    if (!res.ok) throw new Error("Supabase atbilde " + res.status);
    const rows = await res.json();
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(rows)); } catch (e) {}
    dataSource = "supabase";
    return rows;
  } catch (err) {
    console.warn("Neizdevās ielādēt no Supabase:", err);
    try {
      const saved = JSON.parse(localStorage.getItem(SAVED_KEY));
      if (Array.isArray(saved)) { dataSource = "saglabatie"; return saved; }
    } catch (e) {}
    dataSource = "demo";
    return window.DEMO_EVENTS || [];
  }
}

/* ---------- 2. Palīgi datumiem ---------- */
const MONTHS = ["janvāris", "februāris", "marts", "aprīlis", "maijs", "jūnijs",
  "jūlijs", "augusts", "septembris", "oktobris", "novembris", "decembris"];
const WEEKDAYS = ["svētdiena", "pirmdiena", "otrdiena", "trešdiena",
  "ceturtdiena", "piektdiena", "sestdiena"];

function toKey(d) {                       // Date -> "2026-11-11"
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}
function fromKey(key) {                   // "2026-11-11" -> Date
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}
function todayKey() { return toKey(new Date()); }

function niceDate(key) {                  // "trešdiena, 11. novembris"
  const d = fromKey(key);
  return WEEKDAYS[d.getDay()] + ", " + d.getDate() + ". " + MONTHS[d.getMonth()];
}
function shortDate(key) {                 // "11.11.2026."
  const d = fromKey(key);
  return String(d.getDate()).padStart(2, "0") + "." +
    String(d.getMonth() + 1).padStart(2, "0") + "." + d.getFullYear() + ".";
}
function monthName(key) {                 // "Novembris 2026"
  const d = fromKey(key);
  const m = MONTHS[d.getMonth()];
  return m[0].toUpperCase() + m.slice(1) + " " + d.getFullYear();
}
function monthStart(key) { return key.slice(0, 8) + "01"; }
function monthEnd(key) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + 1, 0));
}
function addMonths(key, n) {
  const d = fromKey(key);
  return toKey(new Date(d.getFullYear(), d.getMonth() + n, 1));
}
const maxKey = (a, b) => (a > b ? a : b);
const capital = s => s.charAt(0).toUpperCase() + s.slice(1);

/* ---------- 3. Stāvoklis (kas šobrīd izvēlēts) ---------- */
const state = {
  events: [],
  view: "day",              // "day" = viena diena, "month" = viss mēnesis
  date: todayKey(),         // izvēlētā diena (mēneša skatā – jebkura diena tajā mēnesī)
  cats: new Set(),          // tukšs = visas kategorijas
  query: "",
  calMonth: null            // kurš mēnesis atvērts kalendāra logā
};

const CAT_NAMES = { sports: "Sports", kultura: "Kultūra", berniem: "Bērniem", citi: "Citi" };
const CAT_ICONS = { sports: "🏅", kultura: "🎭", berniem: "🧸", citi: "✨" };

// Pareizā ikona pēc sporta veida nosaukumā (lai basketbolam nav futbola bumba)
const SPORT_ICONS = [
  ["basketbol", "🏀"], ["hokej", "🏒"], ["volejbol", "🏐"], ["futbol", "⚽"],
  ["florbol", "🏑"], ["tenis", "🎾"], ["handbol", "🤾"], ["peldē", "🏊"], ["peldē", "🏊"],
  ["vieglatlēt", "🏃"], ["skrē", "🏃"], ["maraton", "🏃"], ["riteņ", "🚴"], ["velo", "🚴"],
  ["bokss", "🥊"], ["cīņ", "🤼"], ["šah", "♟️"], ["nūjo", "🚶"], ["pārgāj", "🚶"],
  ["burā", "⛵"], ["airē", "🚣"], ["vingro", "🤸"], ["dejo", "💃"]
];
// Citām kategorijām – ikona pēc nosaukuma
const OTHER_ICONS = [
  ["egl", "🎄"], ["ziemassvēt", "🎄"], ["jaungad", "🎆"], ["salaveč", "🎅"],
  ["koncert", "🎵"], ["izrād", "🎭"], ["teātr", "🎭"], ["izstād", "🖼️"],
  ["kino", "🎬"], ["filma", "🎬"], ["tirg", "🛍️"], ["lekcij", "🎓"], ["darbnīc", "🎨"]
];
function eventIcon(ev) {
  const t = (ev.title || "").toLowerCase();
  const list = ev.category === "sports" ? SPORT_ICONS : OTHER_ICONS;
  const hit = list.find(([word]) => t.includes(word));
  return hit ? hit[1] : (CAT_ICONS[ev.category] || "✨");
}
// Svētku pasākumiem – īpašs fons
const isFestive = ev => /egl|ziemassvēt|jaungad|salaveč/i.test(ev.title || "");

/* ---------- 4. Filtrēšana ---------- */
// Noņem garumzīmes, lai "teatris" atrastu arī "teātris"
function plain(text) {
  return (text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
const endOf = ev => ev.end_date || ev.date;
function happensOn(ev, key) { return ev.date <= key && key <= endOf(ev); }
function overlaps(ev, from, to) { return ev.date <= to && endOf(ev) >= from; }

function matchesFilters(ev) {
  if (state.cats.size && !state.cats.has(ev.category)) return false;
  const q = plain(state.query.trim());
  return !q || plain(ev.title + " " + ev.place + " " + (ev.description || "")).includes(q);
}

/* Atgriež pasākumus, sagrupētus pa dienām: [{ date, events: [...] }, ...]
   - meklējot: visi pasākumi no šodienas uz priekšu
   - dienas skatā: tikai izvēlētā diena
   - mēneša skatā: viss mēnesis (šajā mēnesī – no šodienas) */
function groupedEvents() {
  let from, to;
  if (state.query.trim()) {
    from = todayKey(); to = "9999-12-31";
  } else if (state.view === "day") {
    from = to = state.date;
  } else {
    from = maxKey(monthStart(state.date), monthStart(state.date) === monthStart(todayKey()) ? todayKey() : "");
    to = monthEnd(state.date);
  }

  const groups = {};
  state.events
    .filter(ev => overlaps(ev, from, to) && matchesFilters(ev))
    .forEach(ev => {
      const day = maxKey(ev.date, from);        // vairāku dienu pasākums – parādās vienreiz
      (groups[day] = groups[day] || []).push(ev);
    });

  return Object.keys(groups).sort().map(date => ({
    date,
    // Vispirms ar konkrētu laiku, beigās – visas dienas / vairāku dienu
    events: groups[date].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
  }));
}

/* ---------- 5. Zīmēšana ---------- */
// Drošība: teksts no ārpuses nekad netiek ielikts kā HTML
function esc(text) {
  return String(text ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const isMultiDay = ev => ev.end_date && ev.end_date !== ev.date;

function eventCard(ev) {
  const timeText = isMultiDay(ev)
    ? shortDate(ev.date) + " – " + shortDate(ev.end_date)
    : (ev.time || "Visu dienu");
  const mapUrl = "https://www.google.com/maps/search/?api=1&query=" +
    encodeURIComponent(ev.place + ", Liepāja");

  return `
    <article class="event" data-id="${esc(ev.id)}">
      ${ev.image ? `<img class="event-img" src="${esc(ev.image)}" alt="" loading="lazy">` : ""}
      <div class="event-body">
        <div class="event-meta">
          <span class="time">${esc(timeText)}</span>
          <span class="tag tag-${esc(ev.category)}">${eventIcon(ev)} ${esc(CAT_NAMES[ev.category] || "Citi")}</span>
        </div>
        <h3>${esc(ev.title)}</h3>
        <p class="place">📍 ${esc(ev.place)}</p>
        ${ev.price ? `<p class="price">🎟️ ${esc(ev.price)}</p>` : ""}
        ${ev.image && ev.image_credit ? `<small class="credit">Foto: ${esc(ev.image_credit)}</small>` : ""}
        <p class="desc" hidden>${esc(ev.description)}</p>
        <div class="actions">
          ${ev.description ? `<button data-action="desc">ℹ️ Apraksts</button>` : ""}
          <a href="${mapUrl}" target="_blank" rel="noopener">🗺️ Kā nokļūt</a>
          <button data-action="ics">📅 Kalendāram</button>
          <button data-action="share">🔗 Dalīties</button>
          ${ev.url ? `<a class="more" href="${esc(ev.url)}" target="_blank" rel="noopener">Vairāk informācijas / biļetes →</a>` : ""}
        </div>
      </div>
    </article>`;
}

function featuredCard(ev) {
  const dateText = isMultiDay(ev)
    ? shortDate(ev.date) + " – " + shortDate(ev.end_date)
    : shortDate(ev.date) + (ev.time ? " " + ev.time : "");
  return `
    <button class="feat" data-id="${esc(ev.id)}">
      <div class="feat-img cat-${esc(ev.category)}${isFestive(ev) ? " festive" : ""}">
        <span aria-hidden="true">${eventIcon(ev)}</span>
        ${ev.image ? `<img src="${esc(ev.image)}" alt="" loading="lazy">` : ""}
        <span class="feat-date">${esc(dateText)}</span>
      </div>
      <div class="feat-body">
        <p class="place">📍 ${esc(ev.place)}</p>
        <strong>${esc(ev.title)}</strong>
        ${ev.image_credit ? `<small class="credit">Foto: ${esc(ev.image_credit)}</small>` : ""}
      </div>
    </button>`;
}

function renderFeatured() {
  const today = todayKey();
  const list = state.events
    .filter(ev => ev.featured && endOf(ev) >= today)
    .sort((a, b) => maxKey(a.date, today).localeCompare(maxKey(b.date, today)));
  document.getElementById("featuredBox").hidden = list.length === 0;
  document.getElementById("featured").innerHTML = list.map(featuredCard).join("");
}

function render() {
  const isToday = state.date === todayKey();
  const searching = state.query.trim() !== "";
  const thisMonth = monthStart(state.date) === monthStart(todayKey());

  // Skata pogas
  document.querySelectorAll(".viewtoggle button").forEach(b =>
    b.setAttribute("aria-pressed", b.dataset.view === state.view ? "true" : "false"));

  // Datuma josla
  document.getElementById("dateText").textContent =
    state.view === "month" ? monthName(state.date)
    : isToday ? "Šodien, " + fromKey(state.date).getDate() + ". " + MONTHS[fromKey(state.date).getMonth()]
    : niceDate(state.date);
  document.getElementById("prevDay").setAttribute("aria-label",
    state.view === "month" ? "Iepriekšējais mēnesis" : "Iepriekšējā diena");
  document.getElementById("nextDay").setAttribute("aria-label",
    state.view === "month" ? "Nākamais mēnesis" : "Nākamā diena");
  document.getElementById("todayBtn").hidden =
    state.view === "day" ? isToday : thisMonth;

  // Kategoriju pogas + paskaidrojums, kas šobrīd redzams
  document.querySelectorAll(".chip").forEach(btn => {
    btn.setAttribute("aria-pressed", state.cats.has(btn.dataset.cat) ? "true" : "false");
  });
  const catInfo = document.getElementById("catInfo");
  catInfo.hidden = state.cats.size === 0;
  if (state.cats.size) {
    document.getElementById("catInfoText").textContent =
      "Rāda tikai: " + [...state.cats].map(c => CAT_NAMES[c]).join(", ");
  }

  // Izceltie – rāda, kad nemeklē
  renderFeatured();
  if (searching) document.getElementById("featuredBox").hidden = true;

  // Saraksts
  const groups = groupedEvents();
  const count = groups.reduce((n, g) => n + g.events.length, 0);
  const title = document.getElementById("listTitle");
  if (searching) title.textContent = "Meklēšanas rezultāti (" + count + ")";
  else if (state.view === "month") title.textContent = (thisMonth ? "Vēl šomēnes" : monthName(state.date)) + " (" + count + ")";
  else title.textContent = isToday ? "Šodien notiek" : capital(niceDate(state.date));

  const box = document.getElementById("events");
  if (count === 0) {
    const filtered = state.cats.size || searching;
    box.innerHTML = `
      <div class="empty">
        <b>${filtered ? "Nekas neatbilst izvēlei" : state.view === "month" ? "Šajā mēnesī pasākumu nav" : "Šajā dienā pasākumu nav"}</b>
        ${filtered ? "Pamēģini noņemt kādu filtru vai mainīt meklēto vārdu." : "Izvēlies citu datumu kalendārā."}
      </div>`;
    return;
  }
  const showHeads = searching || state.view === "month";
  box.innerHTML = groups.map(g =>
    (showHeads ? `<h3 class="day-head">${esc(g.date === todayKey() ? "Šodien, " + niceDate(g.date) : capital(niceDate(g.date)))}</h3>` : "") +
    g.events.map(eventCard).join("")
  ).join("");
}

/* ---------- 6. Kalendāra logs ---------- */
function renderCalendar() {
  const first = state.calMonth;                        // mēneša 1. datums
  document.getElementById("monthText").textContent =
    MONTHS[first.getMonth()] + " " + first.getFullYear();

  const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7;             // nedēļa sākas ar pirmdienu
  let html = "<span></span>".repeat(offset);
  for (let i = 1; i <= daysInMonth; i++) {
    const key = toKey(new Date(first.getFullYear(), first.getMonth(), i));
    const cls = ["cal-day"];
    if (key === todayKey()) cls.push("is-today");
    if (key === state.date && state.view === "day") cls.push("is-selected");
    if (state.events.some(ev => happensOn(ev, key) && matchesFilters(ev))) cls.push("has-events");
    html += `<button class="${cls.join(" ")}" data-date="${key}" aria-label="${niceDate(key)}">${i}</button>`;
  }
  document.getElementById("calDays").innerHTML = html;
}

function openCalendar() {
  const d = fromKey(state.date);
  state.calMonth = new Date(d.getFullYear(), d.getMonth(), 1);
  renderCalendar();
  document.getElementById("calendar").showModal();
}

function moveMonth(n) {
  state.calMonth = new Date(state.calMonth.getFullYear(), state.calMonth.getMonth() + n, 1);
  renderCalendar();
}

/* ---------- 7. Pogas pie pasākuma ---------- */
function downloadIcs(ev) {
  const d = ev.date.replace(/-/g, "");
  let start, end;
  if (ev.time && !isMultiDay(ev)) {
    const t = ev.time.replace(":", "") + "00";
    start = "DTSTART;TZID=Europe/Riga:" + d + "T" + t;
    const endHour = String(Math.min(23, Number(ev.time.slice(0, 2)) + 2)).padStart(2, "0");
    end = "DTEND;TZID=Europe/Riga:" + d + "T" + endHour + ev.time.slice(3, 5) + "00";
  } else {
    start = "DTSTART;VALUE=DATE:" + d;
    end = "DTEND;VALUE=DATE:" + addDays(endOf(ev), 1).replace(/-/g, "");
  }
  const clean = s => String(s || "").replace(/[\\;,]/g, m => "\\" + m).replace(/\n/g, "\\n");
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Pasakumi Liepaja//LV",
    "BEGIN:VEVENT",
    "UID:" + ev.id + "@pasakumi-liepaja",
    "DTSTAMP:" + new Date().toISOString().replace(/[-:]/g, "").slice(0, 15) + "Z",
    start, end,
    "SUMMARY:" + clean(ev.title),
    "LOCATION:" + clean(ev.place + ", Liepāja"),
    "DESCRIPTION:" + clean(ev.description + (ev.url ? "\n" + ev.url : "")),
    "END:VEVENT", "END:VCALENDAR"
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "pasakums.ics";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

async function shareEvent(ev, btn) {
  const day = maxKey(ev.date, todayKey());
  const text = ev.title + " – " + niceDate(day) + (ev.time ? ", " + ev.time : "") + ", " + ev.place;
  const url = location.origin + location.pathname + "?d=" + day;
  if (navigator.share) {
    try { await navigator.share({ title: ev.title, text, url }); } catch (e) { /* atcelts */ }
  } else {
    try {
      await navigator.clipboard.writeText(text + "\n" + url);
      btn.textContent = "✅ Nokopēts";
      setTimeout(() => (btn.textContent = "🔗 Dalīties"), 1500);
    } catch (e) { prompt("Nokopē šo saiti:", url); }
  }
}

// Izceltā pasākuma klikšķis: atver tā dienu un parāda kartīti
function openEvent(id) {
  const ev = state.events.find(x => x.id === id);
  if (!ev) return;
  state.view = "day";
  state.date = maxKey(ev.date, todayKey());
  state.query = "";
  state.cats.clear();
  document.getElementById("search").value = "";
  render();
  const card = document.querySelector(`.event[data-id="${CSS.escape(id)}"]`);
  if (card) {
    card.scrollIntoView({ behavior: "smooth", block: "center" });
    card.classList.add("flash");
    setTimeout(() => card.classList.remove("flash"), 1600);
  }
}

/* ---------- 8. Pievienot sākuma ekrānam ---------- */
function setupInstall() {
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  if (isInstalled) return;

  const box = document.getElementById("installBox");
  const btn = document.getElementById("installBtn");
  const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent);

  if (isIos) {
    document.getElementById("installText").innerHTML =
      "Pievieno sākuma ekrānam: spied <b>Kopīgot</b> ⬆️ un tad <b>“Pievienot sākuma ekrānam”</b>.";
    box.hidden = false;
  }

  let deferred = null;                    // Android / Chrome
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    box.hidden = false;
    btn.hidden = false;
  });
  btn.addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice;
    deferred = null;
    box.hidden = true;
  });
}

/* ---------- 9. Palaišana ---------- */
async function start() {
  // Ja saitē ir ?d=2026-11-20, atver to dienu (dalīšanās saitēm)
  const fromUrl = new URLSearchParams(location.search).get("d");
  if (fromUrl && /^\d{4}-\d{2}-\d{2}$/.test(fromUrl)) state.date = fromUrl;

  state.events = await loadEvents();
  const note = document.getElementById("demoNote");
  if (dataSource === "supabase") note.hidden = true;
  else {
    note.hidden = false;
    note.innerHTML = dataSource === "saglabatie"
      ? "📴 Nav interneta – rādu pēdējo reizi ielādētos pasākumus."
      : "⚠️ Neizdevās ielādēt pasākumus – rādu <b>parauga pasākumus</b>.";
  }

  // ‹ › – diena vai mēnesis, atkarībā no skata
  document.getElementById("prevDay").onclick = () => {
    state.date = state.view === "month" ? addMonths(state.date, -1) : addDays(state.date, -1);
    render();
  };
  document.getElementById("nextDay").onclick = () => {
    state.date = state.view === "month" ? addMonths(state.date, 1) : addDays(state.date, 1);
    render();
  };
  document.getElementById("todayBtn").onclick = () => { state.date = todayKey(); render(); };

  // Skats: Diena / Viss mēnesis
  document.querySelectorAll(".viewtoggle button").forEach(b => {
    b.onclick = () => {
      state.view = b.dataset.view;
      // Atgriežoties uz dienu no cita mēneša – ņem tā mēneša 1. datumu
      if (state.view === "day" && monthStart(state.date) === monthStart(todayKey())) state.date = todayKey();
      render();
    };
  });

  // Kalendāra logs
  document.getElementById("openCalendar").onclick = openCalendar;
  document.getElementById("prevMonth").onclick = () => moveMonth(-1);
  document.getElementById("nextMonth").onclick = () => moveMonth(1);
  document.getElementById("closeCalendar").onclick = () => document.getElementById("calendar").close();
  document.getElementById("calDays").addEventListener("click", e => {
    const b = e.target.closest("[data-date]");
    if (!b) return;
    state.date = b.dataset.date;
    state.view = "day";
    document.getElementById("calendar").close();
    render();
  });
  document.getElementById("calendar").addEventListener("click", e => {
    if (e.target.id === "calendar") e.target.close();   // klikšķis ārpus loga to aizver
  });

  // Kategorijas
  document.querySelectorAll(".chip").forEach(btn => {
    // Viens spiediens = rāda TIKAI šo kategoriju; vēlreiz uz tās pašas = rāda visus
    btn.onclick = () => {
      const c = btn.dataset.cat;
      const onlyThis = state.cats.size === 1 && state.cats.has(c);
      state.cats.clear();
      if (!onlyThis) state.cats.add(c);
      render();
    };
  });

  document.getElementById("catClear").onclick = () => { state.cats.clear(); render(); };

  // Meklēšana
  document.getElementById("search").addEventListener("input", e => {
    state.query = e.target.value;
    render();
  });

  // Izceltie
  document.getElementById("featured").addEventListener("click", e => {
    const b = e.target.closest(".feat");
    if (b) openEvent(b.dataset.id);
  });

  // Pogas pasākumu kartītēs
  document.getElementById("events").addEventListener("click", e => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const card = btn.closest(".event");
    const ev = state.events.find(x => x.id === card.dataset.id);
    if (btn.dataset.action === "desc") {
      const d = card.querySelector(".desc");
      d.hidden = !d.hidden;
    }
    if (btn.dataset.action === "ics") downloadIcs(ev);
    if (btn.dataset.action === "share") shareEvent(ev, btn);
  });

  setupInstall();
  render();

  // Offline darbība (PWA)
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  }
}

start();
