create extension if not exists pgcrypto;

-- Saved Routes: routes built with the route planner (synced across devices)
create table if not exists public.saved_routes (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'My Route',
  routing_mode text not null default 'default',
  waypoints jsonb not null default '[]',
  route_geo_json jsonb,
  distance_km text,
  elevation_gain_m text,
  elevation_loss_m text,
  created_at timestamptz not null default timezone('utc', now())
);

alter table public.saved_routes enable row level security;

drop policy if exists "Users can view their own saved routes" on public.saved_routes;
create policy "Users can view their own saved routes"
on public.saved_routes for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own saved routes" on public.saved_routes;
create policy "Users can insert their own saved routes"
on public.saved_routes for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own saved routes" on public.saved_routes;
create policy "Users can update their own saved routes"
on public.saved_routes for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own saved routes" on public.saved_routes;
create policy "Users can delete their own saved routes"
on public.saved_routes for delete to authenticated
using ((select auth.uid()) = user_id);

create table if not exists public.gpx_routes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  folder text not null default 'Imported',
  file_name text not null,
  storage_path text not null unique,
  color text not null default '#2563eb',
  imported_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.gpx_folders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default timezone('utc', now()),
  constraint gpx_folders_user_id_name_key unique (user_id, name)
);

alter table public.gpx_routes enable row level security;
alter table public.gpx_folders enable row level security;

drop policy if exists "Users can view their own GPX routes" on public.gpx_routes;
create policy "Users can view their own GPX routes"
on public.gpx_routes
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own GPX routes" on public.gpx_routes;
create policy "Users can insert their own GPX routes"
on public.gpx_routes
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own GPX routes" on public.gpx_routes;
create policy "Users can update their own GPX routes"
on public.gpx_routes
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own GPX routes" on public.gpx_routes;
create policy "Users can delete their own GPX routes"
on public.gpx_routes
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can view their own GPX folders" on public.gpx_folders;
create policy "Users can view their own GPX folders"
on public.gpx_folders
for select
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "Users can insert their own GPX folders" on public.gpx_folders;
create policy "Users can insert their own GPX folders"
on public.gpx_folders
for insert
to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own GPX folders" on public.gpx_folders;
create policy "Users can update their own GPX folders"
on public.gpx_folders
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own GPX folders" on public.gpx_folders;
create policy "Users can delete their own GPX folders"
on public.gpx_folders
for delete
to authenticated
using ((select auth.uid()) = user_id);

insert into storage.buckets (id, name, public)
values ('gpx-files', 'gpx-files', false)
on conflict (id) do nothing;

drop policy if exists "Users can read their own GPX files" on storage.objects;
create policy "Users can read their own GPX files"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can upload their own GPX files" on storage.objects;
create policy "Users can upload their own GPX files"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can update their own GPX files" on storage.objects;
create policy "Users can update their own GPX files"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
)
with check (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);

drop policy if exists "Users can delete their own GPX files" on storage.objects;
create policy "Users can delete their own GPX files"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'gpx-files'
  and (storage.foldername(name))[1] = (select auth.uid()::text)
);
