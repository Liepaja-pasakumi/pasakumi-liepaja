/* =========================================================
   Admina panelis – loģika
   Pieteikšanās: Supabase Authentication (e-pasts + parole).
   Mainīt drīkst tikai lietotāji no tabulas "admins" (to pārbauda
   pati datubāze – šī lapa tikai parāda pogas).
   ========================================================= */
const SUPABASE_URL = "https://vajibazlcehbalkrkqfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_0FCc4zYqkBgw3rG2qIqZ3A_bNk66EF3"; // publiska atslēga
const SESSION_KEY = "pasakumi-admin-sesija";

const CAT_NAMES = { sports: "Sports", kultura: "Kultūra", berniem: "Bērniem", citi: "Citi" };
const $ = id => document.getElementById(id);

const st = {
  session: null,
  events: [],
  sources: {},
  tab: "pending",
  editing: null
};

/* ---------- Palīgi ---------- */
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, c =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function niceDate(key) {
  if (!key) return "";
  const [y, m, d] = key.split("-");
  return d + "." + m + "." + y + ".";
}
function plain(s) {
  return String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}
function words(s) {
  return new Set(plain(s).replace(/[^a-z0-9 ]+/g, " ").split(" ").filter(w => w.length > 2));
}

/* ---------- Sesija ---------- */
function saveSession(s) {
  st.session = s;
  try {
    if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch (e) {}
}
function loadSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}

async function authRequest(grant, body) {
  const res = await fetch(SUPABASE_URL + "/auth/v1/token?grant_type=" + grant, {
    method: "POST",
    headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || data.error || "Kļūda " + res.status);
  return {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: Date.now() + (data.expires_in || 3600) * 1000,
    email: data.user && data.user.email
  };
}

async function refreshIfNeeded() {
  const s = st.session;
  if (!s) throw new Error("Nav pieteicies");
  if (Date.now() < s.expires_at - 60000) return;
  const fresh = await authRequest("refresh_token", { refresh_token: s.refresh_token });
  fresh.email = fresh.email || s.email;
  saveSession(fresh);
}

/* Pieprasījums uz datubāzi kā pieteicies admins */
async function api(path, opts = {}) {
  await refreshIfNeeded();
  const res = await fetch(SUPABASE_URL + "/rest/v1/" + path, {
    ...opts,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: "Bearer " + st.session.access_token,
      "Content-Type": "application/json",
      ...(opts.headers || {})
    }
  });
  if (res.status === 401) { logout("Sesija beigusies – ienāc vēlreiz."); throw new Error("401"); }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error((data && (data.message || data.hint)) || "Kļūda " + res.status);
  return data;
}

/* ---------- Pieteikšanās / iziešana ---------- */
async function login(e) {
  e.preventDefault();
  const msg = $("loginMsg");
  msg.className = "msg"; msg.textContent = "Piesakos…";
  try {
    const s = await authRequest("password", { email: $("loginEmail").value.trim(), password: $("loginPass").value });
    saveSession(s);
    $("loginPass").value = "";
    await afterLogin();
  } catch (err) {
    msg.textContent = /invalid/i.test(err.message) ? "Nepareizs e-pasts vai parole." : err.message;
  }
}

async function afterLogin() {
  const isAdmin = await api("rpc/is_admin", { method: "POST", body: "{}" });
  if (!isAdmin) {
    logout("Šim lietotājam nav admina tiesību.");
    return;
  }
  $("loginView").hidden = true;
  $("listView").hidden = false;
  $("userBox").hidden = false;
  $("userEmail").textContent = st.session.email || "";
  await loadAll();
}

function logout(message) {
  saveSession(null);
  $("listView").hidden = true;
  $("userBox").hidden = true;
  $("loginView").hidden = false;
  const msg = $("loginMsg");
  msg.className = "msg";
  msg.textContent = typeof message === "string" ? message : "";
}

