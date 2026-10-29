# Lakshmi Tours and Holidays
Pure HTML/CSS/JS + Supabase. The site works immediately with **sample content** and generated placeholder images; real data replaces it automatically.

## How dummy data works
- Supabase not configured → sections show sample content (yellow "Sample content" bar).
- Supabase configured → database rows replace sample rows for each table as soon as data is available.
- A row with no image shows a generated placeholder; upload an image in the admin to replace it.
- To remove seeded sample rows, delete them in the admin or skip the "SAMPLE DATA" block at the end of the SQL.

## Setup
1. Create a Supabase project; run `supabase/migrations/001_schema_rls_storage_seed.sql` in the SQL editor, followed by migrations `002` through `024` in numerical order. For an existing installation, apply all pending migrations. The migrations configure public content, the admin-managed photo gallery, and vehicle details. Migration `022_remove_booking_functionality.sql` removes retired request and availability features while preserving existing records in a private schema. Migration `023_vehicle_custom_details.sql` adds flexible admin-managed vehicle details. Migration `024_vehicle_air_conditioning_options.sql` adds the AC availability choices and backfills existing vehicle records.
2. Supabase Auth → Users: create your admin account with the email and password you want to use. Then run the commented `insert into admin_profiles ...` line from the SQL with that email. The credentials are managed by Supabase Auth; don't put passwords in the site files.
3. Edit `assets/js/config.js` with the project URL and publishable key (never the service-role key).
4. Run locally with `npx serve .` (ES modules need http, not file://), then deploy to Netlify/Vercel/GitHub Pages.
5. Supabase Auth → URL Configuration: add your site URL and `/admin/login.html` redirect.
6. Use the **Admin** button in the site footer to sign in at `/admin/login.html` with the email and password from step 2. Manage banners, vehicles (+gallery), packages (+gallery, itinerary), Our Gallery photos, and settings (contact details, WhatsApp Enquiry On/Off, section visibility, privacy/terms).
## Tests
- Public item enquiry buttons open WhatsApp with a pre-filled message; no public enquiry form is used.
- Non-admin accounts are rejected at login and have no data access.
- Add a vehicle with a cover image in admin → homepage shows it instead of dummy data.
- Add a vehicle, save its details, then upload a gallery photo; confirm it appears in the vehicle detail page and in the admin gallery list.
- Add a vehicle with the category “Car” in admin → search for “car” and continue to Choose Your Ride to see only vehicles in that category; opening Choose Your Ride directly shows all vehicles.
- Upload and delete a photo in Admin → Our Gallery; confirm changes appear on the home page carousel and the Our Gallery page without a refresh.
- Add, edit, or delete a vehicle/package and confirm open public pages update automatically.
- Add two vehicles or packages with the same name/title; both should save with distinct detail-page links.
- Confirm vehicle cards show only **View Details** and **Enquire**, and item detail pages provide a WhatsApp **Enquire** button when WhatsApp enquiry is enabled.
## Troubleshooting
- Blank/“Couldn't load”: check config.js keys and that the SQL ran.
- Upload fails: confirm your user is in `admin_profiles` and the buckets exist.
