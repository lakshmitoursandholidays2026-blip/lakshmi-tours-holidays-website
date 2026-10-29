alter table public.gallery_photos
  alter column alt_text drop not null;

alter table public.gallery_photos
  drop constraint if exists gallery_photos_alt_text_check;

alter table public.gallery_photos
  add constraint gallery_photos_alt_text_check
  check (alt_text is null or char_length(trim(alt_text)) between 1 and 200);