/* ---------- Dati ---------- */
async function loadAll() {
  const msg = $("listMsg");
  msg.className = "msg ok"; msg.textContent = "Ielādēju…";
  try {
    const srcRows = await api("sources?select=id,name,trusted");
    st.sources = Object.fromEntries(srcRows.map(s => [s.id, s]));
    let q = "events?select=*&order=date,time&limit=2000";
    if ($("onlyFuture").checked) {
      const t = todayKey();
      q += "&or=(date.gte." + t + ",end_date.gte." + t + ")";
    }
    st.events = await api(q);
    msg.textContent = "";
    render();
  } catch (err) {
    msg.className = "msg"; msg.textContent = "Neizdevās ielādēt: " + err.message;
  }
}

/* Līdzīgi pasākumi no CITIEM avotiem (tā pati diena + līdzīgs nosaukums vai vieta) */
function similar(ev) {
  const w = words(ev.title);
  const p = words(ev.place);
  return st.events
    .filter(o => o.id !== ev.id && o.source_id !== ev.source_id && o.status !== "rejected")
    .filter(o => o.date === ev.date || (o.end_date && o.date <= ev.date && ev.date <= o.end_date))
    .map(o => {
      const ow = words(o.title), op = words(o.place);
      const common = [...w].filter(x => ow.has(x)).length;
      const titleScore = common / Math.max(1, Math.min(w.size, ow.size));
      const placeScore = [...p].filter(x => op.has(x)).length / Math.max(1, Math.min(p.size, op.size));
      // Tikai vieta sakrīt – nepietiek; vajag arī līdzīgu nosaukumu
      const ok = titleScore >= 0.5 || (titleScore >= 0.25 && placeScore >= 0.5);
      return { o, ok, score: titleScore + placeScore * 0.5 };
    })
    .filter(x => x.ok)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(x => x.o);
}

/* ---------- Attēlošana ---------- */
function render() {
  const counts = { pending: 0, published: 0, rejected: 0 };
  st.events.forEach(e => counts[e.status]++);
  $("cntPending").textContent = counts.pending;
  $("cntPublished").textContent = counts.published;
  $("cntRejected").textContent = counts.rejected;
  document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("active", b.dataset.tab === st.tab));

  const q = plain($("q").value.trim());
  const onlyFeat = $("onlyFeatured").checked;
  const list = st.events.filter(e =>
    e.status === st.tab &&
    (!onlyFeat || e.featured) &&
    (!q || plain(e.title + " " + e.place).includes(q)));

  const box = $("rows");
  if (!list.length) {
    box.innerHTML = `<p class="empty">${st.tab === "pending" ? "🎉 Nekas negaida apstiprinājumu." : "Nekā nav."}</p>`;
    return;
  }
  // Rāda ne vairāk kā 300 reizē, lai lapa nebremzē
  box.innerHTML = list.slice(0, 300).map(rowHtml).join("") +
    (list.length > 300 ? `<p class="empty">Rādīti 300 no ${list.length} – precizē meklēšanu.</p>` : "");
}

