-- Enforce each vehicle's admin-configured passenger capacity for public bookings.
alter table public.bookings add column if not exists pickup_date date;

create or replace function public.submit_booking(p jsonb)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  v_vehicle_id uuid;
  v_max_passengers int;
  v_passenger_count int;
begin
  v_vehicle_id := nullif(p->>'vehicle_id', '')::uuid;
  v_passenger_count := coalesce((p->>'passenger_count')::int, 0);

  if char_length(trim(coalesce(p->>'full_name', ''))) not between 2 and 100
    or coalesce(p->>'phone', '') !~ '^[+0-9 ()-]{7,20}$'
    or char_length(regexp_replace(coalesce(p->>'phone', ''), '[^0-9]', '', 'g')) not between 7 and 15
    or char_length(trim(coalesce(p->>'pickup_location', ''))) not between 1 and 200
    or char_length(trim(coalesce(p->>'destination', ''))) not between 1 and 200
    or v_passenger_count not between 1 and 100
    or char_length(coalesce(p->>'special_requirements', '')) > 2000
    or (
      nullif(p->>'vehicle_name', '') is not null
      and (
        nullif(p->>'pickup_date', '') is null
        or nullif(p->>'departure_date', '') is null
        or nullif(p->>'departure_date', '')::date < nullif(p->>'pickup_date', '')::date
      )
    ) then
    raise exception 'Invalid booking details';
  end if;

  if v_vehicle_id is not null then
    select max_passengers into v_max_passengers
    from public.vehicles
    where id = v_vehicle_id;

    if v_max_passengers is not null and v_passenger_count > v_max_passengers then
      raise exception 'Vehicle can carry a maximum of % passengers', v_max_passengers;
    end if;
  end if;

  insert into public.bookings (
    full_name, phone, email, vehicle_id, vehicle_name, package_id, travel_type,
    pickup_location, pickup_date, destination, departure_date, return_date,
    pickup_time, passenger_count, special_requirements, preferred_contact_method
  )
  values (
    trim(p->>'full_name'), trim(p->>'phone'), nullif(p->>'email', ''),
    v_vehicle_id, nullif(p->>'vehicle_name', ''),
    nullif(p->>'package_id', '')::uuid, coalesce(p->>'travel_type', 'Local'),
    trim(p->>'pickup_location'), nullif(p->>'pickup_date', '')::date,
    trim(p->>'destination'), nullif(p->>'departure_date', '')::date,
    nullif(p->>'return_date', '')::date, nullif(p->>'pickup_time', '')::time,
    v_passenger_count, nullif(p->>'special_requirements', ''),
    coalesce(p->>'preferred_contact_method', 'phone')
  )
  returning booking_reference into r;

  return r;
end;
$$;

grant execute on function public.submit_booking(jsonb) to anon, authenticated;
notify pgrst, 'reload schema';
