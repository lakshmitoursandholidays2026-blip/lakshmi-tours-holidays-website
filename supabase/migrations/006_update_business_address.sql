-- Update the public business address and map location.
update public.site_settings
set setting_value = setting_value || jsonb_build_object(
  'address', 'Railway Station, Bus Stand, Mettupalayam, Tamil Nadu 641301',
  'map_query', 'Railway Station, Bus Stand, Mettupalayam, Tamil Nadu 641301'
)
where setting_key = 'business';
