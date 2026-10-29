-- Send safe invalidation signals even when RLS hides a changed or deleted content row.
create table if not exists public.site_change_events (
  table_name text primary key check (table_name in (
    'banners',
    'vehicles',
    'vehicle_images',
    'packages',
    'package_images',
    'package_itinerary',
    'site_settings',
    'vehicle_availability'
  )),
  changed_at timestamptz not null default clock_timestamp()
);

alter table public.site_change_events enable row level security;
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_change_events'
      and policyname = 'public read'
  ) then
    execute 'create policy "public read" on public.site_change_events for select using (true)';
  end if;
end;
$$;
grant select on public.site_change_events to anon, authenticated;

create or replace function public.signal_public_site_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.site_change_events (table_name, changed_at)
  values (tg_table_name, clock_timestamp())
  on conflict (table_name) do update
    set changed_at = excluded.changed_at;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

do $$
declare
  v_table text;
  v_trigger text;
begin
  foreach v_table in array array[
    'banners',
    'vehicles',
    'vehicle_images',
    'packages',
    'package_images',
    'package_itinerary',
    'site_settings',
    'vehicle_availability'
  ] loop
    if to_regclass(format('public.%I', v_table)) is not null then
      v_trigger := 'site_change_' || v_table;
      if not exists (
        select 1 from pg_trigger
        where tgname = v_trigger
          and tgrelid = to_regclass(format('public.%I', v_table))
          and not tgisinternal
      ) then
        execute format(
          'create trigger %I after insert or update or delete on public.%I for each row execute function public.signal_public_site_change()',
          v_trigger,
          v_table
        );
      end if;
    end if;
  end loop;

  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication "supabase_realtime" does not exist';
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'site_change_events'
  ) then
    alter publication supabase_realtime add table public.site_change_events;
  end if;
end;
$$;
