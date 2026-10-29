-- Fix booking availability sync: provide the is_active value in its insert.
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
