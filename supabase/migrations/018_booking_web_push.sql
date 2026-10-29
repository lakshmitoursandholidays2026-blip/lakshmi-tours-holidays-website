create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from public, anon;
grant select, insert, update, delete on public.push_subscriptions to authenticated;
create index push_subscriptions_active_user_idx
  on public.push_subscriptions (user_id)
  where revoked_at is null;

create policy "admin manages own push subscriptions"
  on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid() and public.is_admin())
  with check (user_id = auth.uid() and public.is_admin());

create table public.booking_push_outbox (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'delivered', 'no_subscribers', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  next_attempt_at timestamptz not null default now(),
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);

create index booking_push_outbox_pending_idx
  on public.booking_push_outbox (next_attempt_at, created_at)
  where status = 'pending';

alter table public.booking_push_outbox enable row level security;
revoke all on public.booking_push_outbox from public, anon, authenticated;
grant select, insert, update, delete on public.booking_push_outbox to service_role;

create table public.booking_push_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.booking_push_outbox(id) on delete cascade,
  subscription_id uuid not null references public.push_subscriptions(id) on delete cascade,
  status text not null check (status in ('sent', 'expired', 'failed')),
  attempts integer not null default 1 check (attempts > 0),
  last_error text,
  delivered_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (event_id, subscription_id)
);

alter table public.booking_push_deliveries enable row level security;
revoke all on public.booking_push_deliveries from public, anon, authenticated;
grant select, insert, update, delete on public.booking_push_deliveries to service_role;

create or replace function public.enqueue_booking_push()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.booking_push_outbox (booking_id)
  values (new.id)
  on conflict (booking_id) do nothing;
  return new;
end;
$$;

create trigger bookings_enqueue_push
  after insert on public.bookings
  for each row execute function public.enqueue_booking_push();

create or replace function public.claim_booking_push_event(p_event_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  event_row public.booking_push_outbox%rowtype;
  booking_reference text;
begin
  if coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Service role required';
  end if;

  update public.booking_push_outbox
    set status = 'processing',
        attempts = attempts + 1,
        lease_expires_at = now() + interval '5 minutes',
        last_error = null
    where id = p_event_id
      and (
        (status = 'pending' and next_attempt_at <= now())
        or (status = 'processing' and lease_expires_at < now())
      )
    returning * into event_row;

  if not found then
    return null;
  end if;

  select b.booking_reference
    into booking_reference
    from public.bookings
    as b
    where b.id = event_row.booking_id;

  return jsonb_build_object(
    'event_id', event_row.id,
    'booking_id', event_row.booking_id,
    'attempts', event_row.attempts,
    'booking_reference', booking_reference
  );
end;
$$;

revoke all on function public.claim_booking_push_event(uuid) from public, anon, authenticated;
grant execute on function public.claim_booking_push_event(uuid) to service_role;

create or replace function public.touch_push_subscription()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger push_subscriptions_touch
  before update on public.push_subscriptions
  for each row execute function public.touch_push_subscription();
