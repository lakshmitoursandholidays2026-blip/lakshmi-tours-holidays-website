alter table public.bookings
  add constraint bookings_phone_10_digits
  check (phone ~ '^[0-9]{10}$') not valid;

alter table public.enquiries
  add constraint enquiries_phone_10_digits
  check (phone ~ '^[0-9]{10}$') not valid;
