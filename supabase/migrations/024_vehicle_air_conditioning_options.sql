alter table public.vehicles
  add column if not exists air_conditioning text
  check (air_conditioning in ('AC', 'Non-AC', 'AC / Non-AC Available'));

update public.vehicles
set air_conditioning = case
  when has_ac is true then 'AC'
  when has_ac is false then 'Non-AC'
end
where air_conditioning is null
  and has_ac is not null;

notify pgrst, 'reload schema';
