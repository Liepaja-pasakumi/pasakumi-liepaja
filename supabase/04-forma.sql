-- =========================================================
-- 5. solis: organizatoru forma
-- Bilžu glabātava (Storage) – bildes var skatīt visi,
-- augšupielādēt tikai funkcija "pieteikt" (ar slepeno atslēgu).
-- =========================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pasakumu-bildes', 'pasakumu-bildes', true, 4194304,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
