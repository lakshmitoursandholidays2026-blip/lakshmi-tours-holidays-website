-- Persistent controls for the Choose Your Ride section.
insert into public.site_settings (setting_key, setting_value)
values ('ride_controls', '{"booking_enabled": true, "enquiry_enabled": true}'::jsonb)
on conflict (setting_key) do nothing;

create or replace function public.guard_choose_ride_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking_enabled boolean := true;
begin
  if public.is_admin() then
    return new;
  end if;

  if new.vehicle_id is not null or nullif(btrim(coalesce(new.vehicle_name, '')), '') is not null then
    select coalesce((setting_value->>'booking_enabled')::boolean, true)
    into v_booking_enabled
    from public.site_settings
    where setting_key = 'ride_controls';

    if v_booking_enabled is false then
      raise exception 'Booking is currently unavailable';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bookings_guard_choose_ride on public.bookings;
create trigger bookings_guard_choose_ride
  before insert on public.bookings
  for each row execute function public.guard_choose_ride_booking();

create or replace function public.guard_choose_ride_enquiry()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_enquiry_enabled boolean := true;
begin
  if public.is_admin() then
    return new;
  end if;

  select coalesce((setting_value->>'enquiry_enabled')::boolean, true)
  into v_enquiry_enabled
  from public.site_settings
  where setting_key = 'ride_controls';

  if v_enquiry_enabled is false then
    raise exception 'Enquiries are currently unavailable';
  end if;

  return new;
end;
$$;

drop trigger if exists enquiries_guard_choose_ride on public.enquiries;
create trigger enquiries_guard_choose_ride
  before insert on public.enquiries
  for each row execute function public.guard_choose_ride_enquiry();
