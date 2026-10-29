-- Remove the optional booking web-push notification infrastructure.
drop trigger if exists bookings_enqueue_push on public.bookings;
drop function if exists public.enqueue_booking_push();
drop trigger if exists push_subscriptions_touch on public.push_subscriptions;
drop function if exists public.touch_push_subscription();
drop function if exists public.claim_booking_push_event(uuid);

drop table if exists public.booking_push_deliveries cascade;
drop table if exists public.booking_push_outbox cascade;
drop table if exists public.push_subscriptions cascade;
