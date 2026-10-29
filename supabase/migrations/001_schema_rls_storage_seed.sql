-- SkyRide Travels: schema, RLS, storage, seed. Run in Supabase SQL editor.
create extension if not exists pgcrypto;
create table admin_profiles(id uuid primary key references auth.users on delete cascade,
  display_name text, role text not null default 'admin' check (role in ('admin','editor')),
  created_at timestamptz default now(), updated_at timestamptz default now());
create or replace function is_admin() returns boolean language sql security definer stable
set search_path=public as $$ select exists(select 1 from admin_profiles where id=auth.uid()) $$;
create or replace function touch() returns trigger language plpgsql as $$ begin new.updated_at=now(); return new; end $$;

create table site_settings(id uuid primary key default gen_random_uuid(), setting_key text unique not null,
  setting_value jsonb not null default '{}', updated_at timestamptz default now(), updated_by uuid references auth.users);
create table banners(id uuid primary key default gen_random_uuid(), internal_name text not null,
  eyebrow_text text, title text, title_highlight text, description text,
  desktop_image_path text, mobile_image_path text, foreground_image_path text,
  primary_button_text text, primary_button_url text, secondary_button_text text, secondary_button_url text,
  overlay_opacity numeric default .45 check (overlay_opacity between 0 and 1),
  text_alignment text default 'left' check (text_alignment in ('left','center','right')),
  display_order int default 0, is_active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now());
create table vehicles(id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null, category text,
  short_description text, full_description text, min_passengers int, max_passengers int, luggage_capacity text,
  has_ac boolean default true, features jsonb default '[]', starting_price numeric, price_unit text,
  cover_image_path text, is_featured boolean default false, is_published boolean default true, display_order int default 0,
  seo_title text, seo_description text, created_at timestamptz default now(), updated_at timestamptz default now());
create table vehicle_images(id uuid primary key default gen_random_uuid(), vehicle_id uuid not null references vehicles on delete cascade,
  image_path text not null, alt_text text, display_order int default 0, created_at timestamptz default now());
create table packages(id uuid primary key default gen_random_uuid(), slug text unique not null, title text not null, destination text,
  state_or_region text, short_description text, full_description text, duration_days int, duration_nights int,
  price numeric, price_unit text default 'per person', cover_image_path text,
  inclusions jsonb default '[]', exclusions jsonb default '[]', terms_and_conditions text, cancellation_policy text,
  is_featured boolean default false, is_published boolean default true, display_order int default 0,
  seo_title text, seo_description text, created_at timestamptz default now(), updated_at timestamptz default now());
create table package_images(id uuid primary key default gen_random_uuid(), package_id uuid not null references packages on delete cascade,
  image_path text not null, alt_text text, display_order int default 0, created_at timestamptz default now());
create table package_itinerary(id uuid primary key default gen_random_uuid(), package_id uuid not null references packages on delete cascade,
  day_number int not null, title text, description text, activities jsonb default '[]',
  created_at timestamptz default now(), updated_at timestamptz default now(), unique(package_id, day_number));
create table enquiries(id uuid primary key default gen_random_uuid(), full_name text not null check (char_length(full_name) between 2 and 100),
  phone text not null check (phone ~ '^[+0-9 ()-]{7,20}$'), email text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  subject text check (char_length(subject)<=150), message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'new' check (status in ('new','contacted','resolved','spam')),
  internal_notes text, created_at timestamptz default now(), updated_at timestamptz default now());
