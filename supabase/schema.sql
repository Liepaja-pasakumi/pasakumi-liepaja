-- =========================================================
-- Pasākumi Liepājā – datubāzes uzbūve (Supabase / PostgreSQL)
-- KĀ LIETOT: Supabase → SQL Editor → New query → iekopē VISU šo
-- failu → spied "Run". Var palaist vairākas reizes – nekas nesabojāsies.
-- =========================================================

-- ---------- 1. AVOTI (no kurienes nāk pasākumi) ----------
create table if not exists sources (
  id          text primary key,              -- īss nosaukums, piem. 'liepaja'
  name        text not null,                 -- cilvēkam saprotams nosaukums
  url         text,
  trusted     boolean not null default false,-- true = publicē uzreiz, false = jāpārbauda adminam
  active      boolean not null default true, -- false = nakts skripts šo avotu izlaiž
  created_at  timestamptz not null default now()
);

insert into sources (id, name, url, trusted) values
  ('liepaja', 'Liepājas notikumu kalendārs', 'https://kalendars.liepaja.lv', true),
  ('lsss',    'Liepājas Sporta spēļu skola', 'https://www.lsss.lv/lv/kalendars/', true),
  ('forma',   'Organizatoru iesniegtie',     null, false)
on conflict (id) do nothing;

-- ---------- 2. PASĀKUMI ----------
create table if not exists events (
  id           uuid primary key default gen_random_uuid(),
  source_id    text not null references sources(id),
  external_id  text,                        -- pasākuma numurs avotā (piem. 50817)
  title        text not null,
  date         date not null,               -- sākuma diena
  end_date     date,                        -- beigu diena (ja vairākas dienas)
  time         text,                        -- "19:00" vai tukšs
  place        text not null default '',
  category     text not null default 'citi'
               check (category in ('sports','kultura','berniem','citi')),
  description  text not null default '',
  image        text,
  image_credit text,
  url          text,
  price        text,
  featured     boolean not null default false,   -- "Izceltie"
  status       text not null default 'pending'
               check (status in ('published','pending','rejected')),
  duplicate_of uuid references events(id) on delete set null, -- ja tas pats pasākums jau ir no cita avota
  contact      text,                        -- iesniedzēja e-pasts (tikai adminam, publiski NERĀDA)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (source_id, external_id)           -- viens avota pasākums ienāk tikai vienreiz
);

create index if not exists events_date_idx on events (date, end_date);
create index if not exists events_status_idx on events (status);

-- ---------- 3. PUBLISKAIS SKATS (ko redz apmeklētāji) ----------
-- Tikai apstiprinātie, bez dublikātiem, bez iesniedzēja kontaktiem.
create or replace view public_events
with (security_invoker = true) as
  select id, source_id, title, date, end_date, time, place, category,
         description, image, image_credit, url, price, featured
  from events
  where status = 'published' and duplicate_of is null;

-- ---------- 4. DROŠĪBA (Row Level Security) ----------
-- Apmeklētāji (anonīmi) drīkst TIKAI lasīt publicētos pasākumus.
-- Rakstīt drīkst tikai nakts skripts un admins ar slepeno atslēgu.
alter table events  enable row level security;
alter table sources enable row level security;

drop policy if exists "Visi var lasīt publicētos" on events;
create policy "Visi var lasīt publicētos" on events
  for select to anon, authenticated
  using (status = 'published' and duplicate_of is null);

drop policy if exists "Visi var lasīt avotus" on sources;
create policy "Visi var lasīt avotus" on sources
  for select to anon, authenticated
  using (true);

-- Kontaktinformāciju (contact) apmeklētājiem neatdod: atļauj lasīt tikai
-- uzskaitītās kolonnas, un apmeklētāji neko nedrīkst rakstīt.
revoke all on events from anon, authenticated;
grant select (id, source_id, title, date, end_date, time, place, category,
              description, image, image_credit, url, price, featured,
              status, duplicate_of)
  on events to anon, authenticated;
grant select on public_events to anon, authenticated;
grant select on sources to anon, authenticated;

-- ---------- 5. PARAUGA PASĀKUMS (lai uzreiz redzētu, ka strādā) ----------
insert into events (source_id, external_id, title, date, time, place, category, description, url, status)
values ('liepaja', 'test-1', 'Pārbaudes pasākums no Supabase', current_date, '12:00',
        'Liepājas Olimpiskais centrs', 'sports',
        'Ja redzi šo lapā – savienojums ar datubāzi strādā! Vēlāk izdzēsīsim.',
        'https://kalendars.liepaja.lv', 'published')
on conflict (source_id, external_id) do nothing;
