// =========================================================
// Supabase Edge Function "pieteikt"
// Saņem organizatora pieteikumu no formas (pieteikt.html):
//   1. pārbauda Cloudflare Turnstile (vai nav robots),
//   2. pārbauda laukus,
//   3. ja ir bilde – saglabā Storage mapē "pasakumu-bildes",
//   4. ieraksta pasākumu ar statusu "pending" (gaida admina apstiprinājumu).
// Slepenās atslēgas ņem no vides – kodā to NAV.
//
// Iestatījumi Supabase (Edge Functions → Secrets):
//   TURNSTILE_SECRET – Cloudflare Turnstile slepenā atslēga.
//   Kamēr tā nav ielikta, lieto Cloudflare TESTA atslēgu (vienmēr "nav robots")
//   – tas der tikai pārbaudei, pirms publicēšanas OBLIGĀTI jāieliek īstā!
// "Verify JWT" šai funkcijai jābūt IZSLĒGTAM (to sauc no publiskas lapas).
// =========================================================

const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
const BUCKET = "pasakumu-bildes";
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const CATEGORIES = ["sports", "kultura", "berniem", "citi"];

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function reply(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json; charset=utf-8" },
  });
}

function text(v: unknown, max: number): string {
  return typeof v === "string" ? v.trim().slice(0, max) : "";
}

function rigaToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply(405, { ok: false, error: "Tikai POST" });

  let b: Record<string, unknown>;
  try {
    b = await req.json();
  } catch {
    return reply(400, { ok: false, error: "Nepareizi dati" });
  }

  // --- Slazds robotiem: šo lauku cilvēks neredz, tāpēc tam jābūt tukšam ---
  if (text(b.website, 100)) return reply(200, { ok: true });

  // --- 1. Turnstile ---
  const token = text(b.turnstile, 4000);
  if (!token) return reply(400, { ok: false, error: "Lūdzu, apstiprini, ka neesi robots." });
  const form = new FormData();
  form.append("secret", Deno.env.get("TURNSTILE_SECRET") || TURNSTILE_TEST_SECRET);
  form.append("response", token);
  const ip = req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for")?.split(",")[0];
  if (ip) form.append("remoteip", ip.trim());
  const check = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form })
    .then((r) => r.json()).catch(() => ({ success: false }));
  if (!check.success) return reply(400, { ok: false, error: "Robotu pārbaude neizdevās. Pārlādē lapu un mēģini vēlreiz." });

  // --- 2. Lauki ---
  const title = text(b.title, 200);
  const date = text(b.date, 10);
  const endDate = text(b.end_date, 10) || null;
  const time = text(b.time, 5) || null;
  const place = text(b.place, 200);
  const category = text(b.category, 20);
  const description = text(b.description, 3000);
  const url = text(b.url, 500) || null;
  const contact = text(b.contact, 200) || null;
  const organizer = text(b.organizer, 200);

  const errors: string[] = [];
  if (title.length < 3) errors.push("nosaukums");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < rigaToday()) errors.push("datums (nevar būt pagātnē)");
  if (endDate && (!/^\d{4}-\d{2}-\d{2}$/.test(endDate) || endDate < date)) errors.push("beigu datums");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) errors.push("laiks");
  if (place.length < 2) errors.push("vieta");
  if (!CATEGORIES.includes(category)) errors.push("kategorija");
  if (url && !/^https?:\/\/\S+$/i.test(url)) errors.push("saite");
  if (contact && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact)) errors.push("e-pasts");
  if (errors.length) return reply(400, { ok: false, error: "Pārbaudi: " + errors.join(", ") + "." });

  const SB_URL = Deno.env.get("SUPABASE_URL")!;
  const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const auth = { apikey: SB_KEY, Authorization: "Bearer " + SB_KEY };

  // --- 3. Bilde (nav obligāta) ---
  let image: string | null = null;
  const dataUrl = text(b.image, 8_000_000);
  if (dataUrl) {
    const m = dataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/);
    if (!m) return reply(400, { ok: false, error: "Bildei jābūt JPG, PNG vai WEBP." });
    const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
    if (bytes.length > MAX_IMAGE_BYTES) return reply(400, { ok: false, error: "Bilde ir par lielu (līdz 4 MB)." });
    const ext = m[2] === "jpeg" ? "jpg" : m[2];
    const path = `${date}/${crypto.randomUUID()}.${ext}`;
    const up = await fetch(`${SB_URL}/storage/v1/object/${BUCKET}/${path}`, {
      method: "POST",
      headers: { ...auth, "Content-Type": m[1], "x-upsert": "false" },
      body: bytes,
    });
    if (!up.ok) return reply(500, { ok: false, error: "Neizdevās saglabāt bildi." });
    image = `${SB_URL}/storage/v1/object/public/${BUCKET}/${path}`;
  }

  // --- 4. Ieraksta kā "gaida apstiprinājumu" ---
  const fullDescription = organizer ? `${description}\n\nOrganizators: ${organizer}`.trim() : description;
  const ins = await fetch(`${SB_URL}/rest/v1/events`, {
    method: "POST",
    headers: { ...auth, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({
      source_id: "forma",
      external_id: crypto.randomUUID(),
      title, date, end_date: endDate, time, place, category,
      description: fullDescription, image, url, contact,
      status: "pending",
    }),
  });
  if (!ins.ok) return reply(500, { ok: false, error: "Neizdevās saglabāt pieteikumu. Mēģini vēlāk." });

  return reply(200, { ok: true });
});