create sequence booking_seq start 1000;
create table bookings(id uuid primary key default gen_random_uuid(),
  booking_reference text unique not null default ('SR-'||to_char(now(),'YYMM')||'-'||nextval('booking_seq')||upper(substr(md5(random()::text),1,3))),
  full_name text not null check (char_length(full_name) between 2 and 100), phone text not null check (phone ~ '^[+0-9 ()-]{7,20}$'),
  email text, vehicle_id uuid references vehicles on delete set null, vehicle_name text, package_id uuid references packages on delete set null,
  travel_type text, pickup_location text, pickup_date date, destination text, departure_date date, return_date date, pickup_time time,
  passenger_count int not null check (passenger_count between 1 and 100), special_requirements text check (char_length(special_requirements)<=2000),
  preferred_contact_method text default 'phone' check (preferred_contact_method in ('phone','whatsapp','email')),
  quoted_amount numeric, status text not null default 'new' check (status in ('new','contacted','quoted','confirmed','completed','cancelled')),
  internal_notes text, created_at timestamptz default now(), updated_at timestamptz default now(),
  check (return_date is null or return_date >= departure_date));
create table audit_log(id bigserial primary key, actor uuid, action text, table_name text, row_id text, at timestamptz default now());

do $$ declare t text; begin
 foreach t in array array['banners','vehicles','packages','package_itinerary','enquiries','bookings','admin_profiles'] loop
  execute format('create trigger %I_touch before update on %I for each row execute function touch()',t,t); end loop; end $$;
create index on vehicles(is_published,display_order); create index on packages(is_published,display_order);
create index on bookings(status,created_at desc); create index on enquiries(status,created_at desc);

do $$ declare t text; begin
 foreach t in array array['admin_profiles','site_settings','banners','vehicles','vehicle_images','packages','package_images','package_itinerary','enquiries','bookings','audit_log'] loop
  execute format('alter table %I enable row level security',t); end loop;
 foreach t in array array['banners','vehicles','vehicle_images','packages','package_images','package_itinerary','site_settings','enquiries','bookings'] loop
  execute format('create policy "admin all" on %I for all using (is_admin()) with check (is_admin())',t); end loop; end $$;
create policy "admin read" on audit_log for select using (is_admin());
create policy "own profile" on admin_profiles for select using (id=auth.uid()); -- no write policy: roles only via SQL

create policy "public read" on banners for select using (is_active);
create policy "public read" on vehicles for select using (is_published);
create policy "public read" on packages for select using (is_published);
create policy "public read" on vehicle_images for select using (exists(select 1 from vehicles v where v.id=vehicle_id and v.is_published));
create policy "public read" on package_images for select using (exists(select 1 from packages p where p.id=package_id and p.is_published));
create policy "public read" on package_itinerary for select using (exists(select 1 from packages p where p.id=package_id and p.is_published));
create policy "public read" on site_settings for select using (setting_key not like 'private\_%');
create policy "public insert" on enquiries for insert to anon, authenticated with check (status='new' and internal_notes is null);

-- Bookings: public inserts go only through this RPC (no public select, forced defaults)
create or replace function submit_booking(p jsonb) returns text language plpgsql security definer set search_path=public as $$
declare r text; begin
 if char_length(trim(coalesce(p->>'full_name',''))) not between 2 and 100
   or coalesce(p->>'phone','') !~ '^[+0-9 ()-]{7,20}$'
   or char_length(regexp_replace(coalesce(p->>'phone',''),'[^0-9]','','g')) not between 7 and 15
   or char_length(trim(coalesce(p->>'pickup_location',''))) not between 1 and 200
   or char_length(trim(coalesce(p->>'destination',''))) not between 1 and 200
   or (nullif(p->>'vehicle_name','') is not null and
      (nullif(p->>'pickup_date','') is null or nullif(p->>'departure_date','') is null or
       nullif(p->>'departure_date','')::date < nullif(p->>'pickup_date','')::date))
   or coalesce((p->>'passenger_count')::int,0) not between 1 and 100
   or char_length(coalesce(p->>'special_requirements','')) > 2000 then
  raise exception 'Invalid booking details';
 end if;
 insert into bookings(full_name,phone,email,vehicle_id,vehicle_name,package_id,travel_type,pickup_location,pickup_date,destination,departure_date,return_date,pickup_time,passenger_count,special_requirements,preferred_contact_method)
 values(trim(p->>'full_name'),trim(p->>'phone'),nullif(p->>'email',''),nullif(p->>'vehicle_id','')::uuid,nullif(p->>'vehicle_name',''),nullif(p->>'package_id','')::uuid,p->>'travel_type',trim(p->>'pickup_location'),nullif(p->>'pickup_date','')::date,trim(p->>'destination'),
  nullif(p->>'departure_date','')::date,nullif(p->>'return_date','')::date,nullif(p->>'pickup_time','')::time,(p->>'passenger_count')::int,p->>'special_requirements',coalesce(p->>'preferred_contact_method','phone'))
 returning booking_reference into r; return r; end $$;
