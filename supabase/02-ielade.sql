-- =========================================================
-- 3. solis: sagatavošana nakts ielādei
-- KĀ LIETOT: Supabase → SQL Editor → New query → iekopē → "Run".
-- =========================================================

-- Kad jauns pasākums ienāk no UZTICAMA avota (sources.trusted = true),
-- tas publicējas uzreiz. No "jāpārbauda" avota – paliek "pending" adminam.
-- Atjaunojot jau esošu pasākumu, statusu NEMAINA (ja admins to noraidīja,
-- nakts skripts to atpakaļ nepublicēs).
create or replace function events_before_write() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' and new.status = 'pending'
     and exists (select 1 from sources where id = new.source_id and trusted) then
    new.status := 'published';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists events_before_write on events;
create trigger events_before_write
  before insert or update on events
  for each row execute function events_before_write();
