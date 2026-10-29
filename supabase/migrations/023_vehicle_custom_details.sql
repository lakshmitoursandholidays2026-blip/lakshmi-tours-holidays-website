alter table public.vehicles
  add column if not exists details jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
