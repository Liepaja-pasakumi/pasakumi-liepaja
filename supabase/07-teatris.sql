-- =========================================================
-- Jauna kategorija "teatris" (izrādes) – 2026-11-19
-- KĀ LIETOT: Supabase → SQL Editor → New query → iekopē → "Run".
-- =========================================================
alter table events drop constraint if exists events_category_check;
alter table events add constraint events_category_check
  check (category in ('sports', 'teatris', 'kultura', 'berniem', 'citi'));
