-- =========================================================
-- LSSS avots + dublikātu atsijāšana starp avotiem
-- KĀ LIETOT: Supabase → SQL Editor → New query → iekopē → "Run".
--
-- Galvenais avots ir kalendars.liepaja.lv ('liepaja'). Ja tas pats
-- pasākums ienāk no cita automātiskā avota (piem. 'lsss'), tam uzliek
-- duplicate_of = <liepaja pasākums>, un lapā (public_events) tas nerādās.
-- Organizatoru formu ('forma') šeit neaiztiek – to izvērtē admins.
-- =========================================================
create extension if not exists pg_trgm with schema extensions;

create or replace function mark_duplicates() returns integer
language plpgsql security definer
set search_path = public, extensions
as $$
declare n integer;
begin
  with pairs as (
    select distinct on (d.id) d.id as dup_id, p.id as main_id
    from events d
    join events p
      on p.source_id = 'liepaja'
     and p.status = 'published'
     and p.duplicate_of is null
     and p.date = d.date
     and p.category = d.category
     and d.time is not null and p.time = d.time           -- tas pats sākuma laiks
     and ( similarity(d.title, p.title) > 0.25            -- līdzīgs nosaukums
        or similarity(d.place, p.place) > 0.3 )           -- vai līdzīga vieta
    where d.source_id not in ('liepaja', 'forma')
      and d.duplicate_of is null
      and d.date >= current_date - 1
    order by d.id, similarity(d.title, p.title) desc
  )
  update events e set duplicate_of = pairs.main_id
  from pairs where e.id = pairs.dup_id;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Izsaukt drīkst tikai nakts skripts (slepenā atslēga)
revoke all on function mark_duplicates() from public, anon, authenticated;
grant execute on function mark_duplicates() to service_role;

-- LSSS avots jau ir tabulā sources (uzticams). Pārliecināmies:
update sources set trusted = true, active = true where id = 'lsss';