grant execute on function submit_booking(jsonb) to anon, authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values
 ('site-assets','site-assets',true,5242880,array['image/jpeg','image/png','image/webp','image/svg+xml']),
 ('vehicle-images','vehicle-images',true,5242880,array['image/jpeg','image/png','image/webp']),
 ('package-images','package-images',true,5242880,array['image/jpeg','image/png','image/webp']) on conflict do nothing;
create policy "public read images" on storage.objects for select using (bucket_id in ('site-assets','vehicle-images','package-images'));
create policy "admin insert images" on storage.objects for insert with check (bucket_id in ('site-assets','vehicle-images','package-images') and is_admin());
create policy "admin update images" on storage.objects for update using (bucket_id in ('site-assets','vehicle-images','package-images') and is_admin());
create policy "admin delete images" on storage.objects for delete using (bucket_id in ('site-assets','vehicle-images','package-images') and is_admin());

-- SAMPLE DATA: replace prices and contact details before launch
insert into site_settings(setting_key,setting_value) values
 ('business',jsonb_build_object('name','Lakshmi Tours and Holidays','tagline','Travel agency in Mettupalayam, Coimbatore, Tamil Nadu','phone','+91 94871 02215','whatsapp','919487102215',
  'email','lakshmitoursandholidays2026@gmail.com','address','Railway Station, Bus Stand, Mettupalayam, Tamil Nadu 641301','hours','Open 24 hours')),
 ('sections',jsonb_build_object('hero',true,'vehicles',true,'packages',true,'contact',true));
insert into banners(internal_name,eyebrow_text,title,title_highlight,description,primary_button_text,primary_button_url,secondary_button_text,secondary_button_url,display_order)
 values('Home hero','CAR RENTAL & TRAVEL SERVICES','Your Journey, Our','Priority','Comfortable rides, trusted service and memorable journeys — all in one place.','Call Now','tel:+919487102215','WhatsApp Us','https://wa.me/919487102215',1);
insert into vehicles(slug,name,category,short_description,min_passengers,max_passengers,display_order) values
 ('sedan','Sedan','Sedan','Comfortable and fuel-efficient for city travel and short trips.',4,5,1),
 ('suv','SUV','SUV','Spacious and powerful for family and group travel.',6,7,2),
 ('tempo-traveller','Tempo Traveller','Tempo Traveller','Ideal for larger groups and long journeys.',12,17,3),
 ('bus','Bus','Bus','Ideal for tour groups, events and corporate travel.',20,60,4);
insert into packages(slug,title,destination,state_or_region,duration_days,duration_nights,price,display_order) values
 ('munnar-escape','Munnar Escape','Munnar','Kerala',3,2,8999,1),('goa-getaway','Goa Getaway','Goa','Goa',4,3,12999,2),
 ('ooty-hills','Ooty Hills','Ooty','Tamil Nadu',3,2,7999,3),('kodaikanal-special','Kodaikanal Special','Kodaikanal','Tamil Nadu',3,2,8499,4);
-- First admin (after creating the user in Auth > Users):
-- insert into admin_profiles(id,display_name) select id,'Owner' from auth.users where email='YOUR_EMAIL';
