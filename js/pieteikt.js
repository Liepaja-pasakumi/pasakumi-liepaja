/* =========================================================
   Organizatoru forma – nosūta pieteikumu Supabase funkcijai "pieteikt"
   ========================================================= */
const SUPABASE_URL = "https://vajibazlcehbalkrkqfl.supabase.co";
const SUPABASE_KEY = "sb_publishable_0FCc4zYqkBgw3rG2qIqZ3A_bNk66EF3"; // publiska atslēga

// Cloudflare Turnstile "site key" (publiska). Šī ir Cloudflare TESTA atslēga –
// tā vienmēr palaiž cauri. 6. solī nomainīt uz īsto no Cloudflare paneļa!
const TURNSTILE_SITE_KEY = "1x00000000000000000000AA";

const MAX_SIDE = 1600;          // bildi samazina līdz 1600 px garākajā malā
const $ = id => document.getElementById(id);
const form = $("form");
let imageData = "";              // samazinātā bilde kā data: URL
let turnstileToken = "";

function todayKey() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

function showMsg(text, ok) {
  const m = $("msg");
  m.textContent = text;
  m.className = "subm-msg" + (ok ? " ok" : "");
}

/* Bildi samazina telefonā, lai sūtīšana būtu ātra */
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("Neizdevās nolasīt bildi."));
    img.src = URL.createObjectURL(file);
  });
}

form.elements.image.addEventListener("change", async () => {
  const f = form.elements.image.files[0];
  imageData = "";
  $("preview").hidden = true;
  if (!f) return;
  if (!/^image\/(jpeg|png|webp)$/.test(f.type)) { showMsg("Bildei jābūt JPG, PNG vai WEBP."); return; }
  try {
    imageData = await shrinkImage(f);
    $("preview").src = imageData;
    $("preview").hidden = false;
    showMsg("");
  } catch (e) { showMsg(e.message); }
});

form.addEventListener("submit", async e => {
  e.preventDefault();
  const f = form.elements;

  // Pārbaude vēl pirms sūtīšanas
  if (!form.checkValidity()) {
    form.reportValidity();
    showMsg("Lūdzu, aizpildi obligātos laukus.");
    return;
  }
  if (f.date.value < todayKey()) { showMsg("Datums nevar būt pagātnē."); return; }
  if (f.end_date.value && f.end_date.value < f.date.value) { showMsg("Beigu datums nevar būt pirms sākuma."); return; }
  if (!turnstileToken) { showMsg("Lūdzu, pagaidi robotu pārbaudi (zem formas) un mēģini vēlreiz."); return; }

  const payload = {
    title: f.title.value, date: f.date.value, end_date: f.end_date.value, time: f.time.value,
    place: f.place.value, category: f.category.value, description: f.description.value,
    url: f.url.value, organizer: f.organizer.value, contact: f.contact.value,
    website: f.website.value, image: imageData, turnstile: turnstileToken
  };

  $("sendBtn").disabled = true;
  showMsg("Sūtu…", true);
  try {
    const res = await fetch(SUPABASE_URL + "/functions/v1/pieteikt", {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY },
      body: JSON.stringify(payload)
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) throw new Error(data.error || "Neizdevās nosūtīt. Mēģini vēlreiz.");
    form.hidden = true;
    $("done").hidden = false;
    window.scrollTo(0, 0);
  } catch (err) {
    showMsg(err.message);
    // Turnstile žetonu var izmantot tikai vienreiz – paņem jaunu
    if (window.turnstile && window.turnstile.reset) { window.turnstile.reset("#tsBox"); turnstileToken = ""; }
  } finally {
    $("sendBtn").disabled = false;
  }
});

/* Turnstile logs (kad Cloudflare skripts ielādējies) */
function startTurnstile() {
  if (!window.turnstile || !window.turnstile.render) { setTimeout(startTurnstile, 200); return; }
  window.turnstile.render("#tsBox", {
    sitekey: TURNSTILE_SITE_KEY,
    language: "lv",
    callback: t => { turnstileToken = t; },
    "expired-callback": () => { turnstileToken = ""; },
    "error-callback": () => { turnstileToken = ""; }
  });
}

form.elements.date.min = todayKey();
form.elements.end_date.min = todayKey();
startTurnstile();
