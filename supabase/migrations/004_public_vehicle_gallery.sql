-- Allow visitors to load extra photos for published vehicles only.
alter table public.vehicle_images enable row level security;

drop policy if exists "public read" on public.vehicle_images;
create policy "public read" on public.vehicle_images
  for select
  using (
    exists (
      select 1
      from public.vehicles
      where vehicles.id = vehicle_images.vehicle_id
        and vehicles.is_published = true
    )
  );

grant select on table public.vehicle_images to anon, authenticated;
