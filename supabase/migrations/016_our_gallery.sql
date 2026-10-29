create table public.gallery_photos (
  id uuid primary key default gen_random_uuid(),
  image_path text not null check (char_length(image_path) > 0),
  alt_text text constraint gallery_photos_alt_text_check
    check (alt_text is null or char_length(trim(alt_text)) between 1 and 200),
  created_at timestamptz not null default now()
);

alter table public.gallery_photos enable row level security;

create policy "public read gallery photos"
  on public.gallery_photos for select
  using (true);

create policy "admin manage gallery photos"
  on public.gallery_photos for all
  using (public.is_admin())
  with check (public.is_admin());

grant select on public.gallery_photos to anon, authenticated;
grant insert, update, delete on public.gallery_photos to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'gallery-images',
  'gallery-images',
  true,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "public read gallery images"
  on storage.objects for select
  using (bucket_id = 'gallery-images');

create policy "admin upload gallery images"
  on storage.objects for insert
  with check (bucket_id = 'gallery-images' and public.is_admin());

create policy "admin update gallery images"
  on storage.objects for update
  using (bucket_id = 'gallery-images' and public.is_admin())
  with check (bucket_id = 'gallery-images' and public.is_admin());

create policy "admin delete gallery images"
  on storage.objects for delete
  using (bucket_id = 'gallery-images' and public.is_admin());

alter table public.site_change_events
  drop constraint if exists site_change_events_table_name_check;

alter table public.site_change_events
  add constraint site_change_events_table_name_check
  check (table_name in (
    'banners',
    'vehicles',
    'vehicle_images',
    'packages',
    'package_images',
    'package_itinerary',
    'site_settings',
    'vehicle_availability',
    'gallery_photos'
  ));

create trigger site_change_gallery_photos
  after insert or update or delete on public.gallery_photos
  for each row execute function public.signal_public_site_change();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'gallery_photos'
  ) then
    alter publication supabase_realtime add table public.gallery_photos;
  end if;
end;
$$;