function rowHtml(e) {
  const src = st.sources[e.source_id] || { name: e.source_id, trusted: false };
  const when = niceDate(e.date) + (e.end_date && e.end_date !== e.date ? " – " + niceDate(e.end_date) : "") + (e.time ? " " + e.time : "");
  const img = e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">` : `<div class="noimg">📅</div>`;

  let dup = "";
  if (e.status === "pending") {
    const sim = similar(e);
    dup = sim.length
      ? `<div class="dup">⚠️ Iespējams dublikāts: ${sim.map(o =>
          `<a href="${esc(o.url || "#")}" target="_blank" rel="noopener">${esc(o.title)}</a> (${esc(o.place)}, ${esc((st.sources[o.source_id] || {}).name || o.source_id)})`).join("; ")}</div>`
      : `<div class="dup none">✓ Līdzīgu pasākumu citos avotos nav atrasts.</div>`;
  }

  const b = [];
  if (e.status !== "published") b.push(`<button class="btn btn-green" data-act="approve">✓ Apstiprināt</button>`);
  if (e.status !== "rejected") b.push(`<button class="btn btn-red" data-act="reject">✖ Noraidīt</button>`);
  b.push(`<button class="btn" data-act="edit">✎ Labot</button>`);
  if (e.status === "published") b.push(`<button class="btn btn-gold ${e.featured ? "on" : ""}" data-act="feature" title="Rādīt sadaļā Izceltie">${e.featured ? "⭐ Izcelts" : "☆ Izcelt"}</button>`);

  return `<div class="row" data-id="${e.id}">
    ${img}
    <div>
      <h3>${e.featured ? "⭐ " : ""}${esc(e.title)}</h3>
      <div class="meta">
        <span>📅 ${esc(when)}</span>
        <span>📍 ${esc(e.place || "—")}</span>
        <span>${esc(CAT_NAMES[e.category] || e.category)}</span>
        <span class="src ${src.trusted ? "trusted" : "check"}">${esc(src.name)} · ${src.trusted ? "uzticams" : "jāpārbauda"}</span>
        ${e.locked ? `<span class="lock">🔒 labots</span>` : ""}
        ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">avots ↗</a>` : ""}
        ${e.contact ? `<span>✉️ ${esc(e.contact)}</span>` : ""}
      </div>
      ${dup}
    </div>
    <div class="btns">${b.join("")}</div>
  </div>`;
}

/* ---------- Darbības ---------- */
async function update(id, fields) {
  const rows = await api("events?id=eq." + id, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(fields)
  });
  if (!rows || !rows.length) throw new Error("Neizdevās saglabāt (nav tiesību?)");
  const i = st.events.findIndex(e => e.id === id);
  if (i >= 0) st.events[i] = rows[0];
}

async function onRowClick(ev) {
  const btn = ev.target.closest("button[data-act]");
  if (!btn) return;
  const id = btn.closest(".row").dataset.id;
  const e = st.events.find(x => x.id === id);
  const act = btn.dataset.act;
  if (act === "edit") return openEdit(e);
  btn.disabled = true;
  try {
    if (act === "approve") await update(id, { status: "published" });
    if (act === "reject") {
      if (!confirm("Noraidīt „" + e.title + "”? Lapā tas vairs nerādīsies.")) { btn.disabled = false; return; }
      await update(id, { status: "rejected" });
    }
    if (act === "feature") await update(id, { featured: !e.featured });
    render();
  } catch (err) {
    alert(err.message);
    btn.disabled = false;
  }
}

/* ---------- Labošana ---------- */
function openEdit(e) {
  st.editing = e;
  const f = $("editForm");
  ["title", "date", "end_date", "time", "place", "category", "price", "description", "image", "url"]
    .forEach(k => { f.elements[k].value = e[k] ?? ""; });
  f.elements.featured.checked = !!e.featured;
  $("editDlg").showModal();
}

async function saveEdit(ev) {
  if (ev.submitter && ev.submitter.value !== "save") return;   // "Atcelt"
  ev.preventDefault();
  const f = $("editForm");
  if (!f.reportValidity()) return;
  const v = k => f.elements[k].value.trim() || null;
  const fields = {
    title: v("title"), date: v("date"), end_date: v("end_date"), time: v("time"),
    place: v("place") || "", category: v("category"), price: v("price"),
    description: v("description") || "", image: v("image"), url: v("url"),
    featured: f.elements.featured.checked,
    locked: true          // nakts ielāde vairs nepārrakstīs
  };
  $("saveBtn").disabled = true;
  try {
    await update(st.editing.id, fields);
    $("editDlg").close();
    render();
  } catch (err) {
    alert(err.message);
  } finally {
    $("saveBtn").disabled = false;
  }
}

/* ---------- Palaišana ---------- */
function start() {
  $("loginForm").addEventListener("submit", login);
  $("logoutBtn").onclick = () => logout("Tu izgāji.");
  $("rows").addEventListener("click", onRowClick);
  $("editForm").addEventListener("submit", saveEdit);
  $("reloadBtn").onclick = loadAll;
  $("onlyFuture").onchange = loadAll;
  $("onlyFeatured").onchange = render;
  $("q").oninput = render;
  document.querySelectorAll(".tabs button").forEach(b => b.onclick = () => { st.tab = b.dataset.tab; render(); });

  const s = loadSession();
  if (s) { st.session = s; afterLogin().catch(() => logout()); }
}
start();
