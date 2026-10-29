-- Publish content and enquiry changes so public pages and the admin console stay current.
do $$
declare
  v_table text;
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication "supabase_realtime" does not exist';
  end if;

  foreach v_table in array array[
    'banners',
    'vehicles',
    'vehicle_images',
    'packages',
    'package_images',
    'package_itinerary',
    'site_settings',
    'bookings',
    'enquiries'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null
      and not exists (
        select 1 from pg_publication_tables
        where pubname = 'supabase_realtime'
          and schemaname = 'public'
          and tablename = v_table
      ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end;
$$;
