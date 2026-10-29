-- Set the permanent business email and 24-hour operating status.
update public.site_settings
set setting_value = setting_value || jsonb_build_object(
  'name', 'Lakshmi Tours and Holidays',
  'email', 'lakshmitoursandholidays2026@gmail.com',
  'phone', '+91 94871 02215',
  'whatsapp', '919487102215',
  'address', 'Railway Station, Bus Stand, Mettupalayam, Tamil Nadu 641301',
  'hours', 'Open 24 hours',
  'map_query', 'Railway Station, Bus Stand, Mettupalayam, Tamil Nadu 641301'
)
where setting_key = 'business';
