-- Remove retired request submission, date availability, and ride availability controls.
drop trigger if exists bookings_guard_choose_ride on public.bookings;
drop trigger if exists bookings_check_vehicle_availability on public.bookings;
drop trigger if exists bookings_sync_vehicle_availability on public.bookings;
drop trigger if exists bookings_touch on public.bookings;
drop trigger if exists enquiries_guard_choose_ride on public.enquiries;

drop function if exists public.submit_booking(jsonb);
drop function if exists public.is_vehicle_available(uuid, date, date);
drop function if exists public.guard_vehicle_booking_availability();
drop function if exists public.sync_vehicle_availability();
drop function if exists public.guard_choose_ride_booking();
drop function if exists public.guard_choose_ride_enquiry();

delete from public.site_settings where setting_key = 'ride_controls';
drop table if exists public.vehicle_availability cascade;

create schema if not exists site_feature_archive;
revoke all on schema site_feature_archive from public, anon, authenticated;
alter table public.bookings set schema site_feature_archive;
alter table site_feature_archive.bookings rename to retired_booking_records;
revoke all on table site_feature_archive.retired_booking_records from public, anon, authenticated;
alter sequence if exists public.booking_seq set schema site_feature_archive;
alter sequence site_feature_archive.booking_seq rename to retired_booking_seq;
revoke all on sequence site_feature_archive.retired_booking_seq from public, anon, authenticated;

notify pgrst, 'reload schema';
