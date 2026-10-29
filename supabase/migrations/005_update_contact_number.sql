-- Update the existing business contact details and matching seeded hero links.
update public.site_settings
set setting_value = setting_value || jsonb_build_object(
  'phone', '+91 94871 02215',
  'whatsapp', '919487102215'
)
where setting_key = 'business';

update public.banners
set primary_button_url = 'tel:+919487102215'
where primary_button_url = 'tel:+919876543210';

update public.banners
set secondary_button_url = 'https://wa.me/919487102215'
where secondary_button_url = 'https://wa.me/919876543210';
