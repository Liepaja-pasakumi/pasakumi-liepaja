-- =========================================================
-- Avotā pazudušo (atcelto/pārcelto) pasākumu tīrīšana
-- KĀ LIETOT: Supabase → SQL Editor → New query → iekopē → "Run".
--
-- Nakts skripts pēc ielādes izsauc remove_missing(avots, sākuma_laiks,
-- no_datuma, līdz_datumam). Izdzēš šī avota pasākumus šajā datumu
-- periodā, kurus šajā ielādē NEATJAUNOJA (updated_at vecāks par ielādes
-- sākumu) – tātad avotā to vairs nav.
-- NEAIZTIEK: admina labotos (locked) un izceltos (featured), kā arī
-- organizatoru formu (to izvērtē admins).
-- =========================================================
create or replace function remove_missing(src text, run_started timestamptz, from_date date, to_date date)
returns integer
language plpgsql security definer
set search_path = public
as $$
declare n integer;
begin
  if src = 'forma' then return 0; end if;
  -- Vispirms atbrīvo dublikātus, kas norāda uz dzēšamajiem
  update events set duplicate_of = null
   where duplicate_of in (
     select id from events
      where source_id = src and date between from_date and to_date
        and updated_at < run_started and not locked and not featured);
  delete from events
   where source_id = src and date between from_date and to_date
     and updated_at < run_started and not locked and not featured;
  get diagnostics n = row_count;
  return n;
end;
$$;

revoke all on function remove_missing(text, timestamptz, date, date) from public, anon, authenticated;
grant execute on function remove_missing(text, timestamptz, date, date) to service_role;
