-- =========================================================
-- 4. solis: admina panelis
-- KĀ LIETOT: Supabase → SQL Editor → New query → iekopē → "Run".
-- Var palaist vairākas reizes.
--
-- Ideja: admins piesakās ar e-pastu + paroli (Supabase Authentication).
-- Tikai lietotāji, kas ierakstīti tabulā "admins", drīkst redzēt VISUS
-- pasākumus (arī gaidošos) un tos mainīt.
-- =========================================================

-- ---------- 1. ADMINI ----------
create table if not exists admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table admins enable row level security;
revoke all on admins from anon, authenticated;

-- Vai pašreizējais lietotājs ir admins?
create or replace function is_admin() returns boolean
language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from admins where user_id = auth.uid());
$$;
revoke all on function is_admin() from public, anon;
grant execute on function is_admin() to authenticated;

-- ---------- 2. "LABOTS" ATZĪME ----------
-- Ja admins pasākumu izlabo, nakts ielāde to vairs nepārraksta.
alter table events add column if not exists locked boolean not null default false;

create or replace function events_before_write() returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Admina labotu pasākumu nakts ielāde (service_role) neaiztiek
  if tg_op = 'UPDATE' and old.locked and auth.role() = 'service_role' then
    return old;
  end if;
  -- Jauns pasākums no uzticama avota publicējas uzreiz
  if tg_op = 'INSERT' and new.status = 'pending'
     and exists (select 1 from sources where id = new.source_id and trusted) then
    new.status := 'published';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- ---------- 3. TIESĪBAS ----------
-- Apmeklētāji (anon) – kā līdz šim: tikai publicētie, bez kontaktiem.
drop policy if exists "Visi var lasīt publicētos" on events;
create policy "Visi var lasīt publicētos" on events
  for select to anon
  using (status = 'published' and duplicate_of is null);

-- Pieteicies lietotājs – tikai, ja ir admins
grant select, insert, update, delete on events to authenticated;

drop policy if exists "Admini lasa visu" on events;
create policy "Admini lasa visu" on events
  for select to authenticated using (is_admin());

drop policy if exists "Admini maina" on events;
create policy "Admini maina" on events
  for update to authenticated using (is_admin()) with check (is_admin());

drop policy if exists "Admini pievieno" on events;
create policy "Admini pievieno" on events
  for insert to authenticated with check (is_admin());

drop policy if exists "Admini dzēš" on events;
create policy "Admini dzēš" on events
  for delete to authenticated using (is_admin());

-- ---------- 4. KAD ADMINA KONTS IZVEIDOTS ----------
-- Pēc tam, kad Authentication → Users ir izveidots admina lietotājs,
-- palaid ŠO rindu (atkomentē), lai viņš kļūtu par adminu:
-- insert into admins (user_id) select id from auth.users on conflict do nothing;
