-- Confirmed vehicle bookings reserve their date range; customers query availability through a function.
alter table public.bookings
  add column if not exists pickup_date date;

create table if not exists public.vehicle_availability (
  booking_id uuid primary key references public.bookings(id) on delete cascade,
  vehicle_id uuid not null references public.vehicles(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  is_active boolean not null default true,
  check (end_date >= start_date)
);

alter table public.vehicle_availability
  add column if not exists is_active boolean not null default true;
alter table public.vehicle_availability enable row level security;

create or replace function public.is_vehicle_available(
  p_vehicle_id uuid,
  p_start date,
  p_end date
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    p_vehicle_id is not null
    and p_start is not null
    and p_end is not null
    and p_end >= p_start
    and exists (
      select 1 from public.vehicles
      where id = p_vehicle_id and is_published
    )
    and not exists (
      select 1 from public.vehicle_availability
      where vehicle_id = p_vehicle_id
        and is_active
        and start_date <= p_end
        and end_date >= p_start
    ),
    false
  );
$$;
grant execute on function public.is_vehicle_available(uuid, date, date) to anon, authenticated;

create or replace function public.guard_vehicle_booking_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
begin
  if new.vehicle_id is null then
    return new;
  end if;

  v_start := coalesce(new.pickup_date, new.departure_date);
  v_end := coalesce(new.return_date, new.departure_date, new.pickup_date);
  if v_start is null or v_end is null then
    if new.status = 'confirmed' then
      raise exception 'Vehicle bookings need travel dates before they can be confirmed';
    end if;
    return new;
  end if;
  if v_end < v_start then
    raise exception 'Vehicle booking end date must be on or after its start date';
  end if;

  if new.status = 'confirmed' or tg_op = 'INSERT' then
    perform pg_advisory_xact_lock(hashtextextended(new.vehicle_id::text, 0));
    if exists (
      select 1 from public.bookings b
      where b.id <> new.id
        and b.vehicle_id = new.vehicle_id
        and b.status = 'confirmed'
        and coalesce(b.pickup_date, b.departure_date) <= v_end
        and coalesce(b.return_date, b.departure_date, b.pickup_date) >= v_start
    ) then
      raise exception 'Vehicle is not available for the selected dates';
    end if;
  end if;

  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'bookings_check_vehicle_availability'
      and tgrelid = 'public.bookings'::regclass
      and not tgisinternal
  ) then
    create trigger bookings_check_vehicle_availability
      before insert or update on public.bookings
      for each row execute function public.guard_vehicle_booking_availability();
  end if;
end;
$$;

create or replace function public.sync_vehicle_availability()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_start date;
  v_end date;
begin
  if tg_op = 'DELETE' then
    update public.vehicle_availability
    set is_active = false
    where booking_id = old.id;
    return old;
  end if;

  v_start := coalesce(new.pickup_date, new.departure_date);
  v_end := coalesce(new.return_date, new.departure_date, new.pickup_date);
  if new.vehicle_id is not null and v_start is not null and v_end is not null then
    insert into public.vehicle_availability (booking_id, vehicle_id, start_date, end_date, is_active)
    values (new.id, new.vehicle_id, v_start, v_end, new.status = 'confirmed')
    on conflict (booking_id) do update
    set vehicle_id = excluded.vehicle_id,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        is_active = new.status = 'confirmed';
  else
    update public.vehicle_availability
    set is_active = false
    where booking_id = new.id;
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_trigger
    where tgname = 'bookings_sync_vehicle_availability'
      and tgrelid = 'public.bookings'::regclass
      and not tgisinternal
  ) then
    create trigger bookings_sync_vehicle_availability
      after insert or update or delete on public.bookings
      for each row execute function public.sync_vehicle_availability();
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    raise exception 'Supabase Realtime publication "supabase_realtime" does not exist';
  end if;
end;
$$;

insert into public.vehicle_availability (booking_id, vehicle_id, start_date, end_date, is_active)
select id, vehicle_id, coalesce(pickup_date, departure_date),
  coalesce(return_date, departure_date, pickup_date), true
from public.bookings
where status = 'confirmed'
  and vehicle_id is not null
  and coalesce(pickup_date, departure_date) is not null
  and coalesce(return_date, departure_date, pickup_date) is not null
on conflict (booking_id) do update
set vehicle_id = excluded.vehicle_id,
    start_date = excluded.start_date,
    end_date = excluded.end_date,
    is_active = true;
